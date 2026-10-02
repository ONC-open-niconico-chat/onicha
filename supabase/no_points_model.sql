-- ============================================================
-- ポイントなしモデル（完全無償の教科書譲渡マッチング）
-- ------------------------------------------------------------
-- ※ 既存の supabase/txt_request_functions.sql / txt_received_flow.sql を
--    適用済みの環境で、この 1 ファイルを Supabase SQL Editor に貼り付けて
--    実行してください。下記 RPC は同名の既存関数を「置き換え」ます（冪等・再実行可）。
--
-- 方針：
--   - ポイント／予約／価格を取引から完全に撤去し、純粋な「無償マッチング」にする。
--     （出品 → リクエスト → 投稿主が承諾でマッチング → 直接受け渡し →
--       受取者が「受け取りました」で完了。対価のやり取りは一切なし。）
--   - DB の経済カラム（user.points / reserved_points / total_earned_points、
--     textbook.price / list_price、txt_post.points、txt_transaction.points）は
--     「残すが使わない」。本関数群は一切読み書きしない（過去データ保持・低リスク）。
--   - 完了は受取者の確認で即 completed（運営の精算ステップは廃止）。
--     運営は紛争時に complete / cancel を実行できる手当てとして残す。
--
-- 状態遷移：
--   pending  --(投稿主が承諾)-->                matched
--   matched  --(受取者が「受け取りました」)-->    completed   ← 即完了（ポイント不動）
--   matched  --(運営：紛争対応)-->              completed / cancelled
-- ============================================================


-- ------------------------------------------------------------
-- 1) 教科書譲渡ポストの作成
--    - user_id はサーバー側で auth.uid() を強制（改ざん防止）
--    - 価格／予約は扱わない（points カラムは設定しない＝NULL のまま）
--    戻り値：作成した txt_post.id
-- ------------------------------------------------------------
create or replace function public.create_txt_post(
  p_give_type    text,
  p_textbook_id  bigint,
  p_description  text default null,
  p_condition_id bigint default null,
  p_image_urls   text[] default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_post_id bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if p_give_type not in ('offering', 'seeking') then
    raise exception 'invalid give_type';
  end if;

  -- 教科書の存在確認のみ（価格は見ない）
  if not exists (select 1 from textbook where id = p_textbook_id) then
    raise exception 'textbook not found';
  end if;

  -- image_urls は text 型カラム。配列を JSON 文字列にして格納する（空なら '[]'）。
  insert into txt_post
    (give_type, user_id, textbook_id, description, status, condition_id, image_urls, created_at)
  values
    (p_give_type, v_me, p_textbook_id, p_description, '募集中', p_condition_id,
     to_json(coalesce(p_image_urls, '{}'::text[]))::text, now())
  returning id into v_post_id;

  return v_post_id;
end;
$$;


-- ------------------------------------------------------------
-- 2) 教科書譲渡ポストの削除
--    - 本人のみ。マッチング済み（進行中取引あり）は削除不可。
--    - 予約の解放は不要（ポイントなし）。紐づく通知・取引を削除してから投稿を削除。
-- ------------------------------------------------------------
create or replace function public.delete_txt_post(p_txt_post_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_owner  uuid;
  v_status text;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select user_id, status
    into v_owner, v_status
  from txt_post
  where id = p_txt_post_id
  for update;

  if v_owner is null then
    raise exception 'post not found';
  end if;
  if v_owner <> v_me then
    raise exception 'not authorized';
  end if;
  if v_status = 'マッチング済み' then
    raise exception 'post already matched';
  end if;

  delete from notification    where txt_post_id = p_txt_post_id;
  delete from txt_transaction where txt_post_id = p_txt_post_id;
  delete from txt_post        where id = p_txt_post_id;
end;
$$;


-- ------------------------------------------------------------
-- 3) リクエスト送信
--    - 自分の投稿には不可／同じ投稿への pending 重複を防止
--    - 残高チェック・予約は行わない
--    - txt_transaction(pending) と notification を作成
--    戻り値：作成した txt_transaction.id
-- ------------------------------------------------------------
create or replace function public.send_txt_request(p_txt_post_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_owner    uuid;
  v_give     text;
  v_giver    uuid;
  v_receiver uuid;
  v_type     text;
  v_tx_id    bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 投稿をロックして取得（削除・状態変更との競合防止）
  select tp.user_id, tp.give_type
    into v_owner, v_give
  from txt_post tp
  where tp.id = p_txt_post_id
  for update of tp;

  if v_owner is null then
    raise exception 'post not found';
  end if;
  if v_owner = v_me then
    raise exception 'cannot request own post';
  end if;

  -- 既に自分の pending リクエストがあれば重複させない
  if exists (
    select 1 from txt_transaction t
    where t.txt_post_id = p_txt_post_id
      and t.status = 'pending'
      and v_me in (t.giver_id, t.receiver_id)
  ) then
    raise exception 'already requested';
  end if;

  -- give_type により giver/receiver と通知種別を決定
  --  offering（譲ります）: 投稿主が渡す側(giver) / リクエスト者が受け取る側(receiver)
  --  seeking（譲ってください）: リクエスト者が渡す側(giver) / 投稿主が受け取る側(receiver)
  if v_give = 'offering' then
    v_giver := v_owner; v_receiver := v_me;    v_type := 'request_for_offering';
  else
    v_giver := v_me;    v_receiver := v_owner; v_type := 'request_for_request';
  end if;

  insert into txt_transaction (txt_post_id, giver_id, receiver_id, status)
  values (p_txt_post_id, v_giver, v_receiver, 'pending')
  returning id into v_tx_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_me, v_owner, v_type, p_txt_post_id, v_tx_id);

  return v_tx_id;
