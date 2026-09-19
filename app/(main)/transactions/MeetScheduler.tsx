"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarClock, Check, Loader2, MapPin, Plus, X } from "lucide-react";

// 受け渡し場所のプリセット（よく使う地点）。
const PLACE_PRESETS = [
  "図書館前",
  "北食堂前",
  "中央食堂前",
  "工学部1号館前"
];

const MAX_CANDIDATES = 5;

interface Candidate {
  id: number;
  proposer_id: string;
  meet_at: string;
  place: string;
}

const fmt = (iso: string) =>
  format(new Date(iso), "M月d日(E) HH:mm", { locale: ja });

// datetime-local 用の現在時刻（分まで）。過去日時の入力を抑止する min に使う。
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function MeetScheduler({ txId, myId }: { txId: number; myId: string }) {
  const [loading, setLoading] = useState(true);
  const [meetStatus, setMeetStatus] = useState<string>("none");
  const [meetAt, setMeetAt] = useState<string | null>(null);
  const [meetPlace, setMeetPlace] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // 提案フォーム
  const [formOpen, setFormOpen] = useState(false);
  const [place, setPlace] = useState("");
  const [times, setTimes] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const refetch = async () => {
    const { data: tx } = await supabase
      .from("txt_transaction")
      .select("meet_status, meet_at, meet_place")
      .eq("id", txId)
      .single();
    if (tx) {
      setMeetStatus((tx as { meet_status: string }).meet_status ?? "none");
      setMeetAt((tx as { meet_at: string | null }).meet_at);
      setMeetPlace((tx as { meet_place: string | null }).meet_place);
    }
    const { data: cands } = await supabase
      .from("txt_meet_candidate")
      .select("id, proposer_id, meet_at, place")
      .eq("txt_transaction_id", txId)
      .eq("status", "open")
      .order("meet_at", { ascending: true });
    setCandidates((cands ?? []) as Candidate[]);
  };

  useEffect(() => {
    (async () => {
      await refetch();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId]);

  const proposerId = candidates[0]?.proposer_id ?? null;
  const iAmProposer = proposerId === myId;

  const openForm = () => {
    setPlace(meetPlace ?? "");
    setTimes([""]);
    setFormOpen(true);
  };

  const addTime = () =>
    setTimes((t) => (t.length < MAX_CANDIDATES ? [...t, ""] : t));
  const removeTime = (i: number) =>
    setTimes((t) => t.filter((_, idx) => idx !== i));
  const setTime = (i: number, v: string) =>
    setTimes((t) => t.map((x, idx) => (idx === i ? v : x)));

  const submitProposal = async () => {
    const isoTimes = times.filter(Boolean).map((t) => new Date(t).toISOString());
    if (!place.trim()) {
      alert("受け渡し場所を入力してください。");
      return;
    }
    if (isoTimes.length < 1) {
      alert("候補の日時を1つ以上入力してください。");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("propose_meet_candidates", {
      p_tx_id: txId,
      p_place: place.trim(),
      p_times: isoTimes,
    });
    setSubmitting(false);
    if (error) {
      console.error("候補の送信に失敗しました:", error);
      alert(txtRequestErrorMessage(error.message));
      return;
    }
    setFormOpen(false);
    await refetch();
  };

  const acceptCandidate = async (id: number) => {
    const cand = candidates.find((c) => c.id === id);
    if (
      cand &&
      !window.confirm(
        `この日時・場所で確定しますか？\n${fmt(cand.meet_at)}　@ ${cand.place}`
      )
    )
      return;
    setAcceptingId(id);
    const { error } = await supabase.rpc("accept_meet_candidate", {
      p_candidate_id: id,
    });
    setAcceptingId(null);
    if (error) {
      console.error("確定に失敗しました:", error);
      alert(txtRequestErrorMessage(error.message));
      await refetch();
      return;
    }
    await refetch();
  };

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        日程を読み込み中...
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-gray-50 border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-sm font-bold text-gray-700">
        <CalendarClock className="w-4 h-4 text-blue-600" />
        受け渡しの日時・場所
      </div>

      {/* 確定表示 */}
      {meetStatus === "confirmed" && meetAt && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold">{fmt(meetAt)}</div>
            <div className="flex items-center gap-1 text-green-700">
              <MapPin className="w-3.5 h-3.5" />
              {meetPlace}
            </div>
          </div>
        </div>
      )}

      {/* 候補提示中 */}
      {meetStatus === "pending" && candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            場所：<span className="font-medium text-gray-700">{candidates[0].place}</span>
            {iAmProposer
              ? "（あなたが提案・相手の返答待ち）"
              : "（相手からの候補です。1つ選んで確定してください）"}
          </p>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2"
              >
                <span className="text-sm text-gray-800">{fmt(c.meet_at)}</span>
                {!iAmProposer && (
                  <button
                    onClick={() => acceptCandidate(c.id)}
                    disabled={acceptingId != null}
                    className="inline-flex items-center gap-1 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-60"
                  >
                    {acceptingId === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    この日時で確定
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* アクション：提案／対案／変更 */}
      {!formOpen && (
        <div className="mt-2">
          <button
            onClick={openForm}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            {meetStatus === "confirmed"
              ? "日時・場所を変更する"
              : meetStatus === "pending"
              ? iAmProposer
                ? "候補を出し直す"
                : "別の候補を出す"
              : "日時・場所を提案する"}
          </button>
        </div>
      )}

      {/* 提案フォーム */}
      {formOpen && (
        <div className="mt-2 space-y-3">
          {/* 場所（プリセット＋自由入力） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              受け渡し場所
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {PLACE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlace(p)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    place === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="場所を入力（自由記入可）"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>

          {/* 日時（最大5件） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              候補の日時（最大{MAX_CANDIDATES}件）
            </label>
            <div className="space-y-1.5">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={t}
                    min={nowLocal()}
                    onChange={(e) => setTime(i, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTime(i)}
                      className="text-gray-400 hover:text-red-500 p-1"
                      title="この候補を削除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {times.length < MAX_CANDIDATES && (
              <button
                type="button"
                onClick={addTime}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                候補の日時を追加
              </button>
            )}
          </div>

          {/* 安全の注意書き */}
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ 安全のため、<strong>琉球大学構内</strong>での受け渡しを推奨します。人通りのある明るい場所・時間帯を選んでください。
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={submitProposal}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              候補を送る
            </button>
            <button
              onClick={() => setFormOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
