"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ImageWithFallback } from '../../../components/profile/ImageWithFallback';
import { Avatar } from '@mui/material';
import { Heart, MessageCircle, Repeat2, Share, Settings, LogOut } from 'lucide-react'; // ⭕ LogOutアイコンを追加
import * as Tabs from '@radix-ui/react-tabs';

interface UserProfile {
  id: string;
  username: string;
  grade: number;
  department_id: string | number;
  icon_src: string;
}

export default function App() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('posts');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true);

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          console.log("未ログインのため、ログイン画面へ遷移します");
          router.push('/login');
          return;
        }

        const { data, error } = await supabase
          .from('user')
          .select('id, username, grade, department_id, icon_src')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error("❌ データベース検索エラー:", error.message);
        }
        if (data) setProfile(data);
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [router]);

  // ⭕ ログアウト処理を追加
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('ログアウトエラー:', error.message);
    } else {
      // 成功したらログイン画面に飛ばす
      router.push('/login');
    }
  };

  const posts = [
    {
      id: 1,
      text: '今日は天気が良かったので近所の公園を散歩してきました。桜が綺麗でした🌸',
      time: '2時間前',
      likes: 342,
      retweets: 23,
      comments: 12
    }
  ];

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500 font-medium">読み込み中...</div>;
  }

  const displayProfile = profile || {
    username: 'データ未取得',
    grade: 0,
    department_id: '-',
    icon_src: 'https://unsplash.com'
  };

  return (
    <div className="size-full bg-white overflow-auto text-gray-900 selection:bg-blue-100">
      <div className="max-w-2xl mx-auto border-x border-gray-100 min-h-screen">
        
        {/* ヘッダー */}
        <div className="relative">
          <ImageWithFallback
            src="https://unsplash.com"
            alt="Cover"
            className="w-full h-48 sm:h-52 object-cover bg-gray-200"
          />
          {/* アバター */}
          <div className="absolute -bottom-16 left-4 sm:left-6">
            <Avatar
              src={displayProfile.icon_src}
              sx={{ 
                width: { xs: 96, sm: 136 }, 
                height: { xs: 96, sm: 136 }, 
                border: '4px solid white',
                backgroundColor: '#e5e7eb'
              }}
            />
          </div>
        </div>

        {/* ボタンエリア */}
        <div className="flex justify-end pt-3 pr-4 sm:pr-6 h-16 gap-2">
          {/* ⭕ ログアウトボタンを追加 */}
          <button 
            onClick={handleLogout}
            className="h-9 px-4 rounded-full border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-1.5"
          >
            <LogOut size={16} />
            ログアウト
          </button>

          <button className="h-9 px-4 rounded-full border border-gray-300 text-sm font-bold hover:bg-gray-100 transition flex items-center gap-2">
            <Settings size={16} />
            プロフィール編集
          </button>
        </div>

        {/* ユーザープロフィール詳細 */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="mb-3">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">
              {displayProfile.username}
            </h1>
            <div className="flex gap-2 mt-1.5 text-xs font-semibold text-gray-500">
              <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                {displayProfile.grade}年生
              </span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                所属ID: {displayProfile.department_id}
              </span>
            </div>
          </div>

          <p className="text-[15px] leading-relaxed mb-3 whitespace-pre-wrap text-gray-600">
            写真と旅行が好きです 📸 | 自然の美しさを記録しています | 東京在住 🗼
          </p>

          <div className="flex gap-5 text-sm text-gray-500">
            <span className="hover:underline cursor-pointer"><span className="font-bold text-gray-950">142</span> フォロー中</span>
            <span className="hover:underline cursor-pointer"><span className="font-bold text-gray-950">1,205</span> フォロワー</span>
          </div>
        </div>

        {/* タブ */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="flex border-b border-gray-200 w-full">
            {[
              { id: 'posts', label: 'ツイート' },
              { id: 'replies', label: '返信' },
              { id: 'media', label: 'メディア' },
            ].map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                className="flex-1 py-3.5 text-center text-[15px] font-medium text-gray-500 transition-colors relative hover:bg-gray-900/5 data-[state=active]:font-bold data-[state=active]:text-gray-900"
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-blue-500 rounded-full" />
                )}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="posts">
            <div className="divide-y divide-gray-200">
              {posts.map((post) => (
                <div key={post.id} className="p-4 hover:bg-gray-50/50 cursor-pointer transition flex gap-3">
                  <Avatar src={displayProfile.icon_src} sx={{ width: 40, height: 40 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
                      <span className="font-bold hover:underline">{displayProfile.username}</span>
                      <span className="text-gray-500 text-sm">·</span>
                      <span className="text-gray-500 text-sm hover:underline">{post.time}</span>
                    </div>
                    <p className="text-[15px] leading-normal mb-3 whitespace-pre-wrap">{post.text}</p>
                    
                    <div className="flex justify-between max-w-md text-gray-500 text-sm -ml-2">
                      <button className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition">
                        <MessageCircle size={18} className="group-hover:bg-blue-50 rounded-full transition" />
                        <span className="text-xs">{post.comments}</span>
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-green-500 group p-2 rounded-full transition">
                        <Repeat2 size={18} className="group-hover:bg-green-50 rounded-full transition" />
                        <span className="text-xs">{post.retweets}</span>
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-red-500 group p-2 rounded-full transition">
                        <Heart size={18} className="group-hover:bg-red-50 rounded-full transition" />
                        <span className="text-xs">{post.likes}</span>
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition">
                        <Share size={18} className="group-hover:bg-blue-50 rounded-full transition" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Tabs.Content>

          <Tabs.Content value="replies">
            <div className="py-20 text-center text-sm text-gray-500">返信がここに表示されます</div>
          </Tabs.Content>

          <Tabs.Content value="media">
            <div className="py-20 text-center text-sm text-gray-500">メディアがここに表示されます</div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
