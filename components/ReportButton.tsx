"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

// 通報理由の選択肢（value は report.reason_type に保存）
const REASONS = [
  { value: "spam", label: "スパム・宣伝" },
  { value: "harassment", label: "迷惑行為・ハラスメント" },
  { value: "scam", label: "詐欺・不正な取引" },
  { value: "inappropriate", label: "不適切な内容" },
  { value: "other", label: "その他" },
];

// 投稿・ユーザーを運営に報告するボタン＋モーダル。
// create_report RPC 経由で通報する（サーバー側で reporter/被通報者を確定し、
// 通報時点の内容スナップショットを report に保存＝改ざん不可）。
export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: "txt_post" | "txt_post_reply" | "post" | "user" | "message";
  targetId: string | number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    setOpen(false);
    setReason("");
    setDetail("");
    setDone(false);
  };

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    // reporter_id・被通報者・内容スナップショットはすべてサーバー（RPC）が確定する
    const { error } = await supabase.rpc("create_report", {
      p_target_type: targetType,
      p_target_id: String(targetId),
      p_reason_type: reason,
      p_reason_detail: detail.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      console.error("通報の送信に失敗しました:", error);
      alert("通報の送信に失敗しました。時間をおいて再度お試しください。");
      return;
    }
    setDone(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`text-gray-400 hover:text-red-500 transition-colors ${className ?? ""}`}
        title="報告する"
      >
        <Flag className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <div
            className="relative bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-500" />
                報告する
              </h2>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600 p-1" title="閉じる">
                <X className="w-6 h-6" />
              </button>
            </div>

            {done ? (
              <div className="px-5 py-8 text-center space-y-3">
                <p className="text-gray-800 font-bold">報告を送信しました</p>
                <p className="text-sm text-gray-500">運営が内容を確認します。ご協力ありがとうございます。</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors"
                >
                  閉じる
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                <p className="text-sm text-gray-500">
                  報告理由を選んでください。運営が確認します（相手には通知されません）。
                </p>
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className="flex items-center gap-2.5 text-sm cursor-pointer border border-gray-200 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="text-red-500 focus:ring-red-500"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="詳細があれば入力してください（任意）"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!reason || submitting}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "送信中..." : "報告を送信"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
