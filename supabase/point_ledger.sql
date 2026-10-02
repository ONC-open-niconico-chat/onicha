-- ============================================================
-- ポイント増減履歴（point_ledger）：user の points / reserved_points 変更を自動記帳
-- ------------------------------------------------------------
-- ※ フロントには出さず、問題発生時に Supabase（運営）から確認するためのデバッグ／監査用。
--    RPCは変更しません。user テーブルの AFTER UPDATE トリガーで、points もしくは
--    reserved_points が変わったときだけ 1 行追記します（増減前・増減後を保持）。
--    冪等（再実行可）。
-- ============================================================

create table if not exists public.point_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public."user"(id) on delete cascade,
  points_before   integer,
  points_after    integer,
  points_delta    integer,
  reserved_before integer,
  reserved_after  integer,
  reserved_delta  integer,
  actor           uuid,          -- 変更を引き起こした操作者（auth.uid()。運営完了なら運営、システムは null）
  created_at      timestamptz not null default now()
);

create index if not exists idx_point_ledger_user on public.point_ledger(user_id, created_at desc);

-- 閲覧は運営(staff)のみ（通常ユーザーには見せない。実確認はダッシュボード＝service_roleでも可）。
alter table public.point_ledger enable row level security;
drop policy if exists "staff reads point ledger" on public.point_ledger;
create policy "staff reads point ledger" on public.point_ledger
  for select to authenticated
  using (exists (select 1 from staff_members s where s.user_id = auth.uid()));
grant select on public.point_ledger to authenticated;
-- 追記はトリガー（SECURITY DEFINER）だけが行う。クライアントの書き込みポリシーは付けない。


-- ------------------------------------------------------------
-- 記帳トリガー：points / reserved_points が変化したときだけ 1 行追加
-- ------------------------------------------------------------
create or replace function public.log_point_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.points is distinct from old.points
     or new.reserved_points is distinct from old.reserved_points then
    insert into point_ledger (
      user_id,
      points_before, points_after, points_delta,
      reserved_before, reserved_after, reserved_delta,
      actor
    ) values (
      new.id,
      old.points, new.points, coalesce(new.points, 0) - coalesce(old.points, 0),
      old.reserved_points, new.reserved_points,
      coalesce(new.reserved_points, 0) - coalesce(old.reserved_points, 0),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_point_change on public."user";
create trigger trg_log_point_change
  after update on public."user"
  for each row
  execute function public.log_point_change();
