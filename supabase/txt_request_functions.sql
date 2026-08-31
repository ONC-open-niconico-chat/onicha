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
--   txt_post(id bigint, user_id uuid, give_type text, status text,
--            points integer /*取引額。作成時に textbook.price を凍結*/)
--   txt_transaction(id bigint, txt_post_id bigint, giver_id uuid, receiver_id uuid, status text)
--   notification(id bigint, sender_id uuid, receiver_id uuid, notification_type text,
--                txt_post_id bigint, txt_transaction_id bigint,
--                request_status text, is_read boolean, created_at timestamptz default now())
--   "user"(id uuid, points integer)
--
-- ※ notification.id が uuid の場合は、各関数の引数 p_notification_id を uuid に変えてください。
-- ============================================================


-- 教科書ごとの価格（付与/消費ポイント）。教科書マスタで管理する。
alter table textbook add column if not exists price integer;

-- ユーザーが入力した定価（運営の確認用に保持）。price = round(list_price * 0.4)。
alter table textbook add column if not exists list_price integer;

-- 運営が定価/価格を確認済みか（ユーザー追加分のレビュー用）。
alter table textbook add column if not exists confirmed boolean not null default false;

-- 取引ごとの付与/消費ポイント（作成時に textbook.price を取り込む）
alter table txt_transaction add column if not exists points integer;

-- 仮消費（予約）ポイント。offering リクエスト送信時に価格分を確保し、
-- 完了で確定 / キャンセルで解放する。利用可能残高 = points - reserved_points。
alter table "user" add column if not exists reserved_points integer not null default 0;

-- 運営が取引を確認済みか（取引管理での未読管理用）。既定は未読(false)。
alter table txt_transaction add column if not exists is_read boolean not null default false;


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
  v_me        uuid := auth.uid();
  v_owner     uuid;
  v_give      text;
  v_points    integer;
  v_reserved  integer;
  v_price     integer;
  v_frozen    integer;  -- 投稿に凍結された取引額（txt_post.points）
  v_tx_points integer;  -- この取引で付与/消費するポイント
  v_giver     uuid;
  v_receiver  uuid;
  v_type      text;
  v_tx_id     bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 投稿をロックして取得（削除・状態変更との競合防止）。
  -- 取引額は投稿に凍結された txt_post.points を用いる（未設定の旧データは textbook.price にフォールバック）。
  select tp.user_id, tp.give_type, tp.points, tb.price
    into v_owner, v_give, v_frozen, v_price
  from txt_post tp
  left join textbook tb on tb.id = tp.textbook_id
  where tp.id = p_txt_post_id
  for update of tp;

  -- この取引で付与/消費するポイント（投稿に凍結された取引額）
  v_tx_points := coalesce(nullif(v_frozen, 0), v_price, 0);

  if v_owner is null then
    raise exception 'post not found';
  end if;
  if v_owner = v_me then
    raise exception 'cannot request own post';
  end if;

  -- 残高判定：offering（譲ります）へのリクエストはリクエスト者＝受取者（支払う側）。
  -- 利用可能残高（points - reserved_points）が取引額分あるか確認し、取引額分を予約（仮消費）。
  -- seeking では支払わないのでチェック・予約は不要。
  if v_give = 'offering' then
    -- ユーザー行をロックして同時リクエストによる予約超過を防ぐ
    select points, reserved_points into v_points, v_reserved
      from "user" where id = v_me for update;
    if coalesce(v_points, 0) - coalesce(v_reserved, 0) < v_tx_points then
      raise exception 'insufficient points';
    end if;
    update "user"
       set reserved_points = coalesce(reserved_points, 0) + v_tx_points
     where id = v_me;
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
  values (p_txt_post_id, v_giver, v_receiver, 'pending', v_tx_points)
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
  v_give   text;
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

  select give_type into v_give from txt_post where id = v_notif.txt_post_id;

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

  -- 同じ投稿の他の pending 取引：offering なら各受取者の予約を解放してから cancelled に
  if v_give = 'offering' then
    update "user" u
       set reserved_points = greatest(coalesce(u.reserved_points, 0) - coalesce(t.points, 0), 0)
    from txt_transaction t
    where t.txt_post_id = v_notif.txt_post_id
      and t.status = 'pending'
      and t.id <> v_notif.txt_transaction_id
      and u.id = t.receiver_id;
  end if;

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
  v_me    uuid := auth.uid();
  v_notif record;
  v_tx    record;
  v_give  text;
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

  -- offering の request 時に仮消費した予約を解放
  select give_type into v_give from txt_post where id = v_tx.txt_post_id;
  if v_give = 'offering' then
    update "user"
       set reserved_points = greatest(coalesce(reserved_points, 0) - coalesce(v_tx.points, 0), 0)
     where id = v_tx.receiver_id;
  end if;

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
  v_me    uuid := auth.uid();
  v_notif record;
  v_tx    record;
  v_give  text;
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

  -- offering の request 時に仮消費した予約を解放
  select give_type into v_give from txt_post where id = v_tx.txt_post_id;
  if v_give = 'offering' then
    update "user"
       set reserved_points = greatest(coalesce(reserved_points, 0) - coalesce(v_tx.points, 0), 0)
     where id = v_tx.receiver_id;
  end if;
