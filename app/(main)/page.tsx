"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Plus, AlertCircle } from "lucide-react";
import { PostDialog } from "@/app/(main)/homecomponent/post/PostDialog"; 
import { PostTabsContent } from "@/app/(main)/homecomponent/post/PostTabsContent";
import { FollowingTimeline } from "@/app/(main)/homecomponent/post/FollowingTimeline"; 
import { Header } from "@/app/(main)/homecomponent/layout/Header"; 
import { HomeTabHeader } from "@/app/(main)/homecomponent/home/HomeTabHeader"; 
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [schoolPosts, setSchoolPosts] = useState<any[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [isSchoolLoading, setIsSchoolLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [myInfo, setMyInfo] = useState<{ grade: number; department_id: number; faculty_id: number } | null>(null);
  const [schoolFilter, setSchoolFilter] = useState<"grade" | "dept" | "faculty">("grade");
  
  const filterLabels = { grade: "同学年", dept: "同学科", faculty: "同学部" };

  // 時差バグを完全修正した決定版
  const sortPostsByMixLogic = (rawPosts: any[]) => {
    const now = new Date().getTime();

    // 1. 各ポストが本当に「1分以内の新規投稿」か厳密に判定
    const postsWithFlags = rawPosts.map(post => {
      const time = new Date(post.created_at).getTime();
      
      // 純粋な経過秒数
      const diffInSeconds = (now - time) / 1000;
      
      // データベース（UTC）とクライアント（JST）の9時間ズレを補正した秒数
      const diffInSecondsAdjusted = diffInSeconds - 32400;

      // 未来方向への誤判定を防ぎつつ、「0秒〜60秒の間」のみをターゲットにする
      const isJustNow = 
        (diffInSeconds >= 0 && diffInSeconds < 60) || 
        (diffInSecondsAdjusted >= 0 && diffInSecondsAdjusted < 60);

      return {
        ...post,
        isJustNow,
        time
      };
    });

    // 2. 厳密なルールで2段階ソート
    return postsWithFlags.sort((a, b) => {
      if (a.isJustNow && !b.isJustNow) return -1;
      if (!a.isJustNow && b.isJustNow) return 1;

      if (a.isJustNow && b.isJustNow) {
        return b.time - a.time;
      }

      const likesA = a.number_of_likes || 0;
      const likesB = b.number_of_likes || 0;
      
      if (likesB !== likesA) {
        return likesB - likesA; 
      }

      return b.time - a.time;
    });
  };

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('post').select(`*, user:user_id (username, grade, department_id, appartment:department_id(faculty_id))`);
      if (!error) setPosts(sortPostsByMixLogic(data || []));
    } catch (e) { setErrorMessage("通信に失敗しました"); } finally { setIsLoading(false); }
  };

  const fetchMyInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user').select(`grade, department_id, appartment:department_id(faculty_id)`).eq('id', user.id).single();
    if (data) setMyInfo({ grade: data.grade, department_id: data.department_id, faculty_id: (data.appartment as any)?.faculty_id || 0 });
  };

  const fetchSchoolPosts = async (type: "grade" | "dept" | "faculty", info = myInfo) => {
    if (!info) return;
    setIsSchoolLoading(true);
    const { data, error } = await supabase.from('post').select(`*, user:user_id (username, grade, department_id, appartment:department_id(faculty_id))`);
    if (!error && data) {
      const filtered = data.filter((p: any) => {
        if (type === "grade") return p.user?.grade === info.grade;
        if (type === "dept") return p.user?.department_id === info.department_id;
        return p.user?.appartment?.faculty_id === info.faculty_id;
      });
      setSchoolPosts(sortPostsByMixLogic(filtered));
    }
    setIsSchoolLoading(false);
  };

  // ★ 追加：全データを最新の状態で再フェッチし、同期させる関数
  const mutateAll = () => {
    fetchPosts();
    if (myInfo) fetchSchoolPosts(schoolFilter, myInfo);
  };

  useEffect(() => { fetchPosts(); fetchMyInfo(); }, []);
  useEffect(() => { if (myInfo) fetchSchoolPosts(schoolFilter, myInfo); }, [myInfo]);

  const handleFilterChange = (type: "grade" | "dept" | "faculty") => {
    setSchoolFilter(type);
    fetchSchoolPosts(type);
    setIsMenuOpen(false);
  };

  const handleAddPost = async (content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const exactNow = new Date().toISOString();

    const { error } = await supabase.from('post').insert([{ user_id: user.id, content, number_of_likes: 0, created_at: exactNow }]);
    if (!error) { 
      setIsPostOpen(false); 
      setTimeout(() => {
        mutateAll();
      }, 100);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">
      <Header /> 

      {/* ★ タブ変更時にも一斉フェッチをトリガー */}
      <Tabs 
        defaultValue="all" 
        className="w-full"
        onValueChange={() => {
          mutateAll();
        }}
      >
        <HomeTabHeader 
          filterLabel={filterLabels[schoolFilter]} 
          isMenuOpen={isMenuOpen} 
          setIsMenuOpen={setIsMenuOpen} 
          onFilterChange={handleFilterChange} 
        /> 

        <TabsContent value="all" className="p-0 m-0">
          {errorMessage ? (
            <div className="p-10 text-center text-red-500"><AlertCircle className="mb-2" /><p>{errorMessage}</p></div>
          ) : (
            <PostTabsContent posts={posts} loading={isLoading} onRefresh={mutateAll} />
          )}
        </TabsContent>

        <TabsContent value="follow" className="p-0 m-0">
          <FollowingTimeline sortLogic={sortPostsByMixLogic} />
        </TabsContent>

        <TabsContent value="school" className="p-0 m-0">
          <PostTabsContent posts={schoolPosts} loading={isSchoolLoading} emptyMessage={`${filterLabels[schoolFilter]}の投稿はありません`} onRefresh={mutateAll} />
        </TabsContent>
      </Tabs>

      <PostDialog open={isPostOpen} onOpenChange={setIsPostOpen} onPost={handleAddPost} />
      <button onClick={() => setIsPostOpen(true)} className="fixed bottom-10 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center z-50 border border-blue-400">
        <Plus className="w-8 h-8" />
      </button>
    </div>
  );
}