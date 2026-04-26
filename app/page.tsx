"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookText, MessageCircle, Heart, ChevronDown } from "lucide-react";

export default function HomePage() {
  const [selectedFilter, setSelectedFilter] = useState<"grade" | "dept" | "course">("grade");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 外側をクリックしたらメニューを閉じる処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getLabel = () => {
    if (selectedFilter === "grade") return "同学年";
    if (selectedFilter === "dept") return "同学科";
    return "同コース";
  };

  return (
    <div className="flex flex-col">
      {/* トップバー */}
      <div className="border-b border-gray-200 flex items-center justify-center py-3 sticky top-0 bg-white z-10 gap-3">
        <div className="w-9 h-9 relative overflow-hidden rounded-full border border-gray-100">
          <Image src="/onippi.jpg" alt="オニチャ" fill className="object-cover" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">ホーム</h1>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full border-b border-gray-200 bg-white rounded-none p-0 h-14 relative">
          <TabsTrigger value="all" className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600">おすすめ</TabsTrigger>
          <TabsTrigger value="follow" className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600">フォロー中</TabsTrigger>
          
          {/* 3つ目のタブ：ここが選択メニューになる */}
          <div className="flex-1 relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full h-full flex items-center justify-center gap-1 text-base font-bold text-blue-600 border-b-2 border-blue-600"
            >
              {getLabel()} <ChevronDown className="w-4 h-4" />
            </button>

            {/* ドロップダウンメニュー */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 w-full bg-white border border-gray-200 shadow-lg rounded-b-lg z-50 overflow-hidden">
                {(["grade", "dept", "course"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedFilter(type);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full py-3 text-sm text-center block ${
                      selectedFilter === type ? "bg-blue-50 text-blue-600 font-bold" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {type === "grade" ? "同学年" : type === "dept" ? "同学科" : "同コース"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </TabsList>

        <TabsContent value="all" className="p-6">
          <p className="text-gray-600 font-bold mb-4">{getLabel()} で絞り込み中</p>
          {/* ここに投稿一覧 */}
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold">田中太郎 <span className="text-gray-500 font-normal">@tanaka_taro</span></p>
              <p className="mt-1">今学期使った線形代数の教科書譲ります！</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}