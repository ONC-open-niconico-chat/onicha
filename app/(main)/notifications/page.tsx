"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Bell, Check, Handshake, MessageCircle, UserPlus, X } from "lucide-react";

// 譲渡リクエストを承諾したときに投稿へ設定するステータス
const STATUS_MATCHED = "成立";

// DB の notification テーブル 1 行分
interface NotificationRow {
  id: number;
  receiver_id: string;
  sender_id: string;
  notification_type: string;
  txt_post_id: number | null;
  chat_id: number | null;
  is_read: boolean;
  created_at: string;
}

interface SenderProfile {
  id: string;
  username: string;
  icon_src?: string;
}

// 画面表示用に整形した通知
interface DisplayNotification extends NotificationRow {
  sender?: SenderProfile;
  bookTitle?: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [loading, setLoading] = useState(true);
  // 承諾／拒否の処理中の通知 ID（ボタンの二重押し防止）
  const [processingId, setProcessingId] = useState<number | null>(null);

  // 通知一覧をまとめて取得して整形する
  const fetchNotifications = useCallback(async (currentUserId: string) => {
    // 1. 自分宛ての通知を新しい順に取得
    const { data: rows, error } = await supabase
      .from("notification")
      .select("*")
      .eq("receiver_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("通知の取得に失敗しました:", error);
      return;
    }

    const notificationRows = (rows || []) as NotificationRow[];
    if (notificationRows.length === 0) {
      setNotifications([]);
      return;
    }

    // 2. 関連する送信者プロフィールと教科書名をまとめて取得（messages 画面と同じ手動 JOIN 方式）
    const senderIds = [...new Set(notificationRows.map((n) => n.sender_id).filter(Boolean))];
    const postIds = [...new Set(notificationRows.map((n) => n.txt_post_id).filter((id): id is number => id != null))];

    const [{ data: users }, { data: posts }] = await Promise.all([
      senderIds.length
        ? supabase.from("user").select("id, username, icon_src").in("id", senderIds)
        : Promise.resolve({ data: [] as SenderProfile[] }),
      postIds.length
        ? supabase.from("txt_post").select(`id, textbook:"textbook" ( title )`).in("id", postIds)
        : Promise.resolve({ data: [] as { id: number; textbook: { title: string } | { title: string }[] }[] }),
    ]);

    const userMap = new Map<string, SenderProfile>((users || []).map((u) => [u.id, u]));
    const postTitleMap = new Map<number, string>(
      (posts || []).map((p) => {
        const tb = Array.isArray(p.textbook) ? p.textbook[0] : p.textbook;
        return [p.id, tb?.title ?? ""];
      })
    );

    // 3. 表示用に結合
    const merged: DisplayNotification[] = notificationRows.map((n) => ({
      ...n,
      sender: userMap.get(n.sender_id),
      bookTitle: n.txt_post_id != null ? postTitleMap.get(n.txt_post_id) : undefined,
    }));

    setNotifications(merged);
  }, []);