end;
$$;


-- ------------------------------------------------------------
-- 4) リクエスト承諾（ポスト主のみ）
--    - 対象 transaction が pending か検証 → matched / 投稿→マッチング済み
--    - 同じ投稿の他 pending は cancelled（予約解放なし）、他通知は締め切り＋見送り通知
--    - リクエスト送信者へ承諾通知
-- ------------------------------------------------------------
create or replace function public.accept_txt_request(p_notification_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_notif  record;
  v_status text;
  r        record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_notif from notification where id = p_notification_id;
  if v_notif is null then
    raise exception 'notification not found';
  end if;
  if v_notif.receiver_id <> v_me then
    raise exception 'not authorized';
  end if;
  if v_notif.notification_type not in ('request_for_offering', 'request_for_request') then
    raise exception 'not a request notification';
  end if;

  select status into v_status
  from txt_transaction
  where id = v_notif.txt_transaction_id
  for update;

  if v_status is distinct from 'pending' then
    raise exception 'transaction not pending';
  end if;

  update txt_transaction set status = 'matched'
  where id = v_notif.txt_transaction_id;

  update txt_post set status = 'マッチング済み'
  where id = v_notif.txt_post_id;

  update notification set is_read = true, request_status = 'accepted'
  where id = p_notification_id;

  -- 同じ投稿の他の pending 取引を cancelled に（予約の解放は不要）
  update txt_transaction set status = 'cancelled'
  where txt_post_id = v_notif.txt_post_id
    and status = 'pending'
    and id <> v_notif.txt_transaction_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_me, v_notif.sender_id, 'request_accepted', v_notif.txt_post_id, v_notif.txt_transaction_id);

  -- 同じ投稿への他の未処理リクエスト通知を締め切り、各送信者へ見送り通知
  for r in
    select id, sender_id
    from notification
    where receiver_id = v_me
      and txt_post_id = v_notif.txt_post_id
      and notification_type in ('request_for_offering', 'request_for_request')
      and request_status is null
      and id <> p_notification_id
  loop
    update notification set is_read = true, request_status = 'rejected' where id = r.id;
    insert into notification (sender_id, receiver_id, notification_type, txt_post_id)
    values (v_me, r.sender_id, 'request_rejected', v_notif.txt_post_id);
  end loop;
end;
$$;


-- ------------------------------------------------------------
-- 5) リクエスト見送り（ポスト主のみ）: pending → cancelled（予約解放なし）
-- ------------------------------------------------------------
create or replace function public.reject_txt_request(p_notification_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_notif record;
  v_tx    record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_notif from notification where id = p_notification_id;
  if v_notif is null or v_notif.receiver_id <> v_me then
    raise exception 'not authorized';
  end if;

  select * into v_tx
  from txt_transaction
  where id = v_notif.txt_transaction_id
  for update;

  if v_tx is null or v_tx.status <> 'pending' then
    raise exception 'transaction not pending';
  end if;

  update txt_transaction set status = 'cancelled'
  where id = v_tx.id;

  update notification set is_read = true, request_status = 'rejected'
  where id = p_notification_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id)
  values (v_me, v_notif.sender_id, 'request_rejected', v_notif.txt_post_id);
end;
$$;


