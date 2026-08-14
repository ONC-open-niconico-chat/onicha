import  Link  from "next/link";
import { useRouter } from "next/navigation";
import type { Post } from "@/app/(main)/txtpost/page";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/loginUser";
import { Trash2, X, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
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

  // 自分の所持ポイント（500未満ならリクエスト不可）
  const [myPoints, setMyPoints] = useState<number | null>(null);

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
        .select("points")
        .eq("id", myId)
        .single();
      if (active) setMyPoints(data?.points ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [userProfile?.id, isMine]);

  // ポイント不足（500未満）か。取得前(null)はボタンを止めない。
  const insufficientPoints = myPoints !== null && myPoints < 500;

  // image_urls を配列に正規化する（配列 / JSON文字列 / Postgres配列リテラル "{a,b}" に対応）
  const normalizeImageUrls = (value: unknown): string[] => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === "string") {
      const str = value.trim();
      if (!str) return [];
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed as string[];
      } catch {
        // Postgres の配列リテラル "{url1,url2}" を分解
        if (str.startsWith("{") && str.endsWith("}")) {
          return str
            .slice(1, -1)
            .split(",")
            .map((s) => s.replace(/^"|"$/g, "").trim())
            .filter(Boolean);
        }
      }
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

  // 自分の教科書譲渡ポストを削除する
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("この投稿を削除しますか？")) return;
    await supabase.from("notification").delete().eq("txt_post_id", txtpost.id);
    const { error } = await supabase.from("txt_post").delete().eq("id", txtpost.id);
    if (error) {
      console.error("投稿の削除に失敗しました:", error);
      alert("削除に失敗しました。");
      return;
    }
    onDeleted?.();
  };

  // 送った譲渡リクエストを取り下げる（ポスト主が未対応のときのみ）
  const handleWithdraw = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingRequestId == null) return;
    if (!confirm("この譲渡リクエストを取り下げますか？")) return;

    // 承諾/見送り前（request_status が null）のみ、通知を「取り下げ」に変更
    const { data, error } = await supabase
      .from("notification")
      .update({ notification_type: "request_withdrawn", is_read: false })
      .eq("id", pendingRequestId)
      .is("request_status", null)
      .select("id");

    if (error) {
      console.error("リクエストの取り下げに失敗しました:", error);
      alert("取り下げに失敗しました。");
      return;
    }
    if (!data || data.length === 0) {
      // 直前にポスト主が承諾/見送りした場合
      alert("すでにポスト主が対応済みのため取り下げできません。");
      setPendingRequestId(null);
      return;
    }

    // 取り下げたリクエストの pending 取引を cancelled に更新
    const myId = userProfile?.id;
    if (myId) {
      const { error: cancelError } = await supabase
        .from("txt_transaction")
        .update({ status: "cancelled" })
        .eq("txt_post_id", txtpost.id)
        .eq("status", "pending")
        .or(`giver_id.eq.${myId},receiver_id.eq.${myId}`);
      if (cancelError) {
        console.error("取引のキャンセルに失敗しました:", cancelError);
      }
    }

    // 取り下げ後は再度リクエストできる状態に戻す
    setHasRequested(false);
    setPendingRequestId(null);
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
            {isMine && (
              <button
                onClick={handleDelete}
                className="ml-auto text-gray-500 hover:text-red-500 transition-colors"
                title="投稿を削除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
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
            <div className="flex gap-4 text-sm text-gray-700">
              <span>{txtpost.condition?.name || ""}</span>
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
                title={insufficientPoints ? "譲渡リクエストには500ポイントが必要です" : undefined}
                onClick={async(e) => {
                  e.stopPropagation(); // カード全体のクリックイベントと衝突するのを防ぐ

                  // 所持ポイントが 500 未満なら譲渡リクエスト不可（最新の points を取得して判定）
                  if (!userProfile?.id) return;
                  const { data: me } = await supabase
                    .from("user")
                    .select("points")
                    .eq("id", userProfile.id)
                    .single();
                  if ((me?.points ?? 0) < 500) {
                    setMyPoints(me?.points ?? 0);
                    alert("譲渡リクエストには500ポイントが必要です。ポイントが不足しています。");
                    return;
                  }

                  // 1. ボタンの種類によってメッセージを変える
                  const actionText = txtpost.give_type === "offering" ? "「譲ってください」" : "「譲ります」";
                  const confirmMessage = `${txtpost.user.username} さんに${actionText}のリクエストを送りますか？`;

                  // 2. 「はい」「いいえ」のダイアログを表示
                  const hasConfirmed = window.confirm(confirmMessage);

                  // 3. 「はい」が押された場合だけ処理を実行
                  if (hasConfirmed) {
                    // 譲渡リクエスト時点で txt_transaction を pending で作成
                    // 承諾フローと同じ giver/receiver マッピング:
                    // - offering（譲ります）へのリクエスト: giver = リクエスト送信者 / receiver = ポスト主
                    // - seeking（譲ってください）へのリクエスト: giver = ポスト主 / receiver = リクエスト送信者
                    const isOffering = txtpost.give_type === "offering";
                    const giverId = isOffering ? userProfile.id : txtpost.user.id;
                    const receiverId = isOffering ? txtpost.user.id : userProfile.id;
                    const { data: txData, error: txError } = await supabase.from("txt_transaction").insert({
                      txt_post_id: txtpost.id,
                      giver_id: giverId,
                      receiver_id: receiverId,
                      status: "pending",
                    })
                    .select()
                    .single();
                    if (txError) {
                      console.error("取引レコード(pending)の作成に失敗しました:", txError);
                    }



                    const {data: insertedNotif, error} = await supabase.from("notification").insert({
                      receiver_id : txtpost.user.id,
                      sender_id : userProfile.id,
                      notification_type : txtpost.give_type === "offering" ? "request_for_offering" : "request_for_request",
                      txt_post_id : txtpost.id,
                      txt_transaction_id : txData?.id ?? null, 
                    }).select("id").single();

                  if (error) {
                    console.error("❌ Supabaseインサートエラー詳細:", error);
                    alert(`エラーが発生しました: ${error.message}`);
                  } 
                    

                    setHasRequested(true); // ボタンを「リクエスト済み」に切り替える
                    setPendingRequestId(insertedNotif?.id ?? null); // 送信直後から取り下げ可能に
                    alert("リクエストを送信しました！相手からの返信をお待ちください。");
                  }
                  }
                }

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
