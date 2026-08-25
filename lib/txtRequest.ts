// 教科書譲渡リクエスト RPC（send/accept/reject/withdraw_txt_request）が
// raise exception で返すメッセージを、ユーザー向けの日本語に変換する。
const MESSAGES: Record<string, string> = {
  "insufficient points": "ポイントが不足しています（この教科書の価格分のポイントが必要です）。",
  "post already matched": "マッチング済みの投稿は削除できません。",
  "textbook not found": "教科書が見つかりません。一覧から選び直してください。",
  "invalid give_type": "投稿種別が不正です。",
  "already requested": "すでにこの投稿にリクエスト済みです。",
  "cannot request own post": "自分の投稿にはリクエストできません。",
  "transaction not pending": "操作を実行できませんでした（すでに処理済み、または取り下げ済みです）。",
  "already handled": "すでにポスト主が対応済みのため取り下げできません。",
  "not authorized": "権限がありません。",
  "post not found": "投稿が見つかりません。",
  "notification not found": "通知が見つかりません。",
  "not a request notification": "操作を実行できませんでした。リクエストが取り下げ済みの可能性があります。",
  "transaction not found": "取引が見つかりません。",
  "transaction not matched": "この操作を実行できません（マッチング中の取引のみ対象です）。",
  "receiver insufficient points": "受取者のポイントが不足しているため完了できません。",
  "not authenticated": "ログインが必要です。再ログインしてください。",
};

export function txtRequestErrorMessage(message?: string | null): string {
  if (message) {
    for (const key of Object.keys(MESSAGES)) {
      if (message.includes(key)) return MESSAGES[key];
    }
  }
  return "処理に失敗しました。時間をおいて再度お試しください。";
}