-- ------------------------------------------------------------
-- 6) リクエスト取り下げ（送信者のみ）: pending → cancelled（予約解放なし）
-- ------------------------------------------------------------
create or replace function public.withdraw_txt_request(p_notification_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_notif record;
  v_tx    record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_notif from notification where id = p_notification_id;
  if v_notif is null or v_notif.sender_id <> v_me then
    raise exception 'not authorized';
  end if;
  if v_notif.request_status is not null then
    raise exception 'already handled';
  end if;

  select * into v_tx
  from txt_transaction
  where id = v_notif.txt_transaction_id
  for update;

  if v_tx is null or v_tx.status <> 'pending' then
    raise exception 'transaction not pending';
  end if;

  update txt_transaction set status = 'cancelled'
  where id = v_tx.id;

  update notification set notification_type = 'request_withdrawn', is_read = false
  where id = p_notification_id;
end;
$$;


-- ------------------------------------------------------------
-- 7) 受け取り確認（受取者のみ）: matched → completed（即完了・ポイント不動）
--    - auth.uid() が受取者本人であることを検証
--    - 双方へ完了通知（ポイントの記載はしない）
-- ------------------------------------------------------------
create or replace function public.mark_txt_received(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_tx record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_tx.receiver_id <> v_me then
    raise exception 'not authorized';
  end if;
  if v_tx.status <> 'matched' then
    raise exception 'transaction not matched';
  end if;

  update txt_transaction set status = 'completed' where id = p_id;

  -- 双方へ完了通知（相手を sender に設定し、フロントで相手名／書籍名を表示）
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_completed_giver', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_completed_receiver', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- 8) 譲渡完了（運営のみ・紛争対応の手当て）: matched/received → completed（ポイント不動）
--    - 通常はユーザーの受け取り確認で完了するが、受取者が確認しないまま
--      立ち消えた取引などを運営が完了にできるよう残す。
-- ------------------------------------------------------------
create or replace function public.complete_txt_transaction(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_tx record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_tx.status not in ('matched', 'received') then
    raise exception 'transaction not matched';
  end if;

  update txt_transaction set status = 'completed' where id = p_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_completed_giver', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_completed_receiver', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- 9) マッチング解除（運営のみ）: matched/received → cancelled（予約解放なし）
--    - 投稿を募集中へ戻し、双方へ取り消し通知。
-- ------------------------------------------------------------
create or replace function public.cancel_txt_transaction(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_tx record;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_tx.status not in ('matched', 'received') then
    raise exception 'transaction not matched';
  end if;

  update txt_transaction set status = 'cancelled' where id = p_id;
  update txt_post set status = '募集中' where id = v_tx.txt_post_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_cancelled', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_cancelled', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- 10) 新規教科書の追加（ログインユーザー）
--    - 価格／定価は扱わない。タイトルのみで登録する。
--    - 旧シグネチャ create_textbook(text, integer) は破棄する。
--    戻り値：作成した textbook.id
-- ------------------------------------------------------------
drop function if exists public.create_textbook(text, integer);

create or replace function public.create_textbook(p_title text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_id    bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if v_title = '' then
    raise exception 'invalid title';
  end if;

  -- confirmed は既定 false（運営のタイトル確認用。価格は扱わない）。
  insert into textbook (title)
  values (v_title)
  returning id into v_id;

  return v_id;
end;
$$;


-- ------------------------------------------------------------
-- 実行権限（置き換えた関数・新シグネチャに付け直す）
-- ------------------------------------------------------------
grant execute on function public.create_txt_post(text, bigint, text, bigint, text[]) to authenticated;
grant execute on function public.delete_txt_post(bigint)           to authenticated;
grant execute on function public.send_txt_request(bigint)          to authenticated;
grant execute on function public.accept_txt_request(bigint)        to authenticated;
grant execute on function public.reject_txt_request(bigint)        to authenticated;
grant execute on function public.withdraw_txt_request(bigint)      to authenticated;
grant execute on function public.mark_txt_received(bigint)         to authenticated;
grant execute on function public.complete_txt_transaction(bigint)  to authenticated;
grant execute on function public.cancel_txt_transaction(bigint)    to authenticated;
grant execute on function public.create_textbook(text)             to authenticated;


-- ------------------------------------------------------------
-- （任意）既存の教科書をすべて「確認済み」にする
--   運営の「教科書確認」バッジは confirmed=false の件数を表示します。
--   既存のマスタ教科書が confirmed=false のままだとバッジが大量表示になるため、
--   初回だけ下記を実行して、以後ユーザーが新規追加したものだけが未確認で残るようにします。
-- ------------------------------------------------------------
update textbook set confirmed = true where confirmed = false;
