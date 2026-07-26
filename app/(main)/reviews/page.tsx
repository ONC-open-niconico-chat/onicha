"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import type { ReviewWithCourse } from "@/types/review";
import Link from "next/link";
import styles from "./reviews.module.css";

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
    if (!review.lecture) return false;
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;

    return (
      review.lecture.title.toLowerCase().includes(keyword) ||
      review.lecture.professor.toLowerCase().includes(keyword)
    );
  });

  const renderStars = (rating: number) => {
      return (
        <div className={styles.ratingBox}>
          {[1, 2, 3, 4, 5].map((num) => (
            <span
              key={num}
              className={num <= rating ? styles.starFilled : styles.starEmpty}
            >
              ★
            </span>
          ))}
          <span className={styles.ratingNumber}>{rating} / 5</span>
        </div>
      );
    };


  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <h1 className={styles.pageTitle}>授業レビュー</h1>
        <Link href="/reviews/new" className={styles.postLink}>
          <button className={styles.postButton}>レビューを投稿</button>
        </Link>
      </div>

      <input
        type="text"
        placeholder="授業名 or 教授名で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={styles.searchInput}
      />

      {loading ? (
        <p>読み込み中...</p>
      ) : filteredReviews.length === 0 ? (
        <p>レビューがありません</p>
      ) : (
        <div className={styles.reviewGrid}>
          {filteredReviews.map((review) => (
            <div key={review.id} className={styles.reviewCard}>
              <h3 className={styles.courseTitle}>{review.lecture.title}</h3>
              <p className={styles.professorName}>教授: {review.lecture.professor}</p>
              {renderStars(review.rating)}
              <p className={styles.reviewText}>{review.review_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}