-- ============================================================
-- DM（chat）を「取引中の相手／運営」にスコープ＋メッセージ通報＋送信取消の無効化
-- ------------------------------------------------------------
-- ※ 既存の rls_policies.sql / txt_request_functions.sql を適用済みの環境で、
--    この 1 ファイルを Supabase SQL Editor で実行してください。冪等（再実行可）。
--
-- 目的：
--  (1) メルカリ型の一時DM：非運営あてのメッセージは「取引中(matched/received)の相手」
--      とだけ送れるように、INSERT の RLS を DB レベルで制限する（UIだけでは迂回可能なため）。
--      取引が completed/cancelled になると送信不可＝一時的DMが自動で成立する。
--  (2) 送信取消の無効化：ユーザーによる chat の DELETE ポリシーを撤去（通報の証拠保全にも必要）。
--  (3) メッセージ通報：create_report に 'message'（chat）ブランチを追加。
-- ============================================================


-- ------------------------------------------------------------
-- (1) chat INSERT：運営あて/運営発、または取引中(matched/received)の相手のみ許可
-- ------------------------------------------------------------
drop policy if exists "sender inserts chat" on public.chat;
create policy "sender inserts chat" on public.chat
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and (
      -- 運営（公式アカウント）が相手/自分のやり取り（問い合わせ・通報）
      exists (
        select 1 from "user" u
        where u.is_official and (u.id = receiver_id or u.id = sender_id)
      )
      -- 取引中（matched / received）の相手とだけ
      or exists (
        select 1 from txt_transaction t
        where t.status in ('matched', 'received')
          and (
            (t.giver_id = auth.uid()    and t.receiver_id = chat.receiver_id) or
            (t.receiver_id = auth.uid() and t.giver_id    = chat.receiver_id)
          )
      )
    )
  );


-- ------------------------------------------------------------
-- (2) 送信取消の無効化：ユーザーによる chat の削除を不可にする
--     （メッセージは削除できない＝通報時の証拠を保全）
-- ------------------------------------------------------------
drop policy if exists "sender deletes chat" on public.chat;


-- ------------------------------------------------------------
-- (3) メッセージ通報：create_report に 'message'（chat）を追加
--     ※ 既存の create_report を置き換え（他の target_type の挙動は不変）
-- ------------------------------------------------------------
create or replace function public.create_report(
  p_target_type   text,
  p_target_id     text,
  p_reason_type   text,
  p_reason_detail text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_owner   uuid;
  v_content text;
  v_image   text;
  v_id      bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if p_target_type = 'post' then
    select user_id, content, image_url into v_owner, v_content, v_image
      from post where id = p_target_id::bigint;
  elsif p_target_type = 'txt_post' then
    select user_id, description, image_urls into v_owner, v_content, v_image
      from txt_post where id = p_target_id::bigint;
  elsif p_target_type = 'txt_post_reply' then
    select user_id, content, img_url into v_owner, v_content, v_image
      from txt_post_reply where id = p_target_id::bigint;
  elsif p_target_type = 'message' then
    -- chat.id は uuid。被通報者＝メッセージの送信者。
    select sender_id, content, null::text into v_owner, v_content, v_image
      from chat where id = p_target_id::uuid;
  elsif p_target_type = 'user' then
    select id, username, null::text into v_owner, v_content, v_image
      from "user" where id = p_target_id::uuid;
  else
    raise exception 'invalid target_type';
  end if;

  if v_owner is null then
    raise exception 'target not found';
  end if;

  insert into report
    (reporter_id, reporterd_user_id, target_type, target_id, reason_type,
     reason_detail, status, snapshot_content, snapshot_image)
  values
    (v_me, v_owner, p_target_type, p_target_id, p_reason_type,
     nullif(btrim(coalesce(p_reason_detail,'')), ''), 'pending', v_content, v_image)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_report(text, text, text, text) to authenticated;
