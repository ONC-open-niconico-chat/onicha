// app/(main)/layout.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { SuspensionBanner } from "@/components/SuspensionBanner";

// 会話詳細（独自の入力バーを画面下部に持つフルスクリーン画面）では
// モバイルの下部タブバーを出さず、メインの下部余白も付けない。
const isConversationRoute = (pathname: string) =>
  /^\/(messages|admin\/messages)\/[^/]+$/.test(pathname);

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const fullBleed = isConversationRoute(pathname);

  // アプリ画面(main)にいる間だけ、ドキュメント自体のスクロールを止める。
  // これで（特に Google アプリ等の上部バー常時表示のアプリ内ブラウザで）
  // body が裏でスクロールして「上に戻れない」現象を防ぎ、スクロールは <main> に一本化する。
  // （ログイン/新規登録/利用規約などの (auth) 縦長ページはこのレイアウト外なので影響しない）
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      overscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  return (
    <div className="h-dvh flex overflow-hidden">
      <Sidebar />
      {/* モバイルは下部タブバー(h-16)の分だけ余白を確保（会話画面を除く） */}
      <main className={`flex-1 overflow-y-auto bg-white ${fullBleed ? "" : "pb-16 md:pb-0"}`}>
        <SuspensionBanner />
        {children}
      </main>
    </div>
  );
}
