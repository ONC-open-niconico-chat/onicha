"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import styles from "./NewReview.module.css";

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
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>レビューを書く</h1>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.searchWrapper}>
          <label className={styles.label}>授業を検索</label>
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
            className={styles.searchInput}
          />

          {/* 💡 もし検索窓に何か文字が入っていて、かつ絞り込まれた授業候補が1件以上ある場合だけ、以下の候補リストを表示する（条件分岐） */}
          {isDropdownOpen && searchQuery && filteredLectures.length > 0 && (
            <div className={styles.dropdown}>
              {filteredLectures.map((lecture) => ( // 絞り込まれた候補リスト（配列）を、`.map` を使って1件ずつの表示にループ展開する
                <div // 候補に表示される、授業1件分のクリックエリア（行）
                  key={lecture.id} // Reactが裏側でこの行を識別するために必要な、データベース上の固有の番号（ID）
                  onClick={() => {
                    setSearchQuery(`${lecture.title} / ${lecture.professor}`);
                    setSelectedLectureId(String(lecture.id)); // クリックされた授業のIDを「これが選ばれた！」と `selectedLectureId` に保存する
                    setIsDropdownOpen(false); // クリックされたらリストを閉じる
                  }}
                  className={styles.dropdownItem}
                  >
                  {lecture.title} / {lecture.professor}
                </div> 
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={styles.label}>レビュー</label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)} // ユーザーが文字を書くたびに、その内容を即座に `reviewText` に上書き保存する
            required
            rows={6}
            className={styles.textarea}
          />
        </div>

        <div>
          <label className={styles.label}>評価</label>
            <div className={styles.starContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button" // ⚠️ これを忘れるとボタンを押したときにフォームが送信されてしまいます
                  // 今選ばれている数（Number(rating)）以上の星は「空の星」、以下の星は「塗られた星」のクラスを当てる
                  className={star <= Number(rating) ? styles.starFilled : styles.starEmpty}
                  onClick={() => setRating(String(star))}
                >
                  ★
                </button>
              ))}
              <span className={styles.ratingText}>{rating} / 5</span>
            </div>
        </div>

        <button type="submit" disabled={loading || !selectedLectureId} className={styles.submitButton}>
          {loading ? "保存中..." : "保存する"}
        </button>

        {message && <p className={styles.message}>{message}</p>}
      </form>
    </div>
  );
}