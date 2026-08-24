"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const tabs = [
  { href: "/admin", label: "取引管理" },
  { href: "/admin/messages", label: "メッセージ" },
  { href: "/admin/textbooks", label: "教科書価格" },
];

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // ユーザー追加・未確認の教科書件数（教科書価格タブのバッジ用）
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from("textbook")
        .select("*", { count: "exact", head: true })
        .not("list_price", "is", null)
        .eq("confirmed", false);
      setUnconfirmedCount(count ?? 0);
    };
    fetchCount();
  }, [pathname]);

  return (
    <div className="w-full">
      <div className="flex gap-2 border-b border-gray-200 px-6 pt-4">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-3 text-lg font-bold rounded-t-lg transition-colors ${
              isActive(t.href)
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.href === "/admin/textbooks" && unconfirmedCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {unconfirmedCount > 99 ? "99+" : unconfirmedCount}
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
