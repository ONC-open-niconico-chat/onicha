"use client";

import { Home } from "lucide-react";

export function Header() {
  return (
    <div className="border-b border-gray-200 flex items-center justify-center py-4 sticky top-0 bg-white/80 backdrop-blur-md z-30 gap-2">
      <Home className="w-6 h-6 text-blue-600" />
      <h1 className="text-xl font-bold">ホーム</h1>
    </div>
  );
}