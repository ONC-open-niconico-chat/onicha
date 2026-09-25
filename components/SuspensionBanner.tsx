"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

// 利用停止中のユーザーに、全画面上部で「利用停止中」を告知するバナー。
// 停止中は運営チャット以外の書き込みができない（DB側のトリガーで担保）。
export function SuspensionBanner() {
  const [suspended, setSuspended] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const me = session?.user?.id;
      if (!me) return;
      const { data } = await supabase
        .from("suspended_users")
        .select("reason")
        .eq("user_id", me)
        .maybeSingle();
      if (!cancelled && data) {
        setSuspended(true);
        setReason((data as { reason: string | null }).reason ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!suspended) return null;

  return (
    <div className="sticky top-0 z-30 bg-red-600 text-white px-4 py-3 shadow-md">
      <div className="max-w-3xl mx-auto flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-bold">利用規約に反したため、アカウントを利用停止しています。</p>
          <p className="text-red-100 mt-0.5">
            現在、運営へのお問い合わせ以外の機能はご利用いただけません。
            {reason ? `（理由：${reason}）` : ""}
            心当たりがない場合や解除のご相談は、運営までご連絡ください。
          </p>
          <Link
            href="/messages"
            className="inline-flex items-center gap-1.5 mt-2 bg-white text-red-700 font-bold text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            運営に問い合わせる
          </Link>
        </div>
      </div>
    </div>
  );
}
