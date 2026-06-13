'use client'

import { useEffect, useState } from "react";
import { PostCard } from "@/components/txtPostCard";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";


export interface Post {
  id: number;
  user: {
    id: number;
    username: string;
    icon_src: string;
  };

  book: {
    id:number;
    title:string;
  }

  condition: {
    id:number;
    name:string;
  }
  description: string;
  give_type: "offering" | "seeking";
  created_at: string;
}


export default function TxtPostPage() {
    
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    //データ取得用の関数
    const fetchPosts = async () => {
        setLoading(true);

        const {data,error} = await supabase
        .from('txt_post') 
        .select(`
            id,
            user:"user" (  
            id,
            username,
            icon_src
            ),
            book:"textbook" (     
            id,
            title
            ),
            condition:"txtbook_condition" (
            id,
            name
            ),
            description,
            give_type,
            created_at
            
            

        `)
        .order('created_at',{ascending:false})

        if (error) {
            console.error("データ取得エラー:",error);
        } else if(data) {
        const formattedPosts: Post[] = data.map((item: any) => {

            const postDate = new Date(item.created_at);

            // 「今からどれくらい前か」を日本語で計算
            const relativeTime = formatDistanceToNow(postDate, {
                addSuffix: true, // 「〜前」という言葉を付ける
                locale: ja,      // 日本語に設定
            });
        
            // 日付オブジェクトを作成（自動的にブラウザのローカル時間、日本時間に）
            const date = new Date(item.created_at);
            
            // 読みやすい形式に変換（例：2026/05/12 15:42）
            const formattedDate = date.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });

            return {
                ...item,
                user: Array.isArray(item.user) ? item.user[0] : item.user,
                book: Array.isArray(item.book) ? item.book[0] : item.book,
                condition: Array.isArray(item.condition) ? item.condition[0] : item.condition,
                // ここで変換後の日付を入れる！
                created_at: relativeTime
            };
        });
        setPosts(formattedPosts);
        console.log("データ",formattedPosts);
        setLoading(false);
            };
        
    }
    fetchPosts();
  },[]);

  if (loading) return <div>読み込み中...</div>


  
  

  

  return (
    <div>
      <div className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="border-b border-gray-200 flex items-center justify-center py-4 text-xl font-bold sticky top-0 bg-white z-10">
        教科書ポスト
        </div>
        <div className="flex border-t border-gray-200">
          <button className="flex-1 py-3 hover:bg-gray-100 transition-colors border-b-2 border-blue-600 text-blue-600 font-medium">
            すべて
          </button>
          <button className="flex-1 py-3 hover:bg-gray-100 transition-colors text-gray-600">
            譲ります
          </button>
          <button className="flex-1 py-3 hover:bg-gray-100 transition-colors text-gray-600">
            譲ってください
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {posts.map((post) => (
          <PostCard key={post.id} txtpost={post}  />
        ))}
      </div>
    </div>
  );
}