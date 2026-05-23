"use client";

import { Heart, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface PostListProps {
  posts: any[];
}

function formatTime(dateString: string) {
  if (!dateString) return "";
  const postDate = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - postDate.getTime()) / 1000);
  let adjustedDiff = diffInSeconds;
  
  if (adjustedDiff >= 32400) {
    adjustedDiff = adjustedDiff - 32400;
  }

  if (adjustedDiff < 60) return "たった今";
  const diffInMinutes = Math.floor(adjustedDiff / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}分前`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}時間前`;
  const diffInDays = Math.floor(adjustedDiff / 24);
  if (diffInDays < 7) return `${diffInDays}日前`;
  
  return postDate.toLocaleDateString('ja-JP');
}

export function PostList({ posts }: PostListProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myLikes, setMyLikes] = useState<Set<number>>(new Set());
  const [localPosts, setLocalPosts] = useState<any[]>(posts);

  // 1. 親（page.tsx）から新しい投稿データ（DBの最新値）が降ってきたら、確実に同期する
  useEffect(() => {
    setLocalPosts(posts);
  }, [posts]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        supabase.from('like').select('post_id').eq('user_id', data.user.id)
          .then(({ data: likes }) => {
            if (likes) setMyLikes(new Set(likes.map(l => l.post_id)));
          });
      }
    });
  }, []);

  const handleDelete = async (postId: number) => {
    if (!currentUserId || !confirm("削除しますか？")) return;
    await supabase.from('like').delete().eq('post_id', postId);
    const { error } = await supabase.from('post').delete().eq('id', postId).eq('user_id', currentUserId);
    if (!error) {
      setLocalPosts(prev => prev.filter(p => p.id !== postId));
    }
  };

  // 2. いいねボタンを押した時の処理（ここを修正）
  const toggleLike = async (postId: number, currentLikes: number) => {
    if (!currentUserId) return alert("ログインが必要です");
    
    const isLiked = myLikes.has(postId);
    // DBの現在の値（currentLikes）をベースにして、確実に+1または-1する
    const newCount = isLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;

    // 先に画面の「ハートの見た目」を切り替える
    setMyLikes(prev => {
      const n = new Set(prev);
      isLiked ? n.delete(postId) : n.add(postId);
      return n;
    });

    // ★ 画面に表示されている数字を、計算後の正確な新しいカウント（newCount）に直接上書きする
    setLocalPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, number_of_likes: newCount } : p
    ));

    // Supabase（データベース）側を更新
    if (!isLiked) {
      await supabase.from('like').insert([{ user_id: currentUserId, post_id: postId }]);
    } else {
      await supabase.from('like').delete().eq('post_id', postId).eq('user_id', currentUserId);
    }
    
    // postテーブルの number_of_likes カラムを最新値にアップデート
    await supabase.from('post').update({ number_of_likes: newCount }).eq('id', postId);
  };

  if (!localPosts || localPosts.length === 0) {
    return <div className="p-20 text-center text-gray-400">表示できる投稿がありません</div>;
  }

  return (
    <div className="divide-y divide-gray-100 pb-20">
      {localPosts.map((post) => (
        <div key={post.id} className="p-4 flex gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex-shrink-0 flex items-center justify-center text-blue-600 font-bold">
            {post.user?.username?.substring(0, 1) || "U"}
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{post.user?.username || "名無し"}</span>
                <span className="text-[11px] text-gray-400">{formatTime(post.created_at)}</span>
              </div>
              {currentUserId === post.user_id && (
                <button onClick={() => handleDelete(post.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-gray-800 text-sm my-1 leading-relaxed whitespace-pre-wrap">{post.content}</p>
            <button 
              // ★ 引数として post.number_of_likes（DBから降ってきた現在の数）を確実に渡す
              onClick={() => toggleLike(post.id, post.number_of_likes || 0)}
              className={`flex items-center gap-1 text-xs transition-colors ${myLikes.has(post.id) ? "text-red-500 font-bold" : "text-gray-400"}`}
            >
              <Heart className={`w-4 h-4 ${myLikes.has(post.id) ? "fill-current" : ""}`} />
              {/* ★ ここで localPosts 内のリアルタイムな数を表示する */}
              <span>{post.number_of_likes || 0}</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}