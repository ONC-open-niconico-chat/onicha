"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Trash2, Loader2 } from "lucide-react";

interface DeletedLog {
  id: number;
  content_type: string;
  content_id: number;
  author_id: string | null;
  content: string | null;
  image: string | null;
  original_created_at: string | null;
  deleted_at: string;
}

interface UserLite {
  id: string;
  username: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  post: "投稿",
  txt_post: "教科書投稿",
  txt_post_reply: "教科書投稿への返信",
};

// 画像（単一URL / JSON配列文字列 / 空）を URL 配列に正規化
const toImages = (value: string | null): string[] => {
  if (!value) return [];
  const str = value.trim();
  if (!str || str === "{}" || str === "[]") return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string" && s.trim() !== "");
  } catch {
    /* JSON でなければ単一URL扱い */
  }
  return [str];
};

export default function AdminDeletedLogPage() {
  const [logs, setLogs] = useState<DeletedLog[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("deleted_content_log")
        .select("*")
        .order("deleted_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error("削除ログの取得に失敗しました:", error);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as DeletedLog[];
      setLogs(rows);

      const userIds = Array.from(new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v)));
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("user").select("id, username").in("id", userIds);
        const map: Record<string, UserLite> = {};
        (users ?? []).forEach((u) => {
          map[(u as UserLite).id] = u as UserLite;
        });
        setUserMap(map);
      }

      setLoading(false);
    };
    fetchLogs();
  }, []);

  const userLabel = (id: string | null) => (id ? userMap[id]?.username ?? "不明なユーザー" : "不明");

  return (
    <div className="w-full p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
        <Trash2 className="w-6 h-6 text-gray-500" />
        削除ログ
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        削除された投稿・教科書投稿・返信の内容
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : logs.length === 0 ? (
        <p className="text-gray-500">削除ログはありません。</p>
      ) : (
        <div className="space-y-3">
          {logs.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-2xl p-4 bg-white">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs font-bold">
                  {TYPE_LABELS[r.content_type] ?? r.content_type}
                </span>
                <span className="text-xs text-gray-400">#{r.content_id}</span>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                  削除 {new Date(r.deleted_at).toLocaleString("ja-JP")}
                </span>
              </div>

              <div className="text-sm text-gray-700 mb-2">
                <span className="text-gray-500">投稿者：</span>
                {r.author_id ? (
                  <Link href={`/profile/${r.author_id}`} className="font-bold text-blue-600 hover:underline">
                    {userLabel(r.author_id)}
                  </Link>
                ) : (
                  "不明"
                )}
                {r.original_created_at && (
                  <span className="text-gray-400 text-xs ml-2">
                    （投稿 {new Date(r.original_created_at).toLocaleString("ja-JP")}）
                  </span>
                )}
              </div>

              {r.content && (
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  {r.content}
                </p>
              )}
              {toImages(r.image).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {toImages(r.image).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt="" className="w-24 h-24 object-cover rounded border border-gray-200" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
