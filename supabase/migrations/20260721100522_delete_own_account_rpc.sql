-- ログイン中のユーザーが「自分自身のアカウント」を削除するための RPC。
-- クライアント(anonキー)からは auth.users を消せないため、SECURITY DEFINER 関数として用意する。

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.notification where receiver_id = uid or sender_id = uid;
  delete from public.chat        where sender_id   = uid or receiver_id = uid;
  delete from public.follows     where follower_id = uid or following_id = uid;
  delete from public."like"      where user_id = uid;
  delete from public.txt_post    where user_id = uid;
  delete from public.post        where user_id = uid;
  delete from public.point       where user_id = uid;
  delete from public."user"      where id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
