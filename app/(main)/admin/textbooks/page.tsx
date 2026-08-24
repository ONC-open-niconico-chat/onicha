"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { Search, Loader2, CheckCircle2 } from "lucide-react";

interface Textbook {
  id: number;
  title: string | null;
  price: number | null;
  list_price: number | null;
  confirmed: boolean;
}

export default function AdminTextbooksPage() {
  const [rows, setRows] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  // ユーザー追加（定価入力あり）かつ未確認のものだけ表示するか
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  // 入力中の価格（id -> 文字列）。未編集の行は undefined。
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const load = async (keyword: string, onlyUnconfirmed: boolean) => {
    let query = supabase
      .from("textbook")
      .select("id, title, price, list_price, confirmed")
      .order("title", { ascending: true })
      .limit(50);
    if (keyword.trim()) query = query.ilike("title", `%${keyword.trim()}%`);
    if (onlyUnconfirmed) {
      // ユーザー追加（list_price あり）かつ未確認
      query = query.not("list_price", "is", null).eq("confirmed", false);
    }
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
      await load("", false);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (value: string) => {
    setTerm(value);
    await load(value, unconfirmedOnly);
  };

  const handleToggleUnconfirmed = async (checked: boolean) => {
    setUnconfirmedOnly(checked);
    await load(term, checked);
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
    <div className="w-full p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">教科書の価格設定</h1>
      <p className="text-sm text-gray-500 mb-4">
        ここで設定した価格が、譲渡完了時に贈与者へ付与／受取者から消費されるポイントになります。
        「定価」はユーザーが新規追加時に入力した値です（価格＝定価×0.4）。内容を確認したら「確認済みにする」を押してください。
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
          ユーザー追加・未確認のみ表示
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
                <th className="px-5 py-3 font-semibold w-32">定価</th>
                <th className="px-5 py-3 font-semibold w-48">価格（ポイント）</th>
                <th className="px-5 py-3 font-semibold w-28"></th>
                <th className="px-5 py-3 font-semibold w-40">確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const value = edits[r.id] ?? (r.price != null ? String(r.price) : "");
                const dirty = edits[r.id] != null && edits[r.id] !== (r.price != null ? String(r.price) : "");
                const userAdded = r.list_price != null; // ユーザー追加分
                return (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-5 py-3">{r.title ?? "（無題）"}</td>
                    <td className="px-5 py-3 text-gray-700 tabular-nums">
                      {r.list_price != null ? `${r.list_price.toLocaleString()} 円` : "—"}
                    </td>
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
                    <td className="px-5 py-3">
                      {!userAdded ? (
                        <span className="text-gray-400 text-sm">—</span>
                      ) : r.confirmed ? (
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
