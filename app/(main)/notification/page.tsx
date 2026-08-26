"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // パスはプロジェクトに合わせて調整してください
import { useRouter } from "next/navigation";
import { txtRequestErrorMessage } from "@/lib/txtRequest";
import { CheckCheck, Trash2 } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";



// 通知データの型定義
interface NotificationItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  notification_type: string;
  created_at: string;
  is_read: boolean;
  // 承諾/拒否の結果。リクエストを受け取った通知に対して保存する。
  request_status: "accepted" | "rejected" | null;

  // ① リクエスト送信者のプロフィール
  sender_profile: {
    username: string;
    icon_src?: string | null;
    is_official?: boolean;
  } | null;

  // ② 紐づく教科書譲渡ポスト
  txt_post: {
    id: string;
    // ③ さらにその中に紐づく教科書情報
    book: {
      title: string;
    } | null;
  } | null;
  txt_transaction_id: string | number | null; // 紐づく取引ID（リクエスト通知の場合）
}

export default function NotificationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // 承諾・拒否ボタンを押した結果（通知IDごと）。押したらボタンをラベル表示に切り替える。
  const [actionStatus, setActionStatus] = useState<Record<string, "accepted" | "rejected">>({});
  // 完了通知に紐づく取引ID -> 付与/消費ポイント
  const [txPoints, setTxPoints] = useState<Record<string, number>>({});
  const router = useRouter();


    const fetchNotifications = async () => {
      try {
        setLoading(true);

        // 1. 現在ログインしているユーザーのセッションを取得
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const currentUserId = session.user.id;
        setCurrentUserId(currentUserId);

        // 2. 自分が「受け取り手（receiver_id）」になっている通知を、新しい順（desc）で取得
        const { data, error } = await supabase
          .from("notification")
          .select(`
                id,
                sender_id,
                receiver_id,
                notification_type,
                created_at,
                is_read,
                request_status,
                txt_transaction_id,
                sender_profile:user!notification_sender_id_fkey (username, icon_src, is_official),
                txt_post(
                id,
                book:textbook_id (
                    title
                )
                )
            `)
          .eq("receiver_id", currentUserId)
          .order("created_at", { ascending: false });

          

        if (error) throw error;

        const list = (data as any) || [];
        setNotifications(list);

        // 完了通知に紐づく取引の points をまとめて取得
        const txIds = list
          .filter(
            (n: any) =>
              (n.notification_type === "transfer_completed_giver" ||
                n.notification_type === "transfer_completed_receiver") &&
              n.txt_transaction_id != null
          )
          .map((n: any) => n.txt_transaction_id);
        if (txIds.length > 0) {
          const { data: txs } = await supabase
            .from("txt_transaction")
            .select("id, points")
            .in("id", txIds);
          const map: Record<string, number> = {};
          (txs ?? []).forEach((t: any) => {
            map[String(t.id)] = t.points ?? 0;
          });
          setTxPoints(map);
        }
      } catch (error) {
        console.error("通知の取得に失敗しました:", error);
      } finally {
        setLoading(false);
      }
    };
  
  
    useEffect(() => {
      fetchNotifications();
    }, []);

  // 通知をクリックしたときに既読にする
  const handleMarkAsRead = async (notificationId: string, isRead: boolean) => {
    if (isRead) return; // すでに既読なら何もしない

    // 画面上ですぐ既読表示に切り替える
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );

    const { error } = await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      console.error("通知の既読更新に失敗しました:", error);
    }
  };


  // 承諾：RPC でアトミックに実行（取引の matched 化・他リクエスト締切・各種通知まで）
const handleAcceptAndNavigate = async (
  notificationId: string,
  senderName: string
) => {
  if (!window.confirm(`${senderName} さんとの譲渡を合意しますか？`)) return;

  const { error } = await supabase.rpc("accept_txt_request", {
    p_notification_id: notificationId,
  });

  if (error) {
    alert(txtRequestErrorMessage(error.message));
    await fetchNotifications();
    return;
  }

  setActionStatus((prev) => ({ ...prev, [notificationId]: "accepted" }));
  await fetchNotifications();
};

