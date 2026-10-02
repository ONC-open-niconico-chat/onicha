"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { Search, Loader2, CheckCircle2 } from "lucide-react";

interface Textbook {
  id: number;
  title: string | null;
  confirmed: boolean;
}

export default function AdminTextbooksPage() {
  const [rows, setRows] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  // 未確認（ユーザー追加後まだ確認していない）のものだけ表示するか
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const load = async (keyword: string, onlyUnconfirmed: boolean) => {
    let query = supabase
      .from("textbook")
      .select("id, title, confirmed")
      .order("title", { ascending: true })
      .limit(50);
    if (keyword.trim()) query = query.ilike("title", `%${keyword.trim()}%`);
    if (onlyUnconfirmed) {
      // 未確認のみ
      query = query.eq("confirmed", false);
    }
    const { data, error } = await query;
    if (error) {
      console.error("教科書の取得に失敗しました:", error);
      setRows([]);
    } else {
      setRows((data ?? []) as Textbook[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load("", false);
    };
    run();
  }, []);

  const handleSearch = async (value: string) => {
    setTerm(value);
    await load(value, unconfirmedOnly);
  };

  const handleToggleUnconfirmed = async (checked: boolean) => {
    setUnconfirmedOnly(checked);
    await load(term, checked);
  };

  const handleConfirm = async (id: number) => {
    setConfirmingId(id);
    const { error } = await supabase.rpc("confirm_textbook", { p_textbook_id: id });
    setConfirmingId(null);

    if (error) {
      console.error("確認に失敗しました:", error);
      alert(txtRequestErrorMessage(error.message));
      return;
    }

    if (unconfirmedOnly) {
      // 未確認フィルタ中は一覧から外す
      setRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, confirmed: true } : r)));
    }
  };

  return (
    <div className="w-full p-4 md:p-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">教科書の確認</h1>
      <p className="text-sm text-gray-500 mb-4">
        ユーザーが新規追加した教科書名を確認する画面です。内容に問題がなければ「確認済みにする」を押してください。
      </p>

      {/* 検索 & フィルタ */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 max-w-md flex-1">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={term}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="教科書名で検索"
            className="flex-1 outline-none text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unconfirmedOnly}
            onChange={(e) => handleToggleUnconfirmed(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          未確認のみ表示
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-gray-400">教科書がありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-base">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-5 py-3 font-semibold">教科書名</th>
                <th className="px-5 py-3 font-semibold w-40">確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-5 py-3">{r.title ?? "（無題）"}</td>
                  <td className="px-5 py-3">
                    {r.confirmed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-600 whitespace-nowrap">
                        <CheckCircle2 className="w-4 h-4" />
                        確認済み
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConfirm(r.id)}
                        disabled={confirmingId === r.id}
                        className="rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-1.5 whitespace-nowrap"
                      >
                        {confirmingId === r.id ? "処理中..." : "確認済みにする"}
                      </button>
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
