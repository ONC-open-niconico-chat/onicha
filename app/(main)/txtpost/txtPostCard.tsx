import  Link  from "next/link";
import type { Post } from "@/app/(main)/txtpost/page";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/loginUser";


interface PostCardProps {
  txtpost: Post;
  
}

export function PostCard({ txtpost }: PostCardProps) {
  const { userProfile, loading } = useAuth();

  // マッチングが成立して譲渡済みになったポスト
  const isMatched = txtpost.status === "譲渡済み";

  return (
    <article
      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
        isMatched ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-3">
        <Link href={`/profile/${txtpost.user.id}`}>
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
              className="font-bold hover:underline"
            >
              {txtpost.user.username}
            </Link>
            {/*<span className="text-gray-600">{txtpost.user.username}</span>*/}
            <span className="text-gray-600">·</span>
            <span className="text-gray-600">{txtpost.created_at}</span>
          </div>

          <p className="mb-3">{txtpost.description}</p>

          <div
            className={`border rounded-2xl p-4 mb-3 ${
              txtpost.give_type === "offering"
                ? "bg-blue-50 border-blue-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  txtpost.give_type === "offering"
                    ? "bg-blue-600 text-white"
                    : "bg-green-600 text-white"
                }`}
              >
                {txtpost.give_type === "offering" ? "譲ります" : "譲ってください"}
              </span>
              {isMatched && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-700 text-white">
                  ✓ 譲渡済み
                </span>
              )}
            </div>

            <h3 className="font-bold text-lg mb-1">{txtpost.book.title}</h3>
            <div className="flex gap-4 text-sm text-gray-700">
              <span>{txtpost.condition?.name || ""}</span>
            </div>


            <div className="flex justify-start pt-2 border-t border-dashed border-gray-200">
              {isMatched ? (
                <span className="text-sm font-bold text-gray-500">この取引は成立しました</span>
              ) : (
              <button
                onClick={async(e) => {
                  e.stopPropagation(); // カード全体のクリックイベントと衝突するのを防ぐ
                  // 1. ボタンの種類によってメッセージを変える
                  const actionText = txtpost.give_type === "offering" ? "「譲ってください」" : "「譲ります」";
                  const confirmMessage = `${txtpost.user.username} さんに${actionText}のリクエストを送りますか？`;

                  // 2. 「はい」「いいえ」のダイアログを表示
                  const hasConfirmed = window.confirm(confirmMessage);

                  // 3. 「はい」が押された場合だけ処理を実行
                  if (hasConfirmed) {
                    const {data,error} = await supabase.from("notification").insert({
                      receiver_id : txtpost.user.id,
                      sender_id : userProfile?.id,
                      notification_type : txtpost.give_type === "offering" ? "request_for_offering" : "request_for_request",
                      txt_post_id : txtpost.id,
                    });

                  if (error) {
                    console.error("❌ Supabaseインサートエラー詳細:", error);
                    alert(`エラーが発生しました: ${error.message}`);
                  } else {
                    alert("リクエストを送信しました！相手からの返信をお待ちください。");
                  }
                  } 
                }}
                
                className={`px-4 py-2 rounded-xl font-bold text-sm shadow-sm transition-all active:scale-95 ${
                  txtpost.give_type === "offering"
                    ? "bg-green-600 hover:bg-green-700 text-white" // 「譲ります」に対しては「譲ってください（グリーン）」
                    : "bg-blue-600 hover:bg-blue-700 text-white"   // 「譲ってください」に対しては「譲ります（ブルー）」
                }`}
              >
                {txtpost.give_type === "offering" ? "譲ってください 🙌" : "譲ります 📚"}
              </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
