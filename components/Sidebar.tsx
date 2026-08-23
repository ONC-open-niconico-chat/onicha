"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Home, Bell, MessageCircle, User, Search,  Handshake,ShieldCheck  } from "lucide-react";
import { supabase } from "@/lib/supabase";

// 累計獲得ポイント（total_earned_points）に応じたランク。min の降順で並べる。
const RANKS = [
  { name: "god", label: "God", min: 50000, src: "/rank_icons/7_god.jpg" },
  { name: "master", label: "Master", min: 10000, src: "/rank_icons/6_master.jpg" },
  { name: "diamond", label: "Diamond", min: 5000, src: "/rank_icons/5_diamond.jpg" },
  { name: "platinum", label: "Platinum", min: 3000, src: "/rank_icons/4_platinum.jpg" },
  { name: "gold", label: "Gold", min: 2000, src: "/rank_icons/3_gold.jpg" },
  { name: "silver", label: "Silver", min: 1500, src: "/rank_icons/2_silver.jpg" },
  { name: "bronze", label: "Bronze", min: 0, src: "/rank_icons/1_bronze.jpg" },
];

const getRank = (totalEarned: number) =>
  RANKS.find((r) => totalEarned >= r.min) ?? RANKS[RANKS.length - 1];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  // 未読通知の件数（バッジ表示用）
  const [unreadCount, setUnreadCount] = useState(0);

  // 管理者かどうか（staff_members に登録されているか）
  const [isStaff, setIsStaff] = useState(false);

  // 現在のポイント / 仮消費（予約）ポイント / 累計獲得ポイント
  const [points, setPoints] = useState<number | null>(null);
  const [reserved, setReserved] = useState<number>(0);
  const [totalEarned, setTotalEarned] = useState<number | null>(null);

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

    const fetchPoints = async () => {
      if (!myId) return;
      const { data } = await supabase
        .from("user")
        .select("points, reserved_points, total_earned_points")
        .eq("id", myId)
        .single();
      if (data) {
        setPoints(data.points ?? 0);
        setReserved(data.reserved_points ?? 0);
        setTotalEarned(data.total_earned_points ?? 0);
      }
    };

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      myId = session.user.id;
      await fetchUnread();
      await fetchPoints();

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
            if (rec === myId) fetchUnread();
          }
        )
        .subscribe();

      // 自分の user 行の更新（ポイント変動）をリアルタイムに反映
      const userChannel = supabase
        .channel("sidebar-user-points")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "user" },
          (payload) => {
            const row = payload.new as { id?: string; points?: number; reserved_points?: number; total_earned_points?: number };
            if (row?.id === myId) {
              setPoints(row.points ?? 0);
              setReserved(row.reserved_points ?? 0);
              setTotalEarned(row.total_earned_points ?? 0);
            }
          }
        )
        .subscribe();

      return [channel, userChannel];
    };

    const channelsPromise = init();
    return () => {
      channelsPromise.then((channels) => {
        channels?.forEach((ch) => supabase.removeChannel(ch));
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
        {/* ここを /search に変更し、アイコンを Search に変更！ */}
        <SidebarItem href="/search" icon={<Search className="w-5 h-5" />} label="教科書検索" active={isActive("/search")} />
        <SidebarItem href="/txtpost" icon={<Handshake className="w-5 h-5"/>} label="教科書譲渡" active={isActive("/txtpost")} />
        <SidebarItem href="/notification" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notification")} badge={unreadCount} />
        <SidebarItem href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")} />
        <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} />
        {isStaff && (
          <SidebarItem href="/admin" icon={<ShieldCheck className="w-5 h-5" />} label="管理者" active={isActive("/admin")} />
        )}

      </nav>

      {/* 現在のポイント & ランクバッジ */}
      {points !== null && totalEarned !== null && (
        <div className="mt-auto border-t border-gray-200 pt-4">
          <div className="flex items-center gap-3">
            <img
              src={getRank(totalEarned).src}
              alt={getRank(totalEarned).label}
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="font-bold text-gray-900">{getRank(totalEarned).label}</div>
              <div className="text-xs text-gray-500">累計 {totalEarned.toLocaleString()} pt</div>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm text-gray-600">利用可能ポイント</span>
            <span className="text-lg font-bold text-blue-600">
              {Math.max(points - reserved, 0).toLocaleString()}
              <span className="text-xs text-gray-500 font-normal ml-0.5">pt</span>
            </span>
          </div>
          {reserved > 0 && (
            <div className="mt-0.5 flex items-baseline justify-between text-xs text-gray-400">
              <span>予約中（リクエスト保留分）</span>
              <span>{reserved.toLocaleString()} pt</span>
            </div>
          )}
        </div>
      )}
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