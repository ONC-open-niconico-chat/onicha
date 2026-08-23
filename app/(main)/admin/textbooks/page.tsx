"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { Search, Loader2 } from "lucide-react";

interface Textbook {
  id: number;
  title: string | null;
  price: number | null;
}

export default function AdminTextbooksPage() {
  const [rows, setRows] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  // 入力中の価格（id -> 文字列）。未編集の行は undefined。
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async (keyword: string) => {
    let query = supabase
      .from("textbook")
      .select("id, title, price")
      .order("title", { ascending: true })
      .limit(50);
    if (keyword.trim()) query = query.ilike("title", `%${keyword.trim()}%`);
    const { data, error } = await query;
    if (error) {
      console.error("教科書の取得に失敗しました:", error);
      setRows([]);
    } else {
      setRows((data ?? []) as Textbook[]);
    }
    setEdits({});
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load("");
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (value: string) => {
    setTerm(value);
    await load(value);
  };

  const handleSave = async (id: number) => {
    const raw = edits[id];
    if (raw == null || raw === "") return;
    const price = Number(raw);
    if (!Number.isInteger(price) || price < 0) {
      alert("0以上の整数で価格を入力してください。");
      return;
    }

    setSavingId(id);
    const { error } = await supabase.rpc("set_textbook_price", {
      p_textbook_id: id,
      p_price: price,
    });
    setSavingId(null);

    if (error) {
      console.error("価格の更新に失敗しました:", error);
      alert(txtRequestErrorMessage(error.message));
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, price } : r)));
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="w-full p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">教科書の価格設定</h1>
      <p className="text-sm text-gray-500 mb-4">
        ここで設定した価格が、譲渡完了時に贈与者へ付与／受取者から消費されるポイントになります。
      </p>

      {/* 検索 */}
      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 mb-6 max-w-md">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          value={term}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="教科書名で検索"
          className="flex-1 outline-none text-sm"
        />
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
                <th className="px-5 py-3 font-semibold w-48">価格（ポイント）</th>
                <th className="px-5 py-3 font-semibold w-28"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const value = edits[r.id] ?? (r.price != null ? String(r.price) : "");
                const dirty = edits[r.id] != null && edits[r.id] !== (r.price != null ? String(r.price) : "");
                return (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-5 py-3">{r.title ?? "（無題）"}</td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="未設定"
                        className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleSave(r.id)}
                        disabled={!dirty || savingId === r.id}
                        className="rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold px-4 py-1.5"
                      >
                        {savingId === r.id ? "保存中..." : "保存"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
