// components/CreatePostForm.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { X, ImagePlus } from "lucide-react";
import { txtRequestErrorMessage } from "@/lib/txtRequest";

interface CreatePostFormProps {
  onPostCreated: () => void; // 投稿成功後に親コンポーネントを更新するためのコールバック
  onclose: () => void; // フォームを閉じるためのコールバック
}

interface SearchTextbook {
  id: number;
  title: string;
  price?: number | null; // この教科書の価格（seeking の必要ポイント表示に使用）
}

export default function CreatePostForm({ onPostCreated, onclose }: CreatePostFormProps) {
  const [bookTitle, setBookTitle] = useState(""); 
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<SearchTextbook | null>(null);
  const [suggestions, setSuggestions] = useState<SearchTextbook[]>([]); // 教科書のサジェストリスト
  const [bookError, setBookError] = useState(""); // 教科書未選択などのエラー表示
  // 新規教科書追加フォーム
  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookListPrice, setNewBookListPrice] = useState(""); // 定価
  const [creatingBook, setCreatingBook] = useState(false);
  const [giveType, setGiveType] = useState<"offering" | "seeking">("offering");
  const MAX_IMAGES = 4; // 画像の最大枚数
  const [imageFiles, setImageFiles] = useState<File[]>([]); // 添付する画像（最大4枚）
  const [imagePreviews, setImagePreviews] = useState<string[]>([]); // プレビュー用URL
  // 自分の利用可能ポイント（points - reserved_points）。seeking の必要ポイント判定に使用。
  const [availablePoints, setAvailablePoints] = useState<number | null>(null);

  // 自分の所持/予約ポイントを取得して利用可能残高を求める
  useEffect(() => {
    const loadPoints = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user")
        .select("points, reserved_points")
        .eq("id", user.id)
        .single();
      setAvailablePoints((data?.points ?? 0) - (data?.reserved_points ?? 0));
    };
    loadPoints();
  }, []);

  // seeking のとき、選択教科書の価格＝必要ポイント。残高不足かどうか。
  const requiredPoints = selectedBook?.price ?? null;
  const seekingInsufficient =
    giveType === "seeking" &&
    requiredPoints != null &&
    availablePoints != null &&
    availablePoints < requiredPoints;

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
        .select("id, title, price")
        .ilike("title", `%${bookTitle}%`) // 「%文字%」で含むものを探す
        .limit(5); // 多すぎても困るので最大5件

      if (!error && data) {
        setSuggestions(data);
      }
    };

    searchBooks();
  }, [bookTitle, selectedBook]);

  // 新規教科書を追加：RPC で定価×0.4 を price として登録（価格はサーバー側で計算）
  const handleCreateTextbook = async () => {
    const title = newBookTitle.trim();
    const listPrice = Number(newBookListPrice);

    if (!title) {
      alert("教科書名を入力してください。");
      return;
    }
    if (!Number.isFinite(listPrice) || listPrice <= 0) {
      alert("定価は正の数で入力してください。");
      return;
    }

    setCreatingBook(true);
    const { data: newId, error } = await supabase.rpc("create_textbook", {
      p_title: title,
      p_list_price: Math.round(listPrice),
    });
    setCreatingBook(false);

    if (error || newId == null) {
      console.error("教科書の追加に失敗しました:", error);
      alert("教科書の追加に失敗しました。");
      return;
    }

    // 追加した教科書を選択状態にする（価格はサーバーと同じ 定価×0.4 で算出して表示）
    setSelectedBook({ id: newId as number, title, price: Math.round(listPrice * 0.4) });
    setBookTitle(title);
    setSuggestions([]);
    setBookError("");
    // フォームを閉じてリセット
    setShowNewBook(false);
    setNewBookTitle("");
    setNewBookListPrice("");
  };

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


      // 教科書は DB に登録済みのものからしか選べない。
      // 候補リストから選択され、かつ入力欄と一致している場合のみ許可する。
      if (!selectedBook || selectedBook.title !== bookTitle) {
        setBookError("教科書は一覧から選択してください。");
        return;
      }
      const targetBookId: number = selectedBook.id;

      // seeking はポイント不足だと投稿不可（サーバー側 RPC でも最終チェックされる）
      if (seekingInsufficient) {
        setBookError("利用可能ポイントが不足しているため投稿できません。");
        return;
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

      // 3. RPC で投稿を作成。
      //    seeking は残高チェック＋価格分の予約（reserved_points）までアトミックに行う。
      const { error } = await supabase.rpc("create_txt_post", {
        p_give_type: giveType,
        p_textbook_id: targetBookId,
        p_description: description || null,
        p_condition_id: giveType === "offering" ? Number(conditionId) || null : null,
        p_image_urls: imageUrls.filter((u) => typeof u === "string" && u.trim() !== ""),
      });

      if (error) throw error;

      // 4. フォームをリセットしてタイムラインを再更新
      setBookTitle("");
      handleClearImages();
      onPostCreated(); // 親コンポーネント（タイムライン）を再読み込みさせる関数
      onclose(); // フォームを閉じる
    } catch (error: any) {
      console.error(error);
      alert(txtRequestErrorMessage(error?.message));
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
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-s font-bold text-gray-600">教科書名</label>
                  <button
                    type="button"
                    onClick={() => setShowNewBook(true)}
                    className="shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-3 py-1.5 shadow-sm"
                  >
                    ＋ 新規教科書追加
                  </button>
                  
                </div>
                <input
                type="text"
                value={bookTitle}
                onChange={(e) => {
                    setBookTitle(e.target.value);
                    setBookError(""); // 入力し直したらエラーを消す
                    if (selectedBook && selectedBook.title !== e.target.value) {
                      setSelectedBook(null); // 入力が変わったら選択をリセット
                    }
                }


                }
                placeholder="例: 線形代数学入門（一覧から選択）"
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
                          setBookError("");
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
              {/* 選択状態 / エラー表示 */}
              {selectedBook && selectedBook.title === bookTitle ? (
                <p className="text-xs text-green-600 font-medium">「{selectedBook.title}」を選択中</p>
              ) : (
                <p className="text-sm text-gray-400">教科書検索に登録済みの教科書から選択してください。</p>
              )}
              {bookError && (
                <p className="mt-1 text-xs text-red-500 font-medium">{bookError}</p>
              )}

              {/* 一覧に無い教科書を追加（フォーム） */}
              {showNewBook && (
                <div className="mt-2 p-3 border border-blue-200 bg-blue-50 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-gray-600">新規教科書を追加</p>
                  <input
                    type="text"
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    placeholder="教科書名"
                    className="w-full px-3 py-2 border rounded-lg text-s focus:outline-blue-500 bg-white"
                  />
                  <input
                    type="number"
                    min={0}
                    value={newBookListPrice}
                    onChange={(e) => setNewBookListPrice(e.target.value)}
                    placeholder="定価（円）"
                    className="w-full px-3 py-2 border rounded-lg text-s focus:outline-blue-500 bg-white"
                  />
                  <p className="text-sm text-red-500">
                    入力された定価は後ほど運営で確認させていただくことがあります。
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateTextbook}
                      disabled={creatingBook}
                      className="flex-1 py-2 rounded-lg font-bold text-white text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creatingBook ? "追加中..." : "追加して選択"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewBook(false);
                        setNewBookTitle("");
                        setNewBookListPrice("");
                      }}
                      className="px-4 py-2 rounded-lg font-bold text-gray-600 text-sm bg-white border border-gray-300 hover:bg-gray-50"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
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

            {/* 必要ポイント（譲ってください＝投稿主が支払う側）の案内 */}
            {giveType === "seeking" && (
              <div
                className={`mb-3 rounded-xl border p-3 text-sm ${
                  seekingInsufficient
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green-200 bg-green-50 text-green-700"
                }`}
              >
                {requiredPoints == null ? (
                  <p>教科書を選択すると、募集に必要なポイントが表示されます。</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>必要ポイント</span>
                      <span className="font-bold">{requiredPoints} pt</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>利用可能ポイント</span>
                      <span className="font-bold">
                        {availablePoints == null ? "…" : `${availablePoints} pt`}
                      </span>
                    </div>
                    {seekingInsufficient && (
                      <p className="mt-1 font-medium">
                        ポイントが不足しているため投稿できません。譲渡完了でポイントを獲得できます。
                      </p>
                    )}
                    <p className="mt-1 text-xs opacity-80">
                      ※ 募集の投稿時に必要ポイントを確保（予約）します。譲渡完了または投稿削除で解放されます。
                    </p>
                  </>
                )}
              </div>
            )}

            {/* 送信ボタン */}
            <button
                type="submit"
                disabled={loading || seekingInsufficient}
                className={`w-full py-3 rounded-xl font-bold text-white text-s  shadow-md transition-all active:scale-98 ${
                giveType === "offering" ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
                } ${loading || seekingInsufficient ? "opacity-50 cursor-not-allowed" : ""}`}
            >
                {loading ? "投稿中..." : seekingInsufficient ? "ポイント不足" : "投稿する"}
            </button>
        </form>
    </div>
  );
}