// 見送り：RPC でアトミックに実行（取引の cancelled 化・見送り通知まで）
const handleReject = async (notificationId: string) => {
  if (!window.confirm("このリクエストを見送りますか？")) return;

  const { error } = await supabase.rpc("reject_txt_request", {
    p_notification_id: notificationId,
  });

  if (error) {
    console.error("見送りに失敗しました:", error);
    alert(txtRequestErrorMessage(error.message));
    await fetchNotifications();
    return;
  }

  setActionStatus((prev) => ({ ...prev, [notificationId]: "rejected" }));
  await fetchNotifications();
};

// 相手とのメッセージ画面へ移動する（first: チャットを新規開始する場合 true）
const handleGoToMessage = async (
  notificationId: string,
  partnerId: string,
  first = false
) => {
  try {
    // この通知を既読にする
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) throw error;
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
  }

  // 相手とのメッセージ画面へ遷移
  router.push(`/messages/${partnerId}${first ? "?first=true" : ""}`);
};

// リクエスト通知（承諾/見送りの対応が必要なもの）かどうか
const isRequestNotification = (notif: NotificationItem) =>
  notif.notification_type === "request_for_offering" ||
  notif.notification_type === "request_for_request";

// まだ承諾も見送りもしていないリクエスト通知
const pendingRequests = notifications.filter(
  (n) => isRequestNotification(n) && !(actionStatus[n.id] ?? n.request_status)
);

const unreadCount = notifications.filter((n) => !n.is_read).length;

// すべての通知を既読にする
const handleMarkAllAsRead = async () => {
  if (unreadCount === 0) return;

  const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);

  // 画面上ですぐ既読表示に切り替える
  setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true })
    .in("id", unreadIds);

  if (error) {
    console.error("通知の一括既読に失敗しました:", error);
    alert("既読にできませんでした。時間をおいて試してください。");
    await fetchNotifications();
  }
};

