"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ImageWithFallback } from '../../../components/profile/ImageWithFallback';
import { Avatar } from '@mui/material';
import { Heart, MessageCircle, Repeat2, Share, Settings, LogOut } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import EditProfile from '../editprofile/page';

interface UserProfile {
  id: string;
  username: string;
  grade: number;
  department_id: string | number;
  icon_src: string;
  cover_src: string; // ⭕ 1. 型定義に cover_src を追加
  bio: string;
}

export default function App() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('posts');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true);

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          router.push('/login');
          return;
        }

        // Supabaseから cover_src も一緒に取得
        const { data, error } = await supabase
          .from('user')
          .select('id, username, grade, department_id, icon_src, cover_src, bio')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error("❌ データベース検索エラー:", error.message);
        }
        if (data) {
          setProfile({
            ...data,
            bio: data.bio || '',
            cover_src: data.cover_src || '' // 空なら空文字をセット
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ⭕ 2. 保存関数で coverFile も受け取ってアップデートするよう拡張
  const handleSaveProfile = async (
    newUsername: string, 
    newGrade: number, 
    newBio: string, 
    imageFile: File | null,
    coverFile: File | null // ⭕ 追加
  ) => {
    if (!profile) return;

    try {
      let uploadedIconUrl = profile.icon_src;
      let uploadedCoverUrl = profile.cover_src;

      // アバター画像のアップロード処理
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `icon-${profile.id}-${Date.now()}.${fileExt}`;
        const filePath = `icons/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatar')
          .upload(filePath, imageFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatar')
          .getPublicUrl(filePath);

        uploadedIconUrl = publicUrl;
      }

      // ⭕ カバー画像（背景）のアップロード処理を追加
      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `cover-${profile.id}-${Date.now()}.${fileExt}`;
        const filePath = `covers/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatar')
          .upload(filePath, coverFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatar')
          .getPublicUrl(filePath);

        uploadedCoverUrl = publicUrl;
      }

      // データベースの更新 (cover_srcも追加)
      const { error: updateError } = await supabase
        .from('user')
        .update({
          username: newUsername,
          grade: newGrade,
          bio: newBio,
          icon_src: uploadedIconUrl,
          cover_src: uploadedCoverUrl // ⭕ 保存
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      // 画面の表示を更新
      setProfile({
        ...profile,
        username: newUsername,
        grade: newGrade,
        bio: newBio,
        icon_src: uploadedIconUrl,
        cover_src: uploadedCoverUrl
      });
      setIsEditing(false);
    } catch (error: any) {
      console.error('プロフィール更新エラー:', error.message);
      alert('プロフィールの更新に失敗しました。');
      throw error;
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

  // ⭕ 各項目ごとに安全にデータを展開（null / 空文字の時はデフォルト画像URLを出す）
  const displayProfile = {
    username: profile?.username || 'データ未取得',
    grade: profile?.grade || 0,
    department_id: profile?.department_id || '-',
    icon_src: profile?.icon_src || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    cover_src: profile?.cover_src || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', // デフォルト背景
    bio: profile?.bio || 'プロフィールは未設定です。'
  };

  // ⭕ 3. <EditProfile /> に不足していた新しいPropsを渡す
  if (isEditing && profile) {
    return (
      <EditProfile
        initialUsername={profile.username}
        initialGrade={profile.grade}
        iconSrc={displayProfile.icon_src}
        initialCoverSrc={displayProfile.cover_src} // ⭕ 追加
        initialBio={displayProfile.bio}
        onClose={() => setIsEditing(false)}
        onSave={handleSaveProfile}
      />
    );
  }

  return (
    <div className="size-full bg-white overflow-auto text-gray-900 selection:bg-blue-100">
      <div className="max-w-2xl mx-auto border-x border-gray-100 min-h-screen">
        
        {/* ヘッダー */}
        <div className="relative">
          <ImageWithFallback
            src={displayProfile.cover_src} // ⭕ 保存された背景URLを表示
            alt="Cover"
            className="w-full h-48 sm:h-52 object-cover bg-gray-200"
          />
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
          <button 
            onClick={handleLogout}
            className="h-9 px-4 rounded-full border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-1.5"
          >
            <LogOut size={16} />
            ログアウト
          </button>

          <button 
            onClick={() => setIsEditing(true)}
            className="h-9 px-4 rounded-full border border-gray-300 text-sm font-bold hover:bg-gray-100 transition flex items-center gap-2"
          >
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
            {displayProfile.bio}
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
