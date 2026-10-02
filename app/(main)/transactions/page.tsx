"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { AlertCircle, ArrowLeftRight, Loader2, MessageCircle, MessagesSquare, PackageCheck } from "lucide-react";

// マッチング中（status = 'matched'）の取引1件。
// giver = 教科書を譲る側／receiver = 受け取る側。対価のやり取りはない（完全無償）。
interface TxUser {
  id: string;
  username: string | null;
  icon_src: string | null;
}
interface Transaction {
  id: number;
  status: string;
  giver_id: string;
  receiver_id: string;
  post: {
    id: number;
    give_type: string;
    book: { id: number; title: string } | null;
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
            giver_id,
            receiver_id,
            post:txt_post_id ( id, give_type, book:textbook ( id, title ) ),
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

  // 受取者が対面での受け渡し時に「受け取りました」を押すと、その場で取引が完了する。
  // matched -> completed（対価のやり取りはない）。
  const handleReceived = async (txId: number) => {
    const ok = window.confirm(
      "この教科書を受け取りましたか？\n受け渡し時に、その場で押してください。\n押すと譲渡が完了します。"
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

    // 完了した取引は一覧（取引中）から外す
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
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
            const title = tx.post?.book?.title ?? "（教科書情報なし）";

            return (
              <li key={tx.id} className="p-4">
                <div className="border border-gray-200 rounded-2xl p-4">
                  {/* 役割バッジ */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        iAmGiver
                          ? "bg-blue-600 text-white"
                          : "bg-green-600 text-white"
                      }`}
                    >
                      {iAmGiver ? "あなたが譲る側" : "あなたが受け取る側"}
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
                    {iAmGiver ? (
                      // 譲る側・受け渡し待ち：相手が「受け取りました」を押したことを確認するよう促す
                      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-300 px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <p className="text-sm font-bold text-red-600">
                          受け渡し時に、相手が「受け取りました」を押したことを確認してください。
                        </p>
                      </div>
                    ) : (
                      // 受け取る側・受け渡し待ち：受け取りボタン（押すと完了）
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-300 px-3 py-2.5">
                          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                          <p className="text-sm font-bold text-red-600">
                            受取時に、「受け取りました」ボタンを押したことを相手に確認させてください。押すと譲渡が完了します。
                          </p>
                        </div>
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

                      </div>
                    )}

                    {/* 相談用の導線（メッセージ／投稿コメント）。両者の間隔を少し広めに */}
                    <div className="flex flex-col items-start gap-4">
                      {/* 受け渡しの相談は相手とのメッセージで */}
                      {partner && (
                        <Link
                          href={`/messages/${partner.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all"
                        >
                          <MessagesSquare className="w-4 h-4" />
                          メッセージで相談する
                        </Link>
                      )}

                      {/* 投稿ページ（コメント）へ */}
                      {tx.post && (
                        <Link
                          href={`/txtpost/${tx.post.id}`}
                          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:underline"
                        >
                          <MessageCircle className="w-4 h-4" />
                          投稿・コメントを見る
                        </Link>
                      )}
                    </div>
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
