"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { VerifiedBadge } from "@/components/VerifiedBadge";

interface ChatPartner {
  id: string;
  username: string;
  icon_src?: string;
  is_official?: boolean;
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
        // 2. 運営（公式アカウント）を取得。DMは運営とのやり取りのみ可能。
        const { data: official, error: offErr } = await supabase
          .from("user")
          .select("id, username, icon_src, is_official")
          .eq("is_official", true)
          .limit(1)
          .maybeSingle();

        if (offErr) throw offErr;
        if (!official) {
          // 運営アカウントが未設定
          setPartners([]);
          setLoading(false);
          return;
        }

        // 3. 運営との最新メッセージ（プレビュー用）
        const { data: lastChats } = await supabase
          .from("chat")
          .select("content, created_at")
          .or(
            `and(sender_id.eq.${currentUserId},receiver_id.eq.${official.id}),` +
            `and(sender_id.eq.${official.id},receiver_id.eq.${currentUserId})`
          )
          .order("created_at", { ascending: false })
          .limit(1);
        const last = lastChats?.[0];

        // 4. 運営からの未読メッセージ数
        const { count: unread } = await supabase
          .from("notification")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", currentUserId)
          .eq("notification_type", "message")
          .eq("sender_id", official.id)
          .eq("is_read", false);

        // 5. 運営を常に一覧の先頭に表示
        setPartners([
          {
            id: official.id,
            username: official.username,
            icon_src: official.icon_src,
            is_official: true,
            last_message: last?.content,
            last_message_at: last?.created_at,
            unread_count: unread ?? 0,
          },
        ]);
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
    <div className="w-full bg-white min-h-screen text-black p-4 md:p-6">
      <h1 className="text-2xl font-bold border-b border-gray-100 pb-4 mb-2">メッセージ</h1>
      <p className="text-sm text-gray-400 mb-4">メッセージは運営とのやり取りのみ可能です。</p>

      {partners.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>運営アカウントが見つかりませんでした。</p>
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
                    <span className="font-bold text-base text-black truncate mb-1 flex items-center gap-1">
                      {partner.username}
                      {partner.is_official && <VerifiedBadge />}
                    </span>
                    <div className="text-sm text-gray-500 truncate pr-2">
                      {partner.last_message || "運営への問い合わせ・通報はこちらから"}
                    </div>
                  </div>

                  {/*  右端：時間とその真下にバッジを表示するエリア（LINE風） */}
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