end;
$$;


-- ------------------------------------------------------------
-- 4.5) 教科書譲渡ポストの作成
--    - user_id はサーバー側で auth.uid() を強制（改ざん防止）
--    - seeking（譲ってください）は投稿主が支払う側なので、
--      利用可能残高（points - reserved_points）が価格分あるか確認し、
--      価格分を予約（user.reserved_points += price）。取引額は txt_post.points に凍結して保持。
--    - offering は予約なし（従来どおりリクエスト送信時に予約）。
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
  v_me       uuid := auth.uid();
  v_price    integer;
  v_amount   integer;         -- この投稿の取引額（textbook.price を作成時に凍結）
  v_points   integer;
  v_reserved integer;
  v_post_id  bigint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if p_give_type not in ('offering', 'seeking') then
    raise exception 'invalid give_type';
  end if;

  -- 教科書と価格を取得。取引額はここで凍結する。
  select price into v_price from textbook where id = p_textbook_id;
  if not found then
    raise exception 'textbook not found';
  end if;
  v_amount := coalesce(v_price, 0);

  -- seeking：投稿主が受取者（支払う側）。残高を確認して取引額分を予約する。
  if p_give_type = 'seeking' then
    -- ユーザー行をロックして同時投稿による予約超過を防ぐ
    select points, reserved_points into v_points, v_reserved
      from "user" where id = v_me for update;
    if coalesce(v_points, 0) - coalesce(v_reserved, 0) < v_amount then
      raise exception 'insufficient points';
    end if;
    update "user"
       set reserved_points = coalesce(reserved_points, 0) + v_amount
     where id = v_me;
  end if;

  -- image_urls は text 型カラム。配列を JSON 文字列（例: '["https://..."]'）にして格納する
  -- （フロントの normalizeImageUrls が JSON 配列文字列を解釈できる。空なら '[]'）。
  -- points＝この投稿の取引額（両種別で作成時に凍結）。
  insert into txt_post
    (give_type, user_id, textbook_id, description, status, condition_id, image_urls, points, created_at)
  values
    (p_give_type, v_me, p_textbook_id, p_description, '募集中', p_condition_id,
     to_json(coalesce(p_image_urls, '{}'::text[]))::text, v_amount, now())
  returning id into v_post_id;

  return v_post_id;
end;
$$;


-- ------------------------------------------------------------
-- 4.6) 教科書譲渡ポストの削除
--    - 本人のみ。マッチング済み（進行中取引あり）は削除不可。
--    - seeking：投稿時に予約した額（txt_post.points）を投稿主へ解放。
--    - offering：この投稿への pending リクエスト者（受取者）の予約を解放。
--    - 紐づく通知・取引を削除してから投稿を削除。
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
  v_give   text;
  v_status text;
  v_frozen integer;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- 投稿をロックして取得（同時操作との競合防止）
  select user_id, give_type, status, points
    into v_owner, v_give, v_status, v_frozen
  from txt_post
  where id = p_txt_post_id
  for update;

  if v_owner is null then
    raise exception 'post not found';
  end if;
  if v_owner <> v_me then
    raise exception 'not authorized';
  end if;
  -- マッチング済みは削除不可（進行中取引・予約の整合性を守る）
  if v_status = 'マッチング済み' then
    raise exception 'post already matched';
  end if;

  -- 予約の解放
  if v_give = 'seeking' then
    -- 投稿主が投稿時に予約した分を解放
    update "user"
       set reserved_points = greatest(coalesce(reserved_points, 0) - coalesce(v_frozen, 0), 0)
     where id = v_owner;
  else
    -- offering：この投稿への pending リクエスト者（受取者）の予約を解放
    update "user" u
       set reserved_points = greatest(coalesce(u.reserved_points, 0) - coalesce(t.points, 0), 0)
    from txt_transaction t
    where t.txt_post_id = p_txt_post_id
      and t.status = 'pending'
      and u.id = t.receiver_id;
  end if;

  -- 紐づくデータを削除してから投稿本体を削除
  delete from notification    where txt_post_id = p_txt_post_id;
  delete from txt_transaction where txt_post_id = p_txt_post_id;
  delete from txt_post        where id = p_txt_post_id;
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

  -- 受取者から -v_amount（確定消費）
  update "user"
     set points = points - v_amount
   where id = v_tx.receiver_id;

  -- 予約(reserved)していた分を解放し、確定消費に振り替える。
  -- offering は request 時に、seeking は投稿時に、いずれも受取者が予約している。
  -- （この機能導入前のレガシー seeking 投稿は予約していないが、その完了時はここで
  --   受取者の予約が 0 にクランプされるだけで、通常運用では問題にならない。）
  update "user"
     set reserved_points = greatest(coalesce(reserved_points, 0) - v_amount, 0)
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
-- 5.5) マッチング解除（運営のみ）
--    - matched の取引を cancelled に戻し、投稿を「募集中」に再開する
--      （成立後に受け渡しが立ち消えた取引の後始末）。
--    - offering：リクエスト者(受取者)の予約を解放（投稿は再募集され、他者が改めて予約する）。
--    - seeking ：投稿主(受取者)の予約は投稿に紐づくため、再募集する投稿とともに保持（解放しない）。
--    - 双方へ取り消し通知。
-- ------------------------------------------------------------
create or replace function public.cancel_txt_transaction(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_tx     record;
  v_amount integer;
  v_give   text;
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

  v_amount := coalesce(v_tx.points, 0);

  -- 投稿をロックして種別を取得
  select give_type into v_give from txt_post where id = v_tx.txt_post_id for update;

  -- 取引を取り消し、投稿を募集中に戻す
  update txt_transaction set status = 'cancelled' where id = p_id;
  update txt_post set status = '募集中' where id = v_tx.txt_post_id;

  -- 予約の解放
  --  offering：リクエスト者(受取者)の予約を解放。
  --  seeking ：投稿主(受取者)の予約は投稿に紐づくため、再募集する投稿とともに保持（解放しない）。
  if v_give = 'offering' then
    update "user"
       set reserved_points = greatest(coalesce(reserved_points, 0) - v_amount, 0)
     where id = v_tx.receiver_id;
  end if;

  -- 双方へ取り消し通知（相手を sender に設定し、フロントで相手名/書籍名を表示する）
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_cancelled', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_cancelled', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- 6) 教科書の価格を設定（運営のみ）
-- ------------------------------------------------------------
create or replace function public.set_textbook_price(p_textbook_id bigint, p_price integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'invalid price';
  end if;

  update textbook set price = p_price where id = p_textbook_id;
end;
$$;


-- ------------------------------------------------------------
-- 7) 新規教科書の追加（ログインユーザー）
--    - price は定価×0.4 をサーバー側で計算（クライアントで改ざん不可）
--    - 入力された定価は list_price に保持（運営の確認用）
--    戻り値：作成した textbook.id
-- ------------------------------------------------------------
create or replace function public.create_textbook(p_title text, p_list_price integer)
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
  if p_list_price is null or p_list_price <= 0 then
    raise exception 'invalid list price';
  end if;

  insert into textbook (title, price, list_price)
  values (v_title, round(p_list_price * 0.4)::integer, p_list_price)
  returning id into v_id;

  return v_id;
