"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getOfficialUserId } from "@/lib/official";
import { Search, Loader2 } from "lucide-react";

interface UserLite {
  id: string;
  username: string | null;
  icon_src?: string | null;
}

interface Partner extends UserLite {
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
}

export default function AdminMessagesPage() {
  const router = useRouter();
  const [officialId, setOfficialId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false); // 運営IDの解決が済んだか
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);

  // 運営IDを取得し、運営が関わっている会話の相手一覧を取得
  useEffect(() => {
    const init = async () => {
      const oid = await getOfficialUserId();
      setOfficialId(oid);
      setResolved(true);
      if (!oid) {
        setLoading(false);
        return;
      }

      const { data: chatData, error } = await supabase
        .from("chat")
        .select("sender_id, receiver_id, content, created_at")
        .or(`sender_id.eq.${oid},receiver_id.eq.${oid}`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("会話一覧の取得に失敗しました:", error);
        setLoading(false);
        return;
      }

      const ids = new Set<string>();
      const lastMap = new Map<string, { content: string; created_at: string }>();
      (chatData ?? []).forEach((c) => {
        const pid = c.sender_id === oid ? c.receiver_id : c.sender_id;
        ids.add(pid);
        if (!lastMap.has(pid)) {
          lastMap.set(pid, { content: c.content, created_at: c.created_at });
        }
      });

      // 運営宛の未読メッセージ通知を相手ごとに集計
      const { data: unread } = await supabase
        .from("notification")
        .select("sender_id")
        .eq("receiver_id", oid)
        .eq("notification_type", "message")
        .eq("is_read", false);
      const unreadMap = new Map<string, number>();
      (unread ?? []).forEach((n) => {
        const sid = (n as { sender_id?: string }).sender_id;
        if (sid) unreadMap.set(sid, (unreadMap.get(sid) || 0) + 1);
      });

      if (ids.size > 0) {
        const { data: users } = await supabase
          .from("user")
          .select("id, username, icon_src")
          .in("id", Array.from(ids));
        const list = (users ?? []).map((u) => ({
          ...(u as UserLite),
          last_message: lastMap.get((u as UserLite).id)?.content,
          last_message_at: lastMap.get((u as UserLite).id)?.created_at,
          unread_count: unreadMap.get((u as UserLite).id) || 0,
        })) as Partner[];
        list.sort(
          (a, b) =>
            new Date(b.last_message_at || 0).getTime() -
            new Date(a.last_message_at || 0).getTime()
        );
        setPartners(list);
      }
      setLoading(false);
    };

    init();
  }, []);

  // 新規宛先の検索（ユーザー名の部分一致）
  const handleSearch = async (value: string) => {
    setTerm(value);
    const q = value.trim();
    if (!q || !officialId) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from("user")
      .select("id, username, icon_src")
      .ilike("username", `%${q}%`)
      .neq("id", officialId)
      .limit(8);
    setResults((data ?? []) as UserLite[]);
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
    <div className="w-full p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">運営メッセージ</h1>

      {/* 新規宛先の検索 */}
      <div className="relative mb-6">
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            value={term}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="ユーザー名で検索して新しくメッセージを送る"
            className="flex-1 outline-none text-base"
          />
        </div>
        {results.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => router.push(`/admin/messages/${u.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left"
                >
                  {u.icon_src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.icon_src} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-gray-200" />
                  )}
                  <span className="font-medium text-gray-700">{u.username ?? "不明"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : partners.length === 0 ? (
        <p className="text-gray-400">まだ運営からの会話はありません。上の検索から始められます。</p>
      ) : (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {partners.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/admin/messages/${p.id}`)}
              className="flex items-center gap-4 py-4 px-2 hover:bg-gray-50 rounded-xl cursor-pointer"
            >
              {p.icon_src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.icon_src} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <span className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl">👤</span>
              )}
              <div className="flex-1 min-w-0">
                <span className="font-bold text-base text-black block truncate">
                  {p.username ?? "不明"}
                </span>
                <span className="text-sm text-gray-500 truncate block">
                  {p.last_message || ""}
                </span>
              </div>
              <div className="flex flex-col items-end justify-center shrink-0 gap-1.5">
                {p.last_message_at && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(p.last_message_at).toLocaleDateString()}
                  </span>
                )}
                {p.unread_count > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {p.unread_count > 99 ? "99+" : p.unread_count}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
