"use client";

import { PostList } from "./PostList";

interface PostTabsContentProps {
  posts: any[];
  loading?: boolean;
  emptyMessage?: string;
}

// ★ ここを確実に「export function PostTabsContent」の形に固定します
export function PostTabsContent({ posts, loading, emptyMessage = "投稿がありません" }: PostTabsContentProps) {
  // 1. ローディング中の表示
  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  // 2. データが空の場合の表示
  if (!posts || posts.length === 0) {
    return (
      <div className="p-20 text-center text-gray-400 text-sm">
        {emptyMessage}
      </div>
    );
  }

  // 3. データがある場合は PostList を呼び出す
  return <PostList posts={posts} />;
}