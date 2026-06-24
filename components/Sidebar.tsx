"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
// 検索アイコン(Search)を追加で読み込むようにしたよ！
import { Home, Bell, MessageCircle, User, Search, GraduationCap, ImagePlus } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

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
        <SidebarItem href="/notifications" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notifications")} />
        <SidebarItem href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")} />
        <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} />
      </nav>
      
      <SidebarPoints />
    </div>
  );
}

function SidebarItem({ href, icon, label, active }: { href: string, icon: React.ReactNode, label: string, active: boolean }) {
  return (
    <Link href={href}>
      <Button
        variant={active ? "secondary" : "ghost"}
        className={`w-full justify-start gap-3 text-base py-6 rounded-full transition-all ${active ? "bg-blue-50 text-blue-600 font-bold hover:bg-blue-100" : "text-gray-600 hover:bg-gray-100"}`}
      >
        {icon}
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
  const [pointIconUrl, setPointIconUrl] = useState<string | null>(null);
  const [totalEarned, setTotalEarned] = useState<number>(0);

  useEffect(() => {
    const fetchUserPoints = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user")
        .select("points, icon_src")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("ポイント取得エラー:", error);
        return;
      }

      if (data) {
        setPoints(data.points);
      }

      const { data: historyData, error: historyError } = await supabase
        .from("point")
        .select("amount")
        .eq("user_id", user.id)
        .gt("amount", 0); // プラスの獲得履歴のみを対象にする

      if (historyError) {
        console.error("ポイント履歴取得エラー:", historyError);
        return;
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
      {/* Figmaベースの静的カードデザイン（ユーザーによる操作・クリックは不可） */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 min-w-[160px]">
        {/* アイコン枠 */}
        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden border border-gray-100 flex items-center justify-center bg-gray-50">
          {points !== null ? (
            <img 
              src={activeIconUrl} 
              alt="オニチャポイントアイコン" 
              className="w-full h-full object-cover"
              onError={(e) => {
                // 万が一画像パスが間違っている場合に、コンソールにエラーを出して transparent にする
                console.error("画像の読み込みに失敗しました。パスを確認してください:", activeIconUrl);
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