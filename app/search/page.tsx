"use client";

import React, { useState } from "react";
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
    
    const filtered = mockData.filter((item) => {
      
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
      <div className="border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        教科書検索
      </div>

      {/* 検索入力エリア */}
      <div className="p-4">
        <SearchForm onSearch={handleSearch} loading={loading} />
      </div>

      {/* 検索結果一覧 */}
      <div className="flex-1 px-4 py-2">
        <SearchList results={results} />
      </div> 
    </div>
  );
}