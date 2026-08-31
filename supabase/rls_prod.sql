-- ============================================================
-- 本番DB 用 RLS ポリシー（クリーン版）
-- 実行順：schema.sql → txt_request_functions.sql → この rls_prod.sql
--         → auth_signup_trigger.sql → seed.sql
-- 冪等（drop policy if exists → create）。dev 固有の後始末は含まない。
-- ============================================================

-- ---------- 参照マスタ：全員参照可・書き込み不可 ----------
drop policy if exists "read faculty" on public.faculty;
create policy "read faculty" on public.faculty for select to public using (true);

drop policy if exists "read department" on public.department;
create policy "read department" on public.department for select to public using (true);

drop policy if exists "read txtbook_condition" on public.txtbook_condition;
create policy "read txtbook_condition" on public.txtbook_condition for select to public using (true);

-- textbook：参照は公開、書き込みは RPC（create_textbook / set_textbook_price / confirm_textbook）経由のみ
drop policy if exists "read textbook" on public.textbook;
create policy "read textbook" on public.textbook for select to public using (true);


-- ---------- user：参照=認証、更新=本人のみ。経済/権限カラムは列単位で更新禁止 ----------
drop policy if exists "read users" on public."user";
create policy "read users" on public."user" for select to authenticated using (true);

drop policy if exists "update own profile" on public."user";
create policy "update own profile" on public."user"
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

revoke update (points, reserved_points, total_earned_points, is_official)
  on public."user" from anon, authenticated;


-- ---------- post / like ----------
drop policy if exists "read posts" on public.post;
create policy "read posts" on public.post for select to authenticated using (true);
drop policy if exists "insert own post" on public.post;
create policy "insert own post" on public.post for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own post" on public.post;
create policy "update own post" on public.post for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own post" on public.post;
create policy "delete own post" on public.post for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "read likes" on public."like";
create policy "read likes" on public."like" for select to authenticated using (true);
drop policy if exists "insert own like" on public."like";
create policy "insert own like" on public."like" for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "delete own like" on public."like";
create policy "delete own like" on public."like" for delete to authenticated using (auth.uid() = user_id);

-- number_of_likes は like の増減をトリガーで自動集計（クライアントは更新しない）
create or replace function public.sync_post_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update post set number_of_likes = (select count(*) from "like" l where l.post_id = coalesce(NEW.post_id, OLD.post_id))
  where id = coalesce(NEW.post_id, OLD.post_id);
  return null;
end; $$;
drop trigger if exists trg_sync_post_like_count on public."like";
create trigger trg_sync_post_like_count after insert or delete on public."like"
  for each row execute function public.sync_post_like_count();


-- ---------- txt_post / txt_transaction / txt_post_reply ----------
-- txt_post：参照のみ。作成/削除/状態変更は RPC 経由。
drop policy if exists "read txt_post" on public.txt_post;
create policy "read txt_post" on public.txt_post for select to authenticated using (true);

-- txt_transaction：参照のみ（当事者＋運営）。書き込みは RPC 専任。
drop policy if exists "participant can select own transaction" on public.txt_transaction;
create policy "participant can select own transaction" on public.txt_transaction
  for select to authenticated using (auth.uid() = giver_id or auth.uid() = receiver_id);
drop policy if exists "staff can select transactions" on public.txt_transaction;
create policy "staff can select transactions" on public.txt_transaction
  for select to authenticated using (exists (select 1 from staff_members s where s.user_id = auth.uid()));

-- txt_post_reply：参照=認証、作成/削除は本人のみ
drop policy if exists "read replies" on public.txt_post_reply;
create policy "read replies" on public.txt_post_reply for select to authenticated using (true);
drop policy if exists "insert own reply" on public.txt_post_reply;
create policy "insert own reply" on public.txt_post_reply for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "delete own reply" on public.txt_post_reply;
create policy "delete own reply" on public.txt_post_reply for delete to authenticated using (auth.uid() = user_id);


-- ---------- chat（DM）：当事者のみ ＋ 運営の公式チャット ----------
drop policy if exists "participant reads chat" on public.chat;
create policy "participant reads chat" on public.chat for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "sender inserts chat" on public.chat;
create policy "sender inserts chat" on public.chat for insert to authenticated
  with check (auth.uid() = sender_id);
drop policy if exists "sender deletes chat" on public.chat;
create policy "sender deletes chat" on public.chat for delete to authenticated
  using (auth.uid() = sender_id);

