// app/(main)/layout.tsx
"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

// 会話詳細（独自の入力バーを画面下部に持つフルスクリーン画面）では
// モバイルの下部タブバーを出さず、メインの下部余白も付けない。
const isConversationRoute = (pathname: string) =>
  /^\/(messages|admin\/messages)\/[^/]+$/.test(pathname);

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const fullBleed = isConversationRoute(pathname);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      {/* モバイルは下部タブバー(h-16)の分だけ余白を確保（会話画面を除く） */}
      <main className={`flex-1 overflow-y-auto bg-white ${fullBleed ? "" : "pb-16 md:pb-0"}`}>
        {children}
      </main>
    </div>
  );
}