end;
$$;


-- ------------------------------------------------------------
-- 8) 教科書を確認済みにする（運営のみ）
-- ------------------------------------------------------------
create or replace function public.confirm_textbook(p_textbook_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  update textbook set confirmed = true where id = p_textbook_id;
end;
$$;


-- ------------------------------------------------------------
-- 9) 取引を既読にする（運営のみ）
-- ------------------------------------------------------------
create or replace function public.mark_transaction_read(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  update txt_transaction set is_read = true where id = p_id;
end;
$$;


-- ------------------------------------------------------------
-- 10) 運営宛メッセージ通知を既読にする（運営として/運営のみ）
--     - 管理チャットで相手(p_partner_id)との会話を開いたときに呼ぶ
-- ------------------------------------------------------------
create or replace function public.mark_official_messages_read(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_official uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from staff_members s where s.user_id = v_me) then
    raise exception 'not authorized';
  end if;

  select id into v_official from "user" where is_official limit 1;
  if v_official is null then
    return;
  end if;

  update notification set is_read = true
  where receiver_id = v_official
    and sender_id = p_partner_id
    and notification_type = 'message'
    and is_read = false;
end;
$$;


-- ------------------------------------------------------------
-- 実行権限：ログインユーザーが RPC を呼べるようにする
-- ------------------------------------------------------------
grant execute on function public.create_txt_post(text, bigint, text, bigint, text[]) to authenticated;
grant execute on function public.delete_txt_post(bigint)           to authenticated;
grant execute on function public.send_txt_request(bigint)          to authenticated;
grant execute on function public.accept_txt_request(bigint)        to authenticated;
grant execute on function public.reject_txt_request(bigint)        to authenticated;
grant execute on function public.withdraw_txt_request(bigint)      to authenticated;
grant execute on function public.complete_txt_transaction(bigint)  to authenticated;
grant execute on function public.cancel_txt_transaction(bigint)    to authenticated;
grant execute on function public.set_textbook_price(bigint, integer) to authenticated;
grant execute on function public.create_textbook(text, integer)      to authenticated;
grant execute on function public.confirm_textbook(bigint)            to authenticated;
grant execute on function public.mark_transaction_read(bigint)       to authenticated;
grant execute on function public.mark_official_messages_read(uuid)   to authenticated;


-- ------------------------------------------------------------
-- 11) 通報の作成（ログインユーザー）
--    - reporter_id は auth.uid() を強制（なりすまし防止）
--    - 対象の内容を通報時点でサーバー側から取得し、report にスナップショット保存
--      （元投稿が後で削除/編集されても運営が確認できる＝改ざん不可の証拠）
--    - 被通報者(reporterd_user_id)もサーバーが対象から特定
--    戻り値：作成した report.id
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
