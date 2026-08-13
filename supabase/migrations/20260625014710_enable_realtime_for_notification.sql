-- notification テーブルをリアルタイム発行対象に追加する。
-- これにより通知ページ／サイドバーのバッジが、開いたまま自動で更新される。
-- （chat テーブルは登録済み。notification は未登録だったため追加する）

alter publication supabase_realtime add table public.notification;
