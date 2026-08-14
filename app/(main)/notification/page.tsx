"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // パスはプロジェクトに合わせて調整してください
import { useRouter } from "next/navigation";
import { createNotification } from "@/lib/notifications";
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

        setNotifications((data as any) || []);
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


  // 💡 コンポーネント内の、関数の内側（handleAction の下あたり）に追加
const handleAcceptAndNavigate = async (
  notificationId: string,
  senderId: string,
  senderName: string,
  txtPostId?: string | number | null,
  notificationType?: string,
  txt_transactionId?: string | number | null
) => {
  // ① {相手の名前}で確認ダイアログを出す
  const isConfirmed = window.confirm(`${senderName} さんとの譲渡を合意しますか？`);

  if (!isConfirmed) return;

  // 該当の取引が pending か確認。pending でなければ操作不可。
  if (txt_transactionId != null) {
    const { data: pendingTx } = await supabase
      .from("txt_transaction")
      .select("id")
      .eq("id", Number(txt_transactionId))
      .eq("status", "pending")
      .or(`giver_id.eq.${senderId},receiver_id.eq.${senderId}`)
      .limit(1);
    if (!pendingTx || pendingTx.length === 0) {
      alert("操作を実行できませんでした");
      return;
    }
  }

  // ボタンを「承諾しました」ラベルに切り替える
  setActionStatus((prev) => ({ ...prev, [notificationId]: "accepted" }));

  try {
    // 🟢 Supabaseの notification テーブルの is_read を true（既読）に更新！
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true, request_status: "accepted" }) // 既読 + 承諾を保存
      .eq("id", notificationId); // 💡 この通知IDの行だけをピンポイントで指定

    if (error) throw error; // もしエラーが起きたら catch ブロックへ飛ばす
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
  }

  // ② 該当の教科書譲渡ポストを「マッチング済み」に更新
  if (txtPostId != null) {
    const { error: postError } = await supabase
      .from("txt_post")
      .update({ status: "マッチング済み" })
      .eq("id", Number(txtPostId));

    if (postError) {
      console.error("ポストのステータス更新に失敗しました:", postError);
    }
  }

  // ②-2 txt_transaction を matched に更新
  // - request_for_offering（出品へのリクエスト）: giver = 通知の sender / receiver = 通知の receiver（＝自分）
  // - request_for_request（募集へのリクエスト）  : giver = 通知の receiver（＝自分）/ receiver = 通知の sender
  if (currentUserId && txtPostId != null && txt_transactionId != null) {
    // 該当の pending 取引を id 指定で matched に更新。
    // pending でなければ 0 件更新となり、新規作成もしない（取り下げ済みの復活を防ぐ）。
    const { data: updatedTx, error: txUpdateError } = await supabase
      .from("txt_transaction")
      .update({ status: "matched" })
      .eq("id", Number(txt_transactionId))
      .eq("status", "pending")
      .select("id");

    if (txUpdateError) {
      console.error("取引レコードの更新に失敗しました:", txUpdateError);
    } else if (!updatedTx || updatedTx.length === 0) {
      // 冒頭ガードを通過していれば基本的に来ないが、保険として中断
      alert("操作を実行できませんでした");
      await fetchNotifications();
      return;
    }

    // 同じポストの他の pending 取引はまとめて cancelled に
    const { error: cancelError } = await supabase
      .from("txt_transaction")
      .update({ status: "cancelled" })
      .eq("txt_post_id", Number(txtPostId))
      .eq("status", "pending");
    if (cancelError) {
      console.error("他の取引のキャンセルに失敗しました:", cancelError);
    }
  }

  // ③ リクエスト送信者へ「承諾されました」の通知を作成
  if (currentUserId) {
    await createNotification({
      receiverId: senderId, // リクエストを送ってきた人
      senderId: currentUserId, // 承諾した自分
      type: "request_accepted",
      txtPostId: txtPostId != null ? Number(txtPostId) : null,
    });
  }

  // ④ 同じポストへの他の未処理リクエストを自動で締め切り、各送信者へ通知する
  if (currentUserId && txtPostId != null) {
    // 自分宛の、同じポストに対する未処理（request_status が未設定）のリクエスト通知を取得
    const { data: otherRequests, error: othersError } = await supabase
      .from("notification")
      .select("id, sender_id")
      .eq("receiver_id", currentUserId)
      .eq("txt_post_id", Number(txtPostId))
      .in("notification_type", ["request_for_offering", "request_for_request"])
      .is("request_status", null)
      .neq("id", notificationId);

    if (othersError) {
      console.error("他リクエストの取得に失敗しました:", othersError);
    } else if (otherRequests && otherRequests.length > 0) {
      // 締め切る通知をまとめて既読 + 見送り扱いに更新
      const { error: closeError } = await supabase
        .from("notification")
        .update({ is_read: true, request_status: "rejected" })
        .in(
          "id",
          otherRequests.map((r) => r.id)
        );

      if (closeError) {
        console.error("他リクエストの締め切りに失敗しました:", closeError);
      }

      // 各送信者へ「見送り（他の方に決定）」の通知を作成
      for (const req of otherRequests) {
        await createNotification({
          receiverId: req.sender_id,
          senderId: currentUserId,
          type: "request_rejected",
          txtPostId: Number(txtPostId),
        });
      }
    }
  }

  await fetchNotifications();
  // 遷移はせず、「承諾しました」ラベル＋「メッセージへ」ボタンを表示する
};

