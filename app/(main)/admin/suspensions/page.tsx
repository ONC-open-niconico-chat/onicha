"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Ban, ShieldCheck, Loader2, Search, ShieldAlert } from "lucide-react";

interface Suspension {
  user_id: string;
  reason: string | null;
  created_at: string;
  created_by: string | null;
}
interface UserLite {
  id: string;
  username: string | null;
  icon_src?: string | null;
}

const DEFAULT_ICON = "/yujilink_icon/yujilink_icon.JPG";

export default function AdminSuspensionsPage() {
  const [suspensions, setSuspensions] = useState<Suspension[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // ユーザー名検索して停止する（通報に紐づかない相手用）
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserLite[]>([]);

  const suspendedSet = new Set(suspensions.map((s) => s.user_id));

  // 停止中一覧＋関連ユーザー情報を取得
  const refresh = async () => {
    const { data, error } = await supabase
      .from("suspended_users")
      .select("user_id, reason, created_at, created_by")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("利用停止一覧の取得に失敗しました:", error);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Suspension[];
    setSuspensions(rows);

    const ids = Array.from(
      new Set(rows.flatMap((r) => [r.user_id, r.created_by]).filter((v): v is string => !!v))
    );
    if (ids.length > 0) {
      const { data: users } = await supabase
        .from("user")
        .select("id, username, icon_src")
        .in("id", ids);
      const map: Record<string, UserLite> = {};
      (users ?? []).forEach((u) => {
        map[(u as UserLite).id] = u as UserLite;
      });
      setUserMap(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const nameOf = (id: string | null) => (id ? userMap[id]?.username ?? "不明なユーザー" : "—");

  const handleSuspend = async (userId: string) => {
    const reason = window.prompt(
      "利用停止の理由を入力してください（ユーザーに表示されます）",
      "利用規約違反のため"
    );
    if (reason === null) return;
    setBusyUserId(userId);
    const { error } = await supabase.rpc("suspend_user", {
      p_user_id: userId,
      p_reason: reason.trim() || null,
    });
    setBusyUserId(null);
    if (error) {
      window.alert(
        error.message.includes("cannot suspend staff")
          ? "運営アカウントは停止できません。"
          : error.message.includes("not authorized")
          ? "権限がありません。"
          : "利用停止に失敗しました。"
      );
      return;
    }
    await refresh();
  };

  const handleUnsuspend = async (userId: string) => {
    if (!window.confirm("この利用者の利用停止を解除しますか？")) return;
    setBusyUserId(userId);
    const { error } = await supabase.rpc("unsuspend_user", { p_user_id: userId });
    setBusyUserId(null);
    if (error) {
      window.alert("解除に失敗しました。");
      return;
    }
    await refresh();
  };

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("user")
      .select("id, username, icon_src")
      .ilike("username", `%${q}%`)
      .limit(10);
    setSearching(false);
    setResults((data ?? []) as UserLite[]);
  };

  return (
    <div className="w-full p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <ShieldAlert className="w-6 h-6 text-red-500" />
        利用停止の管理
      </h1>

      {/* ユーザー名で検索して停止 */}
      <form onSubmit={doSearch} className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 flex-1 border border-gray-300 rounded-full px-3 py-2 bg-white focus-within:border-blue-400 transition-colors max-w-md">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ユーザー名で検索して停止"
            className="flex-1 outline-none text-sm bg-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold"
        >
          {searching ? "検索中..." : "検索"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="mb-6 border border-gray-200 rounded-2xl divide-y divide-gray-100 max-w-2xl">
          {results.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.icon_src || DEFAULT_ICON} alt="" className="w-9 h-9 rounded-full object-cover" />
              <Link href={`/profile/${u.id}`} className="flex-1 min-w-0 font-bold text-blue-600 hover:underline truncate">
                {u.username ?? "不明"}
              </Link>
              {suspendedSet.has(u.id) ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-xs font-bold">
                  <Ban className="w-3 h-3" />
                  停止中
                </span>
              ) : (
                <button
                  onClick={() => handleSuspend(u.id)}
                  disabled={busyUserId === u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm font-bold"
                >
                  {busyUserId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  利用停止
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="text-lg font-bold text-gray-800 mb-2">
        停止中のユーザー{!loading && `（${suspensions.length}）`}
      </h2>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : suspensions.length === 0 ? (
        <p className="text-gray-500">現在、利用停止中のユーザーはいません。</p>
      ) : (
        <div className="space-y-3">
          {suspensions.map((s) => (
            <div key={s.user_id} className="border border-gray-200 rounded-2xl p-4 bg-white">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={userMap[s.user_id]?.icon_src || DEFAULT_ICON}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${s.user_id}`} className="font-bold text-blue-600 hover:underline">
                    {nameOf(s.user_id)}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(s.created_at).toLocaleString("ja-JP")}
                    ・実施者：{nameOf(s.created_by)}
                  </div>
                </div>
                <button
                  onClick={() => handleUnsuspend(s.user_id)}
                  disabled={busyUserId === s.user_id}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-gray-700 px-3 py-1.5 text-sm font-bold shrink-0"
                >
                  {busyUserId === s.user_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  停止解除
                </button>
              </div>
              {s.reason && (
                <p className="mt-2 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                  理由：{s.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
