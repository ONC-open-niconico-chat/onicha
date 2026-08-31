-- ============================================================
-- RLS ハードニング（Phase 1：経済・プライバシーの重大穴を塞ぐ）
-- Supabase SQL Editor で実行してください。冪等（再実行可）。
--
-- 方針：
--  - 「全操作可能（ALL / USING true / CHECK true）」等の“事実上RLS無効”ポリシーを撤去
--  - 書き込みは基本「本人の行のみ」。取引・ポイントの正規操作は SECURITY DEFINER の
--    RPC（RLS を迂回）で行うため、直接書き込みを塞いでも既存フローは壊れない
--  - user は列単位で経済カラムの UPDATE を禁止（プロフィール編集は維持）
--
-- ※ Phase 2（post / like のいいね周り）は別ファイルで対応予定。
-- ============================================================


-- ------------------------------------------------------------
-- user：誰でも全操作可能 → 参照は認証ユーザー、更新は本人のみ。
--   さらに経済/権限カラムは列単位で UPDATE 禁止（改ざん防止）。
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public."user";
drop policy if exists "read users" on public."user";
drop policy if exists "update own profile" on public."user";

create policy "read users" on public."user"
  for select to authenticated using (true);

create policy "update own profile" on public."user"
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 経済・権限カラムはクライアントから UPDATE 不可にする（RPC は所有者権限で実行されるため影響なし）。
revoke update (points, reserved_points, total_earned_points, is_official)
  on public."user" from anon, authenticated;
-- （INSERT/DELETE ポリシーは付けない＝クライアントからの作成/削除は不可。
--   user 行の作成は auth トリガー等のサーバー側で行われる想定。）


-- ------------------------------------------------------------
-- textbook：誰でも全操作可能 → 参照のみ公開。作成/価格変更は RPC 経由に限定。
--   （create_textbook / set_textbook_price / confirm_textbook は SECURITY DEFINER）
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public.textbook;
-- 既存の "Enable read access for all users"（SELECT public true）はそのまま読み取りに使う。


-- ------------------------------------------------------------
-- txtbook_condition：誰でも全操作可能 → 参照のみ（マスタデータ）。
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public.txtbook_condition;
drop policy if exists "read txtbook_condition" on public.txtbook_condition;

create policy "read txtbook_condition" on public.txtbook_condition
  for select to public using (true);


-- ------------------------------------------------------------
-- txt_post：誰でも全操作可能 → 参照のみ。作成/削除/状態変更は RPC 経由。
--   （create_txt_post / delete_txt_post / accept_txt_request 等は SECURITY DEFINER）
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public.txt_post;
drop policy if exists "read txt_post" on public.txt_post;

create policy "read txt_post" on public.txt_post
  for select to authenticated using (true);


-- ------------------------------------------------------------
-- txt_transaction：直接の INSERT/UPDATE を全撤去（水増し・不正遷移の防止）。
--   取引の作成・状態遷移・完了・取り消し・既読はすべて SECURITY DEFINER の RPC で行う
--   （RPC は RLS を迂回するため、UPDATE ポリシーは不要）。
--   クライアントは SELECT のみ：admin（staff）と当事者が読む。
-- ------------------------------------------------------------
drop policy if exists "participant can insert transaction" on public.txt_transaction;
drop policy if exists "participant can update own transaction" on public.txt_transaction;
drop policy if exists "staff can update transactions" on public.txt_transaction;
-- 残す：participant can select own transaction / staff can select transactions


-- ------------------------------------------------------------
-- chat（DM）：全員閲覧・送信者偽装・全員削除 → 当事者のみに限定。
-- ------------------------------------------------------------
drop policy if exists "Enable read access for all users" on public.chat;
drop policy if exists "Enable insert for authenticated users only" on public.chat;
drop policy if exists "Enable delete for users based on user_id" on public.chat;
drop policy if exists "participant reads chat" on public.chat;
drop policy if exists "sender inserts chat" on public.chat;
drop policy if exists "sender deletes chat" on public.chat;

create policy "participant reads chat" on public.chat
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "sender inserts chat" on public.chat
  for insert to authenticated
  with check (auth.uid() = sender_id);

create policy "sender deletes chat" on public.chat
  for delete to authenticated
  using (auth.uid() = sender_id);
-- 残す：staff insert official chat / staff select official chat


-- ------------------------------------------------------------
-- notification：全操作可能 → 本人宛のみ閲覧/更新/削除、作成は sender=本人。
--   運営は管理画面のため全件閲覧可（staff）。
--   （RPC が作る通知は SECURITY DEFINER なので RLS の影響を受けない）
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public.notification;
drop policy if exists "read own notifications" on public.notification;
drop policy if exists "staff reads notifications" on public.notification;
drop policy if exists "insert notification as self" on public.notification;
drop policy if exists "update own notifications" on public.notification;
drop policy if exists "delete own notifications" on public.notification;

create policy "read own notifications" on public.notification
  for select to authenticated using (auth.uid() = receiver_id);

