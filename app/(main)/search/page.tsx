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

  // 1. 全体の投稿（おすすめ）を取得：【単純な投稿が新しい順】にソート
  const fetchPosts = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('post')
        .select(`*, user:user_id (username, grade, department_id, appartment:department_id(faculty_id))`)
        // ★ データベース側で新着順（created_at の降順）に並び替えて取得
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMessage(`データの取得に失敗しました: ${error.message}`);
      } else {
        setPosts(data || []);
      }
    } catch (e: any) {
      setErrorMessage("通信に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 自分の所属情報を取得
  const fetchMyInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user').select(`grade, department_id, appartment:department_id(faculty_id)`).eq('id', user.id).single();
    if (data) setMyInfo({ grade: data.grade, department_id: data.department_id, faculty_id: (data.appartment as any)?.faculty_id || 0 });
  };

  // 3. 学内フィルターに応じた投稿を取得
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

  // 4. 新規投稿処理：余計なウェイトを無くして即時リロード
  const handleAddPost = async (content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('post').insert([{ 
      user_id: user.id, 
      content, 
      number_of_likes: 0, 
      created_at: new Date().toISOString() 
    }]);
    
    if (!error) { 
      setIsPostOpen(false); 
      fetchPosts(); // 投稿直後に即最新データを再取得
      if (myInfo) fetchSchoolPosts(schoolFilter);
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