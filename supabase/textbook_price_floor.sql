-- ============================================================
-- 教科書価格の算出を「定価 × 0.4 の一の位切り捨て（＝10の倍数に切り下げ）」に変更
-- ------------------------------------------------------------
-- ※ create_textbook を置き換えます（従来は round(定価×0.4)＝四捨五入）。
--    Supabase SQL Editor で実行してください。冪等（再実行可）。
--    例：定価 1234 → 1234*0.4=493.6 → 493 → 一の位切り捨て → 490
-- ============================================================

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

  -- price = 定価 × 0.4 の一の位を切り捨て（＝10の倍数に切り下げ）
  insert into textbook (title, price, list_price)
  values (v_title, (floor(p_list_price * 0.4 / 10) * 10)::integer, p_list_price)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_textbook(text, integer) to authenticated;
