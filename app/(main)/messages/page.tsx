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
    type ULite = { id: string; username: string; icon_src?: string; is_official?: boolean };

    const init = async () => {
      // 1. ログイン中の自分のIDを取得
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }
      const me = session.user.id;
      setMyId(me);

      try {
        // 2. 運営（公式アカウント）を取得（常に一覧の先頭に表示）
        const { data: officialData } = await supabase
          .from("user")
          .select("id, username, icon_src, is_official")
          .eq("is_official", true)
          .limit(1)
          .maybeSingle();
        const official = officialData as ULite | null;

        // 3. 取引中(matched/received)の相手を集める（取引中のときだけ一覧に出す）
        const { data: txs } = await supabase
          .from("txt_transaction")
          .select("giver_id, receiver_id, status")
          .in("status", ["matched", "received"])
          .or(`giver_id.eq.${me},receiver_id.eq.${me}`);
        const partnerIds = Array.from(
          new Set(
            (txs ?? [])
              .map((t) => ((t as { giver_id: string; receiver_id: string }).giver_id === me
                ? (t as { receiver_id: string }).receiver_id
                : (t as { giver_id: string }).giver_id))
              .filter((id): id is string => !!id && id !== official?.id)
          )
        );

        // 4. 取引相手のプロフィール
        let txPartners: ULite[] = [];
        if (partnerIds.length > 0) {
          const { data: users } = await supabase
            .from("user")
            .select("id, username, icon_src, is_official")
            .in("id", partnerIds);
          txPartners = (users ?? []) as ULite[];
        }

        // 対象ユーザー（運営＋取引中の相手）
        const targetUsers: ULite[] = [...(official ? [official] : []), ...txPartners];
        if (targetUsers.length === 0) {
          setPartners([]);
          setLoading(false);
          return;
        }

        // 5. 自分が関わる最新メッセージ（相手ごとの最後の1件）
        const { data: chats } = await supabase
          .from("chat")
          .select("sender_id, receiver_id, content, created_at")
          .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
          .order("created_at", { ascending: false });
        const lastByPartner: Record<string, { content: string | null; created_at: string }> = {};
        (chats ?? []).forEach((c) => {
          const row = c as { sender_id: string; receiver_id: string; content: string | null; created_at: string };
          const other = row.sender_id === me ? row.receiver_id : row.sender_id;
          if (other && !lastByPartner[other]) {
            lastByPartner[other] = { content: row.content, created_at: row.created_at };
          }
        });

        // 6. 未読メッセージ数（送信者ごと）
        const { data: unreadNotifs } = await supabase
          .from("notification")
          .select("sender_id")
          .eq("receiver_id", me)
          .eq("notification_type", "message")
          .eq("is_read", false);
        const unreadBySender: Record<string, number> = {};
        (unreadNotifs ?? []).forEach((n) => {
          const s = (n as { sender_id: string | null }).sender_id;
          if (s) unreadBySender[s] = (unreadBySender[s] ?? 0) + 1;
        });

        // 7. 一覧を組み立て（運営を先頭に）
        const list: ChatPartner[] = targetUsers.map((u) => ({
          id: u.id,
          username: u.username,
          icon_src: u.icon_src,
          is_official: u.is_official,
          last_message: lastByPartner[u.id]?.content ?? undefined,
          last_message_at: lastByPartner[u.id]?.created_at ?? undefined,
          unread_count: unreadBySender[u.id] ?? 0,
        }));
        setPartners(list);
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
      <p className="text-sm text-gray-400 mb-4">
        運営、および取引中のお相手とやり取りできます。取引が終了すると送信できなくなります。
      </p>

      {partners.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>やり取りできる相手はいません。</p>
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
                      {partner.last_message ||
                        (partner.is_official
                          ? "運営への問い合わせ・通報はこちらから"
                          : "受け渡しの相談はこちらから")}
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
