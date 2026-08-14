"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// txt_transaction の 1 レコード
interface Transaction {
  id: number;
  status: string;
  completed_at?: string | null;
  txt_post_id: number | null;
  giver_id: string | null;
  receiver_id: string | null;
}

// user テーブルの表示用サブセット（id は Auth の UUID）
interface UserLite {
  id: string;
  username: string | null;
  icon_src?: string | null;
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // giver_id / receiver_id -> ユーザー情報
  const [userMap, setUserMap] = useState<Record<string, UserLite>>({});
  // txt_post_id -> 教科書タイトル
  const [bookMap, setBookMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  // 完了処理中のレコード id（二重押し防止・ボタンのローディング表示用）
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchTransactions = async () => {
      // 1. 取引一覧を取得
      const { data: txData, error } = await supabase
        .from("txt_transaction")
        .select("id, status, completed_at, txt_post_id, giver_id, receiver_id")
        .order("id", { ascending: false })
        .in("status", ["matched", "completed"]); // マッチングした取引のみ表示

      if (error) {
        console.error("取引の取得に失敗しました:", error);
        setLoading(false);
        return;
      }

      const txs = (txData ?? []) as Transaction[];
      setTransactions(txs);

      // 2. 関連するユーザー・教科書譲渡ポストの id を集約
      const userIds = Array.from(
        new Set(
          txs
            .flatMap((t) => [t.giver_id, t.receiver_id])
            .filter((v): v is string => !!v)
        )
      );
      const postIds = Array.from(
        new Set(
          txs
            .map((t) => t.txt_post_id)
            .filter((v): v is number => v != null)
        )
      );

      // 3. ユーザー情報をまとめて取得
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

      // 4. 教科書タイトルをまとめて取得（txt_post.textbook_id -> textbook.title）
      if (postIds.length > 0) {
        const { data: posts } = await supabase
          .from("txt_post")
          .select("id, book:textbook_id (title)")
          .in("id", postIds);
        const map: Record<number, string> = {};
        (posts ?? []).forEach((p) => {
          const row = p as { id: number; book: { title?: string } | { title?: string }[] | null };
          const book = Array.isArray(row.book) ? row.book[0] : row.book;
          if (book?.title) map[row.id] = book.title;
        });
        setBookMap(map);
      }

      setLoading(false);
    };

    fetchTransactions();
  }, []);

  // 「譲渡完了」ボタン：window.confirm で確認し、OK なら status を completed に更新
  const handleComplete = async (id: number) => {
    const confirmed = window.confirm("この取引を譲渡完了にしますか？");
    if (!confirmed) return;

    setUpdatingId(id);
    const { error } = await supabase
      .from("txt_transaction")
      .update({ status: "completed" })
      .eq("id", id);
    setUpdatingId(null);

    if (error) {
      console.error("ステータス更新に失敗しました:", error);
      window.alert("更新に失敗しました。");
      return;
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "completed" } : t))
    );
  };

  // ユーザー表示（アイコン＋名前、無ければ不明）
  const renderUser = (userId: string | null) => {
    const u = userId ? userMap[userId] : null;
    return (
      <div className="flex items-center gap-2 min-w-0">
        {u?.icon_src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={u.icon_src}
            alt=""
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
        )}
        <span className="truncate">{u?.username ?? "不明"}</span>
        {userId && (
          <Button
            onClick={() => router.push(`/admin/messages/${userId}`)}
            className="ml-1 h-8 px-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm gap-1 shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            メッセージ
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6 text-left">教科書譲渡 取引管理</h1>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-gray-500">取引データがありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-lg text-left">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-5 py-4 text-lg font-semibold">贈与者</th>
                <th className="px-5 py-4 text-lg font-semibold">受取者</th>
                <th className="px-5 py-4 text-lg font-semibold">教科書</th>
                <th className="px-5 py-4 text-lg font-semibold">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 text-left">
                  <td className="px-5 py-4">{renderUser(t.giver_id)}</td>
                  <td className="px-5 py-4">{renderUser(t.receiver_id)}</td>
                  <td className="px-5 py-4">
                    <span className="text-gray-700">
                      {t.txt_post_id != null ? bookMap[t.txt_post_id] ?? "不明" : "不明"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {t.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 font-bold text-green-600 whitespace-nowrap">
                        <CheckCircle2 className="w-4 h-4" />
                        譲渡完了
                      </span>
                    ) : t.status === "matched" ? (
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 font-bold text-blue-600 whitespace-nowrap">
                          譲渡中
                        </span>
                        <Button
                          onClick={() => handleComplete(t.id)}
                          disabled={updatingId === t.id}
                          className="rounded-full bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                        >
                          {updatingId === t.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "譲渡完了"
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-500">
                        {t.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
