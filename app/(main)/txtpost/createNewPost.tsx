// components/CreatePostForm.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { X, ImagePlus } from "lucide-react";

interface CreatePostFormProps {
  onPostCreated: () => void; // 投稿成功後に親コンポーネントを更新するためのコールバック
  onclose: () => void; // フォームを閉じるためのコールバック
}

interface SearchTextbook {
  id: number;
  title: string;
}

export default function CreatePostForm({ onPostCreated, onclose }: CreatePostFormProps) {
  const [bookTitle, setBookTitle] = useState(""); 
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<SearchTextbook | null>(null);
  const [suggestions, setSuggestions] = useState<SearchTextbook[]>([]); // 教科書のサジェストリスト
  const [giveType, setGiveType] = useState<"offering" | "seeking">("offering");
  const MAX_IMAGES = 4; // 画像の最大枚数
  const [imageFiles, setImageFiles] = useState<File[]>([]); // 添付する画像（最大4枚）
  const [imagePreviews, setImagePreviews] = useState<string[]>([]); // プレビュー用URL

  // 画像が選択されたときの処理（既存の選択に追加、最大4枚まで）
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const remaining = MAX_IMAGES - imageFiles.length;
    if (remaining <= 0) {
      alert(`画像は最大${MAX_IMAGES}枚までです。`);
      return;
    }
    if (selected.length > remaining) {
      alert(`画像は最大${MAX_IMAGES}枚までです。${remaining}枚だけ追加します。`);
    }

    const toAdd = selected.slice(0, remaining);
    setImageFiles((prev) => [...prev, ...toAdd]);
    setImagePreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);

    // 同じファイルを選び直せるように input をリセット
    e.target.value = "";
  };

  // 選択した画像を1枚取り消す
  const handleRemoveImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // 画像の選択をすべてクリア
  const handleClearImages = () => {
    setImageFiles([]);
    setImagePreviews([]);
  };




  // ユーザーが文字を入力するたびにSupabaseから検索
  useEffect(() => {
    const searchBooks = async () => {
      if (!bookTitle.trim() || selectedBook?.title === bookTitle) {
        setSuggestions([]);
        return;
      }

      // Supabaseの ilike（大文字小文字を区別しない部分一致）で検索！
      const { data, error } = await supabase
        .from("textbook")
        .select("id, title")
        .ilike("title", `%${bookTitle}%`) // 「%文字%」で含むものを探す
        .limit(5); // 多すぎても困るので最大5件

      if (!error && data) {
        setSuggestions(data);
      }
    };

    searchBooks();
  }, [bookTitle, selectedBook]);

  const handleSubmit = async (formData: FormData) => {
    const description = formData.get("description") as string;
    const conditionId = formData.get("condition_id") as string;



    setLoading(true);

    try {
      // 1. 現在ログインしているユーザーのIDを取得
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("ログインセッションが切れました。再ログインしてください。");
        return;
      }


      let targetBookId: number;

      if (selectedBook && selectedBook.title === bookTitle) {
        //パターンA:候補から選ばれた本、または既存の本と完全一致する場合
        targetBookId = selectedBook.id;
      } else {
        //パターンB:新しい本を投稿する場合は、まずtextbookテーブルに追加してからそのIDを取得
        const { data: newBook, error: bookError } = await supabase
          .from("textbook")
          .insert({ title: bookTitle })
          .select("id")
          .single();

        if (bookError) throw bookError;
        targetBookId = newBook.id;
      }

      // 2.5 画像が選ばれていれば images バケットにアップロードして公開URLを取得（最大4枚）
      const imageUrls: string[] = [];
      for (const file of imageFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("txt_post_images")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
          .from("txt_post_images")
          .getPublicUrl(filePath);
        imageUrls.push(publicUrl);
      }

      // 3. txt_post テーブルにインサート
      const { error } = await supabase
        .from("txt_post")
        .insert([
          {
            give_type: giveType,
            user_id: user.id, // ログイン中のユーザーID
            textbook_id: targetBookId, // ここはDBの設計に合わせて調整
            description: description,
            status: "募集中",
            condition_id: Number(conditionId) || null,
            image_urls: imageUrls,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;

      // 4. フォームをリセットしてタイムラインを再更新
      setBookTitle("");
      handleClearImages();
      onPostCreated(); // 親コンポーネント（タイムライン）を再読み込みさせる関数
      onclose(); // フォームを閉じる
    } catch (error: any) {
      console.error(error);
      alert(`投稿に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <form action={handleSubmit} className="relative bg-white w-full max-w-2xl p-6 rounded-2xl border border-gray-200 mb-6 shadow-sm">
            {/* 閉じる（×）ボタン */}
            <button
            type="button"
            onClick={onclose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
            >
            <X className="h-8 w-8 text-white bg-red-400  p-1.5" strokeWidth={3} />
            </button>
            <h3 className="font-bold text-lg mb-3">教科書譲渡ポスト</h3>
            
            {/* 譲る or 探す の切り替えタブ */}
            <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-xl">
                <button
                type="button"
                onClick={() => setGiveType("offering")}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                    giveType === "offering" ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-200"
                }`}
                >
                譲ります（出品）
                </button>
                <button
                type="button"
                onClick={() => setGiveType("seeking")}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                    giveType === "seeking" ? "bg-green-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-200"
                }`}
                >
                譲ってください（募集）
                </button>
            </div>

            {/* 教科書名入力 */}
            <div className="mb- relative w-full">
                <label className="block text-s font-bold text-gray-600 mb-3">教科書名</label>
                <input
                type="text"
                value={bookTitle}
                onChange={(e) => {
                    setBookTitle(e.target.value);
                    if (selectedBook && selectedBook.title !== e.target.value) {
                      setSelectedBook(null); // 入力が変わったら選択をリセット
                    }
                }
                 
                  
                }
                placeholder="例: 線形代数学入門"
                className="w-full px-3 py-2 border rounded-xl text-s focus:outline-blue-500 mb-2"
                required
                />
              {/* ─── 検索候補のリスト表示 ─── */}
              {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {suggestions.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setBookTitle(book.title);
                          setSelectedBook(book);
                          setSuggestions([]); // リストを閉じる
                        }}
                        className="w-full  text-left px-4 py-2 text-sm hover:bg-gray-50 font-medium text-gray-700 transition-colors"
                      >
                       {book.title} <span className="text-xs text-gray-400 font-normal"></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )} 
            </div>


            {/* 状態選択 */}
            {giveType === "offering" && (
            <div className="mb-3">
                <label className="block text-s font-bold text-gray-600 mb-3">本の状態</label>
                <select
                name="condition_id"
                className="w-full px-3 py-2 border rounded-xl text-s bg-white focus:outline-blue-500"
                required
                >
                <option value="1">新品に近い</option>
                <option value="2">目立った汚れなし</option>
                <option value="3">少し汚れがある</option>
                <option value="4">非常に悪い</option>
                </select>
            </div>
            )}

            {/* 説明文入力 */}
            <div className="mb-4">
                <label className="block text-s font-bold text-gray-600 mb-1">説明や要望</label>
                <textarea
                name="description"

                rows={3}
                className="w-full px-3 py-2 border rounded-xl text-s focus:outline-blue-500 resize-none"
                />
            </div>

            {/* 画像添付（最大4枚） */}
            <div className="mb-4">
                <label className="block text-s font-bold text-gray-600 mb-1">
                    画像（任意・最大{MAX_IMAGES}枚）
                </label>
                <div className="flex flex-wrap gap-2">
                    {imagePreviews.map((preview, index) => (
                        <div key={index} className="relative">
                            <img
                                src={preview}
                                alt={`プレビュー${index + 1}`}
                                className="h-24 w-24 object-cover rounded-xl border border-gray-200"
                            />
                            <button
                                type="button"
                                onClick={() => handleRemoveImage(index)}
                                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"
                                title="画像を削除"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ))}

                    {imageFiles.length < MAX_IMAGES && (
                        <label className="flex flex-col items-center justify-center gap-1 h-24 w-24 cursor-pointer border border-dashed border-gray-300 rounded-xl text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                            <ImagePlus className="h-6 w-6" />
                            画像を追加
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageChange}
                                className="hidden"
                            />
                        </label>
                    )}
                </div>
            </div>

            {/* 送信ボタン */}
            <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-xl font-bold text-white text-s  shadow-md transition-all active:scale-98 ${
                giveType === "offering" ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
                {loading ? "投稿中..." : "投稿する"}
            </button>
        </form>
    </div>
  );
}