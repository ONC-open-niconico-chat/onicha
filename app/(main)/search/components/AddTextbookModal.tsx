"use client";

import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AddTextbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialValues?: {
    courseName?: string;
    textbookName?: string;
    professorName?: string;
    schedule?: string;
  };
}

export const AddTextbookModal = ({
  isOpen,
  onClose,
  onSuccess,
  initialValues,
}: AddTextbookModalProps) => {
  const [form, setForm] = useState({
    title: "",
    isbn: "",
    courseName: "",
    professorName: "",
    schedule: "",
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm({
        title: initialValues?.textbookName || "",
        isbn: "",
        courseName: initialValues?.courseName || "",
        professorName: initialValues?.professorName || "",
        schedule: initialValues?.schedule || "",
      });
      setErrorMessage(null);
    }
  }, [isOpen, initialValues]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    // ISBNが未入力の場合は、重複しないランダムなキー(DUMMY-xxxx)を自動生成
    const cleanIsbn = form.isbn.trim() !== "" 
      ? form.isbn.trim() 
      : `TMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
      let textbookData: any = null;

      // 1-A. ISBN（または自動生成キー）で既存の教科書がないか検索
      console.log("【Step 1-A】既存教科書を検索中...", cleanIsbn);
      const { data: existingTextbook, error: searchErr } = await supabase
        .from("textbook")
        .select("*")
        .eq("isbn", cleanIsbn)
        .maybeSingle();

      if (searchErr) {
        console.error("【Step 1-A エラー】", searchErr.message);
      }

      if (existingTextbook) {
        console.log("【Step 1-A】既存の教科書を発見:", existingTextbook);
        textbookData = existingTextbook;
      }

      // 1-B. 既存教科書が見つからなかった場合のみ新規挿入
      if (!textbookData) {
        console.log("【Step 1-B】教科書を新規登録中...", cleanIsbn);
        const { data: newTextbook, error: textbookErr } = await supabase
          .from("textbook")
          .insert([
            {
              title: form.title,
              isbn: cleanIsbn, // 必ず一意なISBNをセットする
            },
          ])
          .select()
          .maybeSingle();

        if (textbookErr) {
          console.error("【Step 1-B エラーメッセージ】:", textbookErr.message);
          console.error("【Step 1-B エラーコード】:", textbookErr.code);
          throw new Error(`教科書の登録に失敗しました: ${textbookErr.message}`);
        }

        if (!newTextbook) {
          throw new Error("教科書データの作成結果を取得できませんでした。");
        }

        console.log("【Step 1-B】新規登録成功:", newTextbook);
        textbookData = newTextbook;
      }

      // 2. 授業 (lecture) テーブルにレコード作成
      console.log("【Step 2】授業情報を登録中...");
      const { data: lectureData, error: lectureErr } = await supabase
        .from("lecture")
        .insert([
          {
            title: form.courseName || "名称未設定",
            professor: form.professorName || "不明",
            day: form.schedule || "不明",
          },
        ])
        .select()
        .maybeSingle();

      if (lectureErr) {
        console.error("【Step 2 エラーメッセージ】:", lectureErr.message);
        throw new Error(`授業の登録に失敗しました: ${lectureErr.message}`);
      }

      if (!lectureData) {
        throw new Error("授業データの作成結果を取得できませんでした。");
      }

      console.log("【Step 2】授業登録成功:", lectureData);

      // 3. 中間テーブル (txt_course) に紐づけ作成
      console.log("【Step 3】中間テーブルへの紐付けを登録中...");

      const { error: relErr } = await supabase.from("txt_course").insert([
        {
          txt_post_id: lectureData.id,
          textbook_isbn: textbookData.isbn, // 確実に存在する textbook.isbn を渡す
        },
      ]);

      if (relErr) {
        console.error("【Step 3 エラーメッセージ】:", relErr.message);
        throw new Error(`教科書と授業の紐付けに失敗しました: ${relErr.message}`);
      }

      console.log("【Step 3】紐付け完了！");

      // 1. 先にローディング状態を解除
      setLoading(false);

      // 2. モーダルを閉じる
      onClose();

      // 3. 親コンポーネントの成功通知（データ再取得など）を呼ぶ
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("【登録処理失敗】:", err);
      setErrorMessage(err.message || "予期せぬエラーが発生しました");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-4">新しい教科書を登録</h2>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200 break-words">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              教科書名 <span className="text-red-500">*</span>
            </label>
            <input
              required
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="例：基本情報技術者試験 テキスト"
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              ISBN（または版・型番）
            </label>
            <input
              name="isbn"
              value={form.isbn}
              onChange={handleChange}
              placeholder="例：978-4-0000-0000-0"
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">授業名</label>
            <input
              required
              name="courseName"
              value={form.courseName}
              onChange={handleChange}
              placeholder="例：情報処理概論"
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">教授名</label>
              <input
                name="professorName"
                value={form.professorName}
                onChange={handleChange}
                placeholder="例：山田太郎"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">曜日・時限</label>
              <input
                name="schedule"
                value={form.schedule}
                onChange={handleChange}
                placeholder="例：月2"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
              />
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  登録中...
                </>
              ) : (
                "登録する"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};