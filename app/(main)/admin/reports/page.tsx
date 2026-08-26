"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Flag, Loader2, ExternalLink, Check, X as XIcon } from "lucide-react";

// report テーブルの 1 レコード
interface Report {
  id: number;
  reporter_id: string;
  reporterd_user_id: string; // 被通報ユーザー（列名は既存スキーマのまま）
  target_type: string;
  target_id: string;
  reason_type: string;
  reason_detail: string | null;
  status: string;
  created_at: string;
}

interface UserLite {
  id: string;
  username: string | null;
  icon_src?: string | null;
}

const REASON_LABELS: Record<string, string> = {
  spam: "スパム・宣伝",
  harassment: "迷惑行為・ハラスメント",
  scam: "詐欺・不正な取引",
  inappropriate: "不適切な内容",
  other: "その他",
};

// target_type ごとの表示名とリンク先
const targetInfo = (type: string, id: string): { label: string; href: string | null } => {
  switch (type) {
    case "txt_post":
      return { label: "教科書投稿", href: `/txtpost/${id}` };
    case "post":
      return { label: "投稿", href: `/post/${id}` };
    case "user":
      return { label: "ユーザー", href: `/profile/${id}` };
    case "message":
      return { label: "メッセージ", href: null };
    default:
      return { label: type, href: null };
  }
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [view, setView] = useState<"pending" | "done">("pending");

  useEffect(() => {
    const fetchReports = async () => {
      const { data, error } = await supabase
        .from("report")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("通報の取得に失敗しました:", error);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Report[];
      setReports(rows);

      // 通報者・被通報ユーザーの情報をまとめて取得
      const userIds = Array.from(
        new Set(rows.flatMap((r) => [r.reporter_id, r.reporterd_user_id]).filter((v): v is string => !!v))
      );
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("user")
          .select("id, username, icon_src")
          .in("id", userIds);
        const map: Record<string, UserLite> = {};
        (users ?? []).forEach((u) => {
          map[(u as UserLite).id] = u as UserLite;
        });
        setUserMap(map);
      }

      setLoading(false);
    };

    fetchReports();
  }, []);

  // status を更新（運営のみ・RLS で許可）
  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    const { error } = await supabase.from("report").update({ status }).eq("id", id);
    setUpdatingId(null);
    if (error) {
      console.error("通報の更新に失敗しました:", error);
      window.alert("更新に失敗しました。");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const userLabel = (id: string) => userMap[id]?.username ?? "不明なユーザー";

  const pending = reports.filter((r) => r.status === "pending");
  const done = reports.filter((r) => r.status !== "pending");
  const shown = view === "pending" ? pending : done;

  return (
    <div className="w-full p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Flag className="w-6 h-6 text-red-500" />
        通報の確認
      </h1>

      {/* タブ（未対応 / 対応済み） */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setView("pending")}
          className={`px-4 py-2 rounded-full font-bold text-base transition-colors ${
            view === "pending" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          未対応{pending.length > 0 && `（${pending.length}）`}
        </button>
        <button
          onClick={() => setView("done")}
          className={`px-4 py-2 rounded-full font-bold text-base transition-colors ${
            view === "done" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          対応済み
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : shown.length === 0 ? (
        <p className="text-gray-500">{view === "pending" ? "未対応の通報はありません。" : "対応済みの通報はありません。"}</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const t = targetInfo(r.target_type, r.target_id);
            return (
              <div key={r.id} className="border border-gray-200 rounded-2xl p-4 bg-white">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 font-bold px-3 py-1 text-sm">
                    {REASON_LABELS[r.reason_type] ?? r.reason_type}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-3 py-1 text-xs font-medium">
                    {t.label}
                  </span>
                  {r.status === "resolved" && (
                    <span className="inline-flex items-center rounded-full bg-green-50 text-green-600 px-3 py-1 text-xs font-bold">対応済み</span>
                  )}
                  {r.status === "dismissed" && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-3 py-1 text-xs font-bold">却下</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                  </span>
                </div>

                <div className="text-sm text-gray-700 space-y-1">
                  <div>
                    <span className="text-gray-500">対象ユーザー：</span>
                    <Link href={`/profile/${r.reporterd_user_id}`} className="font-bold text-blue-600 hover:underline">
                      {userLabel(r.reporterd_user_id)}
                    </Link>
                  </div>
                  <div>
                    <span className="text-gray-500">通報者：</span>
                    {userLabel(r.reporter_id)}
                  </div>
                  {r.reason_detail && (
                    <div className="mt-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 whitespace-pre-wrap text-gray-700">
                      {r.reason_detail}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {t.href && (
                    <Link
                      href={t.href}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-100 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      対象を表示
                    </Link>
                  )}
                  {r.status === "pending" ? (
                    <>
                      <button
                        onClick={() => updateStatus(r.id, "resolved")}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm font-bold transition"
                      >
                        <Check className="w-4 h-4" />
                        対応済みにする
                      </button>
                      <button
                        onClick={() => updateStatus(r.id, "dismissed")}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-gray-600 px-3 py-1.5 text-sm font-bold transition"
                      >
                        <XIcon className="w-4 h-4" />
                        却下
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => updateStatus(r.id, "pending")}
                      disabled={updatingId === r.id}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-gray-600 px-3 py-1.5 text-sm font-bold transition"
                    >
                      未対応に戻す
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
