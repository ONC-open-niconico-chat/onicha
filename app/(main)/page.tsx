"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Avatar } from "@mui/material";
import {
  Plus,
  AlertCircle,
  Heart,
  MessageCircle,
  Trash2,
  X,
} from "lucide-react";
import { ReportButton } from "@/components/ReportButton";
import { PostDialog } from "@/app/(main)/homecomponent/post/PostDialog";
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
}

// 1ページあたりの取得件数（無限スクロールの単位）
const PAGE_SIZE = 20;

// post の SELECT。user は結合フィルタ（同学年/学科/学部）で使うため !inner。
const POST_SELECT = `
  *,
  user:user_id!inner (username, grade, department_id, icon_src, appartment:department_id(faculty_id)),
  parent_post:parent_id (
    id,
    content,
    user:user_id (username)
  )
`;

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

// 取得した1ページ分の投稿に、いいね状態・返信数を付与する。
// postId 単位でまとめて引くので、ページ内の件数分だけの軽いクエリで済む。
async function attachExtraStates(rawPosts: any[], uid: string | null): Promise<PostRow[]> {
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
}

// メイン領域（overflow-y-auto の main）を先頭へスクロールする
function scrollFeedTop() {
  if (typeof document !== "undefined") {
    document.querySelector("main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }
}

// 20件ごとのページ送りで投稿リストを管理するフック。
// applyFilters でタブ固有の絞り込みを渡し、created_at 降順で .range() でページ取得する。
function usePagedFeed(params: {
  applyFilters: (q: any) => any; // useCallback で安定させて渡すこと（依存が変わると1ページ目に戻る）
  uid: string | null;
  enabled?: boolean;
  onError?: (message: string) => void;
}) {
  const { applyFilters, uid, enabled = true, onError } = params;

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [page, setPage] = useState(0); // 0起点
  const [isLoading, setIsLoading] = useState(true);
  const [hasNext, setHasNext] = useState(false);
  const loadingRef = useRef(false);

  const goToPage = useCallback(
    async (p: number) => {
      if (!enabled || p < 0) return;
      if (loadingRef.current) return;
      loadingRef.current = true;
      setIsLoading(true);
      try {
        const from = p * PAGE_SIZE;
        let query = supabase
          .from("post")
          .select(POST_SELECT)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        query = applyFilters(query);

        const { data, error } = await query;
        if (error) throw error;

        const rows = data ?? [];
        const enriched = await attachExtraStates(rows, uid);
        setPosts(enriched);
        setPage(p);
        setHasNext(rows.length === PAGE_SIZE); // 20件ちょうどなら次ページがある可能性
      } catch (e) {
        onError?.("通信に失敗しました");
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    [applyFilters, uid, enabled, onError]
  );

  // 絞り込み条件（applyFilters / uid / enabled）が変わったら1ページ目から取り直す
  useEffect(() => {
    goToPage(0);
  }, [goToPage]);

  // next/prev を安定させるため、最新 page を ref で参照
  const pageRef = useRef(0);
  pageRef.current = page;

  const next = useCallback(() => goToPage(pageRef.current + 1), [goToPage]);
  const prev = useCallback(() => goToPage(pageRef.current - 1), [goToPage]);
  const reload = useCallback(() => goToPage(0), [goToPage]);

  return {
    posts,
    setPosts,
    page,
    isLoading,
    hasNext,
    hasPrev: page > 0,
    next,
    prev,
    reload,
  };
}

export default function HomePage() {
  const router = useRouter();

  const [isPostOpen, setIsPostOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // 表示中のタブ（ホームボタンで "all" に戻すため制御化）
  const [tab, setTab] = useState("all");

  const [myId, setMyId] = useState<string | null>(null);
  const [myIconSrc, setMyIconSrc] = useState<string | null>(null);
  const [myInfo, setMyInfo] = useState<{ grade: number; department_id: number; faculty_id: number } | null>(null);
  const [schoolFilter, setSchoolFilter] = useState<"grade" | "dept" | "faculty">("grade");
  // 同学部フィルタ用：自分の学部に属する学科IDを先に解決しておく
  const [facultyDeptIds, setFacultyDeptIds] = useState<number[] | null>(null);
  // フォロー中フィルタ用：自分がフォローしているユーザーID（null=未解決）
  const [followingIds, setFollowingIds] = useState<string[] | null>(null);

  // いいね連打防止
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<number>>(new Set());
  // 画像拡大表示
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  // エラーバナー
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filterLabels = { grade: "同学年", dept: "同学科", faculty: "同学部" };

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  // 「すべて」タブ：トップレベルの通常投稿のみ（返信・引用は除外）
  const applyFiltersAll = useCallback((q: any) => q.is("parent_id", null), []);

  // 「同学年/学科/学部」タブ：トップレベル or 旧引用リポスト、かつ投稿者の所属で絞り込む
  const applyFiltersSchool = useCallback(
    (q: any) => {
      let query = q.is("parent_id", null);
      if (!myInfo) return query;
      if (schoolFilter === "grade") {
        // 学年未設定（null）なら bigint に "null" を渡さず、該当なしにする
        if (myInfo.grade == null) return query.eq("id", -1);
        query = query.eq("user.grade", myInfo.grade);
      } else if (schoolFilter === "dept") {
        // 学科未設定（null）なら同様に該当なし
        if (myInfo.department_id == null) return query.eq("id", -1);
        query = query.eq("user.department_id", myInfo.department_id);
      } else {
        const ids = facultyDeptIds ?? [];
        query = query.in("user.department_id", ids.length ? ids : [-1]);
      }
      return query;
    },
    [schoolFilter, myInfo, facultyDeptIds]
  );

  // 「フォロー中」タブ：自分がフォローしているユーザーのトップレベル投稿のみ
  const applyFiltersFollow = useCallback(
    (q: any) => {
      const ids = followingIds ?? [];
      if (ids.length === 0) return q.eq("id", -1); // フォロー0件なら該当なし
      return q.is("parent_id", null).in("user_id", ids);
    },
    [followingIds]
  );

  const allFeed = usePagedFeed({ applyFilters: applyFiltersAll, uid: myId, onError: showError });
  const schoolFeed = usePagedFeed({
    applyFilters: applyFiltersSchool,
    uid: myId,
    enabled: !!myInfo,
    onError: showError,
  });
  const followFeed = usePagedFeed({
    applyFilters: applyFiltersFollow,
    uid: myId,
    enabled: followingIds !== null,
    onError: showError,
  });

  // サイドバーの「ホーム」を押したとき（既にホームにいる場合）：
  // おすすめタブ・1ページ目・最新に戻し、先頭へスクロールする。
  const allReloadRef = useRef(allFeed.reload);
  allReloadRef.current = allFeed.reload;
  useEffect(() => {
    const onHomeRefresh = () => {
      setTab("all");
      allReloadRef.current();
      scrollFeedTop();
    };
    window.addEventListener("home:refresh", onHomeRefresh);
    return () => window.removeEventListener("home:refresh", onHomeRefresh);
  }, []);

  const fetchMyInfo = useCallback(async () => {
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
  }, [router]);

  useEffect(() => {
    fetchMyInfo();
  }, [fetchMyInfo]);

  // 同学部フィルタ用に、自分の学部に属する学科IDを解決
  useEffect(() => {
    if (!myInfo) return;
    let cancelled = false;
    supabase
      .from("department")
      .select("id")
      .eq("faculty_id", myInfo.faculty_id)
      .then(({ data }) => {
        if (!cancelled) setFacultyDeptIds((data ?? []).map((d: any) => d.id as number));
      });
    return () => {
      cancelled = true;
    };
  }, [myInfo]);

  // 「フォロー中」タブ用に、自分がフォローしているユーザーIDを解決
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", myId)
      .then(({ data }) => {
        if (!cancelled) setFollowingIds((data ?? []).map((r: any) => r.following_id as string));
      });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  const mutateAll = () => {
    allFeed.reload();
    if (myInfo) schoolFeed.reload();
  };

  const handleFilterChange = (type: "grade" | "dept" | "faculty") => {
    setSchoolFilter(type); // 変更で schoolFeed が自動的に先頭から取り直す
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
    let uploadedPath: string | null = null;
    if (file) {
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from("post_images").upload(filePath, file);
        if (uploadError) throw uploadError;
        uploadedPath = filePath;
        const {
          data: { publicUrl },
        } = supabase.storage.from("post_images").getPublicUrl(filePath);
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
      // 投稿に失敗したら、先にアップロードした画像を掃除する（孤児画像を残さない）
      if (uploadedPath) {
        await supabase.storage.from("post_images").remove([uploadedPath]).catch(() => {});
      }
      showError("投稿に失敗しました。");
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

      if (isLikedByMe) {
        await supabase.from("like").delete().eq("user_id", myId).eq("post_id", postId);
      } else {
        await supabase.from("like").insert({ user_id: myId, post_id: postId });
      }

      // number_of_likes は like テーブルのトリガーが自動集計する（クライアントからは更新しない）
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

    return (
      <div
        key={post.id}
        onClick={() => router.push(`/post/${post.id}`)}
        className="p-4 hover:bg-gray-50/50 cursor-pointer transition flex gap-3 border-b border-gray-100"
      >
        <Avatar src={u?.icon_src || "/yujilink_icon/yujilink_icon.JPG"} sx={{ width: 40, height: 40 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
            <Link
              href={`/profile/${post.user_id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-bold hover:underline"
            >
              {u?.username || "不明なユーザー"}
            </Link>
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
            {!isMine && (
              <ReportButton
                targetType="post"
                targetId={post.id}
                className="ml-auto"
              />
            )}
          </div>

          <p className="text-[15px] leading-normal mb-2 whitespace-pre-wrap">{post.content}</p>

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
          <div className="flex items-center gap-8 text-gray-500 text-sm -ml-2 mt-2">
            {/* 返信ボタン */}
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
          </div>
        </div>
      </div>
    );
  };

  // リスト + ページ送り（次へ/前へ）描画
  const renderFeed = (
    feed: ReturnType<typeof usePagedFeed>,
    emptyMessage = "まだ投稿がありません"
  ) => {
    // 初回ロードのみ全面スピナー。ページ移動中は前ページを残してボタンだけ無効化。
    if (feed.isLoading && feed.posts.length === 0)
      return <div className="py-20 text-center text-sm text-gray-400 font-medium">読み込み中...</div>;
    if (!feed.isLoading && feed.posts.length === 0)
      return <div className="py-20 text-center text-sm text-gray-400">{emptyMessage}</div>;

    return (
      <div>
        <div className="divide-y divide-gray-200">
          {feed.posts.map((post) => renderSingleCard(post, feed.setPosts, feed.posts))}
        </div>
        {/* ページ送り（中央寄せ：○ページ目の両隣に前へ/次へ） */}
        <div className="flex items-center justify-center gap-4 px-4 py-5 border-t border-gray-100">
          <button
            type="button"
            disabled={!feed.hasPrev || feed.isLoading}
            onClick={() => {
              feed.prev();
              scrollFeedTop();
            }}
            className="px-4 py-2 rounded-full text-sm font-bold border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ← 前へ
          </button>
          <span className="text-sm text-gray-500">{feed.page + 1} ページ目</span>
          <button
            type="button"
            disabled={!feed.hasNext || feed.isLoading}
            onClick={() => {
              feed.next();
              scrollFeedTop();
            }}
            className="px-4 py-2 rounded-full text-sm font-bold border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            次へ →
          </button>
        </div>
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
        {/* タイムライン表示 */}
        <>

            <Header />
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <HomeTabHeader
                filterLabel={filterLabels[schoolFilter]}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                onFilterChange={handleFilterChange}
              />

              <TabsContent value="all" className="p-0 m-0">
                {renderFeed(allFeed)}
              </TabsContent>

              <TabsContent value="follow" className="p-0 m-0">
                {renderFeed(followFeed, "フォロー中の投稿はありません")}
              </TabsContent>

              <TabsContent value="school" className="p-0 m-0">
                {renderFeed(schoolFeed, `${filterLabels[schoolFilter]}の投稿はありません`)}
              </TabsContent>
            </Tabs>
        </>
      </div>

      <PostDialog open={isPostOpen} onOpenChange={setIsPostOpen} onPost={handleAddPost} />

      {/* 新規投稿ボタン */}
      <button
        onClick={() => setIsPostOpen(true)}
        className="fixed bottom-20 right-6 md:bottom-6 z-40 w-14 h-14 bg-linear-to-tr from-blue-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-90 hover:rotate-90"
        title="新規投稿"
      >
        <Plus />
      </button>

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