const handleReject = async (
  notificationId: string,
  senderId: string,
  txtPostId?: string | number | null,
  txt_transactionId?: string | number | null
) => {
  const isConfirmed = window.confirm("このリクエストを見送りますか？");

  if (!isConfirmed) return;

  // 該当の取引が pending か確認。pending でなければ操作不可。
  if (txt_transactionId != null) {
    const { data: pendingTx } = await supabase
      .from("txt_transaction")
      .select("id")
      .eq("id", Number(txt_transactionId))
      .eq("status", "pending")
      .or(`giver_id.eq.${senderId},receiver_id.eq.${senderId}`)
      .limit(1);
    if (!pendingTx || pendingTx.length === 0) {
      alert("操作を実行できませんでした");
      return;
    }
  }

  // ボタンを「見送りました」ラベルに切り替える
  setActionStatus((prev) => ({ ...prev, [notificationId]: "rejected" }));

  try {
    // 🔴 Supabaseの notification テーブルの is_read を true（既読）に更新！
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true, request_status: "rejected" }) // 既読 + 見送りを保存
      .eq("id", notificationId); // 💡 この通知IDの行だけをピンポイントで指定

    if (error) throw error;
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
  }

  // 見送ったリクエストの pending 取引を cancelled に更新
  if (txtPostId != null) {
    const { error: cancelError } = await supabase
      .from("txt_transaction")
      .update({ status: "cancelled" })
      .eq("txt_post_id", Number(txtPostId))
      .eq("status", "pending")
      .or(`giver_id.eq.${senderId},receiver_id.eq.${senderId}`);
    if (cancelError) {
      console.error("取引のキャンセルに失敗しました:", cancelError);
    }
  }

  // リクエスト送信者へ「拒否されました」の通知を作成
  if (currentUserId) {
    await createNotification({
      receiverId: senderId, // リクエストを送ってきた人
      senderId: currentUserId, // 拒否した自分
      type: "request_rejected",
      txtPostId: txtPostId != null ? Number(txtPostId) : null,
    });
  }

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
                      ) : notif.notification_type === "request_rejected" ? (
                        <>
                          {senderNameEl} さんは
                          教科書 <span className="font-bold">「{textbookTitle}」</span> の
                          譲渡が<span className="font-bold text-gray-500">難しいようです。</span>
                          他のポストを見てみましょう！
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
                            {/* 相手とのメッセージ画面へ */}
                            <button
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={(e) => { e.stopPropagation(); handleGoToMessage(notif.id, notif.sender_id, true); }}
                            >
                            メッセージへ
                            </button>
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
                            onClick={(e) => { e.stopPropagation(); handleAcceptAndNavigate(notif.id, notif.sender_id, senderName, notif.txt_post?.id, notif.notification_type,notif.txt_transaction_id); }}
                            >
                            承諾
                            </button>

                            {/* 🔴 拒否ボタン */}
                            <button
                            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={(e) => { e.stopPropagation(); handleReject(notif.id, notif.sender_id, notif.txt_post?.id, notif.txt_transaction_id); }}
                            >
                            見送る
                            </button>
                        </>
                        )}
                    </div>
                )}

                {/* 承諾通知：相手とのメッセージ画面へ移動するボタン */}
                {notif.notification_type === "request_accepted" && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                        onClick={(e) => { e.stopPropagation(); handleGoToMessage(notif.id, notif.sender_id); }}
                        >
                        メッセージへ
                        </button>
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