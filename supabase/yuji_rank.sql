-- ============================================================
-- ユジランク（譲った回数のゲーミフィケーション）
-- ------------------------------------------------------------
-- ※ supabase/no_points_model.sql を適用済みの環境で、この 1 ファイルを
--    Supabase SQL Editor に貼り付けて実行してください。冪等（再実行可）。
--
-- 内容：
--   - user に give_count（＝贈与者として「譲った“相手の人数”」。distinct な受取者数）を追加。
--   - 譲渡完了時（受取者の受け取り確認 / 運営の完了）に、贈与者の give_count を
--     count(distinct receiver_id) で“再計算”する（単純 +1 ではない）。
--     （mark_txt_received / complete_txt_transaction を no_points_model.sql の定義に
--       この再計算だけ足して置き換える。他のロジックは同一。）
--   - なぜ distinct 人数か：同じ相手との偽取引を繰り返しても相手1人＝+1 で頭打ちになり、
--     ランクを上げるには「別々の有効な大学アカウント」が必要になる。@cs.u-ryukyu.ac.jp
--     限定登録と相まって、水増し（偽取引によるランク稼ぎ）のコストを高くする。
--   - give_count は対価（財産的価値）ではなく、譲渡不可・換金不可の「実績カウント」。
--   - give_count はクライアントから直接 UPDATE できない（rls_policies.sql で user の
--     テーブルUPDATE権限を外し、編集可能列だけ GRANT しているため。give_count は
--     その許可列に含めない＝SECURITY DEFINER の RPC だけが更新できる）。
--   - 再計算式なので、運営が偽取引を cancel すれば give_count は自動的に是正される。
-- ============================================================


-- 譲った相手の人数（贈与者として譲渡を完了した distinct な受取者数）。既定 0。
alter table "user" add column if not exists give_count integer not null default 0;


-- 指定ユーザーの give_count を、完了済み取引の distinct 受取者数で再計算するヘルパ。
create or replace function public.recount_give_count(p_giver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update "user"
     set give_count = coalesce((
       select count(distinct t.receiver_id)
       from txt_transaction t
       where t.giver_id = p_giver and t.status = 'completed'
     ), 0)
   where id = p_giver;
end;
$$;

-- 内部ヘルパ：クライアントからの直接実行は不可にする（完了RPCからのみ呼ばれる）。
revoke all on function public.recount_give_count(uuid) from public;


-- ------------------------------------------------------------
-- 受け取り確認（受取者のみ）: matched → completed（即完了・ポイント不動）
--   ＋ 贈与者の give_count を +1。
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

  -- 贈与者の実績を再計算（distinct 受取者数。同じ相手の繰り返しでは増えない）
  perform public.recount_give_count(v_tx.giver_id);

  -- 双方へ完了通知（相手を sender に設定し、フロントで相手名／書籍名を表示）
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_completed_giver', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_completed_receiver', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- 譲渡完了（運営のみ・紛争対応）: matched/received → completed
--   ＋ 贈与者の give_count を +1。
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

  -- 贈与者の実績を再計算（distinct 受取者数）
  perform public.recount_give_count(v_tx.giver_id);

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_completed_giver', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_completed_receiver', v_tx.txt_post_id, v_tx.id);
end;
$$;


grant execute on function public.mark_txt_received(bigint)        to authenticated;
grant execute on function public.complete_txt_transaction(bigint) to authenticated;


-- ------------------------------------------------------------
-- 既存データのバックフィル：完了済み取引の distinct 受取者数で give_count を集計し直す。
--   （冪等。再実行しても正しい値に設定し直すだけ。）
-- ------------------------------------------------------------
update "user" u
   set give_count = coalesce((
     select count(distinct t.receiver_id) from txt_transaction t
     where t.giver_id = u.id and t.status = 'completed'
   ), 0);
