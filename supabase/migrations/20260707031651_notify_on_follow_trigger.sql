-- フォローされたら通知を自動作成するトリガー。
-- follows テーブルに行が追加された瞬間に、フォローされた側(following_id)へ
-- notification_type = 'follow' の通知を1件作る。
-- フロントのフォローボタンがどのブランチ/場所にあっても確実に通知が飛ぶ。

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 自分自身へのフォロー通知は作らない
  if NEW.follower_id is distinct from NEW.following_id then
    insert into public.notification (receiver_id, sender_id, notification_type)
    values (NEW.following_id, NEW.follower_id, 'follow');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_on_follow on public.follows;

create trigger trg_notify_on_follow
  after insert on public.follows
  for each row
  execute function public.notify_on_follow();
