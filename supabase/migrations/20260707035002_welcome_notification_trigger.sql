-- 新規ユーザー登録時に「登録ありがとうございます」通知を自動作成するトリガー。
-- user テーブルに行が追加された瞬間に、その人へ notification_type = 'welcome' を1件作る。
-- システム通知のため sender_id は本人自身を入れる（NOT NULL 制約のため。表示側で送信者名は出さない）。

create or replace function public.notify_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification (receiver_id, sender_id, notification_type)
  values (NEW.id, NEW.id, 'welcome');
  return NEW;
end;
$$;

drop trigger if exists trg_notify_welcome on public."user";

create trigger trg_notify_welcome
  after insert on public."user"
  for each row
  execute function public.notify_welcome();
