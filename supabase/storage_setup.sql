-- ============================================================
-- Storage（画像バケット）セットアップ ― 本番プロジェクトで実行
--   バケットは用途ごとに4つ。パスは全て {userId}/ファイル名 で統一。
--   ・公開読み取り（getPublicUrl で表示するため）
--   ・書き込み/更新/削除は「自分のフォルダ（先頭が自分の uid）」のみ
-- ============================================================

-- ---------- バケット作成（公開） ----------
insert into storage.buckets (id, name, public) values
  ('post_images',     'post_images',     true),  -- ホーム投稿・プロフィール発の投稿画像
  ('avatars',         'avatars',         true),  -- プロフィールアイコン
  ('txt_post_images', 'txt_post_images', true)   -- 教科書譲渡の投稿画像
on conflict (id) do nothing;
-- ※ DM はテキスト専用のため画像バケットなし。


-- ---------- storage.objects ポリシー ----------
-- 公開読み取り（画像表示）
drop policy if exists "app public read" on storage.objects;
create policy "app public read" on storage.objects
  for select to public
  using (bucket_id in ('post_images','avatars','txt_post_images'));

-- 自分のフォルダにのみアップロード可（先頭フォルダ = 自分の uid）
drop policy if exists "app own folder insert" on storage.objects;
create policy "app own folder insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('post_images','avatars','txt_post_images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 自分のフォルダのファイルのみ更新可（アイコンの upsert 用）
drop policy if exists "app own folder update" on storage.objects;
create policy "app own folder update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('post_images','avatars','txt_post_images')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('post_images','avatars','txt_post_images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 自分のフォルダのファイルのみ削除可
drop policy if exists "app own folder delete" on storage.objects;
create policy "app own folder delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('post_images','avatars','txt_post_images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
