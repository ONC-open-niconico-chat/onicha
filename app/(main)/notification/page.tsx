"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase"; // パスはプロジェクトに合わせて調整してください
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/loginUser";



// 通知データの型定義
interface NotificationItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  notification_type: string;
  created_at: string;
  
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
  const router = useRouter();
  const { authUser, loading: authLoading } = useAuth();

  const fetchNotifications = useCallback(async () => {
    if (!authUser) return;
    try {
      setLoading(true);
      const currentUserId = authUser.id;

      const { data, error } = await supabase
        .from("notification")
        .select(`
              id,
              sender_id,
              receiver_id,
              notification_type,
              created_at,

              sender_profile:user!notification_sender_id_fkey (username),
              txt_post(
              id,
              book:textbook_id (
                  title
              )
              )
          `)
        .eq("receiver_id", currentUserId)
        .eq("is_read", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setNotifications(data as any || []);
    } catch (error) {
      console.error("通知の取得に失敗しました:", error);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setLoading(false);
      return;
    }
    fetchNotifications();
  }, [authUser, authLoading, fetchNotifications]);


  // 💡 コンポーネント内の、関数の内側（handleAction の下あたり）に追加
const handleAcceptAndNavigate = async (notificationId: string, senderId: string, senderName: string) => {
  // ① {相手の名前}で確認ダイアログを出す
  const isConfirmed = window.confirm(`${senderName} さんとのチャットを開始しますか？`);
  
  if (isConfirmed) {
    await fetchNotifications();

    try {
    // 🟢 追記：Supabaseの notification テーブルの is_read を true（既読）に更新！
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true }) // 💡 既読フラグをONにする
      .eq("id", notificationId); // 💡 この通知IDの行だけをピンポイントで指定

    if (error) throw error; // もしエラーが起きたら catch ブロックへ飛ばす

    // ② 既読更新が成功したら、チャット画面へ遷移！
    router.push(`/messages/${senderId}?first=true`);
    
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
    router.push(`/messages/${senderId}?first=true`);
  }
    router.push(`/messages/${senderId}?first=true`);

  }
};

const handleReject = async (notificationId: string) => {
  const isConfirmed = window.confirm("このリクエストを拒否しますか？");
  
  if (isConfirmed) {
    await fetchNotifications();
    
    try {
      // 🔴 追記：Supabaseの notification テーブルの is_read を true（既読）に更新！
      const { error } = await supabase
      .from("notification")
      .update({ is_read: true }) // 💡 既読フラグをONにする
      .eq("id", notificationId); // 💡 この通知IDの行だけをピンポイントで指定

    if (error) throw error;
  } catch (error) {
    console.error("通知の既読更新に失敗しました:", error);
  }
};
}

  //if (loading) return <div className="p-4">通知を読み込み中...</div>;

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

            return (
              <div key={notif.id} className="p-4 border rounded-xl shadow-sm bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {/* アイコン風の丸（アバター用） */}
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold shrink-0">
                    {senderName[0]}
                  </div>
                  
                  <div className="flex-1">
                    <p className="text-sm text-gray-800 leading-relaxed">
                      <span className="font-bold text-indigo-600">{senderName}</span> さんから、
                      教科書 <span className="font-bold">「{textbookTitle}」</span> に対して
                      {notif.notification_type === "request_for_offering" 
                        ? "「譲ってください」のリクエストが届きました！" 
                        : "「譲ります」のリクエストが届きました！"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {new Date(notif.created_at).toLocaleString("ja-JP")}
                    </p>
                  </div>

                {/* 右側：承諾・拒否ボタンエリア */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/*
                        {currentStatus === "accepted" ? (
                        <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">承諾済み ✓</span>
                        ) : currentStatus === "rejected" ? (
                        <span className="text-sm font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">拒否済み</span>
                        ) : */}
                        <>
                            {/* 🟢 承諾ボタン */}
                            <button
                            //onClick={() => handleAction(notif.id, "accepted")}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={() => handleAcceptAndNavigate(notif.id,notif.sender_id, senderName)}
                            >
                            承諾
                            </button>

                            {/* 🔴 拒否ボタン */}
                            <button
                            //onClick={() => handleAction(notif.id, "rejected")}
                            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-bold text-sm rounded-xl shadow-sm transition-all"
                            onClick={() => handleReject(notif.id)}
                            >
                              
                            拒否
                            </button>
                        </>
                        
                    </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}