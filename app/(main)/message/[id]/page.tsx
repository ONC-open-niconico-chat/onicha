"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
// 💡 あなたのプロジェクトのSupabaseクライアントのパスに書き換えてください
import { supabase } from "@/lib/supabase"; 

// メッセージ1件分の型定義
interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

// チャット相手のプロフィール型定義
interface UserProfile {
  id: string;
  username: string;
  avatar_url?: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  
  // URLから相手のIDを取得（/message/abc -> "abc"）
  const receiverId = params.id as string;
  
  // 状態管理
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [partner, setPartner] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 最下部へスクロールするための参照
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. ログイン中の「自分」のIDを取得する
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setMyId(session.user.id);
      } else {
        // ログインしていない場合はログイン画面などに飛ばす
        router.push("/login");
      }
    };
    getSession();
  }, [router]);

  // 2. 相手のプロフィールと、過去のチャット履歴を取得する
  useEffect(() => {
    if (!myId || !receiverId) return;

    const fetchChatData = async () => {
      setLoading(true);
      try {
        // ① 相手のユーザー情報を user テーブルから取得
        const { data: userData, error: userError } = await supabase
          .from("user")
          .select("id, username, avatar_url")
          .eq("id", receiverId)
          .single();

        if (userData) setPartner(userData);

        // ② 過去のメッセージ履歴を取得（自分が送信者かつ相手が受信者、またはその逆）
        const { data: chatData, error: chatError } = await supabase
          .from("chat")
          .select("*")
          .or(`and(sender_id.eq.${myId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${myId})`)
          .order("created_at", { ascending: true }); // 古い順（上から下へ流れる）

        if (chatData) setMessages(chatData);
      } catch (error) {
        console.error("データの取得に失敗しました:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChatData();
  }, [myId, receiverId]);

  // 3. 🔥 Supabase Realtime の設定（リアルタイムにメッセージを監視）
  useEffect(() => {
    if (!myId || !receiverId) return;

    // chatテーブルの変更を監視するチャンネルを作成
    const channel = supabase
      .channel("realtime-chats")
      .on(
        "postgres_changes",
        {
          event: "INSERT", // 新しいデータが入ってきた時だけ検知
          schema: "public",
          table: "chat",
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          
          // 自分と相手の間のメッセージである場合のみ、画面のメッセージ一覧に追加
          const isRelevant = 
            (newMsg.sender_id === myId && newMsg.receiver_id === receiverId) ||
            (newMsg.sender_id === receiverId && newMsg.receiver_id === myId);

          if (isRelevant) {
            setMessages((prev) => {
              // 重複して表示されるのを防ぐチェック
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    // 画面を閉じるときに監視を止める（クリーンアップ）
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, receiverId]);

  // 新しいメッセージが来たら一番下まで自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. メッセージを送信する処理
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !myId || !receiverId) return;

    const messageContent = inputText;
    setInputText(""); // 先に入力欄を空にしてサクサク感を出す

    // Supabaseの `chat` テーブルにデータを挿入
    const { error } = await supabase.from("chat").insert([
      {
        sender_id: myId,
        receiver_id: receiverId,
        content: messageContent,
      },
    ]);

    if (error) {
      console.error("メッセージの送信に失敗しました:", error);
      alert("送信に失敗しました。もう一度お試しください。");
    }
  };

  // 時間の表示を「11:27 AM」のような形に整形する関数
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white text-gray-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="flex bg-white h-screen text-black w-full">
      
      <div className="w-full flex flex-col h-full bg-white relative">
        
        <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center border-b border-gray-100 p-4">
          <button 
            onClick={() => router.back()} 
            className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600 mr-4"
          >
            ←
          </button>
          <div className="flex flex-col flex-1">
            <span className="font-bold text-lg">{partner?.username || "ユーザー"}</span>
            <span className="text-xs text-gray-500">@{partner?.username || "user"}</span>
          </div>
          <button className="text-gray-500 font-bold p-2 hover:bg-gray-100 rounded-full w-10 h-10 flex items-center justify-center">ⓘ</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-28">
          
          <div className="flex flex-col items-center py-8 border-b border-gray-50 mb-6">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-3xl font-bold mb-3">
              👤
            </div>
            <span className="font-bold text-xl">{partner?.username || "ユーザー"}</span>
            <span className="text-gray-500 text-sm">@{partner?.username || "user"}</span>
          </div>

          <div className="text-center text-xs text-gray-400 my-4 font-bold">トークの開始</div>

          {messages.map((msg) => {
            const isMe = msg.sender_id === myId;
            
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className="flex items-end gap-1 max-w-[70%]">
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-[15px] leading-snug ${
                      isMe
                        ? "bg-[#1D9BF0] text-white rounded-br-none" 
                        : "bg-[#EFF3F4] text-black rounded-bl-none" 
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
                <span className="text-[11px] text-gray-500 mt-1 px-1">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            );
          })}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 px-6">
          <form onSubmit={handleSendMessage} className="flex items-center gap-3 bg-[#EFF3F4] rounded-full px-5 py-2.5">
            
            <button type="button" className="text-[#1D9BF0] p-1 hover:bg-blue-50 rounded-full text-xl">🖼️</button>
            
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Start a message"
              className="flex-1 bg-transparent text-[15px] focus:outline-none placeholder-gray-500 text-black py-1"
            />
            
            <button
              type="submit"
              disabled={!inputText.trim()}
              className={`p-2 rounded-full transition ${
                inputText.trim() 
                  ? "text-[#1D9BF0] hover:bg-blue-50" 
                  : "text-gray-300"
              }`}
            >
              <span className="text-xl font-bold">▶</span>
            </button>
          </form>
        </div>

      </div>
    </div>
    );
}