"use client";

import React, { useState } from "react";
import { SearchForm } from "../../../components/search/SearchForm";
import { SearchList } from "../../../components/search/SearchList";
import { Textbook } from "../../../types/textbook";
import { supabase } from "@/lib/supabase";

export default function SearchPage() {
  const [results, setResults] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (params: {
  textbookName: string;
  professorName: string;
  schedule: string;
  courseName: string;
}) => {
  setLoading(true);

  // 1. 基本となるクエリの作成
  // リレーション名はテーブル名「教科書」を指定
  let query = supabase
    .from('授業')
    .select(`
      id,
      title,
      professor,
      day,
      period,
      教科書!inner ( title, author )
    `); 
    // ※ 教科書名で絞り込む場合は !inner をつけるのがコツ！

  // 2. フィルタリング条件の追加
  if (params.courseName) {
    query = query.ilike('title', `%${params.courseName}%`);
  }
  if (params.professorName) {
    query = query.ilike('professor', `%${params.professorName}%`);
  }
  if (params.schedule) {
    query = query.ilike('day', `%${params.schedule}%`);
  }
  // 教科書名で検索したい場合（結合先のカラムを指定）
  if (params.textbookName) {
    query = query.ilike('教科書.title', `%${params.textbookName}%`);
  }

  const { data, error } = await query;

  if (error) {
    // 鬼ちゃアドバイス：errorの中身を詳しく出すと解決が早いよ！
    console.error('検索エラー詳細:', error.message, error.details, error.hint);
    setLoading(false);
    return;
  }

    // Textbook型に変換
    const formatted: Textbook[] = (data || []).map((item: any) => ({
      id: String(item.id),
      course_name: item.title,
      professor_name: item.professor,
      schedule: `${item.day} ${item.period}`,
      textbook_title: item.教科書?.title ?? '未設定',
    }));

    setResults(formatted);
    setLoading(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        教科書検索
      </div>
      <div className="p-4">
        <SearchForm onSearch={handleSearch} loading={loading} />
      </div>
      <div className="flex-1 px-4 py-2">
        <SearchList results={results} />
      </div>
    </div>
  );
}