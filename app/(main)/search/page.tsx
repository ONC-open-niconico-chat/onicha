"use client";

import React, { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchForm } from "./components/SearchForm";
import { SearchList } from "./components/SearchList";
import { AddTextbookModal } from "./components/AddTextbookModal";
import { supabase } from "@/lib/supabase";
import { TextbookSearchResult } from "@/types/textbook";
import { Plus } from "lucide-react";


function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialCourseName = searchParams.get("courseName") || "";
  const initialTextbookName = searchParams.get("textbookName") || "";
  const initialProfessorName = searchParams.get("professorName") || "";
  const initialSchedule = searchParams.get("schedule") || "";

  const [results, setResults] = useState<TextbookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentParams = useRef({
    courseName: initialCourseName,
    textbookName: initialTextbookName,
    professorName: initialProfessorName,
    schedule: initialSchedule,
  });

  const executeSearch = useCallback(async (params: {
    textbookName: string;
    professorName: string;
    schedule: string;
    courseName: string;
  }) => {
    currentParams.current = params;

    const cName = params.courseName.trim();
    const pName = params.professorName.trim();
    const tName = params.textbookName.trim();
    const sched = params.schedule.trim();

    const hasQuery = cName || pName || tName || sched;

    if (!hasQuery) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      // 検索条件がある項目には !inner を付け、条件がない項目は通常結合にする
      const lectureJoin = (cName || pName || sched) ? "lecture!inner" : "lecture";
      const textbookJoin = tName ? "textbook!inner" : "textbook";

      let query = supabase
        .from("txt_course")
        .select(`
          id,
          lecture:${lectureJoin} ( id, title, professor, day ),
          textbook:${textbookJoin} ( id, title, isbn )
        `);

      if (cName) {
        query = query.ilike("lecture.title", `%${cName}%`);
      }
      if (pName) {
        query = query.ilike("lecture.professor", `%${pName}%`);
      }
      if (sched) {
        query = query.ilike("lecture.day", `%${sched}%`);
      }
      if (tName) {
        query = query.ilike("textbook.title", `%${tName}%`);
      }

      const { data, error: fetchErr } = await query;

      if (fetchErr) {
        throw fetchErr;
      }

      const mapped: TextbookSearchResult[] = (data ?? [])
        .map((rel: any) => {
          if (!rel.lecture || !rel.textbook) return null;

          return {
            id: String(rel.id),
            textbook_id: String(rel.textbook?.id ?? ""),
            course_name: rel.lecture?.title ?? "授業名なし",
            professor_name: rel.lecture?.professor ?? "教授名なし",
            schedule: rel.lecture?.day ?? "不明",
            textbook_title: rel.textbook?.title ?? "教科書なし",
            edition: rel.textbook?.isbn ?? "",
          };
        })
        .filter((item): item is TextbookSearchResult => item !== null);

      console.log("【デバッグ】検索ヒット件数:", mapped.length, mapped);

      setResults(mapped);
      setLoading(false);

    } catch (err: any) {
      console.error("検索処理エラー:", err);
      setError("データの取得中にエラーが発生しました。");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCourseName || initialTextbookName || initialProfessorName || initialSchedule) {
      executeSearch({
        courseName: initialCourseName,
        textbookName: initialTextbookName,
        professorName: initialProfessorName,
        schedule: initialSchedule,
      });
    }
  }, [initialCourseName, initialTextbookName, initialProfessorName, initialSchedule, executeSearch]);

  const handleSearch = useCallback(
    (params: {
      textbookName: string;
      professorName: string;
      schedule: string;
      courseName: string;
    }) => {
      const query = new URLSearchParams();
      if (params.courseName) query.set("courseName", params.courseName);
      if (params.textbookName) query.set("textbookName", params.textbookName);
      if (params.professorName) query.set("professorName", params.professorName);
      if (params.schedule) query.set("schedule", params.schedule);

      const queryString = query.toString();
      router.replace(queryString ? `/search?${queryString}` : "/search");

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        executeSearch(params);
      }, 300);
    },
    [executeSearch, router]
  );

  return (
    <div className="flex flex-col min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 flex items-center justify-between px-4 py-4 sticky top-0 bg-white z-10">
        <div className="w-6" />
        <h1 className="text-xl font-bold">教科書検索</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-1 text-blue-600 hover:bg-blue-50 rounded-full transition"
          title="新規教科書を追加"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <div className="p-4">
        <SearchForm
          onSearch={handleSearch}
          loading={loading}
          initialValues={{
            courseName: initialCourseName,
            textbookName: initialTextbookName,
            professorName: initialProfessorName,
            schedule: initialSchedule,
          }}
        />
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
          <div className="text-center py-10 space-y-4">
            <p className="text-gray-400">該当する教科書が見つかりませんでした</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-xl text-sm font-bold transition"
            >
              <Plus className="w-4 h-4" />
              探している教科書を新しく追加する
            </button>
          </div>
        ) : (
          <SearchList results={results} />
        )}
      </div>

      <AddTextbookModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => executeSearch(currentParams.current)}
        initialValues={currentParams.current}
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-gray-400">読み込み中...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}