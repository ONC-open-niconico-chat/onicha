-- ============================================================
-- 教科書譲渡リクエスト用 RPC 関数群
-- Supabase SQL Editor で実行してください。
--
-- 目的：リクエスト送信 / 承諾 / 見送り / 取り下げの一連の複数テーブル操作を
--   1つのトランザクション内でアトミックに実行し、競合（同時承諾・取り下げ直後の
--   承諾など）を FOR UPDATE の行ロックで防ぐ。
--
-- SECURITY DEFINER：関数所有者権限で実行され RLS を迂回するため、
--   これらのフローについてはクライアント側の INSERT/UPDATE 用 RLS は不要になる。
--   代わりに関数内で auth.uid() と status を厳格に検証する。
--
-- 前提スキーマ（列名/型が違う場合は下記を調整してください）:
--   txt_post(id bigint, user_id uuid, give_type text, status text)
--   txt_transaction(id bigint, txt_post_id bigint, giver_id uuid, receiver_id uuid, status text)
--   notification(id bigint, sender_id uuid, receiver_id uuid, notification_type text,
--                txt_post_id bigint, txt_transaction_id bigint,
--                request_status text, is_read boolean, created_at timestamptz default now())
--   "user"(id uuid, points integer)
--
-- ※ notification.id が uuid の場合は、各関数の引数 p_notification_id を uuid に変えてください。
-- ============================================================


-- 取引ごとの付与/消費ポイント（作成時に txt_post.points を取り込む）
alter table txt_transaction add column if not exists points integer;


-- ------------------------------------------------------------
-- 1) リクエスト送信
--    - 500ポイント以上が必要
--    - 自分の投稿には不可
--    - 同じ投稿への自分の pending リクエスト重複を防止
--    - txt_transaction(pending) と notification を作成し、双方向に紐付け
--    戻り値：作成した txt_transaction.id
-- ------------------------------------------------------------
create or replace function public.send_txt_request(p_txt_post_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me          uuid := auth.uid();
  v_owner       uuid;
  v_give        text;
  v_points      integer;
  v_post_points integer;
  v_giver       uuid;
  v_receiver    uuid;
  v_type        text;
  v_tx_id       bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 投稿をロックして取得（削除・状態変更との競合防止）。points も取り込む。
  select user_id, give_type, points
    into v_owner, v_give, v_post_points
  from txt_post
  where id = p_txt_post_id
  for update;

  if v_owner is null then
    raise exception 'post not found';
  end if;
  if v_owner = v_me then
    raise exception 'cannot request own post';
  end if;

  -- ポイント判定
  select points into v_points from "user" where id = v_me;
  if coalesce(v_points, 0) < 500 then
    raise exception 'insufficient points';
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

  insert into txt_transaction (txt_post_id, giver_id, receiver_id, status, points)
  values (p_txt_post_id, v_giver, v_receiver, 'pending', v_post_points)
  returning id into v_tx_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_me, v_owner, v_type, p_txt_post_id, v_tx_id);

  return v_tx_id;
end;
$$;


