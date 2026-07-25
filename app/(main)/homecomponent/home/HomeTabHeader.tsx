"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown } from "lucide-react";

interface HomeTabHeaderProps {
  filterLabel: string;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onFilterChange: (type: "grade" | "dept" | "faculty") => void;
}

export function HomeTabHeader({ filterLabel, isMenuOpen, setIsMenuOpen, onFilterChange }: HomeTabHeaderProps) {
  return (
    <div className="sticky top-[61px] z-20 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <TabsList className="w-full bg-transparent rounded-none p-0 h-14 flex relative">
        <TabsTrigger 
          value="all" 
          className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600 border-b-2 border-transparent data-[state=active]:border-blue-600 rounded-none h-full"
        >
          おすすめ
        </TabsTrigger>
        <TabsTrigger 
          value="follow" 
          className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600 border-b-2 border-transparent data-[state=active]:border-blue-600 rounded-none h-full text-gray-400"
        >
          フォロー中
        </TabsTrigger>

        {/* 学内タブ */}
        <TabsTrigger 
          value="school" 
          className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600 border-b-2 border-transparent data-[state=active]:border-blue-600 rounded-none h-full text-gray-400 pr-8 min-w-[120px] relative"
        >
          {filterLabel}
        </TabsTrigger>

        {/* 右端のドロップダウンボタン（絶対配置） */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30 flex items-center">
          <button 
            className="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none flex items-center justify-center"
            onClick={(e) => { e.preventDefault(); setIsMenuOpen(!isMenuOpen); }}
          >
            <ChevronDown className="w-4 h-4 text-gray-500 hover:text-blue-600" />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
              <div className="absolute right-0 top-8 w-32 bg-white border border-gray-200 shadow-xl rounded-xl p-1 z-50">
                <button onClick={() => onFilterChange("grade")} className="w-full text-left text-sm px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 font-medium block">同学年</button>
                <button onClick={() => onFilterChange("dept")} className="w-full text-left text-sm px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 font-medium block">同学科</button>
                <button onClick={() => onFilterChange("faculty")} className="w-full text-left text-sm px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 font-medium block">同学部</button>
              </div>
            </>
          )}
        </div>
      </TabsList>
    </div>
  );
}