// レビューデータの型
export interface Review {
  id: string;
  course_id: number;
  review_text: string;
  rating: number;
  created_at: string;
}

// レビュー＋授業情報を合わせた型（一覧表示用）
export interface ReviewWithCourse extends Review {
  lecture: {
    title: string;
    professor: string;
  };
}