"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronDown, Plus, Home } from "lucide-react";
import { PostDialog } from "@/components/PostDialog";

// 関数名を HomePage から HomeView に変更し、export default を export に変える
export function HomeView() {
  const [innerFilter, setInnerFilter] = useState<"grade" | "dept" | "faculty">("grade");
  const [isOpen, setIsOpen] = useState(false);
  const [isPostOpen, setIsPostOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getLabel = () => {
    if (innerFilter === "faculty") return "同学部";
    if (innerFilter === "dept") return "同学科";
    return "同学年";
  }; // ←ここに「t」があったので削除しました

  return (
    <div className="flex flex-col min-h-screen relative bg-gray-50/50">
      <div className="border-b border-gray-200 flex items-center justify-center py-4 sticky top-0 bg-white z-10 gap-2.5 shadow-sm">
        <div className="p-2 rounded-full bg-blue-50 text-blue-600">
          <Home className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">ホーム</h1>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full border-b border-gray-200 bg-white rounded-none p-0 h-14">
          <TabsTrigger value="all" className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600">おすすめ</TabsTrigger>
          <TabsTrigger value="follow" className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600">フォロー中</TabsTrigger>
          <TabsTrigger value="chat" className="flex-1 text-base data-[state=active]:font-bold data-[state=active]:text-blue-600">オープンチャット</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="p-6">
           <p className="text-gray-500">おすすめの投稿一覧...</p>
        </TabsContent>

        <TabsContent value="follow" className="p-6">
           <p className="text-gray-500">フォロー中の投稿一覧...</p>
        </TabsContent>

        <TabsContent value="chat" className="p-6 space-y-6">
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white rounded-full font-bold text-sm hover:bg-gray-50 shadow-sm"
            >
              {getLabel()} <ChevronDown className="w-4 h-4" />
            </button>
            
            {isOpen && (
              <div className="absolute top-12 left-0 w-32 bg-white border border-gray-200 shadow-xl rounded-xl z-10 py-1">
                <button className="block w-full px-4 py-2 text-sm text-left hover:bg-gray-100" onClick={() => { setInnerFilter("grade"); setIsOpen(false); }}>同学年</button>
                <button className="block w-full px-4 py-2 text-sm text-left hover:bg-gray-100" onClick={() => { setInnerFilter("dept"); setIsOpen(false); }}>同学科</button>
                <button className="block w-full px-4 py-2 text-sm text-left hover:bg-gray-100" onClick={() => { setInnerFilter("faculty"); setIsOpen(false); }}>同学部</button>
              </div>
            )}
          </div>
          <div className="text-sm text-blue-600 font-bold">{getLabel()} のオープンチャットを表示中</div>
        </TabsContent>
      </Tabs>

      <PostDialog open={isPostOpen} onOpenChange={setIsPostOpen} />

      <button 
        onClick={() => setIsPostOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-blue-700 transition-all z-50 border border-blue-400"
      >
        <Plus className="w-8 h-8" />
      </button>
    </div>
  );
}