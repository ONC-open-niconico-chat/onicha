"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ChatPartner {
  id: string;
  username: string;
  icon_src?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
}

export default function MessageListPage() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [partners, setPartners] = useState<ChatPartner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // 1. ログイン中の自分のIDを取得
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }
      const currentUserId = session.user.id;
      setMyId(currentUserId);

      try {
        // 2. 自分が関わっているチャット履歴をすべて取得
        const { data: chatData, error } = await supabase
          .from("chat")
          .select("sender_id, receiver_id, content, created_at")
          .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
          .order("created_at", { ascending: false });

        if (error) throw error;

        // 3. チャット相手のIDを重複なしで抽出
        const partnerIds = new Set<string>();
        const lastMessagesMap = new Map<string, { content: string; created_at: string }>(); // 最新のメッセージを保持する用

        chatData?.forEach((chat) => {
          const partnerId = chat.sender_id === currentUserId ? chat.receiver_id : chat.sender_id;
          partnerIds.add(partnerId);
          if (!lastMessagesMap.has(partnerId)) {
            lastMessagesMap.set(partnerId, { content: chat.content, created_at: chat.created_at }); // 最初の要素が最新
          }
        });

        if (partnerIds.size === 0) {
          setLoading(false);
          return;
        }

        // 4. 💡 相手のプロフィール情報と、自分宛ての未読通知をまとめて並列取得
        const [{ data: userData, error: userError }, { data: unreadNotifications, error: notifyError }] = await Promise.all([
          supabase.from("user").select("id, username, icon_src").in("id", Array.from(partnerIds)),
          // 自分宛て（receiver_idが自分）かつ、未読（is_readがfalse）のメッセージ通知を一括取得
          supabase.from("notification").select("sender_id").eq("receiver_id", currentUserId).eq("notification_type", "message").eq("is_read", false)
        ]);

        if (userError) throw userError;
        if (notifyError) throw notifyError;

        // 💡 5. 相手ごとの未読数を集計するマップを作成
        const unreadMap = new Map<string, number>();
        unreadNotifications?.forEach((n) => {
          if (n.sender_id) {
            unreadMap.set(n.sender_id, (unreadMap.get(n.sender_id) || 0) + 1);
          }
        });

        // 5. 画面表示用にデータを整形
        const formattedPartners: ChatPartner[] = (userData || []).map((user) => {
          const lastMsgInfo = lastMessagesMap.get(user.id);
          return {
            id: user.id,
            username: user.username,
            icon_src: user.icon_src,
            last_message: lastMsgInfo?.content,      
            last_message_at: lastMsgInfo?.created_at,
            unread_count: unreadMap.get(user.id) || 0,
            };
        });
        
        // 💡 最新メッセージが届いている順に並び替える（オプション：お好みで）
        formattedPartners.sort((a, b) => {
          return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
        });

        setPartners(formattedPartners);
      } catch (err) {
        console.error("履歴の取得に失敗:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen bg-white text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="w-full bg-white min-h-screen text-black p-6">
      <h1 className="text-2xl font-bold border-b border-gray-100 pb-4 mb-4">メッセージ</h1>

      {partners.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>まだメッセージの履歴がありません。</p>
          <p className="text-sm mt-1">他のユーザーのプロフィールなどから新しくチャットを始めてみましょう！</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {partners.map((partner) => (
            <div
              key={partner.id}
              onClick={() => router.push(`/messages/${partner.id}`)}
              className="flex items-center gap-4 py-4 px-2 hover:bg-gray-50 rounded-xl cursor-pointer transition"
            >
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm">
                    {partner.icon_src ? (
                        <img 
                            src={partner.icon_src} 
                            alt={partner.username} 
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <span className="text-xl">👤</span>
                    )}
                </div>
                
                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
              
                  {/* 中央：ユーザー名とメッセージ内容 */}
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-base text-black truncate block mb-1">
                      {partner.username}
                    </span>
                    <div className="text-sm text-gray-500 truncate pr-2">
                      {partner.last_message || "メッセージを送信しました"}
                    </div>
                  </div>

                  {/* ✨ 右端：時間とその真下にバッジを表示するエリア（LINE風） */}
                  <div className="flex flex-col items-end justify-center shrink-0 min-w-[50px] gap-1.5">
                    {/* 上段：時間 */}
                    {partner.last_message_at && (
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(partner.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                
                    {/* 下段：未読件数の丸バッジ */}
                    {partner.unread_count > 0 ? (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                        {partner.unread_count}
                      </span>
                    ) : (
                      // バッジがない時も縦のガタつきを防ぐための透明なスペース（オプション）
                      <div className="h-5 w-5" />
                    )}
                  </div>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}