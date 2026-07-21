"use client";

import React, { useState, useCallback, useRef } from "react";
import { SearchForm } from "./components/SearchForm";
import { SearchList } from "./components/SearchList";
import { Textbook } from "../../../types/textbook";
import { supabase } from "@/lib/supabase";

export default function SearchPage() {
  const [results, setResults] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = useCallback(async (params: {
    textbookName: string;
    professorName: string;
    schedule: string;
    courseName: string;
  }) => {
    const hasQuery =
      params.textbookName ||
      params.professorName ||
      params.schedule ||
      params.courseName;

    if (!hasQuery) {
      setResults([]);
      setSearched(false);
      return;
    }

    // 修正対象: page.tsx の executeSearch 関数内

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const [lectureRes, textbookRes, txtCourseRes] = await Promise.all([
        supabase.from("lecture").select("*"),
        supabase.from("textbook").select("*"),
        supabase.from("txt_course").select("*")
      ]);

      if (lectureRes.error || textbookRes.error || txtCourseRes.error) {
        throw new Error("データ取得失敗");
      }

      const combined = (txtCourseRes.data ?? []).map((rel: any) => {
        const lecture = (lectureRes.data ?? []).find((l: any) => l.id === rel.txt_post_id);
        const textbook = (textbookRes.data ?? []).find((t: any) => t.isbn === rel.textbook_isbn);

        return {
          id: rel.id,
          course_name: lecture?.title ?? "授業名なし",
          professor_name: lecture?.professor ?? "教授名なし",
          schedule: lecture?.day ?? "不明",
          textbook_title: textbook?.title ?? "教科書なし",
          edition: textbook?.isbn ?? ""
        };
      });

      // フィルタリング処理を追加（これがないと全件表示になって重くなります）
      const filtered = combined.filter((item) => {
        return (
          item.course_name.toLowerCase().includes(params.courseName.toLowerCase()) &&
          item.professor_name.toLowerCase().includes(params.professorName.toLowerCase()) &&
          item.textbook_title.toLowerCase().includes(params.textbookName.toLowerCase())
        );
      });

      setResults(filtered);
      setLoading(false); // ★ここを追加：ローディングを終了！

    } catch (err: any) {
      console.error("結合エラー:", err);
      setError("データの結合中にエラーが発生しました。");
      setLoading(false); // ★エラー時も忘れずに終了！
    }
}, []);

  const handleSearch = useCallback(
    (params: {
      textbookName: string;
      professorName: string;
      schedule: string;
      courseName: string;
    }) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        executeSearch(params);
      }, 300);
    },
    [executeSearch]
  );

  return (
    <div className="flex flex-col min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        教科書検索
      </div>
      <div className="p-4">
        <SearchForm onSearch={handleSearch} loading={loading} />
      </div>
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}
      <div className="flex-1 px-4 py-2">
        {!searched ? (
          <p className="text-center text-gray-400 py-10">
            キーワードを1文字以上入力すると検索します
          </p>
        ) : loading ? null : results.length === 0 ? (
          <p className="text-center text-gray-400 py-10">
            該当する教科書が見つかりませんでした
          </p>
        ) : (
          <SearchList results={results} />
        )}
      </div>
    </div>
  );
}
