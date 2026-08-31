-- ============================================================
-- サインアップ時に public."user" を作成するトリガー
-- （schema.sql の後に実行。auth.users への INSERT で発火）
-- ・raw_user_meta_data（signup 時の username / grade / department_id）から作成
-- ・points は user.points の DEFAULT(1000) が入る
-- ・ウェルカム通知を作成
-- ※ 旧DBにあった public.point への初期ポイント挿入は、本番では point テーブルを
--   使わないため削除した。
-- ============================================================

create or replace function public.handle_new_user_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parsed_dept_id int;
  parsed_grade   bigint;
begin
  begin
    parsed_dept_id := (new.raw_user_meta_data->>'department_id')::int;
  exception when others then
    parsed_dept_id := null;
  end;

  begin
    parsed_grade := (new.raw_user_meta_data->>'grade')::bigint;
  exception when others then
    parsed_grade := null;
  end;

  -- ① プロフィール行を作成（points は DEFAULT 1000）
  insert into public."user" (id, username, grade, department_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'ユーザー'),
    parsed_grade,
    parsed_dept_id
  );

  -- ② ウェルカム通知（失敗しても signup は止めない）
  begin
    insert into public.notification (receiver_id, sender_id, notification_type, is_read, created_at)
    values (new.id, null, 'welcome', false, now());
  exception when others then
    raise warning 'Welcome notification failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_complete on auth.users;
create trigger on_auth_user_created_complete
  after insert on auth.users
  for each row execute function public.handle_new_user_complete();


-- ============================================================
-- 在籍者限定：メールドメインをサーバー側で強制
--   @cs.u-ryukyu.ac.jp 以外のメールでの新規登録を DB レベルで拒否する。
--   クライアントのチェック（signup画面）を迂回して supabase.auth.signUp を
--   直接叩かれても、ここで確実に弾ける。
--   ※ 運営/公式など非ドメインのアカウントが必要な場合は、このトリガーを
--     一時的に無効化して作成するか、先に作成しておくこと。
-- ============================================================
create or replace function public.enforce_school_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or lower(new.email) not like '%@cs.u-ryukyu.ac.jp' then
    raise exception '琉球大学のメールアドレス（@cs.u-ryukyu.ac.jp）のみ登録できます。'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_school_email on auth.users;
create trigger trg_enforce_school_email
  before insert on auth.users
  for each row execute function public.enforce_school_email();
