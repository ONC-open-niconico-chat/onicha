"use client";

import React, { useState } from "react";
import { Search, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SearchForm } from "../../components/search/SearchForm";
import { SearchList } from "../../components/search/SearchList";
import { Textbook } from "../../types/textbook";

export default function SearchPage() {
  const [results, setResults] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(false);
  // 仮のデータ（本来はSupabaseから取得）
  const mockData: Textbook[] = [
    {
      id: "1",
      course_name: "概論",
      professor_name: "宮本武佐彦",
      schedule: "月2、木2",
      textbook_title: "キモすぎ概論",
      edition: "新改訂",
    },
    { id: '2', 
      course_name: "経済のなんか", 
      schedule: "火3", 
      professor_name: "山田太郎", 
      textbook_title: "経済学の基礎" },
  ];

  // 検索ロジックの追加
  const handleSearch = async (params: {
    textbookName: string;
    professorName: string;
    schedule: string;
    courseName: string;
  }) => {
    setLoading(true);
    // AND検索ロジック
    const filtered = mockData.filter((item) => {
      const matchesTextbook = params.textbookName && item.textbook_title.toLowerCase().includes(params.textbookName.toLowerCase());
      const matchesProfessor = params.professorName && item.professor_name.toLowerCase().includes(params.professorName.toLowerCase());
      const matchesSchedule = params.schedule && item.schedule.toLowerCase().includes(params.schedule.toLowerCase());
      const matchesCourse = params.courseName && item.course_name.toLowerCase().includes(params.courseName.toLowerCase());

      // AND条件：入力したフィールドだけを条件にする
      return (
        (!params.textbookName || item.textbook_title.toLowerCase().includes(params.textbookName.toLowerCase())) &&
        (!params.professorName || item.professor_name.toLowerCase().includes(params.professorName.toLowerCase())) &&
        (!params.schedule || item.schedule.toLowerCase().includes(params.schedule.toLowerCase())) &&
        (!params.courseName || item.course_name.toLowerCase().includes(params.courseName.toLowerCase()))
      );
    });
    setResults(filtered);
    setLoading(false);
  };

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
      <div className="p-4">
        <SearchForm onSearch={handleSearch} loading={loading} />
      </div>

      {/* 検索結果一覧 */}
      <div className="flex-1 px-4 py-2">
        <SearchList results={results} />
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