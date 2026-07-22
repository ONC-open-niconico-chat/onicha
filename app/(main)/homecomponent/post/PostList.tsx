"use client";

import { Heart, Trash2, UserPlus, UserMinus } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// ★ 修正：型定義に onRefresh?: () => void を追加して ts(2322) エラーを完全抹殺
interface PostListProps {
  posts: any[];
  onRefresh?: () => void; // 親（page.tsx）のデータ一括再取得関数
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

export function PostList({ posts, onRefresh }: PostListProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myLikes, setMyLikes] = useState<Set<number>>(new Set());
  const [myFollows, setMyFollows] = useState<Set<string>>(new Set()); 
  const [localPosts, setLocalPosts] = useState<any[]>(posts);

  // 1. 親から新しい投稿データ（最新のいいね数など）が降ってきたら同期
  useEffect(() => {
    setLocalPosts(posts);
  }, [posts]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const userId = data.user.id;
        setCurrentUserId(userId);
        
        // いいね一覧の取得
        supabase.from('like').select('post_id').eq('user_id', userId)
          .then(({ data: likes }) => {
            if (likes) setMyLikes(new Set(likes.map(l => l.post_id)));
          });

        // フォロー中の一覧を取得してセット
        supabase.from('follows').select('following_id').eq('follower_id', userId)
          .then(({ data: follows, error }) => {
            if (error) console.error("フォローデータの取得エラー:", error);
            if (follows) setMyFollows(new Set(follows.map(f => f.following_id)));
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
      // 削除時も親に通知して全体を同期
      if (onRefresh) onRefresh();
    }
  };

  // 2. いいねボタンを押した時の処理
  const toggleLike = async (postId: number, currentLikes: number) => {
    if (!currentUserId) return alert("ログインが必要です");
    
    const isLiked = myLikes.has(postId);
    const newCount = isLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;

    // 先にローカルの見た目を瞬時に切り替える
    setMyLikes(prev => {
      const n = new Set(prev);
      isLiked ? n.delete(postId) : n.add(postId);
      return n;
    });

    setLocalPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, number_of_likes: newCount } : p
    ));

    // Supabaseへのデータ更新（非同期）
    if (!isLiked) {
      await supabase.from('like').insert([{ user_id: currentUserId, post_id: postId }]);
    } else {
      await supabase.from('like').delete().eq('post_id', postId).eq('user_id', currentUserId);
    }
    
    await supabase.from('post').update({ number_of_likes: newCount }).eq('id', postId);

    // ★ 究極の修正：いいねのDB更新が終わったら、親（page.tsx）の一括更新を即座に叩く！
    // これにより、おすすめタブ・同学年タブ両方のデータが一瞬で最新化されます。
    if (onRefresh) {
      onRefresh();
    }
  };

  // 3. フォロー・フォロー解除ボタンを押した時の処理
  const toggleFollow = async (targetUserId: string) => {
    if (!currentUserId) return alert("ログインが必要です");
    if (currentUserId === targetUserId) return; 

    const isFollowing = myFollows.has(targetUserId);

    setMyFollows(prev => {
      const n = new Set(prev);
      isFollowing ? n.delete(targetUserId) : n.add(targetUserId);
      return n;
    });

    if (!isFollowing) {
      const { error } = await supabase
        .from('follows')
        .insert([{ follower_id: currentUserId, following_id: targetUserId }]);
      if (error) {
        console.error("フォローに失敗しました:", error);
        setMyFollows(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
      }
    } else {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId);
      if (error) {
        console.error("フォロー解除に失敗しました:", error);
        setMyFollows(prev => { const n = new Set(prev); n.add(targetUserId); return n; });
      }
    }
  };

  if (!localPosts || localPosts.length === 0) {
    return <div className="p-20 text-center text-gray-400">表示できる投稿がありません</div>;
  }

  return (
    <div className="divide-y divide-gray-100 pb-20">
      {localPosts.map((post) => (
        <div key={post.id} className="p-4 flex gap-3">
          {post.user?.icon_src ? (
            <img
              src={post.user.icon_src}
              alt={post.user?.username || "ユーザー"}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-gray-100"
            />
          ) : (
            <div className="w-12 h-12 bg-blue-100 rounded-full flex-shrink-0 flex items-center justify-center text-blue-600 font-bold">
              {post.user?.username?.substring(0, 1) || "U"}
            </div>
          )}
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{post.user?.username || "名無し"}</span>
                <span className="text-[11px] text-gray-400">{formatTime(post.created_at)}</span>
                
                {currentUserId && post.user_id && currentUserId !== post.user_id && (
                  <button
                    onClick={() => toggleFollow(post.user_id)}
                    className={`ml-2 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition border ${
                      myFollows.has(post.user_id)
                        ? "bg-gray-100 text-gray-600 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        : "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100"
                    }`}
                  >
                    {myFollows.has(post.user_id) ? (
                      <>
                        <UserMinus className="w-3 h-3" />
                        <span>フォロー中</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3 h-3" />
                        <span>フォローする</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {currentUserId === post.user_id && (
                <button onClick={() => handleDelete(post.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-gray-800 text-sm my-1 leading-relaxed whitespace-pre-wrap">{post.content}</p>
            {post.image_url && (
              <img
                src={post.image_url}
                alt="投稿画像"
                className="mt-2 mb-1 max-w-full max-h-80 w-auto object-contain rounded-2xl border border-gray-100"
              />
            )}
            <button
              onClick={() => toggleLike(post.id, post.number_of_likes || 0)}
              className={`flex items-center gap-1 text-xs transition-colors ${myLikes.has(post.id) ? "text-red-500 font-bold" : "text-gray-400"}`}
            >
              <Heart className={`w-4 h-4 ${myLikes.has(post.id) ? "fill-current" : ""}`} />
              <span>{post.number_of_likes || 0}</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}