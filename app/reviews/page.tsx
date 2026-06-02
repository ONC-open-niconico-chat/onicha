"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import type { ReviewWithCourse } from "@/types/review";

export default function ReviewsPage() {
  const [query, setQuery] = useState("");
  const [reviews, setReviews] = useState<ReviewWithCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReviews() {
      setLoading(true);

      const { data, error } = await supabase
        .from("reviews")
        .select(`
          *,
          lecture:course_id (
            title,
            professor
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("レビュー取得エラー:", error);
        setLoading(false);
        return;
      }

      setReviews((data ?? []) as ReviewWithCourse[]);
      setLoading(false);
    }

    fetchReviews();
  }, []);

  const filteredReviews = reviews.filter((review) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;

    return (
      review.lecture.title.toLowerCase().includes(keyword) ||
      review.lecture.professor.toLowerCase().includes(keyword)
    );
  });

  return (
    <div style={{ padding: "24px" }}>
      <h1>授業レビュー</h1>

      <input
        type="text"
        placeholder="授業名 or 教授名で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "10px 12px",
          marginBottom: "20px",
        }}
      />

      {loading ? (
        <p>読み込み中...</p>
      ) : filteredReviews.length === 0 ? (
        <p>レビューがありません</p>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {filteredReviews.map((review) => (
            <div
              key={review.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <p><strong>授業名:</strong> {review.lecture.title}</p>
              <p><strong>教授名:</strong> {review.lecture.professor}</p>
              <p><strong>評価:</strong> {review.rating} / 5</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{review.review_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}