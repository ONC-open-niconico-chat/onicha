"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookText, MessageCircle, Heart, Link as LinkIcon } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        ホーム
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full border-b border-gray-200 bg-white rounded-none p-0">
          <TabsTrigger value="all" className="flex-1">おすすめ</TabsTrigger>
          <TabsTrigger value="follow" className="flex-1">フォロー中</TabsTrigger>
          <TabsTrigger value="grade" className="flex-1">同学年</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="p-6 space-y-8">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full shrink-0" />
            <div className="flex-1">
              <p className="font-bold">田中太郎 <span className="text-gray-500 font-normal">@tanaka_taro・2時間前</span></p>
              <p className="mt-1">今学期使った線形代数の教科書譲ります！</p>
              <Card className="mt-3 bg-blue-50 border-blue-200 rounded-2xl">
                <CardContent className="p-4">
                  <span className="bg-blue-600 text-white px-3 py-1 text-sm rounded-full">譲ります</span>
                  <p className="mt-3 font-bold text-lg">線形代数学</p>
                  <p className="text-gray-600 text-sm mt-1 flex items-center gap-1">
                    <BookText className="w-4 h-4" /> 数学
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}