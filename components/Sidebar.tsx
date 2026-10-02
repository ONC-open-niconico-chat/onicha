"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Home, Bell, MessageCircle, User, Handshake, ArrowLeftRight, ShieldCheck, Menu, X, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

// お問い合わせ用 Google フォームの URL。
// 環境変数 NEXT_PUBLIC_CONTACT_FORM_URL があればそれを使う。未設定なら下の値を差し替える。
// ★ TODO: 実際の Google フォールURL（例 https://forms.gle/xxxx）に置き換えてください。
const CONTACT_FORM_URL =
  process.env.NEXT_PUBLIC_CONTACT_FORM_URL || "https://forms.gle/your-form-id";

// 会話詳細（独自の入力バーを持つフルスクリーン画面）ではモバイル下部バーを隠す
const isConversationRoute = (pathname: string) =>
  /^\/(messages|admin\/messages)\/[^/]+$/.test(pathname);

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;
  const hideMobileBar = isConversationRoute(pathname);

  // 未読通知の件数（バッジ表示用）
  const [unreadCount, setUnreadCount] = useState(0);

  // 取引中（matched / received）の譲渡が自分にあるか（サイドバーの赤ドット表示用）
  const [activeTxCount, setActiveTxCount] = useState(0);

  // 管理者かどうか（staff_members に登録されているか）
  const [isStaff, setIsStaff] = useState(false);

  // モバイル：メニュー（ドロワー）の開閉
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let myId: string | null = null;

    const fetchUnread = async () => {
      if (!myId) return;
      const { count } = await supabase
        .from("notification")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", myId)
        .eq("is_read", false);
      setUnreadCount(count ?? 0);
    };

    // 取引中（matched / received）の譲渡が自分にあるか（件数）
    const fetchActiveTx = async () => {
      if (!myId) return;
      const { count } = await supabase
        .from("txt_transaction")
        .select("*", { count: "exact", head: true })
        .in("status", ["matched", "received"])
        .or(`giver_id.eq.${myId},receiver_id.eq.${myId}`);
      setActiveTxCount(count ?? 0);
    };

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      myId = session.user.id;
      await fetchUnread();
      await fetchActiveTx();

      // 管理者判定：staff_members に自分の user_id があるか
      const { data: staff } = await supabase
        .from("staff_members")
        .select("user_id")
        .eq("user_id", myId)
        .maybeSingle();
      setIsStaff(!!staff);

      // 通知の追加・既読化をリアルタイムに反映
      const channel = supabase
        .channel("sidebar-notifications")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notification" },
          (payload) => {
            // サーバー側フィルタは使わず JS 側で判定（INSERT/UPDATE は new、DELETE は old を参照）
            const rec =
              (payload.new as { receiver_id?: string })?.receiver_id ??
              (payload.old as { receiver_id?: string })?.receiver_id;
            if (rec === myId) {
              fetchUnread();
              // 承諾/完了/取消は通知を伴うため、取引中バッジもここで更新する
              fetchActiveTx();
            }
          }
        )
        .subscribe();

      return [channel];
    };

    const channelsPromise = init();
    return () => {
      channelsPromise.then((channels) => {
        channels?.forEach((ch) => supabase.removeChannel(ch));
      });
    };
  }, []);

  // 画面遷移のたびに取引中の件数を取り直す（承諾直後などリアルタイム通知が無いケースも拾う）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const me = session?.user?.id;
      if (!me) return;
      const { count } = await supabase
        .from("txt_transaction")
        .select("*", { count: "exact", head: true })
        .in("status", ["matched", "received"])
        .or(`giver_id.eq.${me},receiver_id.eq.${me}`);
      if (!cancelled) setActiveTxCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      {/* ─── デスクトップ：左サイドバー（md 以上） ─── */}
      <div className="hidden md:flex w-72 border-r border-gray-200 p-6 flex-col gap-8 h-screen bg-white shrink-0">
        <div className="flex items-center gap-2 px-2">
          <div className="p-2 rounded-xl text-white">
            <img className="w-13 h-13" src="/yujilink_icon/yujilink_icon.JPG" alt="Icon" />
          </div>
          <h1
            className="inline-block text-2xl font-bold tracking-tight bg-linear-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent"
            style={{ fontFamily: "var(--font-logo), sans-serif" }}
          >
            YujiLink
          </h1>
        </div>

        <nav className="flex flex-col gap-2">
          <SidebarItem href="/" icon={<Home className="w-5 h-5" />} label="ホーム" active={isActive("/")} onClick={() => window.dispatchEvent(new Event("home:refresh"))} />
          <SidebarItem href="/txtpost" icon={<Handshake className="w-5 h-5" />} label="教科書譲渡" active={isActive("/txtpost")} />
          <SidebarItem href="/transactions" icon={<ArrowLeftRight className="w-5 h-5" />} label="取引中の譲渡" active={isActive("/transactions")} dot={activeTxCount > 0} />
          <SidebarItem href="/notification" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notification")} badge={unreadCount} />
          <SidebarItem href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")} />
          <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} />
          <ExternalItem href={CONTACT_FORM_URL} icon={<Mail className="w-5 h-5" />} label="ご意見・お問い合わせ" />
          {isStaff && (
            <SidebarItem href="/admin" icon={<ShieldCheck className="w-5 h-5" />} label="管理者" active={isActive("/admin")} />
          )}
        </nav>
      </div>

      {/* ─── モバイル：下部タブバー（md 未満／会話画面では非表示） ─── */}
      <nav className={`${hideMobileBar ? "hidden" : "flex"} md:hidden fixed bottom-0 inset-x-0 z-40 items-stretch justify-around border-t border-gray-200 bg-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] h-16`}>
        <MobileTab href="/" icon={<Home className="w-5 h-5" />} label="ホーム" active={isActive("/")} onClick={() => window.dispatchEvent(new Event("home:refresh"))} />
        <MobileTab href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")}  />
        <MobileTab href="/txtpost" icon={<Handshake className="w-5 h-5" />} label="譲渡" active={isActive("/txtpost")} />
        <MobileTab href="/notification" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notification")} badge={unreadCount} />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-blue-600 transition-colors"
        >
          <span className="relative flex items-center">
            <Menu className="w-5 h-5" />
            {activeTxCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
            )}
          </span>
          <span className="text-[10px] font-medium">メニュー</span>
        </button>
      </nav>

      {/* ─── モバイル：メニュー（ドロワー） ─── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 max-w-[85%] bg-white shadow-xl p-6 flex flex-col gap-6 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">メニュー</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="閉じる"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex flex-col gap-2">
              <SidebarItem href="/transactions" icon={<ArrowLeftRight className="w-5 h-5" />} label="取引中の譲渡" active={isActive("/transactions")} dot={activeTxCount > 0} onClick={() => setDrawerOpen(false)} />
              <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} onClick={() => setDrawerOpen(false)} />
               <ExternalItem href={CONTACT_FORM_URL} icon={<Mail className="w-5 h-5" />} label="ご意見・お問い合わせ" onClick={() => setDrawerOpen(false)} />
              {isStaff && (
                <SidebarItem href="/admin" icon={<ShieldCheck className="w-5 h-5" />} label="管理者" active={isActive("/admin")} onClick={() => setDrawerOpen(false)} />
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarItem({
  href,
  icon,
  label,
  active,
  badge = 0,
  dot = false,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  // 件数バッジではなく「ある／ない」を示す赤いドット（取引中の譲渡など）
  dot?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick}>
      <Button
        variant={active ? "secondary" : "ghost"}
        className={`w-full justify-start gap-3 text-base py-6 rounded-full transition-all ${active ? "bg-blue-50 text-blue-600 font-bold hover:bg-blue-100" : "text-gray-600 hover:bg-gray-100"}`}
      >
        <span className="relative flex items-center">
          {icon}
          {badge > 0 ? (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : dot ? (
            <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          ) : null}
        </span>
        {label}
      </Button>
    </Link>
  );
}

// 外部リンク用の項目（Google フォームなど）。SidebarItem と同じ見た目だが
// 内部ルーティングの Link ではなく通常の <a>（新規タブ）で開く。
function ExternalItem({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      <Button
        variant="ghost"
        className="w-full justify-start gap-3 text-base py-6 rounded-full transition-all text-gray-600 hover:bg-gray-100"
      >
        <span className="relative flex items-center">{icon}</span>
        {label}
      </Button>
    </a>
  );
}

// モバイル下部タブバーの各タブ（アイコン＋小さいラベルの縦並び）
function MobileTab({
  href,
  icon,
  label,
  active,
  badge = 0,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? "text-blue-600" : "text-gray-600 hover:text-blue-600"
      }`}
    >
      <span className="relative flex items-center">
        {icon}
        {badge > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