// すべての通知を削除する（未対応のリクエストが残っている場合は削除させない）
const handleDeleteAll = async () => {
  if (notifications.length === 0) return;

  if (pendingRequests.length > 0) {
    alert(
      `未対応の項目があります（${pendingRequests.length}件）。`
    );
    return;
  }

  if (!window.confirm(`通知をすべて削除しますか？（${notifications.length}件）`)) return;

  const ids = notifications.map((n) => n.id);

  const { error } = await supabase.from("notification").delete().in("id", ids);

  if (error) {
    console.error("通知の一括削除に失敗しました:", error);
    alert("削除に失敗しました。時間をおいて試してください。");
    return;
  }

  setNotifications([]);
};

  if (loading) return <div className="p-4">通知を読み込み中...</div>;

  return (
    <div className="w-full ml-4 p-4">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">あなたへの通知</h1>

        {/* ─── 右上：一括操作ボタン ─── */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="すべての通知を既読にする"
          >
            <CheckCheck className="w-4 h-4" />
            全て既読
          </button>

          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="すべての通知を削除する"
          >
            <Trash2 className="w-4 h-4" />
            全て削除
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <p className="text-gray-500">新しい通知はありません。</p>
      ) : (
        <div className="space-y-4">
          {notifications.map((notif:any) => {
            const senderName = notif.sender_profile?.username || "名無しユーザー";
            const senderIcon = notif.sender_profile?.icon_src || "/onicha_icon/onicha_icon.JPG";
            // 送信者名（運営なら認証マーク付き）
            const senderNameEl = (
              <span className="font-bold text-indigo-600 inline-flex items-center gap-0.5">
                {senderName}
                {notif.sender_profile?.is_official && <VerifiedBadge />}
              </span>
            );
            const textbookTitle = notif.txt_post?.book?.title || "削除された教科書";
            // 完了通知の付与/消費ポイント
            const completedPoints =
              notif.txt_transaction_id != null
                ? txPoints[String(notif.txt_transaction_id)] ?? 0
                : 0;

            // このリクエストに対して既に承諾/拒否したか（DBの値を優先、押した直後はローカル状態）
            const requestStatus = actionStatus[notif.id] ?? notif.request_status;

            return (
              <div
                key={notif.id}
                onClick={() => handleMarkAsRead(notif.id, notif.is_read)}
                className={`p-4 border rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  notif.is_read ? "bg-white" : "bg-indigo-50 border-indigo-200 cursor-pointer"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 送信者アイコン（無ければ public のオニチャアイコンを表示） */}
                  <img
                    src={senderIcon}
                    alt={senderName}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />

                  <div className="flex-1">
                    <p className="text-sm text-gray-800 leading-relaxed">
                      {notif.notification_type === "follow" ? (
                        <>
                          {senderNameEl} さんにフォローされました
                        </>
                      ) : notif.notification_type === "message" ? (
                        <>
                          {senderNameEl} さんからメッセージが来ました
                        </>
                      ) : notif.notification_type === "welcome" ? (
                        <>
                          新規登録ありがとうございます！オニチャへようこそ🎉
                        </>
                      ) : notif.notification_type === "txt_post_reply" ? (
                        <>
                          {senderNameEl} さんがあなたの教科書
                          <span className="font-bold">「{textbookTitle}」</span> の投稿にコメントしました
                        </>
                      ) : notif.notification_type === "request_withdrawn" ? (
                        <>
                          {senderNameEl} さんが
                          教科書 <span className="font-bold">「{textbookTitle}」</span> の
                          <span className="font-bold text-gray-500">リクエストを取り下げました。</span>
                        </>
                      ) : notif.notification_type === "transfer_completed_giver" ? (
                        <>
                          {senderNameEl} さんとの
                          <span className="font-bold">「{textbookTitle}」</span> の譲渡が完了しました！
                          ポイントが <span className="font-bold text-green-600">{completedPoints} pt</span> 付与されました。
                        </>
                      ) : notif.notification_type === "transfer_completed_receiver" ? (
                        <>
                          {senderNameEl} さんとの
                          <span className="font-bold">「{textbookTitle}」</span> の譲渡が完了しました！
                          ポイントが <span className="font-bold text-red-600">{completedPoints} pt</span> 消費されました。
                        </>
                      ) : notif.notification_type === "request_rejected" ? (
                        <>
                          {senderNameEl} さんは
                          教科書 <span className="font-bold">「{textbookTitle}」</span> の
                          譲渡が<span className="font-bold text-gray-500">難しいようです。</span>
                          他のポストを見てみましょう！
                        </>
                      ) : notif.notification_type === "transfer_cancelled" ? (
                        <>
                          {senderNameEl} さんとの
                          <span className="font-bold">「{textbookTitle}」</span> の取引が
                          <span className="font-bold text-gray-500">取り消されました。</span>
                          投稿は募集中に戻りました。
                        </>
                      ) : (
                        <>
                          {senderNameEl} さんが、
                          教科書 <span className="font-bold">「{textbookTitle}」</span> の
                          {notif.notification_type === "request_accepted" ? (
                            <>あなたのリクエストを<span className="font-bold text-green-600">承諾しました！</span> 運営からの案内をお待ちください。</>
                          ) : notif.notification_type === "request_for_offering" ? (
                            <>リクエスト「譲ってください」を送りました！</>
                          ) : (
                            <>リクエスト「譲ります」を送りました！</>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {new Date(notif.created_at).toLocaleString("ja-JP")}
                    </p>
                  </div>

                {/* 右側：承諾・拒否ボタンエリア（教科書譲渡リクエストのときだけ表示） */}
                {isRequestNotification(notif) && (
                    <div className="flex items-center gap-2 shrink-0">
                        {requestStatus === "accepted" ? (
                          <>
                            <span className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 font-bold text-sm rounded-xl">
                            承諾しました
                            </span>
                          </>
                        ) : requestStatus === "rejected" ? (
                            <span className="px-4 py-2 bg-gray-50 text-gray-500 border border-gray-200 font-bold text-sm rounded-xl">
                            見送りました
                            </span>
                        ) : (
                        <>
                            {/* 🟢 承諾ボタン */}
                            <button
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={(e) => { e.stopPropagation(); handleAcceptAndNavigate(notif.id, senderName); }}
                            >
                            承諾
                            </button>

                            {/* 🔴 拒否ボタン */}
                            <button
                            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={(e) => { e.stopPropagation(); handleReject(notif.id); }}
                            >
                            見送る
                            </button>
                        </>
                        )}
                    </div>
                )}


                {/* コメント通知：該当の教科書譲渡ポストへ移動するボタン */}
                {notif.notification_type === "txt_post_reply" && notif.txt_post?.id && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                        onClick={(e) => { e.stopPropagation(); router.push(`/txtpost/${notif.txt_post!.id}`); }}
                        >
                        投稿を見る
                        </button>
                    </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}