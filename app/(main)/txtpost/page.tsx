'use client'

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PostCard } from "@/app/(main)/txtpost/txtPostCard";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import CreatePostForm from "./createNewPost";
import { Plus, X, Search } from "lucide-react";
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
    
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "offering" | "seeking">("all");
  // 教科書名での検索キーワード
  const [search, setSearch] = useState("");
  // マッチング済みも表示するか（false のときは募集中のみ）
  const [showMatched, setShowMatched] = useState(false);

  const router = useRouter();
  
  //データ取得用の関数
  const fetchPosts = async () => {
      setLoading(true);

      let query = supabase
        .from('txt_post') 
        .select(`
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
        `)
      .order('created_at',{ascending:false})

      if (textbookId) {
          query = query.eq('textbook_id', Number(textbookId));
      }
      console.log("クエリ",textbookId);

      const { data, error } = await query;
      
      if (error) {
          console.error("データ取得エラー:",error);
      } else if(data) {
      const formattedPosts: Post[] = data.map((item: any) => {

          const postDate = new Date(item.created_at);

          // 「今からどれくらい前か」を日本語で計算
          const relativeTime = formatDistanceToNow(postDate, {
              addSuffix: true, // 「〜前」という言葉を付ける
              locale: ja,      // 日本語に設定
          });
      
          // 日付オブジェクトを作成（自動的にブラウザのローカル時間、日本時間に）
          const date = new Date(item.created_at);
          
          // 読みやすい形式に変換（例：2026/05/12 15:42）
          const formattedDate = date.toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
          });

          return {
              ...item,
              user: Array.isArray(item.user) ? item.user[0] : item.user,
              book: Array.isArray(item.book) ? item.book[0] : item.book,
              condition: Array.isArray(item.condition) ? item.condition[0] : item.condition,
              // コメント数（txt_post_reply(count) は [{ count: N }] 形式で返る）
              reply_count: Array.isArray(item.txt_post_reply) ? (item.txt_post_reply[0]?.count ?? 0) : 0,
              // ここで変換後の日付を入れる！
              created_at: relativeTime
          };
      });
      setPosts(formattedPosts);
      console.log("データ",formattedPosts);
      setLoading(false);
          };
      
  }
    
  useEffect(() => {
    fetchPosts();
  }, [textbookId]);

  const keyword = search.trim().toLowerCase();
  const filteredPosts = posts.filter((post) => {
    // タブ（すべて / 譲ります / 譲ってください）
    if (filter !== "all" && post.give_type !== filter) return false;
    // マッチング済み非表示（チェックが入っていないときは募集中のみ）
    if (!showMatched && post.status === "マッチング済み") return false;
    // 教科書名での検索
    if (keyword && !(post.book?.title ?? "").toLowerCase().includes(keyword)) return false;
    return true;
  });

  if (loading) return <div className="text-center py-10 text-gray-500">読み込み中...</div>

  
  
  

  

  return (
    <div>
      <div className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        教科書ポスト
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

        {/* 検索バー & マッチング済み表示チェック */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-200">
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
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {textbookId ? "この教科書に関する投稿はまだありません" : "該当する投稿がありません"}
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostCard key={post.id} txtpost={post} onDeleted={fetchPosts} />
          ))
        )}
      </div>


      {/* ─── 画面右下に固定されたプラスボタン（FAB） ─── */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-linear-to-tr from-blue-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-90 hover:rotate-90"
        title="新規投稿"
      >
        <Plus />
      </button>

      {/* ─── 状態が true の時だけ投稿フォーム（モーダル）を表示 ─── */}
      {isModalOpen && (
        <CreatePostForm
          onPostCreated={fetchPosts} // 投稿成功後にタイムラインを更新する関数を渡す
          onclose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}
