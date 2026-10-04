-- ============================================================
-- Supabase Security Advisor 対応（本番 = yujilink プロジェクト）
-- Supabase SQL Editor で実行。冪等（再実行可）。
--
-- 方針：
--  - anon（未ログイン）は RPC を一切呼ばない（サインアップは Auth API、
--    トリガー関数は EXECUTE 権限が無くても発火する）ため、EXECUTE を全剥奪。
--  - トリガー関数は RPC として公開する必要がないので authenticated からも剥奪。
--  - 本物の RPC（送信/承諾/完了など）は authenticated に残す＝アプリが使うため。
--    これらが「authenticated が SECURITY DEFINER を実行可」で警告されるのは設計通り
--    （内部で auth.uid()・staff 判定を行う。INVOKER には変えない）。
-- ============================================================

-- 1) public スキーマ全関数の EXECUTE を PUBLIC（全員）から剥奪（0028 警告を一括解消）。
--    ※ anon の実行権は「関数作成時に自動で付く PUBLIC への既定 EXECUTE」由来のため、
--      REVOKE ... FROM anon では消えない（anon への個別付与しか外せない）。
--      外すべき相手は PUBLIC。これで anon の経路が消える。
--    ※ authenticated への明示 GRANT（grant execute ... to authenticated）は
--      PUBLIC への revoke では外れないので、本物の RPC は引き続き動作する。
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;  -- 念のため（個別付与があれば除去）

-- 2) トリガー関数は直接呼ぶ必要がないため authenticated / public からも EXECUTE 剥奪。
--    （トリガーは権限が無くても発火するので機能は壊れない。）
--    ※ 本番に存在しない関数があれば、その行はスキップしてください。
revoke all on function public.block_write_if_suspended()  from public, authenticated;
revoke all on function public.block_msg_if_suspended()    from public, authenticated;
revoke all on function public.log_point_change()          from public, authenticated;
revoke all on function public.log_deleted_content()       from public, authenticated;
revoke all on function public.enforce_school_email()      from public, authenticated;
revoke all on function public.handle_new_user_complete()  from public, authenticated;

-- 3) 経済カラム保護トリガー関数の search_path を固定（0011 警告）。
alter function public.protect_user_economic_columns() set search_path = public;

-- ------------------------------------------------------------
-- 残る「authenticated が SECURITY DEFINER を実行可」(本物の RPC) は設計通りのため
-- 対応不要。Supabase のアドバイザー上で Acknowledge（無視）して差し支えない。
--  例) accept/reject/withdraw/send_txt_request, create_txt_post, delete_txt_post,
--      complete/cancel_txt_transaction, create_report, create_textbook,
--      set_textbook_price, confirm_textbook, mark_transaction_read,
--      mark_official_messages_read, mark_txt_received, suspend_user, unsuspend_user
-- ------------------------------------------------------------
