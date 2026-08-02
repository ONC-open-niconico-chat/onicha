"use client";

import { useState, useEffect, useCallback, use } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Avatar } from "@mui/material";
import { Heart, MessageCircle, Share, ArrowLeft, Trash2 } from "lucide-react";

interface PostUser {
  username: string;
  grade?: number | null;
  icon_src?: string | null;
}

interface PostRow {
  id: number;
  content: string;
  created_at: string;
  number_of_likes: number;
  image_url?: string | null;
  user_id: string;
  parent_id?: number | null;
  user: PostUser | PostUser[] | null;
  is_liked_by_me?: boolean;
  reply_count?: number;
}

interface Props {
  params: Promise<{ id: string }>;
}

// 投稿日時フォーマット（UTC/JST補正済み）
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

  return postDate.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

const POST_SELECT = `
  id, content, image_url, created_at, number_of_likes, user_id, parent_id,
  user:user_id (username, grade, icon_src)
`;

export default function PostDetailPage({ params }: Props) {
  const router = useRouter();
  const postId = Number(use(params).id);

  const [myId, setMyId] = useState<string | null>(null);
  const [myIconSrc, setMyIconSrc] = useState<string | null>(null);

  const [mainPost, setMainPost] = useState<PostRow | null>(null);
  const [replies, setReplies] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [replyInput, setReplyInput] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<number>>(new Set());
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // いいね状態・返信数を付与
  const attachExtraStates = useCallback(async (rawPosts: any[], uid: string | null): Promise<PostRow[]> => {
    if (rawPosts.length === 0) return [];
    const ids = rawPosts.map((p) => p.id);

    let myLikes: any[] = [];
    if (uid) {
      const { data } = await supabase.from("like").select("post_id").eq("user_id", uid).in("post_id", ids);
      myLikes = data || [];
    }

    const { data: allChildren } = await supabase
      .from("post")
      .select("id, parent_id, content")
      .in("parent_id", ids);

    return rawPosts.map((p) => {
      const children = (allChildren || []).filter((c) => c.parent_id === p.id);
      const repliesList = children.filter((c) => !c.content?.startsWith("[QUOTE]"));
      return {
        ...p,
        is_liked_by_me: myLikes.some((l) => l.post_id === p.id),
        reply_count: repliesList.length,
      };
    });
  }, []);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setMyId(uid);

      if (uid) {
        const { data: userData } = await supabase.from("user").select("icon_src").eq("id", uid).single();
        if (userData) setMyIconSrc(userData.icon_src || null);
      }

      // メインポスト取得
      const { data: postData, error: postError } = await supabase
        .from("post")
        .select(POST_SELECT)
        .eq("id", postId)
        .single();

      if (postError || !postData) {
        setMainPost(null);
        return;
      }
      const [enrichedMain] = await attachExtraStates([postData], uid);
      setMainPost(enrichedMain);

      // 返信スレッド取得（[QUOTE] は除外、古い順）
      const { data: replyData } = await supabase
        .from("post")
        .select(POST_SELECT)
        .eq("parent_id", postId)
        .not("content", "like", "[QUOTE]%")
        .order("created_at", { ascending: true });

      setReplies(await attachExtraStates(replyData || [], uid));
    } catch (e) {
      setErrorMessage("読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [postId, attachExtraStates]);

  useEffect(() => {
    if (!Number.isNaN(postId)) fetchThread();
  }, [postId, fetchThread]);

  // 返信送信
  const handleSendReply = async () => {
    if (!myId || !mainPost || !replyInput.trim()) return;
    setIsSendingReply(true);
    try {
      const { error } = await supabase.from("post").insert([
        {
          user_id: myId,
          content: replyInput,
          parent_id: mainPost.id,
          number_of_likes: 0,
          created_at: new Date().toISOString(),
        },
      ]);
      if (error) throw error;
      setReplyInput("");
      fetchThread();
    } catch (err) {
      setErrorMessage("返信に失敗しました。");
    } finally {
      setIsSendingReply(false);
    }
  };

  // いいねトグル
  const handleLikeToggle = async (
    post: PostRow,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>> | ((p: PostRow) => void)
  ) => {
    if (!myId || pendingLikeIds.has(post.id)) return;
    setPendingLikeIds((prev) => new Set(prev).add(post.id));

    const isLiked = !!post.is_liked_by_me;
    const newCount = post.number_of_likes + (isLiked ? -1 : 1);

    // 楽観的更新
    const apply = (p: PostRow): PostRow =>
      p.id === post.id ? { ...p, is_liked_by_me: !isLiked, number_of_likes: newCount } : p;
    if (mainPost && mainPost.id === post.id) setMainPost((prev) => (prev ? apply(prev) : prev));
    setReplies((prev) => prev.map(apply));

    try {
      if (isLiked) {
        await supabase.from("like").delete().eq("user_id", myId).eq("post_id", post.id);
      } else {
        await supabase.from("like").insert({ user_id: myId, post_id: post.id });
      }
      await supabase.from("post").update({ number_of_likes: newCount }).eq("id", post.id);
    } catch {
      setErrorMessage("いいねの更新に失敗しました。");
      fetchThread();
    } finally {
      setPendingLikeIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  };

  // 投稿削除
  const handleDeletePost = async (post: PostRow) => {
    if (!myId || !confirm("この投稿を削除しますか？")) return;
    await supabase.from("like").delete().eq("post_id", post.id);
    const { error } = await supabase.from("post").delete().eq("id", post.id).eq("user_id", myId);
    if (error) {
      setErrorMessage("投稿の削除に失敗しました。");
      return;
    }
    // メインポストを消したら一覧へ戻る。返信を消したら再取得。
    if (post.id === mainPost?.id) {
      router.back();
    } else {
      fetchThread();
    }
  };

  const renderCard = (post: PostRow, opts: { clickable?: boolean } = {}) => {
    const u = Array.isArray(post.user) ? post.user[0] : post.user;
    const isMine = post.user_id === myId;
    const isLikePending = pendingLikeIds.has(post.id);

    return (
      <div
        key={post.id}
        onClick={opts.clickable ? () => router.push(`/post/${post.id}`) : undefined}
        className={`p-4 flex gap-3 border-b border-gray-100 ${
          opts.clickable ? "hover:bg-gray-50/50 cursor-pointer transition" : ""
        }`}
      >
        <Avatar src={u?.icon_src || undefined} sx={{ width: 40, height: 40 }} />
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
                  handleDeletePost(post);
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
            <div
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageUrl(post.image_url || null);
              }}
              className="mt-2 mb-3 inline-block max-w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-zoom-in group relative"
            >
              <img
                src={post.image_url}
                alt="Post media"
                className="max-w-full max-h-96 w-auto object-contain group-hover:brightness-95 transition duration-200"
              />
            </div>
          )}

          {/* ボタンエリア */}
          <div className="flex justify-between max-w-md text-gray-500 text-sm -ml-2 mt-2">
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
                handleLikeToggle(post, setReplies);
              }}
              className={`flex items-center gap-1.5 group p-2 rounded-full transition disabled:opacity-60 disabled:cursor-not-allowed ${
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

            <button
              type="button"
              className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition"
            >
              <Share size={18} className="group-hover:bg-blue-50 rounded-full transition" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-white">
      {errorMessage && (
        <div className="m-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center justify-between">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600">
            ✕
          </button>
        </div>
      )}

      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-20 border-b border-gray-200 px-4 py-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold">ポスト</h2>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-gray-400">読み込み中...</div>
      ) : !mainPost ? (
        <div className="py-20 text-center text-sm text-gray-400">ポストが見つかりませんでした。</div>
      ) : (
        <>
          {/* メインポスト */}
          {renderCard(mainPost)}

          {/* 返信入力フォーム */}
          {myId && (
            <div className="p-4 border-b border-gray-200 flex gap-3 items-start bg-gray-50/30">
              <Avatar src={myIconSrc || undefined} sx={{ width: 40, height: 40 }} />
              <div className="flex-1">
                <textarea
                  rows={2}
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder="返信をポスト..."
                  className="w-full bg-transparent text-sm p-1 outline-none resize-none placeholder-gray-400"
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    disabled={!replyInput.trim() || isSendingReply}
                    onClick={handleSendReply}
                    className="bg-blue-600 text-white font-bold text-xs px-5 py-2 rounded-full hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {isSendingReply ? "送信中..." : "返信"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 返信スレッド */}
          <div className="divide-y divide-gray-100">
            {replies.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">まだ返信はありません</div>
            ) : (
              replies.map((reply) => renderCard(reply, { clickable: true }))
            )}
          </div>
        </>
      )}

      {/* 画像拡大表示 */}
      {activeImageUrl && (
        <div
          onClick={() => setActiveImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        >
          <button
            type="button"
            onClick={() => setActiveImageUrl(null)}
            className="absolute top-4 right-4 z-50 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition text-sm font-bold shadow-sm"
          >
            閉じる
          </button>
          <div className="relative max-w-5xl max-h-[90vh] flex items-center justify-center">
            <img
              src={activeImageUrl}
              alt="Expanded media"
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl select-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
