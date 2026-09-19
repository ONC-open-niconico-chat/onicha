-- ============================================================
-- 受け渡しの日時・場所 調整（候補提示 → 合意で確定）
-- ------------------------------------------------------------
-- ※ 既存の txt_request_functions.sql / txt_received_flow.sql とは別ファイルです。
--    それらを適用済みの環境で、この 1 ファイルを Supabase SQL Editor で実行してください。
--
-- 目的：教科書の受け渡しを当事者どうしで調整する。
--   片方が「場所（1つ）＋日時（最大5件）」を候補として提示 → もう片方が
--   1つ選んで確定、または自分から対案を提示。どちらかが確定するまで繰り返す。
--   確定後の再交渉（予定変更）も、新しい候補を出せば可能。
--
-- 個人情報保護：候補・確定情報は txt_transaction / txt_meet_candidate に持たせ、
--   RLS で当事者（giver / receiver）だけが閲覧できる（公開コメントには出さない）。
-- ============================================================


-- ------------------------------------------------------------
-- 1) txt_transaction に確定情報を追加
--    meet_status: none（未提案）/ pending（候補提示・返答待ち）/ confirmed（確定）
--    meet_at / meet_place: 確定した日時・場所（確定時に候補からコピー）
-- ------------------------------------------------------------
alter table public.txt_transaction add column if not exists meet_status text not null default 'none';
alter table public.txt_transaction add column if not exists meet_at     timestamptz;
alter table public.txt_transaction add column if not exists meet_place  text;


-- ------------------------------------------------------------
-- 2) 候補テーブル
--    status: open（現在の提示）/ accepted（確定）/ superseded（新しい提案で失効）
--    place は「提案ごとに1つ」（同じ場所で複数の日時を出す運用）
-- ------------------------------------------------------------
create table if not exists public.txt_meet_candidate (
  id                 bigint generated always as identity primary key,
  txt_transaction_id bigint not null references public.txt_transaction(id) on delete cascade,
  proposer_id        uuid   not null references public."user"(id),
  meet_at            timestamptz not null,
  place              text   not null,
  status             text   not null default 'open',
  created_at         timestamptz not null default now()
);

create index if not exists idx_txt_meet_candidate_tx
  on public.txt_meet_candidate(txt_transaction_id);


-- ------------------------------------------------------------
-- 3) RLS：当事者（giver / receiver）だけが候補を閲覧できる
--    追加・更新は SECURITY DEFINER の RPC 経由で行うため、書き込みポリシーは置かない。
-- ------------------------------------------------------------
alter table public.txt_meet_candidate enable row level security;

drop policy if exists "participant can select meet candidates" on public.txt_meet_candidate;
create policy "participant can select meet candidates"
on public.txt_meet_candidate for select
to authenticated
using (
  exists (
    select 1 from public.txt_transaction t
    where t.id = txt_meet_candidate.txt_transaction_id
      and (auth.uid() = t.giver_id or auth.uid() = t.receiver_id)
  )
);

grant select on public.txt_meet_candidate to authenticated;


-- ------------------------------------------------------------
-- 4) 候補の提示（当事者のみ・最大5件）
--    - 進行中（matched / received）の取引のみ
--    - 既存の open 候補を superseded にしてから、新しい候補を open で挿入
--    - 取引を pending にし、確定情報はクリア（再交渉に対応）
-- ------------------------------------------------------------
create or replace function public.propose_meet_candidates(
  p_tx_id bigint,
  p_place text,
  p_times text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_tx    record;
  v_place text := btrim(coalesce(p_place, ''));
  v_n     integer := coalesce(array_length(p_times, 1), 0);
  v_t     text;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 取引をロックして当事者・状態を検証
  select * into v_tx from txt_transaction where id = p_tx_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_me <> v_tx.giver_id and v_me <> v_tx.receiver_id then
    raise exception 'not authorized';
  end if;
  if v_tx.status not in ('matched', 'received') then
    raise exception 'transaction not matched';
  end if;

  if v_place = '' then
    raise exception 'place required';
  end if;
  if v_n < 1 or v_n > 5 then
    raise exception 'invalid candidate count';
  end if;

  -- 既存の open 候補を失効させる
  update txt_meet_candidate
     set status = 'superseded'
   where txt_transaction_id = p_tx_id
     and status = 'open';

  -- 新しい候補を挿入
  foreach v_t in array p_times loop
    insert into txt_meet_candidate (txt_transaction_id, proposer_id, meet_at, place, status)
    values (p_tx_id, v_me, v_t::timestamptz, v_place, 'open');
  end loop;

  -- 取引を「返答待ち」に。確定情報はクリア（再交渉時も未確定に戻す）。
  update txt_transaction
     set meet_status = 'pending',
         meet_at     = null,
         meet_place  = null
   where id = p_tx_id;
end;
$$;


-- ------------------------------------------------------------
-- 5) 候補の確定（提案者でない側のみ）
--    - open の候補を1つ選んで確定 → 取引に日時・場所をコピー
--    - 他の open 候補は superseded に
-- ------------------------------------------------------------
create or replace function public.accept_meet_candidate(p_candidate_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_cand record;
  v_tx   record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 候補をロックして取得
  select * into v_cand from txt_meet_candidate where id = p_candidate_id for update;
  if v_cand is null then
    raise exception 'candidate not found';
  end if;
  if v_cand.status <> 'open' then
    raise exception 'candidate not open';
  end if;

  -- 取引をロックして当事者・状態を検証
  select * into v_tx from txt_transaction where id = v_cand.txt_transaction_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_me <> v_tx.giver_id and v_me <> v_tx.receiver_id then
    raise exception 'not authorized';
  end if;
  if v_tx.status not in ('matched', 'received') then
    raise exception 'transaction not matched';
  end if;
  -- 自分が出した候補は確定できない（相手が選ぶ）
  if v_cand.proposer_id = v_me then
    raise exception 'cannot accept own proposal';
  end if;

  -- 選んだ候補を確定、他の open は失効
  update txt_meet_candidate set status = 'accepted' where id = p_candidate_id;
  update txt_meet_candidate
     set status = 'superseded'
   where txt_transaction_id = v_cand.txt_transaction_id
     and status = 'open'
     and id <> p_candidate_id;

  -- 取引に確定情報をコピー
  update txt_transaction
     set meet_status = 'confirmed',
         meet_at     = v_cand.meet_at,
         meet_place  = v_cand.place
   where id = v_cand.txt_transaction_id;
end;
$$;


-- ------------------------------------------------------------
-- 実行権限
-- ------------------------------------------------------------
grant execute on function public.propose_meet_candidates(bigint, text, text[]) to authenticated;
grant execute on function public.accept_meet_candidate(bigint)                 to authenticated;