-- ------------------------------------------------------------
-- 2) リクエスト承諾（ポスト主のみ）
--    - 対象 transaction が pending か FOR UPDATE で検証
--    - transaction→matched / txt_post→マッチング済み / 通知→accepted
--    - 同じ投稿の他 pending は cancelled、他リクエスト通知は締め切り+見送り通知
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

  -- 取引をロックして pending か検証
  select status into v_status
  from txt_transaction
  where id = v_notif.txt_transaction_id
  for update;

  if v_status is distinct from 'pending' then
    raise exception 'transaction not pending';
  end if;

  -- 承諾する取引を matched に
  update txt_transaction set status = 'matched'
  where id = v_notif.txt_transaction_id;

  -- 投稿をマッチング済みに
  update txt_post set status = 'マッチング済み'
  where id = v_notif.txt_post_id;

  -- この通知を承諾済みに
  update notification set is_read = true, request_status = 'accepted'
  where id = p_notification_id;

  -- 同じ投稿の他の pending 取引は cancelled に
  update txt_transaction set status = 'cancelled'
  where txt_post_id = v_notif.txt_post_id
    and status = 'pending'
    and id <> v_notif.txt_transaction_id;

  -- リクエスト送信者へ「承諾されました」通知
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
-- 3) リクエスト見送り（ポスト主のみ）
--    - 対象 transaction が pending か検証 → cancelled
--    - 通知→rejected、送信者へ見送り通知
-- ------------------------------------------------------------
create or replace function public.reject_txt_request(p_notification_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_notif  record;
  v_status text;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_notif from notification where id = p_notification_id;
  if v_notif is null or v_notif.receiver_id <> v_me then
    raise exception 'not authorized';
  end if;

  select status into v_status
  from txt_transaction
  where id = v_notif.txt_transaction_id
  for update;

  if v_status is distinct from 'pending' then
    raise exception 'transaction not pending';
  end if;

  update txt_transaction set status = 'cancelled'
  where id = v_notif.txt_transaction_id;

  update notification set is_read = true, request_status = 'rejected'
  where id = p_notification_id;

  insert into notification (sender_id, receiver_id, notification_type, txt_post_id)
  values (v_me, v_notif.sender_id, 'request_rejected', v_notif.txt_post_id);
end;
$$;


-- ------------------------------------------------------------
-- 4) リクエスト取り下げ（送信者のみ）
--    - ポスト主が未対応（request_status is null かつ transaction が pending）のときのみ
--    - transaction→cancelled、通知→request_withdrawn（ポスト主側の表示が変わる）
-- ------------------------------------------------------------
create or replace function public.withdraw_txt_request(p_notification_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_notif  record;
  v_status text;
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

  select status into v_status
  from txt_transaction
  where id = v_notif.txt_transaction_id
  for update;

  if v_status is distinct from 'pending' then
    raise exception 'transaction not pending';
  end if;

  update txt_transaction set status = 'cancelled'
  where id = v_notif.txt_transaction_id;

  update notification set notification_type = 'request_withdrawn', is_read = false
  where id = p_notification_id;
end;
$$;


-- ------------------------------------------------------------
-- 5) 譲渡完了（運営のみ）
--    - matched の取引のみ completed にできる（FOR UPDATE の行ロックで二重実行を防止）
--    - 贈与者(giver)へ +500pt（total_earned_points も +500）
--    - 受取者(receiver)から -500pt（不足していれば中断してポイントを負にしない）
-- ------------------------------------------------------------
create or replace function public.complete_txt_transaction(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me              uuid := auth.uid();
  v_tx              record;
  v_amount          integer;
  v_receiver_points integer;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 運営のみ実行可能
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  -- 取引をロックして matched か検証
  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_tx.status <> 'matched' then
    raise exception 'transaction not matched';
  end if;

  -- 付与/消費するポイント（取引作成時に取り込んだ txt_post.points）
  v_amount := coalesce(v_tx.points, 0);

  -- 受取者のポイントをロックして確認（不足なら中断）
  select points into v_receiver_points from "user" where id = v_tx.receiver_id for update;
  if coalesce(v_receiver_points, 0) < v_amount then
    raise exception 'receiver insufficient points';
  end if;

  -- 完了に更新
  update txt_transaction set status = 'completed' where id = p_id;

  -- 贈与者へ +v_amount（累計獲得ポイントも加算）
  update "user"
     set points = points + v_amount,
         total_earned_points = coalesce(total_earned_points, 0) + v_amount
   where id = v_tx.giver_id;

  -- 受取者から -v_amount
  update "user"
     set points = points - v_amount
   where id = v_tx.receiver_id;

  -- 完了通知（双方向）。相手を sender に設定し、フロントで相手名/書籍名/ポイントを表示する。
  -- 贈与者へ：ポイント付与
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_completed_giver', v_tx.txt_post_id, v_tx.id);
  -- 受取者へ：ポイント消費
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_completed_receiver', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- 実行権限：ログインユーザーが RPC を呼べるようにする
-- ------------------------------------------------------------
grant execute on function public.send_txt_request(bigint)          to authenticated;
grant execute on function public.accept_txt_request(bigint)        to authenticated;
grant execute on function public.reject_txt_request(bigint)        to authenticated;
grant execute on function public.withdraw_txt_request(bigint)      to authenticated;
grant execute on function public.complete_txt_transaction(bigint)  to authenticated;
