"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { PostCard } from "@/app/(main)/txtpost/txtPostCard";
import type { Post } from "@/app/(main)/txtpost/page";
import { ChevronLeft, Loader2, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

// コメント1件
interface Reply {
  id: number;
  content: string;
  created_at: string;
  user_id: string;
  user: { username: string | null; icon_src: string | null } | null;
}

export default function TxtPostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = Number(params.id);

  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // コメント一覧を取得
  const fetchReplies = async () => {
    const { data } = await supabase
      .from("txt_post_reply")
      .select("id, content, created_at, user_id, user:user_id (username, icon_src)")
      .eq("txt_post_id", postId)
      .order("created_at", { ascending: true });
    setReplies((data ?? []) as unknown as Reply[]);
  };

  useEffect(() => {
    if (!postId) return;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setMyId(session?.user?.id ?? null);

      // 出品情報（一覧と同じ形）
      const { data: item } = await supabase
        .from("txt_post")
        .select(
          `
            id,
            user:"user" ( id, username, icon_src ),
            book:"textbook" ( id, title ),
            condition:"txtbook_condition" ( id, name ),
            description,
            give_type,
            created_at,
            status,
            image_urls
          `
        )
        .eq("id", postId)
        .single();

      if (item) {
        const it = item as Record<string, unknown>;
        const formatted = {
          ...it,
          user: Array.isArray(it.user) ? it.user[0] : it.user,
          book: Array.isArray(it.book) ? it.book[0] : it.book,
          condition: Array.isArray(it.condition) ? it.condition[0] : it.condition,
          created_at: formatDistanceToNow(new Date(it.created_at as string), {
            addSuffix: true,
            locale: ja,
          }),
        } as unknown as Post;
        setPost(formatted);
      }

      await fetchReplies();
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // コメント送信
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || !myId || !post) return;

    setSending(true);
    const { error } = await supabase
      .from("txt_post_reply")
      // created_at はアプリの他投稿と同様クライアント時刻で統一（サーバー now() だと相対時刻がズレる）
      .insert({ txt_post_id: postId, user_id: myId, content, created_at: new Date().toISOString() });

    if (error) {
      console.error("コメントの送信に失敗しました:", error);
      alert(`コメントの送信に失敗しました: ${error.message}`);
      setSending(false);
      return;
    }

    // 出品主へ通知（自分の投稿へのコメントは通知しない）
    const ownerId = String(post.user.id);
    await createNotification({
      receiverId: ownerId,
      senderId: myId,
      type: "txt_post_reply",
      txtPostId: postId,
    });

    setInput("");
    await fetchReplies();
    setSending(false);
  };

  // 自分のコメントを削除
  const handleDelete = async (replyId: number) => {
    if (!confirm("このコメントを削除しますか？")) return;
    const { error } = await supabase.from("txt_post_reply").delete().eq("id", replyId);
    if (error) {
      console.error("コメントの削除に失敗しました:", error);
      return;
    }
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        読み込み中...
      </div>
    );
  }

  if (!post) {
    return <div className="text-center py-20 text-gray-400">投稿が見つかりません。</div>;
  }

  return (
    <div className="w-full">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold">投稿</h1>
      </div>

      {/* 出品情報（カードを流用、コメントボタンは非表示） */}
      <div className="border-b border-gray-200">
        <PostCard txtpost={post} showCommentButton={false} linkToDetail={false} onDeleted={() => router.push("/txtpost")} />
      </div>

      {/* コメント入力 */}
      {myId ? (
        <form onSubmit={handleSend} className="flex items-center gap-2 border-b border-gray-200 p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="コメントを入力..."
            className="flex-1 border border-gray-200 rounded-full px-4 py-2 outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className={`p-2 rounded-full ${
              input.trim() && !sending ? "text-blue-600 hover:bg-blue-50" : "text-gray-300"
            }`}
            title="コメントを送信"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      ) : (
        <p className="p-4 text-sm text-gray-400 border-b border-gray-200">
          コメントするにはログインしてください。
        </p>
      )}

      {/* コメント一覧 */}
      <div className="divide-y divide-gray-100">
        {replies.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">まだコメントはありません。</p>
        ) : (
          replies.map((r) => (
            <div key={r.id} className="flex gap-3 p-4">
              <Link href={`/profile/${r.user_id}`} className="shrink-0">
                {r.user?.icon_src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.user.icon_src} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">👤</span>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/profile/${r.user_id}`} className="font-bold hover:underline">
                    {r.user?.username ?? "不明"}
                  </Link>
                  <span className="text-gray-400 text-xs">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ja })}
                  </span>
                  {r.user_id === myId && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                      title="コメントを削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[15px] whitespace-pre-wrap break-words mt-0.5">{r.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