  // ログインユーザーの取得＋初回ロード
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }
      const currentUserId = session.user.id;
      setMyId(currentUserId);

      await fetchNotifications(currentUserId);
      setLoading(false);
    };
    init();
  }, [router, fetchNotifications]);

  // リアルタイム購読：自分宛ての新しい通知が届いたら一覧を更新
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel("realtime-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification",
        },
        (payload) => {
          // サーバー側フィルタは使わず、自分宛てかどうかを JS 側で判定（chat 画面と同じ方式）
          if ((payload.new as NotificationRow)?.receiver_id === myId) {
            fetchNotifications(myId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, fetchNotifications]);

  // 1 件を既読にする
  const markAsRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notification").update({ is_read: true }).eq("id", id);
  };

  // すべて既読にする
  const markAllAsRead = async () => {
    if (!myId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("receiver_id", myId)
      .eq("is_read", false);
  };

  // 譲渡リクエストを承諾する：投稿を成立にし、相手に承諾通知を送り、この通知を既読化
  const handleAccept = async (n: DisplayNotification) => {
    if (!myId || processingId != null) return;
    setProcessingId(n.id);
    try {
      if (n.txt_post_id != null) {
        const { error } = await supabase
          .from("txt_post")
          .update({ status: STATUS_MATCHED })
          .eq("id", n.txt_post_id);
        if (error) throw error;
      }
      await createNotification({
        receiverId: n.sender_id,
        senderId: myId,
        type: "request_accepted",
        txtPostId: n.txt_post_id,
      });
      await markAsRead(n.id);
    } catch (err) {
      console.error("承諾の処理に失敗しました:", err);
      alert("承諾の処理に失敗しました。もう一度お試しください。");
    } finally {
      setProcessingId(null);
    }
  };

  // 譲渡リクエストを拒否する：相手に拒否通知を送り、この通知を既読化（投稿は募集中のまま）
  const handleReject = async (n: DisplayNotification) => {
    if (!myId || processingId != null) return;
    setProcessingId(n.id);
    try {
      await createNotification({
        receiverId: n.sender_id,
        senderId: myId,
        type: "request_rejected",
        txtPostId: n.txt_post_id,
      });
      await markAsRead(n.id);
    } catch (err) {
      console.error("拒否の処理に失敗しました:", err);
      alert("拒否の処理に失敗しました。もう一度お試しください。");
    } finally {
      setProcessingId(null);
    }
  };

  // 通知をクリックしたときの遷移先と既読処理
  const handleClick = (n: DisplayNotification) => {
    // 譲渡リクエストは承諾／拒否ボタンで対応するため、本体クリックでは既読にしない
    if (n.notification_type === "request_for_offering") {
      router.push("/txtpost");
      return;
    }

    if (!n.is_read) markAsRead(n.id);

    switch (n.notification_type) {
      case "message":
        router.push(`/messages/${n.sender_id}`);
        break;
      case "request_accepted":
      case "request_rejected":
        router.push("/txtpost");
        break;
      case "follow":
        router.push(`/profile/${n.sender_id}`);
        break;
      default:
        break;
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white text-gray-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="w-full bg-white min-h-screen text-black">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">通知</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded-full transition"
          >
            すべて既読にする
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>まだ通知はありません。</p>
          <p className="text-sm mt-1">教科書のリクエストやメッセージが届くとここに表示されます。</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onClick={() => handleClick(n)}
              onAccept={() => handleAccept(n)}
              onReject={() => handleReject(n)}
              processing={processingId === n.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 通知の種類ごとの見た目（アイコン・文言）を組み立てる
function describe(n: DisplayNotification): { icon: React.ReactNode; text: React.ReactNode } {
  const name = n.sender?.username || "ユーザー";
  switch (n.notification_type) {
    case "request_for_offering":
      return {
        icon: <Handshake className="w-5 h-5 text-green-600" />,
        text: (
          <>
            <span className="font-bold">{name}</span> さんが
            {n.bookTitle ? `「${n.bookTitle}」` : "あなたの出品"}にリクエストしました
          </>
        ),
      };
    case "request_accepted":
      return {
        icon: <Check className="w-5 h-5 text-green-600" />,
        text: (
          <>
            <span className="font-bold">{name}</span> さんがあなたの
            {n.bookTitle ? `「${n.bookTitle}」` : ""}リクエストを承諾しました🎉
          </>
        ),
      };
    case "request_rejected":
      return {
        icon: <X className="w-5 h-5 text-gray-500" />,
        text: (
          <>
            <span className="font-bold">{name}</span> さんが
            {n.bookTitle ? `「${n.bookTitle}」` : ""}リクエストを見送りました
          </>
        ),
      };
    case "message":
      return {
        icon: <MessageCircle className="w-5 h-5 text-blue-600" />,
        text: (
          <>
            <span className="font-bold">{name}</span> さんからメッセージが届きました
          </>
        ),
      };
    case "follow":
      return {
        icon: <UserPlus className="w-5 h-5 text-purple-600" />,
        text: (
          <>
            <span className="font-bold">{name}</span> さんがあなたをフォローしました
          </>
        ),
      };
    default:
      return {
        icon: <Bell className="w-5 h-5 text-gray-500" />,
        text: (
          <>
            <span className="font-bold">{name}</span> さんから新しい通知があります
          </>
        ),
      };
  }
}

function NotificationItem({
  notification,
  onClick,
  onAccept,
  onReject,
  processing,
}: {
  notification: DisplayNotification;
  onClick: () => void;
  onAccept: () => void;
  onReject: () => void;
  processing: boolean;
}) {
  const { icon, text } = describe(notification);
  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ja });
    } catch {
      return "";
    }
  })();

  // 譲渡リクエストの未対応のものだけ、承諾／拒否ボタンを出す
  const isRequest = notification.notification_type === "request_for_offering";
  const showActions = isRequest && !notification.is_read;

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-4 px-6 py-4 cursor-pointer transition hover:bg-gray-50 ${
        notification.is_read ? "bg-white" : "bg-blue-50/60"
      }`}
    >
      {/* 送信者アイコン＋種類アイコン */}
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center border border-gray-100">
          {notification.sender?.icon_src ? (
            <img
              src={notification.sender.icon_src}
              alt={notification.sender.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-lg">👤</span>
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">{icon}</div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] leading-snug text-black">{text}</p>
        <span className="text-xs text-gray-400">{relativeTime}</span>

        {/* 承諾／拒否ボタン（未対応のリクエストのみ） */}
        {showActions && (
          <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onAccept}
              disabled={processing}
              className="flex items-center gap-1 bg-green-600 text-white text-sm font-bold px-4 py-1.5 rounded-full hover:bg-green-700 transition disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              承諾
            </button>
            <button
              onClick={onReject}
              disabled={processing}
              className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm font-bold px-4 py-1.5 rounded-full hover:bg-gray-200 transition disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              拒否
            </button>
          </div>
        )}

        {/* 対応済みのリクエストの表示 */}
        {isRequest && notification.is_read && (
          <p className="text-xs text-gray-400 mt-2 font-bold">対応済み</p>
        )}
      </div>

      {!notification.is_read && <span className="mt-2 w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />}
    </div>
  );
}
