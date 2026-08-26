'use client'

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { PostCard } from "@/app/(main)/txtpost/txtPostCard";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import CreatePostForm from "./createNewPost";
import { Plus, X, Search, HelpCircle } from "lucide-react";
import { useRouter } from "next/navigation";


export interface Post {
  id: number;
  user: {
    id: number;
    username: string;
    icon_src: string;
  };

  book: {
    id:number;
    title:string;
    price?:number | null;
  }

  condition: {
    id:number;
    name:string;
  }
  description: string;
  give_type: "offering" | "seeking";
  created_at: string;
  status: string;
  image_urls: string[] | null;
  reply_count?: number;
}


export default function TxtPostPage() {
  const searchParams = useSearchParams();
  const textbookId = searchParams.get("textbook_id");
    
  // 1ページあたりの取得件数
  const PAGE_SIZE = 12;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true); // 初回 / フィルタ変更時のリセット読み込み
  const [loadingMore, setLoadingMore] = useState(false); // 追加読み込み中
  const [hasMore, setHasMore] = useState(true); // まだ次のページがあるか
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false); // 「使い方」モーダルの開閉
  const [filter, setFilter] = useState<"all" | "offering" | "seeking">("all");
  // 教科書名での検索キーワード（入力用）と、デバウンス後の実クエリ用
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // マッチング済みも表示するか（false のときは募集中のみ）
  const [showMatched, setShowMatched] = useState(false);
  // 自分の投稿のみ / リクエスト中のみ の絞り込み
  const [mineOnly, setMineOnly] = useState(false);
  const [requestedOnly, setRequestedOnly] = useState(false);
  // ログインユーザー / 自分がリクエスト中（保留中）の投稿ID
  const [myId, setMyId] = useState<string | null>(null);
  const [requestedPostIds, setRequestedPostIds] = useState<Set<number>>(new Set());

  // 次に取得する DB オフセット / 多重読み込み防止 / 重複表示防止
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const seenIdsRef = useRef<Set<number>>(new Set());
  // hasMore を loadPosts の依存に入れると、末尾到達で loadPosts が作り直され
  // リセット effect が再発火して先頭へ戻ってしまう。ref で持って依存から外す。
  const hasMoreRef = useRef(true);
  // 無限スクロールの監視対象（リスト末尾のセンチネル）
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();

  // txt_post の SELECT（結合込み）。読み込みごとに使い回す。
  const SELECT = `
      id,
      user:"user" (
        id,
        username,
        icon_src
      ),
      book:"textbook" (
        id,
        title,
        price
      ),
      condition:"txtbook_condition" (
        id,
        name
      ),
      description,
      give_type,
      created_at,
      status,
      image_urls,
      txt_post_reply ( count )
  `;

  // 1件を表示用に整形する
  const formatPost = (item: any): Post => {
    const relativeTime = formatDistanceToNow(new Date(item.created_at), {
      addSuffix: true,
      locale: ja,
    });
    return {
      ...item,
      user: Array.isArray(item.user) ? item.user[0] : item.user,
      book: Array.isArray(item.book) ? item.book[0] : item.book,
      condition: Array.isArray(item.condition) ? item.condition[0] : item.condition,
      reply_count: Array.isArray(item.txt_post_reply)
        ? (item.txt_post_reply[0]?.count ?? 0)
        : 0,
      created_at: relativeTime,
    };
  };

  // データ取得。reset=true で先頭から取り直し、false で続きを追加読み込み。
  // フィルタはすべてサーバー側（.eq / .neq / .in）で適用してから .range() で分割取得する。
  const loadPosts = useCallback(
    async (reset: boolean) => {
      if (loadingRef.current) return;
      if (!reset && !hasMoreRef.current) return;
      loadingRef.current = true;

      if (reset) {
        setLoading(true);
        offsetRef.current = 0;
        seenIdsRef.current = new Set();
        hasMoreRef.current = true;
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      try {
        // 教科書名検索：先に textbook から一致する id を引き、txt_post を textbook_id で絞る。
        // （結合テーブルへの埋め込みフィルタより堅実で、"リクエスト中" ID 方式と同じ考え方）
        let titleTextbookIds: number[] | null = null;
        if (debouncedSearch) {
          const { data: tb } = await supabase
            .from("textbook")
            .select("id")
            .ilike("title", `%${debouncedSearch}%`);
          titleTextbookIds = (tb ?? []).map((t: any) => t.id as number);
        }

        const from = offsetRef.current;
        let query = supabase
          .from("txt_post")
          .select(SELECT)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        // 特定教科書ページ（?textbook_id=）
        if (textbookId) query = query.eq("textbook_id", Number(textbookId));
        // タブ（譲ります / 譲ってください）
        if (filter !== "all") query = query.eq("give_type", filter);
        // マッチング済み非表示
        if (!showMatched) query = query.neq("status", "マッチング済み");
        // 自分の投稿のみ（未ログインなら該当なし）
        if (mineOnly) {
          if (myId) query = query.eq("user_id", myId);
          else query = query.in("id", [-1]);
        }
        // リクエスト中（保留中）のみ
        if (requestedOnly) {
          const ids = [...requestedPostIds];
          query = query.in("id", ids.length ? ids : [-1]);
        }
        // 教科書名検索（一致 id が 0 件なら該当なし）
        if (titleTextbookIds) {
          query = query.in(
            "textbook_id",
            titleTextbookIds.length ? titleTextbookIds : [-1]
          );
        }

        const { data, error } = await query;
        if (error) {
          console.error("データ取得エラー:", error);
          return;
        }

        const rows = data ?? [];
        // 重複ガード（並行 insert 等で同じ行が来ても二重表示しない）
        const fresh = rows
          .map(formatPost)
          .filter((p) => !seenIdsRef.current.has(p.id));
        fresh.forEach((p) => seenIdsRef.current.add(p.id));

        setPosts((prev) => (reset ? fresh : [...prev, ...fresh]));
        offsetRef.current = from + rows.length;
        const more = rows.length === PAGE_SIZE;
        hasMoreRef.current = more;
        setHasMore(more);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      textbookId,
      filter,
      showMatched,
      mineOnly,
      requestedOnly,
      myId,
      requestedPostIds,
      debouncedSearch,
    ]
  );

  // 検索キーワードのデバウンス（入力ごとにクエリを投げない）
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // フィルタ・検索・textbookId が変わったら先頭から取り直す
  useEffect(() => {
    loadPosts(true);
    // loadPosts は上記依存で作り直されるので、これで各条件変更を拾える
  }, [loadPosts]);

  // リスト末尾が見えたら次のページを読み込む（無限スクロール）
  // センチネルは初回ロード完了後（!loading かつ posts あり）に描画されるため、
  // loading / hasMore を依存に含めて、センチネル出現時にオブザーバーを張り直す。
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadPosts(false);
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadPosts, loading, hasMore]);

  // ログインユーザーと、自分がリクエスト中（保留中）の投稿IDを取得
  useEffect(() => {
    const loadMine = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setMyId(uid);
      if (!uid) return;
      const { data } = await supabase
        .from("notification")
        .select("txt_post_id")
        .eq("sender_id", uid)
        .in("notification_type", ["request_for_offering", "request_for_request"])
        .is("request_status", null);
      const ids = new Set<number>(
        (data ?? [])
          .map((n) => (n as { txt_post_id?: number }).txt_post_id)
          .filter((v): v is number => v != null)
      );
      setRequestedPostIds(ids);
    };
    loadMine();
  }, []);


  return (
    <div>
      <div className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="relative border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        教科書ポスト
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-full px-2.5 py-1.5 transition-colors"
            title="使い方"
          >
            <HelpCircle className="w-4 h-4" />
            使い方
          </button>
        </div>

        {textbookId && (
          <div className="bg-blue-50 px-4 py-2 flex items-center justify-between text-xs text-blue-700 font-medium border-t border-blue-100">
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-800">特定教科書の投稿を表示中</span>
              {/* ★ フィルタ解除（textbook_id を外して全件表示に戻す） */}
              <button
                onClick={() => router.push("/txtpost")}
                title="フィルタを解除"
                className="text-blue-600 hover:bg-blue-100 rounded-full p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              // ★ router.back() を使うと、検索文字が入った状態の検索ページへそのまま戻れます！
              onClick={() => router.back()}
              className="text-xs bg-white text-blue-600 px-3 py-1 rounded border border-blue-200 font-medium hover:bg-blue-50"
            >
              検索結果に戻る
            </button>

          </div>
        )}

        <div className="flex border-t border-gray-200">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-3 hover:bg-gray-100 transition-colors ${
              filter === "all"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-gray-600"
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setFilter("offering")}
            className={`flex-1 py-3 hover:bg-gray-100 transition-colors ${
              filter === "offering"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-gray-600"
            }`}
          >
            譲ります
          </button>
          <button
            onClick={() => setFilter("seeking")}
            className={`flex-1 py-3 hover:bg-gray-100 transition-colors ${
              filter === "seeking"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-gray-600"
            }`}
          >
            譲ってください
          </button>
        </div>

        {/* 検索バー & 絞り込みチェック */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t border-gray-200">
          <div className="flex items-center gap-2 flex-1 border border-gray-300 rounded-full px-3 py-1.5 bg-white focus-within:border-blue-400 transition-colors">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="教科書名で検索"
              className="flex-1 outline-none text-sm bg-transparent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                title="クリア"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMatched}
              onChange={(e) => setShowMatched(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            マッチング済みも表示
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            自分の投稿
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requestedOnly}
              onChange={(e) => setRequestedOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            リクエスト中
          </label>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {loading ? (
          <div className="text-center py-10 text-gray-500">読み込み中...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {textbookId ? "この教科書に関する投稿はまだありません" : "該当する投稿がありません"}
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} txtpost={post} onDeleted={() => loadPosts(true)} />
          ))
        )}
      </div>

      {/* 無限スクロール用センチネル & 追加読み込み表示 */}
      {!loading && posts.length > 0 && (
        <div ref={sentinelRef} className="py-6 text-center text-sm text-gray-400">
          {loadingMore ? "読み込み中..." : hasMore ? "" : "すべて表示しました"}
        </div>
      )}


      {/* ─── 画面右下に固定されたプラスボタン（FAB） ─── */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-20 right-6 md:bottom-6 z-40 w-14 h-14 bg-linear-to-tr from-blue-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-90 hover:rotate-90"
        title="新規投稿"
      >
        <Plus />
      </button>

      {/* ─── 状態が true の時だけ投稿フォーム（モーダル）を表示 ─── */}
      {isModalOpen && (
        <CreatePostForm
          onPostCreated={() => loadPosts(true)} // 投稿成功後にタイムラインを先頭から更新
          onclose={() => setIsModalOpen(false)}
        />
      )}

      {/* ─── 「使い方」モーダル ─── */}
      {isHelpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsHelpOpen(false)}
        >
          <div
            className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー（固定） */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-blue-600" />
                教科書ポストの使い方
              </h2>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="閉じる"
              >
                <X className="w-7 h-7" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 text-base text-gray-700 leading-relaxed">
              {/* 2種類の投稿 */}
              <section>
                <h3 className="font-bold text-lg text-gray-900 mb-2">① 2種類の投稿</h3>
                <ul className="space-y-1.5">
                  <li>
                    <span className="inline-block font-bold text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 mr-1">譲ります</span>
                    使わない教科書を出品します。受け取った相手から<b>ポイントを獲得</b>できます。
                  </li>
                  <li>
                    <span className="inline-block font-bold text-green-700 bg-green-50 rounded px-1.5 py-0.5 mr-1">譲ってください</span>
                    欲しい教科書を募集します。受け取るときに<b>ポイントを消費</b>します（投稿時に必要ポイントを仮消費します）。
                  </li>
                  <li>教科書データベースに登録されている教科書のみ投稿できます。登録されていない教科書を新規追加して投稿することもできます。その際、投稿する書籍の定価を入力してください。
                  </li>
                </ul>
              </section>

              {/* ポイント */}
              <section>
                <h3 className="font-bold text-lg text-gray-900 mb-2">② ポイントの仕組み</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>教科書ごとに必要ポイントが設定されています。</li>
                  <li>譲ると <b className="text-blue-600">＋ポイント</b>、受け取ると <b className="text-red-500">−ポイント</b>。</li>
                  <li><b>利用可能ポイント</b> ＝ 所持ポイント − 仮消費ポイント。</li>
                </ul>
              </section>

              {/* 流れ */}
              <section>
                <h3 className="font-bold text-lg text-gray-900 mb-2">③ 取引の流れ</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>投稿を見つけて「譲ってください／譲ります」ボタンでリクエスト</li>
                  <li>相手（投稿者）が承諾するとマッチング成立</li>
                  <li>運営が双方へそれぞれ連絡し、実際に会って贈与者から教科書を受け取り、受取者へ渡します。</li>
                  <li>運営が完了処理を行い、贈与者へポイントを付与し、受取者がポイントを消費します。</li>
                </ol>
                <p className="mt-2 text-gray-500 text-sm">
                  ※ リクエストは相手が対応する前なら取り下げできます。投稿者はリクエストに対して承諾／見送りを選べます。
                </p>
              </section>

              {/* 注意 */}
              <section>
                <h3 className="font-bold text-lg text-gray-900 mb-2">④ 注意点</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>「譲ってください」の投稿には、必要ポイント分の利用可能残高が必要です。</li>
                  <li>マッチング済みの投稿は削除できません。</li>
                  <li>出品できる書籍は、講義で使う教科書や学習用の参考書のみです。漫画や雑誌は不可です。不適切な書籍の投稿は削除される可能性があります。</li>
                </ul>
              </section>
            </div>

            {/* フッター */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-bold transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
