"use client";

import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ImageWithFallback } from '../../../../components/profile/ImageWithFallback';
import { Avatar } from '@mui/material';
import { Heart, MessageCircle, Repeat2, Share, Settings, LogOut, Image, Send } from 'lucide-react'; // 💡 Image, Send を追加
import * as Tabs from '@radix-ui/react-tabs';
import EditProfile from '../../editprofile/page';

interface UserProfile {
  id: string;
  username: string;
  grade: number;
  department_id: string | number;
  icon_src: string;
  cover_src: string;
  bio: string;
}

interface Post {
  id: number;
  text: string;
  time: string;
  likes_count: number;
  is_liked_by_me: boolean;
  comments: number;
  retweets: number;
  image_url?: string;
}

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default function App({ params }: Props) {
  const unwrappedParams = use(params);
  const userId = unwrappedParams.id;

  const router = useRouter();
  const [activeTab, setActiveTab] = useState('posts');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // 💡 新規投稿テキストの状態管理を追加
  const [newPostText, setNewPostText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // フォロー・フォロワー数の状態管理
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

  // ログインしている自分自身のIDと、フォロー中かどうかの管理
  const [myId, setMyId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  const isMe = myId === userId;

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          router.push('/login');
          return;
        }

        setMyId(user.id);

        const { data: profileData, error: profileError } = await supabase
          .from('user')
          .select('id, username, grade, department_id, icon_src, cover_src, bio')
          .eq('id', userId)
          .single();

        if (profileError) console.error("❌ ユーザー検索エラー:", profileError.message);
        if (profileData) {
          setProfile({
            ...profileData,
            bio: profileData.bio || '',
            cover_src: profileData.cover_src || ''
          });
        }

        const { count: following, error: followingError } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', userId);

        const { count: followers, error: followersError } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', userId);

        if (!followingError && following !== null) setFollowingCount(following);
        if (!followersError && followers !== null) setFollowerCount(followers);
        // 2.5 自分がこのユーザー(userId)をフォローしているかチェック
        if (user.id !== userId) {
          const { data: followData } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', userId)
            .maybeSingle();

          setIsFollowing(!!followData);
        }

        // 3. ページの主(userId)の投稿をすべて取得
        const { data: postsData, error: postsError } = await supabase
          .from('post')
          .select('id, content, image_url, created_at, number_of_likes')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        if (postsData && postsData.length > 0) {
          const postIds = postsData.map(p => p.id);

          // 自分がいいねしている投稿のIDを取得
          const { data: myLikes } = await supabase
            .from('like')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds);

          // 4. 画面表示用のデータ構造に変換
          const formattedPosts = postsData.map(post => {
            const isLikedByMe = myLikes?.some(l => l.post_id === post.id) || false;

            const postDate = new Date(post.created_at);
            const diffMs = Date.now() - postDate.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const timeLabel = diffHours <= 0 ? 'たった今' : `${diffHours}時間前`;

            return {
              id: post.id,
              text: post.content || '',
              time: timeLabel,
              likes_count: post.number_of_likes || 0,
              is_liked_by_me: isLikedByMe,
              comments: 0,
              retweets: 0,
              image_url: post.image_url
            };
          });

          setPosts(formattedPosts);
        } else {
          setPosts([]);
        }

      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [router, userId]);

  // 💡 新規投稿（ツイート）をSupabaseに保存する関数を追加
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim() || !myId || isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Supabaseのpostテーブルにデータを挿入
      const { data: insertedPost, error } = await supabase
        .from('post')
        .insert({
          user_id: myId,
          content: newPostText,
          number_of_likes: 0
        })
        .select()
        .single();

      if (error) throw error;

      // 画面上の投稿一覧の先頭に、今つぶやいた投稿をリアルタイムで追加
      const newPostFormatted: Post = {
        id: insertedPost.id,
        text: insertedPost.content || '',
        time: 'たった今',
        likes_count: 0,
        is_liked_by_me: false,
        comments: 0,
        retweets: 0,
        image_url: insertedPost.image_url
      };

      setPosts(prev => [newPostFormatted, ...prev]);
      setNewPostText(''); // 入力欄を空にする

    } catch (error: any) {
      console.error('投稿に失敗しました詳細:', error?.message || JSON.stringify(error));
      alert(`エラー内容: ${error?.message || error?.details || '不明なエラー'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
  const handleSaveProfile = async (
    newUsername: string, 
    newGrade: number, 
    newBio: string, 
    imageFile: File | null,
    coverFile: File | null
  ) => {
    if (!profile) return;

    try {
      let uploadedIconUrl = profile.icon_src;
      let uploadedCoverUrl = profile.cover_src;

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

      const { error: updateError } = await supabase
        .from('user')
        .update({
          username: newUsername,
          grade: newGrade,
          bio: newBio,
          icon_src: uploadedIconUrl,
          cover_src: uploadedCoverUrl
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

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

  const handleLikeToggle = async (postId: number, isLikedByMe: boolean) => {
    if (!profile) return;

    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.id === postId
          ? {
              ...post,
              is_liked_by_me: !isLikedByMe,
              likes_count: post.likes_count + (isLikedByMe ? -1 : 1)
            }
          : post
      )
    );

    try {
      const currentPost = posts.find(p => p.id === postId);
      if (!currentPost) return;

      const newLikeCount = currentPost.likes_count + (isLikedByMe ? -1 : 1);

      if (isLikedByMe) {
        const { error: deleteLikeError } = await supabase
          .from('like')
          .delete()
          .eq('user_id', myId)
          .eq('post_id', postId);
        if (deleteLikeError) throw deleteLikeError;
      } else {
        const { error: insertLikeError } = await supabase
          .from('like')
          .insert({ user_id: myId, post_id: postId });
        if (insertLikeError) throw insertLikeError;
      }

      const { error: updatePostError } = await supabase
        .from('post')
        .update({ number_of_likes: newLikeCount })
        .eq('id', postId);
        
      if (updatePostError) throw updatePostError;

    } catch (error: any) {
      console.error('いいね更新エラー詳細:', error?.message || JSON.stringify(error));
      alert(`いいねエラー内容: ${error?.message || error?.details || '不明なエラー'}`);
      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? {
                ...post,
                is_liked_by_me: isLikedByMe,
                likes_count: post.likes_count
              }
            : post
        )
      );
    }
  };

  const handleFollowToggle = async () => {
    if (!myId || !profile || isMe) return;

    const nextFollowingState = !isFollowing;
    setIsFollowing(nextFollowingState);
    setFollowerCount(prev => prev + (nextFollowingState ? 1 : -1));

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', myId)
          .eq('following_id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: myId,
            following_id: profile.id
          });
        if (error) throw error;
      }
    } catch (error) {
      console.error('フォロー処理に失敗しました:', error);
      setIsFollowing(isFollowing);
      setFollowerCount(prev => prev + (isFollowing ? 1 : -1));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500 font-medium">読み込み中...</div>;
  }

  const displayProfile = {
    username: profile?.username || 'データ未取得',
    grade: profile?.grade || 0,
    department_id: profile?.department_id || '-',
    icon_src: profile?.icon_src || 'https://unsplash.com',
    cover_src: profile?.cover_src || 'https://unsplash.com',
    bio: profile?.bio || 'プロフィールは未設定です。'
  };

  if (isEditing && profile) {
    return (
      <EditProfile
        initialUsername={profile.username}
        initialGrade={profile.grade}
        iconSrc={displayProfile.icon_src}
        initialCoverSrc={displayProfile.cover_src}
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
            src={displayProfile.cover_src}
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
          {isMe ? (
            <>
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
            </>
          ) : (
            <button 
              onClick={handleFollowToggle}
              className={`h-9 px-5 rounded-full text-sm font-bold transition-all border duration-200 ${
                isFollowing 
                  ? 'bg-white text-gray-900 border-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 group' 
                  : 'bg-gray-900 text-white border-transparent hover:bg-gray-800'
              }`}
            >
              {isFollowing ? (
                <>
                  <span className="group-hover:hidden">フォロー中</span>
                  <span className="hidden group-hover:inline">フォロー解除</span>
                </>
              ) : (
                'フォローする'
              )}
            </button>
          )}
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
            <span className="hover:underline cursor-pointer">
              <span className="font-bold text-gray-950">{followingCount}</span> フォロー中
            </span>
            <span className="hover:underline cursor-pointer">
              <span className="font-bold text-gray-950">{followerCount}</span> フォロワー
            </span>
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
            {/* 💡 ツイッター風の新規投稿フォーム（自分のページのみ表示） */}
            {isMe && (
              <form onSubmit={handleCreatePost} className="p-4 border-b border-gray-100 flex gap-3 bg-gray-50/30">
                <Avatar src={displayProfile.icon_src} sx={{ width: 40, height: 40 }} />
                <div className="flex-1">
                  <textarea
                    value={newPostText}
                    onChange={(e) => setNewPostText(e.target.value)}
                    placeholder="いまどうしてる？"
                    rows={2}
                    className="w-full text-[17px] bg-transparent outline-none resize-none placeholder-gray-400 text-gray-900"
                    disabled={isSubmitting}
                  />
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100/50 mt-1">
                    <div className="text-blue-500 hover:bg-blue-50 p-2 rounded-full cursor-pointer transition">
                      <Image size={18} />
                    </div>
                    <button
                      type="submit"
                      disabled={!newPostText.trim() || isSubmitting}
                      className="bg-blue-500 text-white font-bold px-4 py-1.5 rounded-full text-sm hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Send size={14} />
                      {isSubmitting ? '送信中...' : 'ツイート'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* 投稿一覧 */}
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
                    
                    {post.image_url && (
                      <div className="mb-3 max-h-80 rounded-xl overflow-hidden border border-gray-100">
                        <img src={post.image_url} alt="Post media" className="w-full h-full object-cover" />
                      </div>
                    )}
                    
                    <div className="flex justify-between max-w-md text-gray-500 text-sm -ml-2">
                      <button className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition">
                        <MessageCircle size={18} className="group-hover:bg-blue-50 rounded-full transition" />
                        <span className="text-xs">{post.comments}</span>
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-green-500 group p-2 rounded-full transition">
                        <Repeat2 size={18} className="group-hover:bg-green-50 rounded-full transition" />
                        <span className="text-xs">{post.retweets}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleLikeToggle(post.id, post.is_liked_by_me)}
                        className={`flex items-center gap-1.5 group p-2 rounded-full transition ${
                          post.is_liked_by_me ? 'text-red-500' : 'hover:text-red-500 text-gray-500'
                        }`}
                      >
                        <Heart 
                          size={18} 
                          className="group-hover:bg-red-50 rounded-full transition" 
                          fill={post.is_liked_by_me ? "currentColor" : "none"} 
                        />
                        <span className="text-xs">{post.likes_count}</span>
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
