"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // パスはプロジェクトに合わせて調整してください
import { useRouter } from "next/navigation";
import { createNotification } from "@/lib/notifications";



// 通知データの型定義
interface NotificationItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  notification_type: string;
  created_at: string;
  is_read: boolean;

  // ① リクエスト送信者のプロフィール
  sender_profile: {
    username: string;
  } | null;

  // ② 紐づく教科書譲渡ポスト
  txt_post: {
    id: string;
    // ③ さらにその中に紐づく教科書情報
    book: {
      title: string;
    } | null;
  } | null;
}

export default function NotificationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
                sender_profile:user!notification_sender_id_fkey (username),
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
  txtPostId?: string | number | null
) => {
  // ① {相手の名前}で確認ダイアログを出す
  const isConfirmed = window.confirm(`${senderName} さんとのチャットを開始しますか？`);

  if (!isConfirmed) return;

  try {
    // 🟢 Supabaseの notification テーブルの is_read を true（既読）に更新！
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true }) // 💡 既読フラグをONにする
      .eq("id", notificationId); // 💡 この通知IDの行だけをピンポイントで指定

    if (error) throw error; // もしエラーが起きたら catch ブロックへ飛ばす
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
  }

  // ② リクエスト送信者へ「承諾されました」の通知を作成
  if (currentUserId) {
    await createNotification({
      receiverId: senderId, // リクエストを送ってきた人
      senderId: currentUserId, // 承諾した自分
      type: "request_accepted",
      txtPostId: txtPostId != null ? Number(txtPostId) : null,
    });
  }

  await fetchNotifications();

  // ③ チャット画面へ遷移！
  router.push(`/messages/${senderId}?first=true`);
};

const handleReject = async (
  notificationId: string,
  senderId: string,
  txtPostId?: string | number | null
) => {
  const isConfirmed = window.confirm("このリクエストを拒否しますか？");

  if (!isConfirmed) return;

  try {
    // 🔴 Supabaseの notification テーブルの is_read を true（既読）に更新！
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true }) // 💡 既読フラグをONにする
      .eq("id", notificationId); // 💡 この通知IDの行だけをピンポイントで指定

    if (error) throw error;
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
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

// 承諾通知から、相手とのメッセージ画面へ移動する
const handleGoToMessage = async (notificationId: string, partnerId: string) => {
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
  router.push(`/messages/${partnerId}`);
};

  if (loading) return <div className="p-4">通知を読み込み中...</div>;

  return (
    <div className="w-full ml-4 p-4">
      <h1 className="text-2xl font-bold mb-6">あなたへの通知</h1>

      {notifications.length === 0 ? (
        <p className="text-gray-500">新しい通知はありません。</p>
      ) : (
        <div className="space-y-4">
          {notifications.map((notif:any) => {
            const senderName = notif.sender_profile?.username || "名無しユーザー";
            const textbookTitle = notif.txt_post?.book?.title || "削除された教科書";

            // 承諾・拒否の結果通知（リクエスト送信者が受け取る通知）かどうか
            const isResultNotification =
              notif.notification_type === "request_accepted" ||
              notif.notification_type === "request_rejected";

            return (
              <div
                key={notif.id}
                onClick={() => handleMarkAsRead(notif.id, notif.is_read)}
                className={`p-4 border rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  notif.is_read ? "bg-white" : "bg-indigo-50 border-indigo-200 cursor-pointer"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* アイコン風の丸（アバター用） */}
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold shrink-0">
                    {senderName[0]}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm text-gray-800 leading-relaxed">
                      {notif.notification_type === "request_rejected" ? (
                        <>
                          <span className="font-bold text-indigo-600">{senderName}</span> さんは
                          教科書 <span className="font-bold">「{textbookTitle}」</span> の
                          譲渡が<span className="font-bold text-gray-500">難しいようです。</span>
                          他のポストを見てみましょう！
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-indigo-600">{senderName}</span> さんが、
                          教科書 <span className="font-bold">「{textbookTitle}」</span> の
                          {notif.notification_type === "request_accepted" ? (
                            <>あなたのリクエストを<span className="font-bold text-green-600">承諾しました！</span> 譲渡方法を話し合いましょう！</>
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

                {/* 右側：承諾・拒否ボタンエリア（リクエストを受け取った側だけ表示） */}
                {!isResultNotification && (
                    <div className="flex items-center gap-2 shrink-0">
                        <>
                            {/* 🟢 承諾ボタン */}
                            <button
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={(e) => { e.stopPropagation(); handleAcceptAndNavigate(notif.id, notif.sender_id, senderName, notif.txt_post?.id); }}
                            >
                            承諾
                            </button>

                            {/* 🔴 拒否ボタン */}
                            <button
                            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={(e) => { e.stopPropagation(); handleReject(notif.id, notif.sender_id, notif.txt_post?.id); }}
                            >
                            拒否
                            </button>
                        </>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}