// lib/mock-db.ts
export interface Post {
  id: number;
  user_id: number;
  content: string;
  image_url: string | null;
  created_at: string;
  number_of_likes: number;
}

export const INITIAL_POSTS: Post[] = [
  {
    id: 1,
    user_id: 101,
    content: "初めての投稿です！このER図をもとに開発を進めています。",
    image_url: null,
    created_at: "2026-04-28 10:00",
    number_of_likes: 3,
  },
];