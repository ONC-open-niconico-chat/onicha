"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { ArrowLeftRight, Clock, Coins, Loader2, MessageCircle, PackageCheck } from "lucide-react";

// マッチング中（status = 'matched'）の取引1件。
// giver = 教科書を譲る側（ポイントを受け取る）／receiver = 受け取る側（ポイントを支払う）。
interface TxUser {
  id: string;
  username: string | null;
  icon_src: string | null;
}
interface Transaction {
  id: number;
  status: string;
  points: number | null;
  giver_id: string;
  receiver_id: string;
  post: {
    id: number;
    give_type: string;
    book: { id: number; title: string; price: number | null } | null;
  } | null;
  giver: TxUser | null;
  receiver: TxUser | null;
}

// PostgREST の埋め込みは to-one でもオブジェクト/配列のどちらかで返ることがあるため正規化する
const one = (v: unknown): Record<string, unknown> | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return (x ?? null) as Record<string, unknown> | null;
};

const DEFAULT_ICON = "/yujilink_icon/yujilink_icon.JPG";

export default function TransactionsPage() {
  const [myId, setMyId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  // 「受け取りました」処理中の取引 id（二重押し防止・ローディング表示用）
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setMyId(uid);
      if (!uid) {
        setLoading(false);
        return;
      }

      // 自分が当事者（giver もしくは receiver）で、マッチング中の取引を取得
      const { data, error } = await supabase
        .from("txt_transaction")
        .select(
          `
            id,
            status,
            points,
            giver_id,
            receiver_id,
            post:txt_post_id ( id, give_type, book:textbook ( id, title, price ) ),
            giver:giver_id ( id, username, icon_src ),
            receiver:receiver_id ( id, username, icon_src )
          `
        )
        .in("status", ["matched", "received"])
        .or(`giver_id.eq.${uid},receiver_id.eq.${uid}`)
        .order("id", { ascending: false });

      if (error) {
        console.error("取引の取得に失敗しました:", error);
        setLoading(false);
        return;
      }

      const normalized = (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const post = one(r.post);
        return {
          ...r,
          post: post ? { ...post, book: one(post.book) } : null,
          giver: one(r.giver),
          receiver: one(r.receiver),
        };
      }) as unknown as Transaction[];

      setTransactions(normalized);
      setLoading(false);
    };

    load();
  }, []);

  // 受取者が対面での受け渡し時に「受け取りました」を押す。
  // matched -> received（ポイントは動かさない。確定は運営の完了処理で）。
  const handleReceived = async (txId: number) => {
    const ok = window.confirm(
      "この教科書を受け取りましたか？\n受け渡し時に、その場で押してください。\n（運営の確認後にポイントが移動します）"
    );
    if (!ok) return;

    setUpdatingId(txId);
    const { error } = await supabase.rpc("mark_txt_received", { p_id: txId });
    setUpdatingId(null);

    if (error) {
      console.error("受け取り確認に失敗しました:", error);
      window.alert(txtRequestErrorMessage(error.message));
      return;
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: "received" } : t))
    );
  };

  return (
    <div className="w-full">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-blue-600" />
          取引中の譲渡
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          マッチングが成立し、受け渡し待ちの取引です。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-20 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : !myId ? (
        <p className="text-center py-20 text-gray-400 text-sm">
          ログインすると取引中の譲渡が表示されます。
        </p>
      ) : transactions.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm px-6">
          現在、取引中の譲渡はありません。
          <br />
          教科書譲渡でリクエストが承諾されると、ここに表示されます。
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {transactions.map((tx) => {
            const iAmGiver = tx.giver_id === myId;
            const partner = iAmGiver ? tx.receiver : tx.giver;
            const points = tx.points ?? 0;
            const title = tx.post?.book?.title ?? "（教科書情報なし）";

            return (
              <li key={tx.id} className="p-4">
                <div className="border border-gray-200 rounded-2xl p-4">
                  {/* 役割バッジ＋ポイント */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        iAmGiver
                          ? "bg-blue-600 text-white"
                          : "bg-green-600 text-white"
                      }`}
                    >
                      {iAmGiver ? "あなたが譲る側" : "あなたが受け取る側"}
                    </span>
                    <span className="inline-flex items-baseline gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5">
                      <Coins className="w-3.5 h-3.5 text-amber-500 self-center" />
                      <span className="text-sm font-bold text-amber-700 tabular-nums">
                        {iAmGiver ? "+" : "−"}
                        {points.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-bold text-amber-600">pt</span>
                    </span>
                  </div>

                  {/* 教科書名 */}
                  <h3 className="font-bold text-lg mb-2">{title}</h3>

                  {/* 相手 */}
                  {partner && (
                    <Link
                      href={`/profile/${partner.id}`}
                      className="inline-flex items-center gap-2 mb-3 group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={partner.icon_src || DEFAULT_ICON}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <span className="text-sm text-gray-700 group-hover:underline">
                        {iAmGiver ? "受取相手" : "譲り主"}：
                        <span className="font-bold">
                          {partner.username ?? "不明"}
                        </span>
                      </span>
                    </Link>
                  )}

                  {/* 状態・アクション */}
                  <div className="pt-3 border-t border-dashed border-gray-200 space-y-3">
                    {tx.status === "received" ? (
                      // 受け取り確認済み：運営の最終確認待ち
                      <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <Clock className="w-4 h-4 shrink-0" />
                        {iAmGiver
                          ? "相手が受け取りを確認しました。運営の確認をお待ちください。"
                          : "受け取りを確認しました。運営の確認後にポイントが移動します。"}
                      </div>
                    ) : iAmGiver ? (
                      // 譲る側・受け渡し待ち
                      <p className="text-sm text-gray-500">
                        受け渡し時に、相手が「受け取りました」を押します。
                      </p>
                    ) : (
                      // 受け取る側・受け渡し待ち：受け取りボタン
                      <div>
                        <button
                          onClick={() => handleReceived(tx.id)}
                          disabled={updatingId === tx.id}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-green-600 hover:bg-green-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {updatingId === tx.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <PackageCheck className="w-4 h-4" />
                          )}
                          受け取りました
                        </button>
                        <p className="text-xs text-gray-400 mt-1.5">
                          ※ 教科書を受け取った、その場で押してください。
                        </p>
                      </div>
                    )}

                    {/* 受け渡しの連絡・コメントは投稿ページで */}
                    {tx.post && (
                      <Link
                        href={`/txtpost/${tx.post.id}`}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                      >
                        <MessageCircle className="w-4 h-4" />
                        投稿・コメントを見る
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
