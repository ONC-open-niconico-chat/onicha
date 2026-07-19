"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PostTabsContent } from "./PostTabsContent";
import { useAuth } from "@/components/loginUser";

interface FollowingTimelineProps {
  // 親（page.tsx）の最強ソートロジックをここでも使い回せるように関数として受け取る
  sortLogic?: (rawPosts: any[]) => any[];
}

export function FollowingTimeline({ sortLogic }: FollowingTimelineProps) {
  const { authUser, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setPosts([]);
      setLoading(false);
      return;
    }
    const currentUserId = authUser.id;

    const fetchFollowingPosts = async () => {
      setLoading(true);
      try {
        // 1. 自分がフォローしている人のIDリストを取得
        const { data: followData, error: followError } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUserId);

        if (followError) throw followError;

        // フォローしている人が誰もいない場合
        if (!followData || followData.length === 0) {
          setPosts([]);
          return;
        }

        const followingIds = followData.map((row) => row.following_id);

        // 2. その人たちの投稿だけを絞り込んで取得
        const { data: followingPosts, error: postsError } = await supabase
          .from("post")
          .select(`*, user:user_id (username, grade, department_id, appartment:department_id(faculty_id))`);

        if (postsError) throw postsError;

        // フォローしているユーザーの投稿だけにフィルター
        const filteredPosts = (followingPosts || []).filter((p: any) => 
          followingIds.includes(p.user_id)
        );

        // 3. 親からソートロジックが渡されていれば適用、なければ通常の新着順
        if (sortLogic) {
          setPosts(sortLogic(filteredPosts));
        } else {
          filteredPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setPosts(filteredPosts);
        }
      } catch (error) {
        console.error("フォロー中の投稿取得に失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFollowingPosts();
  }, [sortLogic, authUser, authLoading]);

  return (
    <PostTabsContent 
      posts={posts} 
      loading={loading} 
      emptyMessage="フォロー中のユーザーの投稿がありません。誰かをフォローしてみましょう！" 
    />
  );
}