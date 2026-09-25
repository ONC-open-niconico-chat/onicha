-- ============================================================
-- アカウント利用停止（ソフトBAN）：運営チャット以外の書き込みを全停止
-- ------------------------------------------------------------
-- ※ 既存のRLS/RPC群を適用済みの環境で、この1ファイルを Supabase SQL Editor で
--    実行してください。冪等（再実行可）。
--
-- 方針：
--  - 利用停止ユーザーは「ログインは可能・閲覧も可能」だが、投稿・コメント・いいね・
--    フォロー・教科書投稿・譲渡リクエスト・通報・利用者間DM など**書き込みを一切できない**。
--  - 唯一の例外：**運営（is_official）あての chat / notification**（＝運営への問い合わせ）は許可。
--  - 実装：各書き込みテーブルの BEFORE INSERT トリガーで auth.uid() の停止状態を判定。
--    直接INSERTでも、SECURITY DEFINER の RPC 経由のINSERTでも、最終的な INSERT を捉えて弾く。
-- ============================================================


-- ------------------------------------------------------------
-- 1) 利用停止ユーザーの一覧（理由付き）
-- ------------------------------------------------------------
create table if not exists public.suspended_users (
  user_id    uuid primary key references public."user"(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  created_by uuid references public."user"(id)
);

alter table public.suspended_users enable row level security;

-- 本人は自分の停止状態を読める（画面の告知バナー用）。運営は全件閲覧可。
drop policy if exists "read own suspension" on public.suspended_users;
create policy "read own suspension" on public.suspended_users
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "staff reads suspensions" on public.suspended_users;
create policy "staff reads suspensions" on public.suspended_users
  for select to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid()));

grant select on public.suspended_users to authenticated;
-- 追加/解除は下記の運営専用RPC（またはダッシュボード）で行う。直接の書き込みポリシーは付けない。


-- ------------------------------------------------------------
-- 2) 停止判定トリガー関数
--    (a) 一般：停止中なら常に拒否
--    (b) メッセージ系：停止中でも「運営あて」だけ許可（問い合わせ用）
-- ------------------------------------------------------------
create or replace function public.block_write_if_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and exists (select 1 from suspended_users s where s.user_id = auth.uid()) then
    raise exception 'account suspended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.block_msg_if_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and exists (select 1 from suspended_users s where s.user_id = auth.uid()) then
    -- 運営（公式アカウント）あてなら許可（問い合わせ・異議申し立て用）
    if exists (select 1 from "user" u where u.is_official and u.id = new.receiver_id) then
      return new;
    end if;
    raise exception 'account suspended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 3) 各書き込みテーブルにトリガーを設置
--    一般（全停止）：post / like / follows / txt_post_reply / txt_post / txt_transaction / report
--    メッセージ（運営あて例外）：chat / notification
-- ------------------------------------------------------------
drop trigger if exists trg_block_suspended on public.post;
create trigger trg_block_suspended before insert on public.post
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended on public."like";
create trigger trg_block_suspended before insert on public."like"
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended on public.follows;
create trigger trg_block_suspended before insert on public.follows
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended on public.txt_post_reply;
create trigger trg_block_suspended before insert on public.txt_post_reply
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended on public.txt_post;
create trigger trg_block_suspended before insert on public.txt_post
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended on public.txt_transaction;
create trigger trg_block_suspended before insert on public.txt_transaction
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended on public.report;
create trigger trg_block_suspended before insert on public.report
  for each row execute function public.block_write_if_suspended();

drop trigger if exists trg_block_suspended_msg on public.chat;
create trigger trg_block_suspended_msg before insert on public.chat
  for each row execute function public.block_msg_if_suspended();

drop trigger if exists trg_block_suspended_msg on public.notification;
create trigger trg_block_suspended_msg before insert on public.notification
  for each row execute function public.block_msg_if_suspended();


-- ------------------------------------------------------------
-- 4) 運営専用：利用停止 / 解除 RPC（管理画面から使う想定。ダッシュボードでも可）
-- ------------------------------------------------------------
create or replace function public.suspend_user(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;
  if exists (select 1 from staff_members s where s.user_id = p_user_id) then
    raise exception 'cannot suspend staff';
  end if;

  insert into suspended_users (user_id, reason, created_by)
  values (p_user_id, nullif(btrim(coalesce(p_reason, '')), ''), v_me)
  on conflict (user_id) do update
    set reason = excluded.reason, created_by = excluded.created_by, created_at = now();
end;
$$;

create or replace function public.unsuspend_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  delete from suspended_users where user_id = p_user_id;
end;
$$;

grant execute on function public.suspend_user(uuid, text) to authenticated;
grant execute on function public.unsuspend_user(uuid)      to authenticated;
