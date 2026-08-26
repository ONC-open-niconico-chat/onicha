"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getOfficialUserId } from "@/lib/official";

const tabs = [
  { href: "/admin", label: "取引管理" },
  { href: "/admin/messages", label: "メッセージ" },
  { href: "/admin/textbooks", label: "教科書価格" },
  { href: "/admin/reports", label: "通報" },
];

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // ユーザー追加・未確認の教科書件数（教科書価格タブのバッジ用）
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  // 未読の譲渡中取引件数（取引管理タブのバッジ用）
  const [unreadTxCount, setUnreadTxCount] = useState(0);
  // 運営宛の未読メッセージ件数（メッセージタブのバッジ用）
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  // 未対応の通報件数（通報タブのバッジ用）
  const [pendingReportCount, setPendingReportCount] = useState(0);

  useEffect(() => {
    const fetchCounts = async () => {
      const officialId = await getOfficialUserId();
      const [tb, tx, msg, rep] = await Promise.all([
        supabase
          .from("textbook")
          .select("*", { count: "exact", head: true })
          .not("list_price", "is", null)
          .eq("confirmed", false),
        supabase
          .from("txt_transaction")
          .select("*", { count: "exact", head: true })
          .eq("status", "matched")
          .eq("is_read", false),
        officialId
          ? supabase
              .from("notification")
              .select("*", { count: "exact", head: true })
              .eq("receiver_id", officialId)
              .eq("notification_type", "message")
              .eq("is_read", false)
          : Promise.resolve({ count: 0 }),
        supabase
          .from("report")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      setUnconfirmedCount(tb.count ?? 0);
      setUnreadTxCount(tx.count ?? 0);
      setUnreadMsgCount(msg.count ?? 0);
      setPendingReportCount(rep.count ?? 0);
    };
    fetchCounts();
  }, [pathname]);

  return (
    <div className="w-full">
      <div className="flex gap-2 border-b border-gray-200 px-4 md:px-6 pt-4 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 md:px-4 py-3 text-base md:text-lg font-bold rounded-t-lg transition-colors whitespace-nowrap ${
              isActive(t.href)
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.href === "/admin" && unreadTxCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {unreadTxCount > 99 ? "99+" : unreadTxCount}
                </span>
              )}
              {t.href === "/admin/messages" && unreadMsgCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                </span>
              )}
              {t.href === "/admin/textbooks" && unconfirmedCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {unconfirmedCount > 99 ? "99+" : unconfirmedCount}
                </span>
              )}
              {t.href === "/admin/reports" && pendingReportCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {pendingReportCount > 99 ? "99+" : pendingReportCount}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
