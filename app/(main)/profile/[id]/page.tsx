"use client";

import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ImageWithFallback } from '../../../../components/profile/ImageWithFallback';
import { Avatar } from '@mui/material';
import { Heart, MessageCircle, Repeat2, Share, Settings, LogOut, Image as ImageIcon, Send, Mail } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import EditProfile from '../../editprofile/page';

interface UserProfile {
  id: string;
  username: string;
  grade: number;
  department_id: number;
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
  retweets_count: number;
  is_reposted_by_me: boolean;
  image_url?: string;
  reply_to_id?: number | null;
  user_id?: string;
  is_repost_item?: boolean;
}

interface FFUser {
  id: string;
  username: string;
  grade: number;
  icon_src: string;
  bio: string;
}

interface Props {
  params: Promise<{ id: string; }>;
}

function formatPostTime(createdAtString: string): string {
  const dateString = createdAtString.endsWith('Z') ? createdAtString : `${createdAtString}Z`;
  const postDate = new Date(dateString);
  const diffMs = Date.now() - postDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffMins < 1) return 'たった今';
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  if (diffWeeks < 5) return `${diffWeeks}週間前`;
  return postDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function App({ params }: Props) {
  const unwrappedParams = use(params);
  const userId = unwrappedParams.id;
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('posts');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: UserProfile }>({});
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [ffModalOpen, setFfModalOpen] = useState(false);
  const [ffModalTitle, setFfModalTitle] = useState<'フォロー中' | 'フォロワー'>('フォロー中');
  const [ffUsers, setFfUsers] = useState<FFUser[]>([]);
  const [loadingFF, setLoadingFF] = useState(false);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyTargetPost, setReplyTargetPost] = useState<Post | null>(null);
  const [replyText, setReplyText] = useState('');

  const isMe = myId === userId;

  const fetchAllData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setMyId(user.id);

      const { data: profileData } = await supabase.from('user').select('*').eq('id', userId).single();
      if (profileData) setProfile(profileData);

      const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
      const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
      setFollowingCount(following || 0);
      setFollowerCount(followers || 0);

      if (user.id !== userId) {
        const { data: followData } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle();
        setIsFollowing(!!followData);
      }

      // 1. 自分が投稿したポストを取得
      const { data: myPosts } = await supabase.from('post').select('*').eq('user_id', userId);

      // 2. 自分がリポストしたポストのIDと、リポストした日時を取得
      const { data: myRepostsData } = await supabase.from('repost').select('post_id, created_at').eq('user_id', userId);
      const repostMapInfo = new Map();
      myRepostsData?.forEach(r => repostMapInfo.set(r.post_id, r.created_at));
      const repostedPostIds = Array.from(repostMapInfo.keys());

      // 3. リポストされたポスト本体を取得
      let repostedPosts: any[] = [];
      if (repostedPostIds.length > 0) {
        const { data: fetchedReposts } = await supabase.from('post').select('*').in('id', repostedPostIds);
        repostedPosts = fetchedReposts || [];
      }

      // 4. マージして並び替え（自分の投稿は自分の作成日時を維持、他人のリポストのみリポスト日時を適用）
      const combinedMap = new Map();

      myPosts?.forEach(p => {
        combinedMap.set(p.id, {
          ...p,
          display_at: p.created_at,
          is_repost_item: false,
        });
      });

      repostedPosts.forEach(p => {
        const repostTime = repostMapInfo.get(p.id);
        combinedMap.set(p.id, {
          ...p,
          // 他人の投稿の場合のみ、リポスト日時を適用。自分の投稿がリポストに含まれていても元の投稿日時のままにする
          display_at: p.user_id === userId ? p.created_at : (repostTime || p.created_at),
          is_repost_item: p.user_id !== userId,
        });
      });

      const postsData = Array.from(combinedMap.values()).sort((a, b) => 
        new Date(b.display_at).getTime() - new Date(a.display_at).getTime()
      );

      if (postsData) {
        const postIds = postsData.map(p => p.id);
        const { data: myLikes } = await supabase.from('like').select('post_id').eq('user_id', user.id).in('post_id', postIds);
        const { data: myReposts } = await supabase.from('repost').select('post_id').eq('user_id', user.id).in('post_id', postIds);
        const { data: repostCounts } = await supabase.from('repost').select('post_id').in('post_id', postIds);
        const { data: replyCounts } = await supabase.from('post').select('reply_to_id').in('reply_to_id', postIds);

        const userIds = new Set<string>();
        postsData.forEach(p => { if (p.user_id) userIds.add(p.user_id); });
        if (profileData?.id) userIds.add(profileData.id);

        let profilesMap: { [key: string]: UserProfile } = {};
        if (userIds.size > 0) {
          const { data: profilesData } = await supabase.from('user').select('*').in('id', Array.from(userIds));
          profilesData?.forEach(p => { profilesMap[p.id] = p; });
          setUserProfiles(profilesMap);
        }

        setPosts(postsData.map(post => ({
          ...post,
          reply_to_id: post.reply_to_id,
          text: post.content || '',
          time: formatPostTime(post.display_at),
          likes_count: post.number_of_likes || 0,
          is_liked_by_me: myLikes?.some(l => l.post_id === post.id) || false,
          comments: replyCounts?.filter(r => r.reply_to_id === post.id).length || 0,
          retweets_count: repostCounts?.filter(r => r.post_id === post.id).length || 0,
          is_reposted_by_me: myReposts?.some(r => r.post_id === post.id) || false,
        })));
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchAllData(); }, [router, userId]);
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newPostText.trim() && !selectedImage) || !myId || isSubmitting) return;
    try {
      setIsSubmitting(true);
      let uploadedImageUrl = undefined;
      if (selectedImage) {
        const filePath = `posts/post-${myId}-${Date.now()}.${selectedImage.name.split('.').pop()}`;
        await supabase.storage.from('avatar').upload(filePath, selectedImage);
        const { data } = supabase.storage.from('avatar').getPublicUrl(filePath);
        uploadedImageUrl = data.publicUrl;
      }
      await supabase.from('post').insert({ user_id: myId, content: newPostText, number_of_likes: 0, image_url: uploadedImageUrl });
      setNewPostText(''); setSelectedImage(null); setImagePreview(null);
      await fetchAllData();
    } catch (error) { alert('投稿に失敗しました'); } finally { setIsSubmitting(false); }
  };

  const handleRepostToggle = async (post: Post, isRepostedByMe: boolean) => {
    if (!myId) {
      alert('ログイン情報がまだ読み込まれていません。');
      return;
    }
    
    // 💡 自分の投稿の場合はリポストできないようにする仕様
    if (post.user_id === myId) {
      alert('自分の投稿はリポストできません。');
      return;
    }
    
    setPosts(prev => prev.map(p => p.id === post.id ? { 
      ...p, 
      is_reposted_by_me: !isRepostedByMe, 
      retweets_count: p.retweets_count + (isRepostedByMe ? -1 : 1) 
    } : p));

    try {
      if (isRepostedByMe) {
        const { error } = await supabase.from('repost').delete().eq('user_id', myId).eq('post_id', post.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('repost').insert({ user_id: myId, post_id: post.id });
        if (error) throw error;
      }
      await fetchAllData();
    } catch (error: any) {
      console.error('リポストエラーの詳細:', error);
      alert(`リポストの保存に失敗しました: ${error.message || JSON.stringify(error)}`);
      await fetchAllData();
    }
  };

  const handleCreateReply = async () => {
    if (!replyTargetPost || !replyText.trim() || !myId) return;

    try {
      const { error } = await supabase
        .from('post')
        .insert({
          user_id: myId,
          content: replyText,
          number_of_likes: 0,
          reply_to_id: replyTargetPost.id
        });

      if (error) throw error;

      setReplyText('');
      setIsReplyModalOpen(false);
      await fetchAllData();
      alert('返信しました！');
    } catch (error) {
      console.error('返信エラー:', error);
      alert('返信に失敗しました。');
    }
  };

  const handleLikeToggle = async (postId: number, isLikedByMe: boolean) => {
    if (!myId) return;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_liked_by_me: !isLikedByMe, likes_count: p.likes_count + (isLikedByMe ? -1 : 1) } : p));
    try {
      if (isLikedByMe) await supabase.from('like').delete().eq('user_id', myId).eq('post_id', postId);
      else await supabase.from('like').insert({ user_id: myId, post_id: postId });
      await supabase.from('post').update({ number_of_likes: posts.find(p => p.id === postId)!.likes_count + (isLikedByMe ? -1 : 1) }).eq('id', postId);
    } catch { fetchAllData(); }
  };

  const handleSaveProfile = async (newUsername: string, newGrade: number, newBio: string, imageFile: File | null, coverFile: File | null) => {
    if (!profile) return;
    let icon_src = profile.icon_src;
    let cover_src = profile.cover_src;
    try {
      if (imageFile) {
        const path = `icons/${profile.id}-${Date.now()}`;
        await supabase.storage.from('avatar').upload(path, imageFile);
        icon_src = supabase.storage.from('avatar').getPublicUrl(path).data.publicUrl;
      }
      if (coverFile) {
        const path = `covers/${profile.id}-${Date.now()}`;
        await supabase.storage.from('avatar').upload(path, coverFile);
        cover_src = supabase.storage.from('avatar').getPublicUrl(path).data.publicUrl;
      }
      await supabase.from('user').update({ username: newUsername, grade: newGrade, bio: newBio, icon_src, cover_src }).eq('id', profile.id);
      await fetchAllData();
      setIsEditing(false);
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login'); };
  
  const handleFollowToggle = async () => { 
    if (!myId || !profile || isMe) return; 
    setIsFollowing(!isFollowing); 
    setFollowerCount(prev => prev + (isFollowing ? -1 : 1)); 
    try { 
      if (isFollowing) await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', profile.id); 
      else await supabase.from('follows').insert({ follower_id: myId, following_id: profile.id }); 
    } catch { 
      setIsFollowing(isFollowing); 
    } 
  };

  const handleOpenFFModal = async (type: 'following' | 'followers') => {
    setFfModalTitle(type === 'following' ? 'フォロー中' : 'フォロワー');
    setFfModalOpen(true);
    setLoadingFF(true);
    setFfUsers([]);
    try {
        const field = type === 'following' ? 'following_id' : 'follower_id';
        const { data: followData } = await supabase.from('follows').select(field).eq(type === 'following' ? 'follower_id' : 'following_id', userId);
        if (followData && followData.length > 0) {
            const ids = followData.map((f: any) => f[field]);
            const { data: users } = await supabase.from('user').select('*').in('id', ids);
            setFfUsers(users || []);
        }
    } catch (e) { console.error(e); } finally { setLoadingFF(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;

  if (isEditing && profile) return <EditProfile initialUsername={profile.username} initialGrade={profile.grade} iconSrc={profile.icon_src} initialCoverSrc={profile.cover_src} initialBio={profile.bio} onClose={() => setIsEditing(false)} onSave={handleSaveProfile} />;

  return (
    <div className="w-full bg-white text-gray-900 min-h-screen border-l border-gray-100">
        {/* ヘッダーエリア */}
        <div className="relative">
          <ImageWithFallback src={profile?.cover_src || ''} alt="Cover" className="w-full h-48 object-cover bg-gray-200" />
          <div className="absolute -bottom-12 left-4">
            <Avatar src={profile?.icon_src} sx={{ width: 120, height: 120, border: '4px solid white' }} />
          </div>
        </div>

        {/* ボタンエリア */}
        <div className="flex justify-end pt-3 pr-4 h-12 gap-2">
          {isMe ? (
            <button onClick={() => setIsEditing(true)} className="h-9 px-4 rounded-full border border-gray-300 font-bold text-sm">プロフィール編集</button>
          ) : (
            <button onClick={handleFollowToggle} className={`h-9 px-5 rounded-full font-bold text-sm ${isFollowing ? 'bg-white border text-black' : 'bg-black text-white'}`}>
              {isFollowing ? 'フォロー中' : 'フォローする'}
            </button>
          )}
        </div>

        {/* ユーザー情報エリア */}
        <div className="px-6 pb-4 pt-1">
          <h1 className="text-xl font-extrabold">{profile?.username}</h1>
          <p className="text-gray-600 my-2">{profile?.bio}</p>
          <div className="flex gap-4 text-sm text-gray-500">
             <span onClick={() => handleOpenFFModal('following')} className="cursor-pointer hover:underline"><span className="font-bold text-black">{followingCount}</span> フォロー中</span>
             <span onClick={() => handleOpenFFModal('followers')} className="cursor-pointer hover:underline"><span className="font-bold text-black">{followerCount}</span> フォロワー</span>
          </div>
        </div>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="flex border-b border-gray-200 w-full">
            {[
              { id: 'posts', label: 'ポスト' },
              { id: 'replies', label: '返信' },
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

          {/* ポストタブ */}
          <Tabs.Content value="posts">
            {isMe && (
              <form onSubmit={handleCreatePost} className="p-4 border-b border-gray-100 flex gap-3 bg-gray-50/30">
                <Avatar src={profile?.icon_src} sx={{ width: 40, height: 40 }} />
                <div className="flex-1">
                  <textarea
                    value={newPostText}
                    onChange={(e) => setNewPostText(e.target.value)}
                    placeholder="いまどうしてる？"
                    rows={2}
                    className="w-full text-[17px] bg-transparent outline-none resize-none placeholder-gray-400 text-gray-900"
                    disabled={isSubmitting}
                  />
                  {imagePreview && (
                    <div className="relative mt-2 mb-3 max-h-60 rounded-xl overflow-hidden border border-gray-200 inline-block">
                      <img src={imagePreview} alt="Selected preview" className="max-h-60 object-cover rounded-xl" />
                      <button type="button" onClick={() => { setSelectedImage(null); setImagePreview(null); }} className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-full hover:bg-black/90 transition">削除</button>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100/50 mt-1">
                    <label className="text-blue-500 hover:bg-blue-50 p-2 rounded-full cursor-pointer transition flex items-center justify-center">
                      <ImageIcon size={18} />
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={isSubmitting} />
                    </label>
                    <button type="submit" disabled={(!newPostText.trim() && !selectedImage) || isSubmitting} className="bg-blue-500 text-white font-bold px-4 py-1.5 rounded-full text-sm hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5">
                      <Send size={14} />{isSubmitting ? '送信中...' : 'ツイート'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {posts.filter(p => !p.reply_to_id).map((post) => {
                const postAuthor = userProfiles[post.user_id || ''] || profile;
                return (
                  <div 
                    key={post.id} 
                    onClick={() => router.push('/post/' + post.id)} 
                    className="p-4 hover:bg-gray-50/50 cursor-pointer transition flex gap-3"
                  >
                    <Avatar src={postAuthor?.icon_src} sx={{ width: 40, height: 40 }} />
                    <div className="flex-1 min-w-0">
                      {post.is_repost_item && (
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs font-bold mb-1">
                          <Repeat2 size={14} />
                          <span>リポストしました</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
                        <span className="font-bold hover:underline">{postAuthor?.username}</span>
                        <span className="text-gray-500 text-sm">·</span>
                        <span className="text-gray-500 text-sm hover:underline">{post.time}</span>
                      </div>
                      <p className="text-[15px] leading-normal whitespace-pre-wrap">{post.text}</p>
                      {post.image_url && <img src={post.image_url} className="mt-2 rounded-xl max-h-60 cursor-pointer" onClick={(e) => { e.stopPropagation(); setActiveImageUrl(post.image_url || null); }} />}
                      <div className="flex justify-between mt-3 max-w-xs text-gray-500">
                        <button onClick={(e) => { e.stopPropagation(); setReplyTargetPost(post); setIsReplyModalOpen(true); }} className="flex items-center gap-1 hover:text-blue-500 transition">
                            <MessageCircle size={18} />
                            <span className="text-xs">{post.comments > 0 ? post.comments : ''}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRepostToggle(post, post.is_reposted_by_me); }} className={`flex items-center gap-1 ${post.is_reposted_by_me ? 'text-green-500' : ''}`}><Repeat2 size={18} /><span>{post.retweets_count > 0 ? post.retweets_count : ''}</span></button>
                        <button onClick={(e) => { e.stopPropagation(); handleLikeToggle(post.id, post.is_liked_by_me); }} className={`flex items-center gap-1 ${post.is_liked_by_me ? 'text-red-500' : ''}`}><Heart size={18} fill={post.is_liked_by_me ? "currentColor" : "none"} /><span>{post.likes_count}</span></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Tabs.Content>

          {/* 返信タブ */}
          <Tabs.Content value="replies">
            <div className="divide-y divide-gray-200">
              {posts.filter(post => post.reply_to_id).length > 0 ? (
                posts.filter(post => post.reply_to_id).map((post) => {
                  const postAuthor = userProfiles[post.user_id || ''] || profile;
                  return (
                    <div 
                      key={post.id} 
                      onClick={() => router.push('/post/' + post.id)}
                      className="p-4 hover:bg-gray-50/50 cursor-pointer transition flex gap-3"
                    >
                       <Avatar src={postAuthor?.icon_src} sx={{ width: 40, height: 40 }} />
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
                           <span className="font-bold hover:underline">{postAuthor?.username}</span>
                           <span className="text-gray-500 text-sm">·</span>
                           <span className="text-gray-500 text-sm hover:underline">{post.time}</span>
                         </div>
                         <p className="text-sm text-gray-500 mb-1">返信:</p>
                         <p className="text-[15px] leading-normal whitespace-pre-wrap">{post.text}</p>
                       </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-20 text-center text-sm text-gray-500">返信はまだありません</div>
              )}
            </div>
          </Tabs.Content>
        </Tabs.Root>

        {ffModalOpen && (
           <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" onClick={() => setFfModalOpen(false)}>
              <div className="bg-white p-4 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                 <h2 className="font-bold mb-4">{ffModalTitle}</h2>
                 {ffUsers.map(u => <div key={u.id} className="p-2 border-b">{u.username}</div>)}
              </div>
           </div>
        )}
        
        {activeImageUrl && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4" onClick={() => setActiveImageUrl(null)}>
                <img src={activeImageUrl} className="max-h-[90vh] rounded-lg" />
            </div>
        )}

        {/* 返信モーダル */}
        {isReplyModalOpen && replyTargetPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setIsReplyModalOpen(false)}>
            <div className="relative bg-white w-full max-w-md rounded-2xl p-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold">返信</h2>
                <button onClick={() => setIsReplyModalOpen(false)} className="text-sm text-gray-500">閉じる</button>
              </div>
              
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm">
                <p className="text-gray-600 line-clamp-2">{replyTargetPost.text}</p>
              </div>

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full h-24 p-2 border border-gray-200 rounded-xl outline-none focus:border-blue-500 resize-none"
                placeholder="返信を投稿..."
              />

              <div className="mt-4 flex justify-end">
                <button 
                  onClick={handleCreateReply} 
                  className="bg-blue-500 text-white font-bold px-4 py-2 rounded-full hover:bg-blue-600 transition"
                >
                  返信する
                </button>       
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
