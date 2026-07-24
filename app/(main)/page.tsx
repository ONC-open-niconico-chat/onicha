"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Avatar } from "@mui/material";
import {
  Plus,
  AlertCircle,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  Trash2,
  X,
  ArrowLeft,
} from "lucide-react";
import { PostDialog } from "@/app/(main)/homecomponent/post/PostDialog";
import { FollowingTimeline } from "@/app/(main)/homecomponent/post/FollowingTimeline";
import { Header } from "@/app/(main)/homecomponent/layout/Header";
import { HomeTabHeader } from "@/app/(main)/homecomponent/home/HomeTabHeader";
import { supabase } from "@/lib/supabase";

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
  repost_count?: number;
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

  return postDate.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HomePage() {
  const router = useRouter();

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [schoolPosts, setSchoolPosts] = useState<PostRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSchoolLoading, setIsSchoolLoading] = useState(false);
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [myId, setMyId] = useState<string | null>(null);
  const [myIconSrc, setMyIconSrc] = useState<string | null>(null);
  const [myInfo, setMyInfo] = useState<{ grade: number; department_id: number; faculty_id: number } | null>(null);
  const [schoolFilter, setSchoolFilter] = useState<"grade" | "dept" | "faculty">("grade");

  // いいね連打防止
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<number>>(new Set());
  // 画像拡大表示
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  // エラーバナー
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ポスト詳細表示用
  const [selectedPost, setSelectedPost] = useState<PostRow | null>(null);
  const [replies, setReplies] = useState<PostRow[]>([]);
  const [replyInput, setReplyInput] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // 引用リポスト用の状態
  const [quoteTarget, setQuoteTarget] = useState<PostRow | null>(null);
  const [quoteInput, setQuoteInput] = useState("");
  const [isSendingQuote, setIsSendingQuote] = useState(false);

  const filterLabels = { grade: "同学年", dept: "同学科", faculty: "同学部" };

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  // ソートロジック
  const sortPostsByMixLogic = (rawPosts: any[]) => {
    const now = Date.now();

    const postsWithFlags = rawPosts.map((post) => {
      const utcString = post.created_at?.endsWith("Z") ? post.created_at : `${post.created_at}Z`;
      const time = new Date(utcString).getTime();
      const diffInSeconds = (now - time) / 1000;

      const isJustNow = diffInSeconds >= 0 && diffInSeconds < 60;

      return { ...post, isJustNow, time };
    });

    return postsWithFlags.sort((a, b) => {
      if (a.isJustNow && !b.isJustNow) return -1;
      if (!a.isJustNow && b.isJustNow) return 1;
      if (a.isJustNow && b.isJustNow) return b.time - a.time;

      const likesA = a.number_of_likes || 0;
      const likesB = b.number_of_likes || 0;
      if (likesB !== likesA) return likesB - likesA;

      return b.time - a.time;
    });
  };

  // 状態の拡張（いいね状態・返信数・リポスト数）
  const attachExtraStates = async (rawPosts: any[], uid: string | null) => {
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

      const reposts = children.filter((c) => c.content?.startsWith("[QUOTE]"));
      const repliesList = children.filter((c) => !c.content?.startsWith("[QUOTE]"));

      return {
        ...p,
        is_liked_by_me: myLikes.some((l) => l.post_id === p.id),
        reply_count: repliesList.length,
        repost_count: reposts.length,
      };
    });
  };

  // メインタイムライン取得
  const fetchPosts = async (uid: string | null = myId) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
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

      if (error) throw error;

      // 通常投稿 または [QUOTE] で始まる引用リポストをタイムラインにそのまま表示
      const mainTimelinePosts = (data || []).filter((p) => {
        if (!p.parent_id) return true;
        if (p.content?.startsWith("[QUOTE]")) return true;
        return false;
      });

      const enriched = await attachExtraStates(mainTimelinePosts, uid);
      setPosts(sortPostsByMixLogic(enriched));
    } catch (e) {
      showError("通信に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // ポスト詳細の返信一覧を取得
  const fetchReplies = async (postId: number) => {
    try {
      const { data, error } = await supabase
        .from("post")
        .select(`
          *,
          user:user_id (username, grade, department_id, icon_src, appartment:department_id(faculty_id))
        `)
        .eq("parent_id", postId)
        .not("content", "like", "[QUOTE]%")
        .order("created_at", { ascending: true });

      if (error) throw error;
      const enriched = await attachExtraStates(data || [], myId);
      setReplies(enriched);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMyInfo = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setMyId(user.id);

    const { data } = await supabase
      .from("user")
      .select(`grade, department_id, icon_src, appartment:department_id(faculty_id)`)
      .eq("id", user.id)
      .single();

    if (data) {
      setMyIconSrc(data.icon_src || null);
      setMyInfo({
        grade: data.grade,
        department_id: data.department_id,
        faculty_id: (data.appartment as any)?.faculty_id || 0,
      });
    }

    fetchPosts(user.id);
  };

  const fetchSchoolPosts = async (type: "grade" | "dept" | "faculty", info = myInfo) => {
    if (!info) return;
    setIsSchoolLoading(true);
    try {
      const { data, error } = await supabase
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

      if (error) throw error;

      const filtered = (data || []).filter((p: any) => {
        const isMainOrQuote = !p.parent_id || p.content?.startsWith("[QUOTE]");
        if (!isMainOrQuote) return false;

        if (type === "grade") return p.user?.grade === info.grade;
        if (type === "dept") return p.user?.department_id === info.department_id;
        return p.user?.appartment?.faculty_id === info.faculty_id;
      });

      const enriched = await attachExtraStates(filtered, myId);
      setSchoolPosts(sortPostsByMixLogic(enriched));
    } catch (e) {
      showError("通信に失敗しました");
    } finally {
      setIsSchoolLoading(false);
    }
  };

  const mutateAll = () => {
    fetchPosts();
    if (myInfo) fetchSchoolPosts(schoolFilter, myInfo);
    if (selectedPost) fetchReplies(selectedPost.id);
  };

  useEffect(() => {
    fetchPosts();
    fetchMyInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (myInfo) fetchSchoolPosts(schoolFilter, myInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myInfo]);

  const handleFilterChange = (type: "grade" | "dept" | "faculty") => {
    setSchoolFilter(type);
    fetchSchoolPosts(type);
    setIsMenuOpen(false);
  };

  // 通常投稿
  const handleAddPost = async (content: string, file: File | null) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const exactNow = new Date().toISOString();

    let imageUrl: string | null = null;
    if (file) {
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from("images").upload(filePath, file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("images").getPublicUrl(filePath);
        imageUrl = publicUrl;
      } catch (uploadErr) {
        console.error("画像のアップロードに失敗しました:", uploadErr);
        showError("画像のアップロードに失敗しました。");
        return;
      }
    }

    const { error } = await supabase
      .from("post")
      .insert([{ user_id: user.id, content, image_url: imageUrl, number_of_likes: 0, created_at: exactNow }]);

    if (!error) {
      setIsPostOpen(false);
      setTimeout(() => mutateAll(), 100);
    } else {
      showError("投稿に失敗しました。");
    }
  };

  // 返信の送信処理
  const handleSendReply = async () => {
    if (!myId || !selectedPost || !replyInput.trim()) return;
    setIsSendingReply(true);

    try {
      const exactNow = new Date().toISOString();
      const { error } = await supabase.from("post").insert([
        {
          user_id: myId,
          content: replyInput,
          parent_id: selectedPost.id,
          number_of_likes: 0,
          created_at: exactNow,
        },
      ]);

      if (error) throw error;
      setReplyInput("");
      fetchReplies(selectedPost.id);
      mutateAll();
    } catch (err) {
      showError("返信に失敗しました。");
    } finally {
      setIsSendingReply(false);
    }
  };

  // 引用リポストの送信処理
  const handleSendQuote = async () => {
    if (!myId || !quoteTarget || !quoteInput.trim()) return;
    setIsSendingQuote(true);

    try {
      const exactNow = new Date().toISOString();

      const { error } = await supabase.from("post").insert([
        {
          user_id: myId,
          content: `[QUOTE] ${quoteInput}`,
          parent_id: quoteTarget.id,
          number_of_likes: 0,
          created_at: exactNow,
        },
      ]);

      if (error) throw error;

      setQuoteInput("");
      setQuoteTarget(null);
      mutateAll();
    } catch (err) {
      showError("リポストに失敗しました。");
    } finally {
      setIsSendingQuote(false);
    }
  };

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
      const newLikeCount = currentPost.number_of_likes + (isLikedByMe ? -1 : 1);

      if (isLikedByMe) {
        await supabase.from("like").delete().eq("user_id", myId).eq("post_id", postId);
      } else {
        await supabase.from("like").insert({ user_id: myId, post_id: postId });
      }

      await supabase.from("post").update({ number_of_likes: newLikeCount }).eq("id", postId);
    } catch (error) {
      showError("いいねの更新に失敗しました。");
      mutateAll();
    } finally {
      setPendingLikeIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  // 投稿削除
  const handleDeletePost = async (
    postId: number,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>>
  ) => {
    if (!myId || !confirm("この投稿を削除しますか？")) return;
    await supabase.from("like").delete().eq("post_id", postId);
    const { error } = await supabase.from("post").delete().eq("id", postId).eq("user_id", myId);
    if (error) {
      showError("投稿の削除に失敗しました。");
      return;
    }
    listSetter((prev) => prev.filter((p) => p.id !== postId));
    if (selectedPost?.id === postId) setSelectedPost(null);
  };

  // ポストカード描画
  const renderSingleCard = (
    post: PostRow,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>>,
    currentList: PostRow[]
  ) => {
    const isLikePending = pendingLikeIds.has(post.id);
    const u = Array.isArray(post.user) ? post.user[0] : post.user;
    const isMine = post.user_id === myId;

    const parentUser = post.parent_post
      ? Array.isArray(post.parent_post.user)
        ? post.parent_post.user[0]
        : post.parent_post.user
      : null;

    const isQuotePost = post.content?.startsWith("[QUOTE] ");
    const displayContent = isQuotePost ? post.content.replace("[QUOTE] ", "") : post.content;

    return (
      <div
        key={post.id}
        onClick={() => {
          setSelectedPost(post);
          fetchReplies(post.id);
        }}
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

          <p className="text-[15px] leading-normal mb-2 whitespace-pre-wrap">{displayContent}</p>

          {/* 引用リポスト（[QUOTE]）の時だけ引用カード（グレー枠）を表示 */}
          {isQuotePost && post.parent_post && (
            <div className="my-2 p-3 rounded-2xl bg-gray-50/80 border border-gray-200/80 text-sm">
              <span className="font-bold text-gray-900">@{parentUser?.username || "ユーザー"}: </span>
              <p className="text-gray-700 mt-0.5 whitespace-pre-wrap">
                {post.parent_post.content?.startsWith("[QUOTE] ")
                  ? post.parent_post.content.replace("[QUOTE] ", "")
                  : post.parent_post.content}
              </p>
            </div>
          )}

          {post.image_url && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageUrl(post.image_url);
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
            {/* 返信ボタン */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPost(post);
                fetchReplies(post.id);
              }}
              className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition"
            >
              <MessageCircle size={18} className="group-hover:bg-blue-50 rounded-full transition" />
              <span className="text-xs">{post.reply_count || 0}</span>
            </button>

            {/* 引用リポストボタン */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQuoteTarget(post);
              }}
              className="flex items-center gap-1.5 hover:text-green-500 group p-2 rounded-full transition"
            >
              <Repeat2 size={18} className="group-hover:bg-green-50 rounded-full transition" />
              <span className="text-xs">{post.repost_count || 0}</span>
            </button>

            {/* いいねボタン */}
            <button
              type="button"
              disabled={isLikePending}
              onClick={(e) => {
                e.stopPropagation();
                handleLikeToggle(post.id, !!post.is_liked_by_me, listSetter, currentList);
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

  // リストの描画
  const renderPostList = (
    list: PostRow[],
    loading: boolean,
    listSetter: React.Dispatch<React.SetStateAction<PostRow[]>>,
    emptyMessage = "まだ投稿がありません"
  ) => {
    if (loading) return <div className="py-20 text-center text-sm text-gray-400 font-medium">読み込み中...</div>;
    if (list.length === 0) return <div className="py-20 text-center text-sm text-gray-400">{emptyMessage}</div>;

    return (
      <div className="divide-y divide-gray-200">
        {list.map((post) => renderSingleCard(post, listSetter, list))}
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 selection:bg-blue-100">
      {/* エラーバナー */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)] bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 shadow-lg flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm flex-1">{errorMessage}</p>
          <button type="button" onClick={() => setErrorMessage(null)} className="shrink-0 text-red-400 hover:text-red-600 transition">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="w-full min-h-screen border-l border-gray-100">
        {/* ポスト詳細表示モード */}
        {selectedPost ? (
          <div>
            {/* 詳細画面ヘッダー */}
            <div className="sticky top-0 bg-white/80 backdrop-blur-md z-20 border-b border-gray-200 px-4 py-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition"
              >
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-lg font-bold">ポスト</h2>
            </div>

            {/* 選択されたメインポスト */}
            {renderSingleCard(selectedPost, setPosts, posts)}

            {/* 返信入力フォーム */}
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

            {/* 返信スレッド一覧 */}
            <div className="divide-y divide-gray-100">
              {replies.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">まだ返信はありません</div>
              ) : (
                replies.map((reply) => renderSingleCard(reply, setReplies, replies))
              )}
            </div>
          </div>
        ) : (
          /* 通常のタイムライン表示 */
          <>
            <Header />
            <Tabs defaultValue="all" className="w-full" onValueChange={() => mutateAll()}>
              <HomeTabHeader
                filterLabel={filterLabels[schoolFilter]}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                onFilterChange={handleFilterChange}
              />

              <TabsContent value="all" className="p-0 m-0">
                {renderPostList(posts, isLoading, setPosts)}
              </TabsContent>

              <TabsContent value="follow" className="p-0 m-0">
                <FollowingTimeline sortLogic={sortPostsByMixLogic} />
              </TabsContent>

              <TabsContent value="school" className="p-0 m-0">
                {renderPostList(
                  schoolPosts,
                  isSchoolLoading,
                  setSchoolPosts,
                  `${filterLabels[schoolFilter]}の投稿はありません`
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <PostDialog open={isPostOpen} onOpenChange={setIsPostOpen} onPost={handleAddPost} />

      {/* 新規投稿ボタン */}
      {!selectedPost && (
        <button
          onClick={() => setIsPostOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-linear-to-tr from-blue-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-90 hover:rotate-90"
          title="新規投稿"
        >
          <Plus />
        </button>
      )}

      {/* 引用リポスト入力モーダル */}
      {quoteTarget && (
        <div
          onClick={() => setQuoteTarget(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-xl border border-gray-100 relative"
          >
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm">引用リポスト</h3>
              <button
                type="button"
                onClick={() => setQuoteTarget(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3">
              <textarea
                rows={3}
                value={quoteInput}
                onChange={(e) => setQuoteInput(e.target.value)}
                placeholder="コメントを追加..."
                className="w-full text-sm p-2 outline-none resize-none placeholder-gray-400"
              />
            </div>

            {/* 引用対象の埋め込みカードプレビュー */}
            <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-700 my-2">
              <span className="font-bold">
                @{(Array.isArray(quoteTarget.user) ? quoteTarget.user[0] : quoteTarget.user)?.username}:{" "}
              </span>
              <p className="mt-0.5">
                {quoteTarget.content?.startsWith("[QUOTE] ")
                  ? quoteTarget.content.replace("[QUOTE] ", "")
                  : quoteTarget.content}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!quoteInput.trim() || isSendingQuote}
                onClick={handleSendQuote}
                className="bg-green-600 text-white font-bold text-xs px-5 py-2 rounded-full hover:bg-green-700 transition disabled:opacity-50"
              >
                {isSendingQuote ? "送信中..." : "再投稿"}
              </button>
            </div>
          </div>
        </div>
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