-- 運営が「公式ユーザー」として送受信/閲覧できる
drop policy if exists "staff insert official chat" on public.chat;
create policy "staff insert official chat" on public.chat for insert to authenticated
  with check (exists (select 1 from staff_members s where s.user_id = auth.uid())
          and exists (select 1 from "user" u where u.is_official and u.id = chat.sender_id));
drop policy if exists "staff select official chat" on public.chat;
create policy "staff select official chat" on public.chat for select to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid())
     and exists (select 1 from "user" u where u.is_official and u.id = any (array[chat.sender_id, chat.receiver_id])));


-- ---------- notification：本人宛のみ＋運営閲覧＋公式送信 ----------
drop policy if exists "read own notifications" on public.notification;
create policy "read own notifications" on public.notification for select to authenticated
  using (auth.uid() = receiver_id);
drop policy if exists "staff reads notifications" on public.notification;
create policy "staff reads notifications" on public.notification for select to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid()));
drop policy if exists "insert notification as self" on public.notification;
create policy "insert notification as self" on public.notification for insert to authenticated
  with check (auth.uid() = sender_id);
drop policy if exists "staff insert official notification" on public.notification;
create policy "staff insert official notification" on public.notification for insert to authenticated
  with check (exists (select 1 from staff_members s where s.user_id = auth.uid())
          and exists (select 1 from "user" u where u.is_official and u.id = notification.sender_id));
drop policy if exists "update own notifications" on public.notification;
create policy "update own notifications" on public.notification for update to authenticated
  using (auth.uid() = receiver_id) with check (auth.uid() = receiver_id);
drop policy if exists "delete own notifications" on public.notification;
create policy "delete own notifications" on public.notification for delete to authenticated
  using (auth.uid() = receiver_id);


-- ---------- follows：参照は公開、管理は本人（follower）のみ ----------
drop policy if exists "read follows" on public.follows;
create policy "read follows" on public.follows for select to public using (true);
drop policy if exists "manage own follows" on public.follows;
create policy "manage own follows" on public.follows for all to authenticated
  using (auth.uid() = follower_id) with check (auth.uid() = follower_id);


-- ---------- report：通報は create_report RPC 経由のみ（直接 insert 不可）、閲覧/更新は運営 ----------
-- 直接 insert ポリシーは置かない（RPC が reporter/被通報者/スナップショットを確定するため）。
drop policy if exists "user can insert own report" on public.report;
drop policy if exists "staff can select reports" on public.report;
create policy "staff can select reports" on public.report for select to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid()));
drop policy if exists "staff can update reports" on public.report;
create policy "staff can update reports" on public.report for update to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid()))
  with check (exists (select 1 from staff_members s where s.user_id = auth.uid()));


-- ---------- staff_members：自分の行だけ参照可（isStaff 判定用） ----------
drop policy if exists "read own staff row" on public.staff_members;
create policy "read own staff row" on public.staff_members for select to authenticated
  using (user_id = auth.uid());


-- ============================================================
-- 関数の実行権限を最小化：
--   public/anon から一括剥奪 → クライアントが呼ぶ RPC だけ authenticated に付与。
--   （トリガー関数は EXECUTE 権限が無くても発火する。定義者権限で内部処理も動く）
-- ============================================================
revoke execute on all functions in schema public from anon, public;

grant execute on function public.create_txt_post(text, bigint, text, bigint, text[]) to authenticated;
grant execute on function public.delete_txt_post(bigint)                to authenticated;
grant execute on function public.send_txt_request(bigint)               to authenticated;
grant execute on function public.accept_txt_request(bigint)             to authenticated;
grant execute on function public.reject_txt_request(bigint)             to authenticated;
grant execute on function public.withdraw_txt_request(bigint)           to authenticated;
grant execute on function public.cancel_txt_transaction(bigint)         to authenticated;
grant execute on function public.complete_txt_transaction(bigint)       to authenticated;
grant execute on function public.mark_transaction_read(bigint)          to authenticated;
grant execute on function public.set_textbook_price(bigint, integer)    to authenticated;
grant execute on function public.create_textbook(text, integer)         to authenticated;
grant execute on function public.confirm_textbook(bigint)               to authenticated;
grant execute on function public.mark_official_messages_read(uuid)      to authenticated;
grant execute on function public.create_report(text, text, text, text)  to authenticated;