create policy "staff reads notifications" on public.notification
  for select to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid()));

create policy "insert notification as self" on public.notification
  for insert to authenticated with check (auth.uid() = sender_id);

create policy "update own notifications" on public.notification
  for update to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

create policy "delete own notifications" on public.notification
  for delete to authenticated using (auth.uid() = receiver_id);
-- 残す：staff insert official notification


-- ============================================================
-- Phase 2：post / like（いいね）の最小権限化
--  - like：閲覧は認証ユーザー、いいね/解除は本人のみ（なりすまし・匿名いいね防止）
--  - post：閲覧は認証ユーザー、作成/更新/削除は本人のみ
--  - number_of_likes はクライアントが直接更新できなくなるため、
--    like の増減をトリガーで自動集計する
--  - like には post への外部キーが無いため、投稿削除時の like 掃除もトリガーで行う
-- ============================================================

-- ------------------------------------------------------------
-- like：全操作可能 → 参照=認証ユーザー、INSERT/DELETE は本人のみ
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public."like";
drop policy if exists "read likes" on public."like";
drop policy if exists "insert own like" on public."like";
drop policy if exists "delete own like" on public."like";

create policy "read likes" on public."like"
  for select to authenticated using (true);

create policy "insert own like" on public."like"
  for insert to authenticated with check (auth.uid() = user_id);

create policy "delete own like" on public."like"
  for delete to authenticated using (auth.uid() = user_id);


-- ------------------------------------------------------------
-- post：全操作可能 → 参照=認証ユーザー、作成/更新/削除は本人のみ
-- ------------------------------------------------------------
drop policy if exists "全操作可能" on public.post;
drop policy if exists "read posts" on public.post;
drop policy if exists "insert own post" on public.post;
drop policy if exists "update own post" on public.post;
drop policy if exists "delete own post" on public.post;

create policy "read posts" on public.post
  for select to authenticated using (true);

create policy "insert own post" on public.post
  for insert to authenticated with check (auth.uid() = user_id);

create policy "update own post" on public.post
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own post" on public.post
  for delete to authenticated using (auth.uid() = user_id);


-- ------------------------------------------------------------
-- トリガー：like の増減で post.number_of_likes を自動集計。
--   SECURITY DEFINER なので post の RLS を迂回して更新できる。
-- ------------------------------------------------------------
create or replace function public.sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update post
     set number_of_likes = (select count(*) from "like" l where l.post_id = coalesce(NEW.post_id, OLD.post_id))
   where id = coalesce(NEW.post_id, OLD.post_id);
  return null;
end;
$$;

drop trigger if exists trg_sync_post_like_count on public."like";
create trigger trg_sync_post_like_count
  after insert or delete on public."like"
  for each row execute function public.sync_post_like_count();


-- ------------------------------------------------------------
-- トリガー：投稿削除時に、その投稿への like を掃除する（FK が無いため）。
--   AFTER DELETE。SECURITY DEFINER で like の RLS を迂回。
-- ------------------------------------------------------------
create or replace function public.delete_post_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from "like" where post_id = OLD.id;
  return null;
end;
$$;

drop trigger if exists trg_delete_post_likes on public.post;
create trigger trg_delete_post_likes
  after delete on public.post
  for each row execute function public.delete_post_likes();


-- ============================================================
-- Phase 3：関数・残テーブルのセキュリティ（アドバイザー指摘対応）
--   Supabase SQL Editor で実行。冪等。
-- ============================================================

-- 1) 認可チェックの無い経済関数を削除。
--    どちらも SECURITY DEFINER かつ誰でも実行可能で、任意の相手・金額に
--    ポイントを増減できる（＝ポイントの自作/強奪）。アプリからは未使用。
drop function if exists public.transfer_points(text, text, integer);
drop function if exists public.settle_transfer_points(uuid, uuid, integer);

-- 2) lecture / txt_reaction の「全操作可能」を撤去 → 参照のみ（改ざん防止）。
drop policy if exists "全操作可能" on public.lecture;
drop policy if exists "read lecture" on public.lecture;
create policy "read lecture" on public.lecture for select to authenticated using (true);

drop policy if exists "全操作可能" on public.txt_reaction;
drop policy if exists "read txt_reaction" on public.txt_reaction;
create policy "read txt_reaction" on public.txt_reaction for select to authenticated using (true);
-- （将来リアクション機能を作るなら、本人 insert/delete ポリシーを追加）

-- 3) SECURITY DEFINER 関数の search_path を固定（探索パス乗っ取り対策）。
alter function public.handle_new_user() set search_path = public;
alter function public.handle_new_user_points() set search_path = public;
alter function public.reset_cafeteria_percent() set search_path = public;

-- 4) anon（未ログイン）から public スキーマ全関数の実行権限を剥奪。
--    未ログインは RPC を一切呼ばない（サインアップは Auth API 経由、
--    トリガー関数は EXECUTE 権限が無くても発火する）ため安全。
--    authenticated（ログイン中）には既存の grant がそのまま残る。
revoke execute on all functions in schema public from anon;
