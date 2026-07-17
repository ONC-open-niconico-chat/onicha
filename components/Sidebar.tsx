"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
// 検索アイコン(Search)を追加で読み込むようにしたよ！
import { Home, Bell, MessageCircle, User, Search, GraduationCap, Handshake } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  // 未読通知の件数（バッジ表示用）
  const [unreadCount, setUnreadCount] = useState(0);

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

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      myId = session.user.id;
      await fetchUnread();

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
            if (rec === myId) fetchUnread();
          }
        )
        .subscribe();

      return channel;
    };

    const channelPromise = init();
    return () => {
      channelPromise.then((channel) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, []);


  return (
    <div className="w-72 border-r border-gray-200 p-6 flex flex-col gap-8 h-screen bg-white shrink-0">
      <div className="flex items-center gap-2 px-2">
        <div className="bg-blue-600 p-2 rounded-xl text-white">
          <GraduationCap className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">オニチャ</h1>
      </div>

      <nav className="flex flex-col gap-2">
        <SidebarItem href="/" icon={<Home className="w-5 h-5" />} label="ホーム" active={isActive("/")} />
        {/* ここを /search に変更し、アイコンを Search に変更！ */}
        <SidebarItem href="/search" icon={<Search className="w-5 h-5" />} label="教科書検索" active={isActive("/search")} />
        <SidebarItem href="/txtpost" icon={<Handshake className="w-5 h-5"/>} label="教科書譲渡" active={isActive("/txtpost")} />
        <SidebarItem href="/notification" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notification")} badge={unreadCount} />
        <SidebarItem href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")} />
        <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} />
        
      </nav>
    </div>
  );
}

function SidebarItem({ href, icon, label, active, badge = 0 }: { href: string, icon: React.ReactNode, label: string, active: boolean, badge?: number }) {
  return (
    <Link href={href}>
      <Button
        variant={active ? "secondary" : "ghost"}
        className={`w-full justify-start gap-3 text-base py-6 rounded-full transition-all ${active ? "bg-blue-50 text-blue-600 font-bold hover:bg-blue-100" : "text-gray-600 hover:bg-gray-100"}`}
      >
        <span className="relative flex items-center">
          {icon}
          {badge > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        {label}
      </Button>
    </Link>
  );
}