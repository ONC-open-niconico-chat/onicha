import  Link  from "next/link";
import { useRouter } from "next/navigation";
import type { Post } from "@/app/(main)/txtpost/page";
import { supabase } from "@/lib/supabase";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { useAuth } from "@/components/loginUser";
import { ReportButton } from "@/components/ReportButton";
import { Trash2, X, ChevronLeft, ChevronRight, MessageCircle, Coins } from "lucide-react";
import { useEffect, useState } from "react";


interface PostCardProps {
  txtpost: Post;
  onDeleted?: () => void;
  // 詳細ページなど、コメントボタンを出したくない場合に false を渡す
  showCommentButton?: boolean;
  // カード全体をクリックで詳細ページへ遷移させるか（詳細ページ自身では false）
  linkToDetail?: boolean;
}

export function PostCard({ txtpost, onDeleted, showCommentButton = true, linkToDetail = true }: PostCardProps) {
  const { userProfile} = useAuth();
  const router = useRouter();

  // 拡大表示中の画像インデックス（null なら閉じている）
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  // 自分がこのポストにリクエスト済みか
  const [hasRequested, setHasRequested] = useState(false);
  // 保留中（ポスト主が未対応）のリクエスト通知ID。取り下げ可能なときだけ入る。
  const [pendingRequestId, setPendingRequestId] = useState<number | string | null>(null);

  // 自分の所持ポイント / 仮消費（予約）ポイント。利用可能 = points - reserved。
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [myReserved, setMyReserved] = useState<number>(0);

  // 自分の投稿かどうか
  const isMine = userProfile?.id != null && String(userProfile.id) === String(txtpost.user.id);

  // 既にリクエストを送っているか＆その状態を notification テーブルから判定
  useEffect(() => {
    const myId = userProfile?.id;
    if (!myId || isMine) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("notification")
        .select("id, request_status")
        .eq("sender_id", myId)
        .eq("txt_post_id", txtpost.id)
        .in("notification_type", ["request_for_offering", "request_for_request"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active) return;
      const req = data?.[0];
      if (req) {
        setHasRequested(true);
        // 承諾/見送り前（request_status が null）のみ取り下げ可能
        setPendingRequestId(req.request_status == null ? req.id : null);
      }
    })();
    return () => {
      active = false;
    };
  }, [userProfile?.id, isMine, txtpost.id]);

  // 自分の所持ポイントを取得（リクエストボタンの有効/無効判定用）
  useEffect(() => {
    const myId = userProfile?.id;
    if (!myId || isMine) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("user")
        .select("points, reserved_points")
        .eq("id", myId)
        .single();
      if (active) {
        setMyPoints(data?.points ?? 0);
        setMyReserved(data?.reserved_points ?? 0);
      }
    })();
    return () => {
      active = false;
    };
  }, [userProfile?.id, isMine]);

  // この教科書の価格
  const price = txtpost.book?.price ?? null;
  // offering（譲ります）投稿では、リクエスト者＝受取者なので価格分のポイントを支払う。
  // seeking（譲ってください）投稿では、リクエスト者＝贈与者なので支払い不要。
  const requesterPays = txtpost.give_type === "offering";
  // 利用可能残高（仮消費分を差し引いた残り）
  const available = myPoints !== null ? myPoints - myReserved : null;
  // ポイント不足か。取得前(null)や価格未設定はボタンを止めない。
  const insufficientPoints =
    requesterPays &&
    price != null &&
    available !== null &&
    available < price;

  // 自分のリクエスト状態を再取得（送信・取り下げ後に呼ぶ）
  const refreshRequestState = async () => {
    const myId = userProfile?.id;
    if (!myId || isMine) return;
    const { data } = await supabase
      .from("notification")
      .select("id, request_status")
      .eq("sender_id", myId)
      .eq("txt_post_id", txtpost.id)
      .in("notification_type", ["request_for_offering", "request_for_request"])
      .order("created_at", { ascending: false })
      .limit(1);
    const req = data?.[0];
    if (req) {
      setHasRequested(true);
      setPendingRequestId(req.request_status == null ? req.id : null);
    } else {
      setHasRequested(false);
      setPendingRequestId(null);
    }
  };

  // 所持/予約ポイントを再取得（送信・取り下げ後に呼ぶ）
  const refreshPoints = async () => {
    const myId = userProfile?.id;
    if (!myId) return;
    const { data } = await supabase
      .from("user")
      .select("points, reserved_points")
      .eq("id", myId)
      .single();
    setMyPoints(data?.points ?? 0);
    setMyReserved(data?.reserved_points ?? 0);
  };

  // image_urls を配列に正規化する（配列 / JSON文字列 / Postgres配列リテラル "{a,b}" に対応）。
  // 空文字を必ず除外する（空の配列 "{}" や [""] を壊れた <img> にしないため）。
  const normalizeImageUrls = (value: unknown): string[] => {
    const clean = (arr: unknown[]): string[] =>
      arr.filter((s): s is string => typeof s === "string" && s.trim() !== "");

    if (value == null) return [];
    if (Array.isArray(value)) return clean(value);
    if (typeof value === "string") {
      const str = value.trim();
      // 空・空配列（JSON "[]" / Postgres "{}"）は画像なし
      if (!str || str === "{}" || str === "[]") return [];
      // JSON 配列文字列（例: '["https://..."]'）
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return clean(parsed);
      } catch {
        // JSON でなければ下の Postgres 配列リテラルとして処理する
      }
      // Postgres の配列リテラル "{url1,url2}" を分解
      if (str.startsWith("{") && str.endsWith("}")) {
        return str
          .slice(1, -1)
          .split(",")
          .map((s) => s.replace(/^"|"$/g, "").trim())
          .filter(Boolean);
      }
      // 単一URL文字列
      return [str];
    }
    return [];
  };

  const imageUrls = normalizeImageUrls(txtpost.image_urls);

  const showPrev = () =>
    setZoomIndex((i) => (i === null ? i : (i - 1 + imageUrls.length) % imageUrls.length));
  const showNext = () =>
    setZoomIndex((i) => (i === null ? i : (i + 1) % imageUrls.length));

  // 拡大表示中は背面のスクロールを止め、キーボード操作を受け付ける
  useEffect(() => {
    if (zoomIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomIndex(null);
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomIndex, imageUrls.length]);

  // 自分の教科書譲渡ポストを削除する。
  // 削除〜予約解放〜通知/取引の後始末を RPC でアトミックに実行する。
  // マッチング済みは RPC 側で拒否される（'post already matched'）。
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("この投稿を削除しますか？")) return;
    const { error } = await supabase.rpc("delete_txt_post", {
      p_txt_post_id: txtpost.id,
    });
    if (error) {
      console.error("投稿の削除に失敗しました:", error);
      alert(txtRequestErrorMessage(error.message));
      return;
    }
    await refreshPoints(); // seeking 投稿削除時の予約解放を残高へ反映
    onDeleted?.();
  };

  // 送った譲渡リクエストを取り下げる（ポスト主が未対応のときのみ）
  const handleWithdraw = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingRequestId == null) return;
    if (!confirm("この譲渡リクエストを取り下げますか？")) return;

    // 通知の更新〜取引の cancelled 化までを RPC でアトミックに実行
    const { error } = await supabase.rpc("withdraw_txt_request", {
      p_notification_id: pendingRequestId,
    });

    if (error) {
      console.error("リクエストの取り下げに失敗しました:", error);
      alert(txtRequestErrorMessage(error.message));
      await refreshRequestState();
      return;
    }

    // 取り下げ後は再度リクエストできる状態に戻す（予約解放も残高へ反映）
    await refreshRequestState();
    await refreshPoints();
  };

  return (
    <article
      onClick={linkToDetail ? () => router.push(`/txtpost/${txtpost.id}`) : undefined}
      className={`p-4 hover:bg-gray-50 transition-colors ${linkToDetail ? "cursor-pointer" : ""}`}
    >
      <div className="flex gap-3">
        <Link href={`/profile/${txtpost.user.id}`} onClick={(e) => e.stopPropagation()}>
          <img
            src={txtpost?.user?.icon_src || "https://kvppbmrsywcabytfrhit.supabase.co/storage/v1/object/public/avatar/IMG_1108.JPG"}
            alt={txtpost.user.username}
            className="w-12 h-12 rounded-full"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/profile/${txtpost.user.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-bold hover:underline"
            >
              {txtpost.user.username}
            </Link>
            {/*<span className="text-gray-600">{txtpost.user.username}</span>*/}
            <span className="text-gray-600">·</span>
            <span className="text-gray-600">{txtpost.created_at}</span>
            {isMine && txtpost.status !== "マッチング済み" && (
              <button
                onClick={handleDelete}
                className="ml-auto text-gray-500 hover:text-red-500 transition-colors"
                title="投稿を削除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            {!isMine && (
              <ReportButton
                targetType="txt_post"
                targetId={txtpost.id}
                reportedUserId={String(txtpost.user.id)}
                className="ml-auto"
              />
            )}
          </div>

          <p className="mb-3">{txtpost.description}</p>

          <div
            className={`border rounded-2xl p-4 mb-3 ${
              txtpost.give_type === "offering"
                ? "bg-blue-50 border-blue-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="mb-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  txtpost.give_type === "offering"
                    ? "bg-blue-600 text-white"
                    : "bg-green-600 text-white"
                }`}
              >
                {txtpost.give_type === "offering" ? "譲ります" : "譲ってください"}
              </span>
            </div>

            <h3 className="font-bold text-lg mb-1">{txtpost.book.title}</h3>
            <div className="flex items-center gap-4 text-sm text-gray-700 mb-2">
              <span>{txtpost.condition?.name || ""}</span>
            </div>

            {/* 価格（目立たせる） */}
            <div className="inline-flex items-baseline gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 shadow-sm">
              <Coins className="w-4 h-4 text-amber-500 self-center" />
              {txtpost.book.price != null ? (
                <>
                  <span className="text-xl font-extrabold text-amber-700 leading-none tabular-nums">
                    {txtpost.book.price.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-amber-600">pt</span>
                </>
              ) : (
                <span className="text-sm font-bold text-gray-400 self-center">価格未設定</span>
              )}
            </div>


            <div className="flex justify-start pt-2 border-t border-dashed border-gray-200">
              {txtpost.status === "マッチング済み" ? (
                <span className="px-4 py-2 rounded-xl font-bold text-sm bg-gray-100 text-gray-500 border border-gray-300">
                  マッチング済み ✓
                </span>
              ) : isMine ? null : hasRequested ? (
                pendingRequestId != null ? (
                  // 保留中：取り下げボタン
                  <button
                    onClick={handleWithdraw}
                    className="px-4 py-2 rounded-xl font-bold text-sm bg-white text-red-600 border border-red-300 hover:bg-red-50 transition-colors active:scale-95"
                  >
                    リクエストを取り下げる
                  </button>
                ) : (
                  <span className="px-4 py-2 rounded-xl font-bold text-sm bg-gray-100 text-gray-500 border border-gray-300">
                    リクエスト済み ✓
                  </span>
                )
              ) : (
              <button
                disabled={insufficientPoints}
                title={insufficientPoints ? `この教科書の受け取りには ${price} ポイントが必要です` : undefined}
                onClick={async(e) => {
                  e.stopPropagation(); // カード全体のクリックイベントと衝突するのを防ぐ
                  if (!userProfile?.id) return;

                  const actionText = txtpost.give_type === "offering" ? "「譲ってください」" : "「譲ります」";
                  if (!window.confirm(`${txtpost.user.username} さんに${actionText}のリクエストを送りますか？`)) return;

                  // 送信〜取引作成〜通知作成までを RPC でアトミックに実行
                  const { error } = await supabase.rpc("send_txt_request", {
                    p_txt_post_id: txtpost.id,
                  });

                  if (error) {
                    console.error("リクエスト送信に失敗しました:", error);
                    await refreshPoints();
                    alert(txtRequestErrorMessage(error.message));
                    return;
                  }

                  await refreshRequestState(); // 送信直後から取り下げ可能に
                  await refreshPoints();        // 仮消費（予約）分を残高に反映
                  alert("リクエストを送信しました！相手からの返信をお待ちください。");
                }}

                className={`px-4 py-2 rounded-xl font-bold text-sm shadow-sm transition-all ${
                  insufficientPoints
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed" // ポイント不足時はグレーアウト
                    : txtpost.give_type === "offering"
                    ? "bg-green-600 hover:bg-green-700 text-white active:scale-95" // 「譲ります」に対しては「譲ってください（グリーン）」
                    : "bg-blue-600 hover:bg-blue-700 text-white active:scale-95"   // 「譲ってください」に対しては「譲ります（ブルー）」
                }`}
              >
                {insufficientPoints
                  ? "ポイント不足"
                  : txtpost.give_type === "offering"
                  ? "譲ってください 🙌"
                  : "譲ります 📚"}
              </button>
              )}
            </div>
          </div>

          {/* ─── 添付画像のサムネイル（クリックで拡大表示） ─── */}
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {imageUrls.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomIndex(index);
                  }}
                  className="w-50 h-50 rounded-xl overflow-hidden border border-gray-200 hover:opacity-80 transition-opacity active:scale-95"
                  title="画像を拡大表示"
                >
                  <img
                    src={url}
                    alt={`${txtpost.book.title} ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* コメント（返信）ページへのリンク */}
          {showCommentButton && (
            <div className="mt-1">
              <Link
                href={`/txtpost/${txtpost.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-gray-500 hover:text-blue-600 text-sm p-2 -ml-2 rounded-full transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{txtpost.reply_count ?? 0}</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ─── 画像の拡大表示（ライトボックス） ─── */}
      {zoomIndex !== null && imageUrls[zoomIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            setZoomIndex(null);
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIndex(null);
            }}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
            title="閉じる"
          >
            <X className="w-8 h-8" />
          </button>

          {imageUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrev();
                }}
                className="absolute left-2 sm:left-6 text-white/80 hover:text-white transition-colors"
                title="前の画像"
              >
                <ChevronLeft className="w-10 h-10" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showNext();
                }}
                className="absolute right-2 sm:right-6 text-white/80 hover:text-white transition-colors"
                title="次の画像"
              >
                <ChevronRight className="w-10 h-10" />
              </button>
              <span className="absolute bottom-6 text-white/80 text-sm">
                {zoomIndex + 1} / {imageUrls.length}
              </span>
            </>
          )}

          <img
            src={imageUrls[zoomIndex]}
            alt={`${txtpost.book.title} ${zoomIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        </div>
      )}
    </article>
  );
}
