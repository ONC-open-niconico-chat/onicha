"use client";

import React, { useState } from "react";
import { Search, ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");

  // 仮のデータ（本来はSupabaseから取得）
  const results = [
    { id: 1, title: "キモすぎ概論", time: "月2、木2", prof: "宮本武佐彦", detail: "概論 -キモすぎ- 新改訂" },
    { id: 2, title: "経済のなんか", time: "火3", prof: "山田太郎", detail: "経済学の基礎" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white text-black">
      {/* ヘッダー */}
      <div className="flex items-center px-4 py-4 border-b border-gray-100">
        <Link href="/">
          <ChevronLeft className="w-6 h-6 mr-2 cursor-pointer" />
        </Link>
        <h1 className="text-xl font-bold">教科書検索</h1>
      </div>

      {/* 検索入力エリア */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="教科書名・教授名・授業名"
            className="w-full bg-gray-100 border-none rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 ml-1">一単語から検索可能です</p>
      </div>

      {/* 検索結果一覧（PDFのイメージ再現） */}
      <div className="flex-1 px-4 py-2">
        <h2 className="text-sm font-bold text-gray-500 mb-4">検索結果一覧</h2>
        
        <div className="space-y-4">
          {results.map((item) => (
            <div key={item.id} className="border-b border-gray-100 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.time} {item.prof}</p>
                  <p className="text-sm text-gray-500 mt-1">{item.detail}</p>
                </div>
                <button className="text-blue-600 text-sm font-bold">詳細</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 下部ナビゲーション */}
      <div className="border-t border-gray-100 flex justify-around py-3 bg-white">
        <Link href="/" className="flex flex-col items-center text-gray-400 text-xs">
          <div className="w-6 h-6 bg-gray-200 rounded-sm mb-1"/>
          ホーム
        </Link>
        <div className="flex flex-col items-center text-blue-600 text-xs">
          <Search className="w-6 h-6 mb-1"/>
          検索
        </div>
        <div className="flex flex-col items-center text-gray-400 text-xs">
          <div className="w-6 h-6 bg-gray-200 rounded-sm mb-1"/>
          通知
        </div>
      </div>
    </div>
  );
}