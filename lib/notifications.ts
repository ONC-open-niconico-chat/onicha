import { supabase } from "@/lib/supabase";

// 通知の種類。DB の notification.notification_type に対応する。
export type NotificationType =
  | "request_for_offering" // 出品（譲ります）へのリクエスト
  | "request_accepted" // リクエストが承諾された（リクエスト元へ通知）
  | "request_rejected" // リクエストが拒否された（リクエスト元へ通知）
  | "message" // メッセージ受信
  | "follow"; // フォローされた

export interface CreateNotificationParams {
  receiverId: string; // 通知を受け取るユーザー
  senderId: string; // 通知のきっかけとなったユーザー
  type: NotificationType;
  txtPostId?: number | null;
  chatId?: number | null;
}

/**
 * notification テーブルに 1 件通知を追加する。
 * 自分自身への通知は作らない（送信者 = 受信者のケースをスキップ）。
 */
export async function createNotification({
  receiverId,
  senderId,
  type,
  txtPostId = null,
  chatId = null,
}: CreateNotificationParams): Promise<void> {
  if (!receiverId || receiverId === senderId) return;

  const { error } = await supabase.from("notification").insert([
    {
      receiver_id: receiverId,
      sender_id: senderId,
      notification_type: type,
      txt_post_id: txtPostId,
      chat_id: chatId,
    },
  ]);

  if (error) {
    // 通知作成の失敗は本処理を止めない（ログのみ）
    console.error("通知の作成に失敗しました:", error);
  }
}
