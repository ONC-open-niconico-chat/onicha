"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";


export default function NewReviewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [professor, setProfessor] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState("5");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lectures, setLectures] = useState<{ id: number; title: string; professor: string }[]>([]);
  const [selectedLectureId, setSelectedLectureId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
      async function fetchLectures() {
      const { data, error } = await supabase
          .from("lecture")
          .select("id, title, professor")
          .order("title", { ascending: true });
      if (error) {
          console.error(error);
          return;
      }
      setLectures(data ?? []);
      }
      fetchLectures();
  }, []);

   // 絞り込まれた新しいリストが、リアルタイムに `filteredLectures` に格納される
  const filteredLectures = lectures.filter((lecture) => {
    // もし lecture 自体が存在しない場合はスキップ
    if (!lecture) return false;

    // null だった場合は代わりに空文字 "" を使うようにガードをかける
    const title = lecture.title || "";
    const professor = lecture.professor || "";

    return (
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      professor.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // 保存ボタンがクリックされたときの処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

  // `reviews` テーブルに新しいレビューを挿入
    const { error } = await supabase.from("reviews").insert([
      {
        course_id: Number(selectedLectureId),
        review_text: reviewText,
        rating: Number(rating),
      },
    ]);

    setLoading(false);

    // エラーが発生した場合は、エラーメッセージをコンソールに出力し、ユーザーに通知
    if (error) {
      console.error("エラーのメッセージ:", error.message);
      console.error("エラーの名前:", error.name);
      console.error("エラーの生データ:", String(error));
      setMessage("保存に失敗しました");
      return;
    }

    setMessage("レビューを保存しました");
    router.push("/reviews");
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>レビューを書く</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16, maxWidth: 600 }}>
        <div>
          <label>授業を検索</label>
          <input 
            type="text"
            placeholder="授業名または教授名で検索" 
            value={searchQuery} // この検索窓に表示する文字は、Reactの `searchQuery` の箱と常に連動させる
            onChange={(e) => {
              setSearchQuery(e.target.value); // ユーザーがキーボードを叩くたびに、その文字を即座に `searchQuery` の箱に上書き保存する
              setIsDropdownOpen(true); // 👈 入力されたらリストを開く
              if (selectedLectureId) setSelectedLectureId(""); // 打ち直したらリセット
            }}
            onFocus={() => setIsDropdownOpen(true)} // 👈 クリックした時もリストを開く
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />

          {/* 💡 もし検索窓に何か文字が入っていて、かつ絞り込まれた授業候補が1件以上ある場合だけ、以下の候補リストを表示する（条件分岐） */}
          {isDropdownOpen && searchQuery && filteredLectures.length > 0 && (
            <div style={{ border: "1px solid #ddd", borderRadius: 4, maxHeight: 200, overflow: "auto" }}>
              {filteredLectures.map((lecture) => ( // 絞り込まれた候補リスト（配列）を、`.map` を使って1件ずつの表示にループ展開する
                <div // 候補に表示される、授業1件分のクリックエリア（行）
                  key={lecture.id} // Reactが裏側でこの行を識別するために必要な、データベース上の固有の番号（ID）
                  onClick={() => {
                    setSearchQuery(`${lecture.title} / ${lecture.professor}`);
                    setSelectedLectureId(String(lecture.id)); // クリックされた授業のIDを「これが選ばれた！」と `selectedLectureId` に保存する
                    setIsDropdownOpen(false); // クリックされたらリストを閉じる
                  }}
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f0f0")} // マウスがこの行の上に乗った瞬間、背景を薄いグレーにして「選べそう」と視覚的に伝える
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")} // マウスが離れたら、背景色を元の白に戻す
                  >
                  {lecture.title} / {lecture.professor}
                </div> 
              ))}
            </div>
          )}
        </div>





        <div>
          <label>レビュー</label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)} // ユーザーが文字を書くたびに、その内容を即座に `reviewText` に上書き保存する
            required
            rows={6}
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <div>
          <label>評価</label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}// 別の数字が選ばれたら、その数字を `rating` の箱に上書き保存する
            style={{ width: "100%", padding: 8 }}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>

        <button type="submit" disabled={loading || !selectedLectureId}>
          {loading ? "保存中..." : "保存する"}
        </button>

        {message && <p>{message}</p>}
      </form>
    </div>
  );
}