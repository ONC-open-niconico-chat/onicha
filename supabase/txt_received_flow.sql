-- ============================================================
-- ユーザーによる受け取り確認フロー（'received' 状態の導入）
-- ------------------------------------------------------------
-- ※ 既存の supabase/txt_request_functions.sql とは別ファイルです。
--    そちら（元の関数群）を適用済みの環境で、この 1 ファイルを
--    Supabase SQL Editor に貼り付けて実行してください。
--    本ファイルの complete_txt_transaction / cancel_txt_transaction は
--    txt_request_functions.sql の同名関数を「置き換え」ます（受け取り確認
--    済み 'received' も対象にするための拡張。他のロジックは同一）。
--
-- 目的：教科書の受け渡しをユーザーに任せるモデル。
--   受取者が対面で「受け取りました」を押すと取引を 'received' にする。
--   ★ このステップではポイントを一切動かさない。
--   ポイントの増減を伴う 'completed' 化は、従来どおり運営のみが実行する。
--
--   ユーザー自身に completed（＝ポイント移動）をさせない理由：
--     (1) 完了時に giver の total_earned_points（＝ランクの根拠）が増えるため、
--         共謀した2アカウントで「譲渡した体」の完了を繰り返すとランクを不正に
--         稼げてしまう。運営ゲートで完了させることでこれを防ぐ。
--     (2) ポイント移動の箇所を運営RPCの単一監査点に保ち、不正検知・紛争対応を容易にする。
--
-- 状態遷移：
--   pending  --(投稿主が承諾)-->            matched
--   matched  --(受取者が「受け取りました」)--> received   ← 本ファイルで追加（ポイント不動）
--   received --(運営が確認)-->              completed  ← 本ファイルで対象拡張（ここで初めてポイント増減）
--   matched / received --(運営)-->          cancelled  ← 本ファイルで対象拡張
-- ============================================================


-- ------------------------------------------------------------
-- A) 受け取り確認（受取者のみ）: matched -> received
--    - auth.uid() が受取者本人であることを検証（giver や第三者は不可）
--    - ポイントは動かさない（確定は運営の completed 化で行う）
--    - is_read=false にして、運営の取引一覧に「新着（受取確認済み）」として再浮上させる
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

  -- 取引をロックして状態を検証（二重押し・競合を防ぐ）
  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;

  -- 受取者本人のみが「受け取りました」を押せる
  if v_tx.receiver_id <> v_me then
    raise exception 'not authorized';
  end if;

  -- マッチング中の取引のみ受け取り確認できる
  if v_tx.status <> 'matched' then
    raise exception 'transaction not matched';
  end if;

  -- 受け取り確認：ポイントは動かさない。運営の確認待ちにするため未読化する。
  update txt_transaction
     set status = 'received',
         is_read = false
   where id = p_id;
end;
$$;


-- ------------------------------------------------------------
-- B) 譲渡完了（運営のみ）※ txt_request_functions.sql の同名関数を置き換え
--    変更点：完了可能な状態を 'matched' のみ → 'matched' または 'received' に拡張。
--    （受取者が受け取り確認済み(received)の取引を、運営が最終確認して完了できる。
--      受取確認がない matched でも、紛争時に運営が直接完了できる従来動作は維持。）
--    それ以外（ポイント移動・予約解放・通知）のロジックは従来と同一。
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

  -- 取引をロックして matched / received か検証
  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_tx.status not in ('matched', 'received') then
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
  update "user"
     set reserved_points = greatest(coalesce(reserved_points, 0) - v_amount, 0)
   where id = v_tx.receiver_id;

  -- 完了通知（双方向）。相手を sender に設定し、フロントで相手名/書籍名/ポイントを表示する。
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.receiver_id, v_tx.giver_id, 'transfer_completed_giver', v_tx.txt_post_id, v_tx.id);
  insert into notification (sender_id, receiver_id, notification_type, txt_post_id, txt_transaction_id)
  values (v_tx.giver_id, v_tx.receiver_id, 'transfer_completed_receiver', v_tx.txt_post_id, v_tx.id);
end;
$$;


-- ------------------------------------------------------------
-- C) マッチング解除（運営のみ）※ txt_request_functions.sql の同名関数を置き換え
--    変更点：取り消し可能な状態を 'matched' のみ → 'matched' または 'received' に拡張。
--    （受取確認済み(received)でも、実際には受け渡されていない等の場合に運営が取り消せる。）
--    それ以外（投稿を募集中へ戻す・予約解放・通知）のロジックは従来と同一。
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

  -- 取引をロックして matched / received か検証
  select * into v_tx from txt_transaction where id = p_id for update;
  if v_tx is null then
    raise exception 'transaction not found';
  end if;
  if v_tx.status not in ('matched', 'received') then
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
-- 実行権限
--  mark_txt_received：ログインユーザー（受取者本人チェックは関数内で実施）
--  complete_/cancel_：ログインユーザー（運営チェックは関数内で実施。元ファイルと同様）
-- ------------------------------------------------------------
grant execute on function public.mark_txt_received(bigint)        to authenticated;
grant execute on function public.complete_txt_transaction(bigint) to authenticated;
grant execute on function public.cancel_txt_transaction(bigint)   to authenticated;
