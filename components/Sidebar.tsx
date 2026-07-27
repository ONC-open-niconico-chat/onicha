"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Home, Bell, MessageCircle, User, Search, GraduationCap, Handshake, ImagePlus } from "lucide-react";
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
        <div className="p-2 rounded-xl text-white">
          <img className="w-13 h-13" src="/onicha_icon/onicha_icon.jpg" alt="Icon" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">オニチャ</h1>
      </div>

      <nav className="flex flex-col gap-2">
        <SidebarItem href="/" icon={<Home className="w-5 h-5" />} label="ホーム" active={isActive("/")} />
        <SidebarItem href="/search" icon={<Search className="w-5 h-5" />} label="教科書検索" active={isActive("/search")} />
        <SidebarItem href="/txtpost" icon={<Handshake className="w-5 h-5"/>} label="教科書譲渡" active={isActive("/txtpost")} />
        <SidebarItem href="/notification" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notification")} badge={unreadCount} />
        <SidebarItem href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")} />
        <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} />
      </nav>
      
      <SidebarPoints />
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

function SidebarPoints() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [points, setPoints] = useState<number | null>(null);
  const [totalEarned, setTotalEarned] = useState<number>(0);

  useEffect(() => {
    const fetchUserPoints = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. 現在保有ポイントの取得
      const { data, error } = await supabase
        .from("user")
        .select("points")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("ポイント取得エラー:", error);
      } else if (data) {
        setPoints(data.points);
      }

      // 2. 累計獲得ポイントの計算
      const { data: historyData, error: historyError } = await supabase
        .from("point")
        .select("amount")
        .eq("user_id", user.id)
        .gt("amount", 0);

      if (historyError) {
        console.error("ポイント履歴取得エラー:", historyError);
        return;
      }

      if (historyData) {
        const total = historyData.reduce((sum, item) => sum + (item.amount || 0), 0);
        setTotalEarned(total);
      }
    };

    fetchUserPoints();
  }, [supabase]);

  const getRankIconUrl = (total: number): string => {
    if (total >= 50000) return "/rank_icons/7_god.jpg";        // 🔥 50,000pt以上
    if (total >= 10000) return "/rank_icons/6_master.jpg";     // 😈 10,000pt以上
    if (total >= 5000)  return "/rank_icons/5_diamond.jpg";    // 💎 5,000pt以上
    if (total >= 3000)  return "/rank_icons/4_platinum.jpg";   // 🪙 3,000pt以上
    if (total >= 2000)  return "/rank_icons/3_gold.jpg";       // 🥇 2,000pt以上
    if (total >= 1500)  return "/rank_icons/2_silver.jpg";     // 🥈 1,500pt以上
    return "/rank_icons/1_bronze.jpg";                         // 🥉 初期（1,000pt〜）
  };

  const activeIconUrl = getRankIconUrl(totalEarned);

  return (
    <div className="mt-auto w-full pt-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 min-w-[160px]">
        {/* アイコン枠 */}
        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden border border-gray-100 flex items-center justify-center bg-gray-50">
          {points !== null ? (
            <img 
              src={activeIconUrl} 
              alt="オニチャポイントアイコン" 
              className="w-full h-full object-cover"
              onError={() => {
                console.error("画像の読み込みに失敗しました:", activeIconUrl);
              }}
            />
          ) : (
            <div className="w-full h-full bg-gray-100 animate-pulse" />
          )}
        </div>

        {/* テキスト情報 */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 font-medium tracking-wider">オニチャポイント</span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-black text-gray-800">
              {points !== null ? points.toLocaleString() : "---"}
            </span>
            <span className="text-xs font-bold text-amber-600 ml-0.5">pt</span>
          </div>
        </div>
      </div>
    </div>
  );
}