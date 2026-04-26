"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Home, Bell, MessageCircle, User, BookOpen } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  return (
    <div className="w-72 border-r border-gray-200 p-6 flex flex-col gap-8 h-screen bg-white flex-shrink-0">
      <div className="flex items-center gap-3 px-2">
        {/* アイコン部分：publicフォルダに置いたonippi.jpgを表示 */}
        <div className="w-10 h-10 relative overflow-hidden rounded-xl">
          <Image 
            src="/onippi.jpg" 
            alt="オニチャ" 
            fill 
            className="object-cover" 
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">オニチャ</h1>
      </div>

      <nav className="flex flex-col gap-2">
        <SidebarItem href="/" icon={<Home className="w-5 h-5" />} label="ホーム" active={isActive("/")} />
        <SidebarItem href="/textbook" icon={<BookOpen className="w-5 h-5" />} label="教科書譲渡" active={isActive("/textbook")} />
        <SidebarItem href="/notifications" icon={<Bell className="w-5 h-5" />} label="通知" active={isActive("/notifications")} />
        <SidebarItem href="/messages" icon={<MessageCircle className="w-5 h-5" />} label="メッセージ" active={isActive("/messages")} />
        <SidebarItem href="/profile" icon={<User className="w-5 h-5" />} label="プロフィール" active={isActive("/profile")} />
      </nav>
    </div>
  );
}

function SidebarItem({ href, icon, label, active }: { href: string, icon: React.ReactNode, label: string, active: boolean }) {
  return (
    <Link href={href}>
      <Button 
        variant={active ? "secondary" : "ghost"} 
        className={`w-full justify-start gap-3 text-base py-6 rounded-full transition-all ${
          active 
            ? "bg-blue-50 text-blue-600 font-bold hover:bg-blue-100" 
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        {icon}
        {label}
      </Button>
    </Link>
  );
}