"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Plus, AlertCircle } from "lucide-react";
import { PostDialog } from "@/components/post/PostDialog"; 
import { PostTabsContent } from "@/components/post/PostTabsContent";
import { Header } from "@/components/layout/Header"; 
import { HomeTabHeader } from "@/components/home/HomeTabHeader"; 
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

  // ★ 究極のソート：1分以内は絶対最優先 ＆ それ以降は「いいね順」
  const sortPostsByMixLogic = (rawPosts: any[]) => {
    const now = new Date().getTime();

    // 1. まず全ポストの時差を計算して「たった今」かどうかを判定
    const postsWithFlags = rawPosts.map(post => {
      const time = new Date(post.created_at).getTime();
      const diff = (now - time) / 1000;
      const absDiff = Math.abs(diff);

      // 1分以内、または9時間時差の前後1分以内なら「たった今」認定
      const isJustNow = absDiff < 60 || Math.abs(absDiff - 32400) < 60;

      return {
        ...post,
        isJustNow,
        time
      };
    });

    // 2. 厳密なルールで2段階ソート
    return postsWithFlags.sort((a, b) => {
      // ルール①：「たった今」の投稿がある場合は、いいね数に関係なく絶対に一番上
      if (a.isJustNow && !b.isJustNow) return -1;
      if (!a.isJustNow && b.isJustNow) return 1;

      // ルール②：両方とも「たった今」なら、その中だけで新しい順に並べる
      if (a.isJustNow && b.isJustNow) {
        return b.time - a.time;
      }

      // ルール③：どちらも1分以上経っている過去データなら、【いいねが多い順】で並び替える
      const likesA = a.number_of_likes || 0;
      const likesB = b.number_of_likes || 0;
      
      if (likesB !== likesA) {
        return likesB - likesA; // いいねが多い方を上にする
      }

      // もしいいね数が全く同じ（0個同士など）なら、投稿日時が新しい方を上にする
      return b.time - a.time;
    });
  };

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('post').select(`*, user:user_id (username, grade, department_id, appartment:department_id(faculty_id))`);
      // ★ 取得したデータを自作のミックスロジックでソートしてセット
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
    const { data, error } = await supabase.from('post').select(`*, user:user_id (username, grade, department_id, appartment:department_id(faculty_id))`).order('created_at', { ascending: false });
    if (!error && data) {
      setSchoolPosts(data.filter((p: any) => {
        if (type === "grade") return p.user?.grade === info.grade;
        if (type === "dept") return p.user?.department_id === info.department_id;
        return p.user?.appartment?.faculty_id === info.faculty_id;
      }));
    }
    setIsSchoolLoading(false);
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
        fetchPosts(); 
        if (myInfo) fetchSchoolPosts(schoolFilter);
      }, 100);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">
      <Header /> 

      <Tabs defaultValue="all" className="w-full">
        <HomeTabHeader 
          filterLabel={filterLabels[schoolFilter]} 
          isMenuOpen={isMenuOpen} 
          setIsMenuOpen={setIsMenuOpen} 
          onFilterChange={handleFilterChange} 
        /> 

        <TabsContent value="all" className="p-0 m-0">
          {errorMessage ? <div className="p-10 text-center text-red-500"><AlertCircle className="mb-2" /><p>{errorMessage}</p></div> : <PostTabsContent posts={posts} loading={isLoading} />}
        </TabsContent>

        <TabsContent value="follow" className="p-0 m-0">
          <PostTabsContent posts={[]} emptyMessage="フォロー中の投稿はありません" />
        </TabsContent>

        <TabsContent value="school" className="p-0 m-0">
          <PostTabsContent posts={schoolPosts} loading={isSchoolLoading} emptyMessage={`${filterLabels[schoolFilter]}の投稿はありません`} />
        </TabsContent>
      </Tabs>

      <PostDialog open={isPostOpen} onOpenChange={setIsPostOpen} onPost={handleAddPost} />
      <button onClick={() => setIsPostOpen(true)} className="fixed bottom-10 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center z-50 border border-blue-400">
        <Plus className="w-8 h-8" />
      </button>
    </div>
  );
}