"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { getOfficialUserId } from "@/lib/official";
import { ChevronLeft, Send } from "lucide-react";

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  image_url?: string | null;
}

interface UserProfile {
  id: string;
  username: string | null;
  icon_src?: string | null;
}

export default function AdminChatPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string; // 相手（一般ユーザー）の id

  const [officialId, setOfficialId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false); // 運営IDの解決が済んだか
  const [partner, setPartner] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  // 運営ID取得＋相手プロフィール＋履歴取得
  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      const oid = await getOfficialUserId();
      setOfficialId(oid);
      setResolved(true);
      if (!oid) {
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase
        .from("user")
        .select("id, username, icon_src")
        .eq("id", userId)
        .single();
      if (userData) setPartner(userData as UserProfile);

      const { data: chatData } = await supabase
        .from("chat")
        .select("id, sender_id, receiver_id, content, created_at, image_url")
        .or(
          `and(sender_id.eq.${oid},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${oid})`
        )
        .order("created_at", { ascending: true });
      if (chatData) setMessages(chatData as ChatMessage[]);

      // この相手からの運営宛メッセージ通知を既読にする
      await supabase.rpc("mark_official_messages_read", { p_partner_id: userId });

      setLoading(false);
      scrollToBottom();
    };

    fetchData();
  }, [userId]);

  // リアルタイム受信
  useEffect(() => {
    if (!officialId || !userId) return;

    const channel = supabase
      .channel(`admin-chat-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const m = payload.new as ChatMessage;
            const relevant =
              (m.sender_id === officialId && m.receiver_id === userId) ||
              (m.sender_id === userId && m.receiver_id === officialId);
            if (relevant) {
              setMessages((prev) =>
                prev.some((x) => x.id === m.id) ? prev : [...prev, m]
              );
              scrollToBottom();
            }
          }
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setMessages((prev) => prev.filter((x) => x.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [officialId, userId]);

  // 運営として送信
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputText.trim();
    if (!content || !officialId) return;

    setInputText("");

    const { data: inserted, error } = await supabase
      .from("chat")
      .insert([
        {
          sender_id: officialId, // ← 運営名義で送信
          receiver_id: userId,
          content,
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.error("送信に失敗しました:", error);
      alert(`送信に失敗しました: ${error.message}`);
      setInputText(content); // 失敗時は入力を戻す
      return;
    }

    // ユーザーへ「運営からのメッセージ」通知（送信元は運営アカウント）
    await createNotification({
      receiverId: userId,
      senderId: officialId,
      type: "message",
      chatId: inserted?.id ?? null,
    });
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (resolved && !officialId) {
    return (
      <div className="p-6">
        <p className="text-red-500 font-medium">
          運営アカウントが未設定です。user テーブルの運営行に is_official = true を設定してください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-white text-black w-full">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center border-b border-gray-100 p-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-600 mr-3"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 mr-3 flex items-center justify-center">
          {partner?.icon_src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={partner.icon_src} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm">👤</span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-lg">{partner?.username ?? "ユーザー"}</span>
          <span className="text-xs text-blue-600 font-bold">運営として送信中</span>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
          <div className="text-center text-gray-400">読み込み中...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm">トークの開始</div>
        ) : (
          messages.map((m) => {
            const isOfficial = m.sender_id === officialId;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isOfficial ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                    isOfficial
                      ? "bg-[#1D9BF0] text-white rounded-br-none"
                      : "bg-[#EFF3F4] text-black rounded-bl-none"
                  }`}
                >
                  {m.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image_url}
                      alt="添付画像"
                      className="max-h-60 rounded-xl mb-1 object-cover"
                    />
                  )}
                  {m.content && (
                    <div className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 mt-1">
                  {formatTime(m.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* 入力欄 */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-3 bg-[#EFF3F4] rounded-full px-5 py-2.5 m-4"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="運営としてメッセージを送る"
          className="flex-1 bg-transparent text-[15px] focus:outline-none text-black py-1"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className={`p-2 rounded-full ${
            inputText.trim() ? "text-[#1D9BF0] hover:bg-blue-50" : "text-gray-300"
          }`}
          title="送信"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
