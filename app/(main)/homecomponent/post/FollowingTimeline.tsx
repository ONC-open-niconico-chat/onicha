"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar } from "@mui/material";
import {
  Heart,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface PostUser {
  username: string;
  grade: number;
  department_id: number;
  icon_src: string;
  appartment?: { faculty_id: number } | { faculty_id: number }[] | null;
}

interface PostRow {
  id: number;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  number_of_likes: number;
  parent_id?: number | null;
  parent_post?: {
    id: number;
    content: string;
    user?: PostUser | PostUser[] | null;
  } | null;
  user: PostUser | PostUser[] | null;
  is_liked_by_me?: boolean;
  reply_count?: number;
}

interface FollowingTimelineProps {
  sortLogic?: (rawPosts: any[]) => any[];
}

function formatPostTime(createdAtString: string): string {
  if (!createdAtString) return "";
  const utcString = createdAtString.endsWith("Z") ? createdAtString : `${createdAtString}Z`;
  const postDate = new Date(utcString);
  const diffMs = Date.now() - postDate.getTime();

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "たった今";
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;

  return postDate.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function FollowingTimeline({ sortLogic }: FollowingTimelineProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [myIconSrc, setMyIconSrc] = useState<string | null>(null);

  const [pendingLikeIds, setPendingLikeIds] = useState<Set<number>>(new Set());

  // 状態の拡張（いいね・返信数）
  const attachExtraStates = useCallback(async (rawPosts: any[], uid: string | null) => {
    if (rawPosts.length === 0) return [];
    const postIds = rawPosts.map((p) => p.id);

    let myLikes: any[] = [];
    if (uid) {
      const { data } = await supabase
        .from("like")
        .select("post_id")
        .eq("user_id", uid)
        .in("post_id", postIds);
      myLikes = data || [];
    }

    const { data: allChildren } = await supabase
      .from("post")
      .select("id, parent_id, content")
      .in("parent_id", postIds);

    return rawPosts.map((p) => {
      const children = (allChildren || []).filter((c) => c.parent_id === p.id);
      // 旧・引用リポスト（[QUOTE]）は返信数に含めない
      const repliesList = children.filter((c) => !c.content?.startsWith("[QUOTE]"));

      return {
        ...p,
        is_liked_by_me: myLikes.some((l) => l.post_id === p.id),
        reply_count: repliesList.length,
      };
    });
  }, []);

  const fetchFollowingPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        setPosts([]);
        return;
      }
      setMyId(currentUser.id);

      // 自分のアイコン取得
      const { data: userData } = await supabase
        .from("user")
        .select("icon_src")
        .eq("id", currentUser.id)
        .single();
      if (userData) setMyIconSrc(userData.icon_src || null);

      // 1. フォロー中のユーザーIDを取得
      const { data: followData, error: followError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUser.id);

      if (followError) throw followError;
      if (!followData || followData.length === 0) {
        setPosts([]);
        return;
      }

      const followingIds = followData.map((row) => row.following_id);

      // 2. 投稿取得
      const { data: followingPosts, error: postsError } = await supabase
        .from("post")
        .select(`
          *,
          user:user_id (username, grade, department_id, icon_src, appartment:department_id(faculty_id)),
          parent_post:parent_id (
            id,
            content,
            user:user_id (username)
          )
        `);

      if (postsError) throw postsError;

      // フォロー中ユーザーのトップレベル投稿のみ（返信・旧引用リポストは除外）
      const filteredPosts = (followingPosts || []).filter((p: any) => {
        const isFollowingUser = followingIds.includes(p.user_id);
        return isFollowingUser && !p.parent_id;
      });

      const enriched = await attachExtraStates(filteredPosts, currentUser.id);

      if (sortLogic) {
        setPosts(sortLogic(enriched));
      } else {
        setPosts(enriched);
      }
    } catch (error) {
      console.error("フォロー中の投稿取得に失敗:", error);
    } finally {
      setLoading(false);
    }
  }, [sortLogic, attachExtraStates]);

  useEffect(() => {
    fetchFollowingPosts();
  }, [fetchFollowingPosts]);

  // いいね機能
  const handleLikeToggle = async (
    postId: number,
    isLikedByMe: boolean,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>>,
    currentList: PostRow[]
  ) => {
    if (!myId || pendingLikeIds.has(postId)) return;
    setPendingLikeIds((prev) => new Set(prev).add(postId));

    listSetter((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              is_liked_by_me: !isLikedByMe,
              number_of_likes: post.number_of_likes + (isLikedByMe ? -1 : 1),
            }
          : post
      )
    );

    try {
      const currentPost = currentList.find((p) => p.id === postId);
      if (!currentPost) return;

      if (isLikedByMe) {
        await supabase.from("like").delete().eq("user_id", myId).eq("post_id", postId);
      } else {
        await supabase.from("like").insert({ user_id: myId, post_id: postId });
      }

      // number_of_likes は like テーブルのトリガーが自動集計する（クライアントからは更新しない）
    } catch (error) {
      fetchFollowingPosts();
    } finally {
      setPendingLikeIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  // ポスト削除
  const handleDeletePost = async (
    postId: number,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>>
  ) => {
    if (!myId || !confirm("この投稿を削除しますか？")) return;
    await supabase.from("like").delete().eq("post_id", postId);
    const { error } = await supabase.from("post").delete().eq("id", postId).eq("user_id", myId);
    if (error) return;
    listSetter((prev) => prev.filter((p) => p.id !== postId));
  };

  // カード描画関数
  const renderSingleCard = (
    post: PostRow,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>>,
    currentList: PostRow[]
  ) => {
    const isLikePending = pendingLikeIds.has(post.id);
    const u = Array.isArray(post.user) ? post.user[0] : post.user;
    const isMine = post.user_id === myId;

    return (
      <div
        key={post.id}
        onClick={() => router.push(`/post/${post.id}`)}
        className="p-4 hover:bg-gray-50/50 cursor-pointer transition flex gap-3 border-b border-gray-100"
      >
        <Avatar src={u?.icon_src} sx={{ width: 40, height: 40 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
            <span className="font-bold hover:underline">{u?.username || "不明なユーザー"}</span>
            {u?.grade != null && (
              <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-semibold">
                {u.grade}年生
              </span>
            )}
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-gray-500 text-sm hover:underline">{formatPostTime(post.created_at)}</span>

            {isMine && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePost(post.id, listSetter);
                }}
                className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                title="投稿を削除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          <p className="text-[15px] leading-normal mb-2 whitespace-pre-wrap">{post.content}</p>

          {post.image_url && (
            <div className="mt-2 mb-3 inline-block max-w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50">
              <img
                src={post.image_url}
                alt="Post media"
                className="max-w-full max-h-96 w-auto object-contain"
              />
            </div>
          )}

          {/* ボタンエリア */}
          <div className="flex items-center gap-8 text-gray-500 text-sm -ml-2 mt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/post/${post.id}`);
              }}
              className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition"
            >
              <MessageCircle size={18} className="group-hover:bg-blue-50 rounded-full transition" />
              <span className="text-xs">{post.reply_count || 0}</span>
            </button>

            <button
              type="button"
              disabled={isLikePending}
              onClick={(e) => {
                e.stopPropagation();
                handleLikeToggle(post.id, !!post.is_liked_by_me, listSetter, currentList);
              }}
              className={`flex items-center gap-1.5 group p-2 rounded-full transition disabled:opacity-60 ${
                post.is_liked_by_me ? "text-red-500" : "hover:text-red-500 text-gray-500"
              }`}
            >
              <Heart
                size={18}
                className="group-hover:bg-red-50 rounded-full transition"
                fill={post.is_liked_by_me ? "currentColor" : "none"}
              />
              <span className="text-xs">{post.number_of_likes}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400 font-medium">読み込み中...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        フォロー中のユーザーの投稿がありません。誰かをフォローしてみましょう！
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {posts.map((post) => renderSingleCard(post, setPosts, posts))}
    </div>
  );
}