"use client";

import { useState, useEffect, useCallback, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ImageWithFallback } from '../ImageWithFallback';
import { Avatar } from '@mui/material';
import { Heart, MessageCircle, Repeat2, Share, Settings, LogOut, Image as ImageIcon, Send, Mail, AlertCircle, X, Trash2 } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import EditProfile from '../../editprofile/page';

interface UserProfile {
  id: string;
  username: string;
  grade: number;
  department_id: number;
  department?:
    | { name: string; faculty?: { name: string } | { name: string }[] | null }
    | { name: string; faculty?: { name: string } | { name: string }[] | null }[]
    | null;
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

const MAX_IMAGE_SIZE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return '対応していないファイル形式です（JPEG, PNG, GIF, WEBPのみ）';
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return `画像サイズは${MAX_IMAGE_SIZE_MB}MB以下にしてください`;
  }
  return null;
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
  const [isFollowPending, setIsFollowPending] = useState(false);

  const [ffModalOpen, setFfModalOpen] = useState(false);
  const [ffModalTitle, setFfModalTitle] = useState<'フォロー中' | 'フォロワー'>('フォロー中');
  const [ffUsers, setFfUsers] = useState<FFUser[]>([]);
  const [loadingFF, setLoadingFF] = useState(false);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyTargetPost, setReplyTargetPost] = useState<Post | null>(null);
  const [replyText, setReplyText] = useState('');

  const [pendingLikeIds, setPendingLikeIds] = useState<Set<number>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMe = myId === userId;

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }

      setMyId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('user')
        .select('id, username, grade, department_id, icon_src, cover_src, bio, department:department_id(name,faculty:faculty_id(name))')
        .eq('id', userId)
        .single();

      if (profileError) console.error("❌ ユーザー検索エラー:", profileError.message);
      if (profileData) {
        setProfile({
          ...profileData,
          bio: profileData.bio || '',
          cover_src: profileData.cover_src || '',
        });
      }

      const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
      const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
      setFollowingCount(following || 0);
      setFollowerCount(followers || 0);

      if (user.id !== userId) {
        const { data: followData } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle();
        setIsFollowing(!!followData);
      }

      const { data: myPosts } = await supabase.from('post').select('*').eq('user_id', userId);

      const { data: myRepostsData } = await supabase.from('repost').select('post_id, created_at').eq('user_id', userId);
      const repostMapInfo = new Map();
      myRepostsData?.forEach(r => repostMapInfo.set(r.post_id, r.created_at));
      const repostedPostIds = Array.from(repostMapInfo.keys());

      let repostedPosts: any[] = [];
      if (repostedPostIds.length > 0) {
        const { data: fetchedReposts } = await supabase.from('post').select('*').in('id', repostedPostIds);
        repostedPosts = fetchedReposts || [];
      }

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
  }, [router, userId]);

  useEffect(() => { setLoading(true); fetchAllData(); }, [fetchAllData]);
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validationError = validateImageFile(file);
      if (validationError) {
        showError(validationError);
        e.target.value = '';
        return;
      }
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
    } catch (error: any) {
      console.error('投稿に失敗しました詳細:', error?.message || JSON.stringify(error));
      showError(`投稿に失敗しました: ${error?.message || '不明なエラー'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRepostToggle = async (post: Post, isRepostedByMe: boolean) => {
    if (!myId) {
      showError('ログイン情報がまだ読み込まれていません。');
      return;
    }
    
    if (post.user_id === myId) {
      showError('自分の投稿はリポストできません。');
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
      showError(`リポストの保存に失敗しました: ${error.message || JSON.stringify(error)}`);
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
    } catch (error) {
      console.error('返信エラー:', error);
      showError('返信に失敗しました。');
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

    if (imageFile) {
      const err = validateImageFile(imageFile);
      if (err) { showError(err); return; }
    }
    if (coverFile) {
      const err = validateImageFile(coverFile);
      if (err) { showError(err); return; }
    }

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

      await fetchAllData();
      setIsEditing(false);
    } catch (error: any) {
      console.error('プロフィール更新エラー:', error.message);
      showError('プロフィールの更新に失敗しました。');
    }
  };

  const handleLikeToggle = async (postId: number, isLikedByMe: boolean) => {
    if (!myId || pendingLikeIds.has(postId)) return;

    setPendingLikeIds(prev => new Set(prev).add(postId));

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
      showError('いいねの更新に失敗しました。');
      await fetchAllData();
    } finally {
      setPendingLikeIds(prev => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!myId || !confirm("この投稿を削除しますか？")) return;
    await supabase.from('like').delete().eq('post_id', postId);
    const { error } = await supabase
      .from('post')
      .delete()
      .eq('id', postId)
      .eq('user_id', myId);
    if (error) {
      console.error('投稿の削除に失敗しました:', error);
      showError('投稿の削除に失敗しました。');
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleFollowToggle = async () => {
    if (!myId || !profile || isMe || isFollowPending) return;

    setIsFollowPending(true);
    const nextFollowingState = !isFollowing;
    setIsFollowing(nextFollowingState);
    setFollowerCount(prev => prev + (nextFollowingState ? 1 : -1));

    try {
      if (nextFollowingState) {
        const { error } = await supabase.from('follows').insert({ follower_id: myId, following_id: profile.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', profile.id);
        if (error) throw error;
      }
    } catch (error) {
      console.error('フォロー処理に失敗しました:', error);
      showError('フォロー処理に失敗しました。');
      setIsFollowing(!nextFollowingState);
      setFollowerCount(prev => prev + (nextFollowingState ? -1 : 1));
    } finally {
      setIsFollowPending(false);
    }
  };

  const handleOpenFFModal = async (type: 'following' | 'followers') => {
    setFfModalTitle(type === 'following' ? 'フォロー中' : 'フォロワー');
    setFfModalOpen(true);
    setLoadingFF(true);
    setFfUsers([]);
    try {
      const field = type === 'following' ? 'following_id' : 'follower_id';
      const targetQueryField = type === 'following' ? 'follower_id' : 'following_id';

      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select(field)
        .eq(targetQueryField, userId);

      if (followError) throw followError;

      if (followData && followData.length > 0) {
        const ids = followData.map((f: any) => f[field]);
        const { data: users, error: userError } = await supabase.from('user').select('*').in('id', ids);
        if (userError) throw userError;
        setFfUsers(users || []);
      }
    } catch (e) {
      console.error(e);
      showError('リストの取得に失敗しました。');
    } finally {
      setLoadingFF(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500 font-medium">読み込み中...</div>;
  }

  const dept = Array.isArray(profile?.department) ? profile?.department[0] : profile?.department;
  const facul = Array.isArray(dept?.faculty) ? dept?.faculty[0] : dept?.faculty;
  const displayProfile = {
    username: profile?.username || 'データ未取得',
    grade: profile?.grade || 0,
    department_id: profile?.department_id || '-',
    departmentName: dept?.name || '未設定',
    facultyName: facul?.name || '未設定',
    icon_src: profile?.icon_src || '',
    cover_src: profile?.cover_src || '',
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
    <div className="w-full bg-white overflow-auto text-gray-900 selection:bg-blue-100 min-h-screen border-l border-gray-100">
      {errorMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)] bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 shadow-lg flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm flex-1">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="shrink-0 text-red-400 hover:text-red-600 transition"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ヘッダー・カバー */}
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
              width: { xs: 96, sm: 120 },
              height: { xs: 96, sm: 120 },
              border: '4px solid white',
              backgroundColor: '#e5e7eb'
            }}
          />
        </div>
      </div>

      {/* ボタンエリア */}
      <div className="flex justify-end pt-3 pr-4 h-12 gap-2">
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
            disabled={isFollowPending}
            className={`h-9 px-5 rounded-full text-sm font-bold transition-all border duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
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
      <div className="px-4 sm:px-6 pb-4 pt-1">
        <div className="mb-3">
          <h1 className="text-xl font-extrabold tracking-tight leading-tight">
            {displayProfile.username}
          </h1>
          <div className="flex gap-2 mt-1.5 text-xs font-semibold text-gray-500 flex-wrap">
            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
              {displayProfile.grade}年生
            </span>
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {displayProfile.facultyName}
            </span>
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {displayProfile.departmentName}
            </span>
          </div>
        </div>

        <p className="text-[15px] leading-relaxed mb-3 whitespace-pre-wrap text-gray-600">
          {displayProfile.bio}
        </p>

        {/* FF欄 ＆ メッセージボタン */}
        <div className="flex items-center gap-5 text-sm text-gray-500 flex-wrap">
          <div className="flex gap-5">
            <span onClick={() => handleOpenFFModal('following')} className="hover:underline cursor-pointer">
              <span className="font-bold text-gray-950">{followingCount}</span> フォロー中
            </span>
            <span onClick={() => handleOpenFFModal('followers')} className="hover:underline cursor-pointer">
              <span className="font-bold text-gray-950">{followerCount}</span> フォロワー
            </span>
          </div>

          {!isMe && (
            <button
              onClick={() => router.push(`/messages/${userId}`)}
              className="h-7 px-3 rounded-full border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition shadow-sm shrink-0 flex items-center gap-1.5 ml-1"
            >
              <Mail size={13} />
              メッセージ
            </button>
          )}
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
              const isLikePending = pendingLikeIds.has(post.id);
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
                      {post.user_id === myId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePost(post.id);
                          }}
                          className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                          title="投稿を削除"
                        >
                          <Trash2 className='w-4 h-4' />
                        </button>
                      )}
                    </div>
                    <p className="text-[15px] leading-normal whitespace-pre-wrap">{post.text}</p>
                    {post.image_url && (
                      <img 
                        src={post.image_url} 
                        className="mt-2 rounded-xl max-h-60 cursor-pointer object-cover" 
                        onClick={(e) => { e.stopPropagation(); setActiveImageUrl(post.image_url || null); }} 
                        alt="Post media"
                      />
                    )}
                    <div className="flex justify-between mt-3 max-w-xs text-gray-500">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setReplyTargetPost(post); setIsReplyModalOpen(true); }} 
                        className="flex items-center gap-1 hover:text-blue-500 transition p-1"
                      >
                        <MessageCircle size={18} />
                        <span className="text-xs">{post.comments > 0 ? post.comments : ''}</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRepostToggle(post, post.is_reposted_by_me); }} 
                        className={`flex items-center gap-1 p-1 ${post.is_reposted_by_me ? 'text-green-500' : 'hover:text-green-500'}`}
                      >
                        <Repeat2 size={18} />
                        <span className="text-xs">{post.retweets_count > 0 ? post.retweets_count : ''}</span>
                      </button>
                      <button 
                        disabled={isLikePending}
                        onClick={(e) => { e.stopPropagation(); handleLikeToggle(post.id, post.is_liked_by_me); }} 
                        className={`flex items-center gap-1 p-1 disabled:opacity-50 ${post.is_liked_by_me ? 'text-red-500' : 'hover:text-red-500'}`}
                      >
                        <Heart size={18} fill={post.is_liked_by_me ? "currentColor" : "none"} />
                        <span className="text-xs">{post.likes_count}</span>
                      </button>
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

      {/* FF表示モーダル */}
      {ffModalOpen && (
         <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setFfModalOpen(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
               <div className="flex items-center justify-between p-4 border-b border-gray-100">
                 <h2 className="font-bold text-base">{ffModalTitle}</h2>
                 <button onClick={() => setFfModalOpen(false)} className="text-sm text-gray-500 hover:text-gray-800">閉じる</button>
               </div>
               <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                 {loadingFF ? (
                   <div className="py-10 text-center text-sm text-gray-400">読み込み中...</div>
                 ) : ffUsers.length === 0 ? (
                   <div className="py-10 text-center text-sm text-gray-400">ユーザーがいません</div>
                 ) : (
                   ffUsers.map(u => (
                     <div 
                       key={u.id} 
                       onClick={() => { setFfModalOpen(false); router.push(`/profile/${u.id}`); }}
                       className="p-3 hover:bg-gray-50 flex items-center gap-3 cursor-pointer transition"
                     >
                       <Avatar src={u.icon_src} sx={{ width: 36, height: 36 }} />
                       <div>
                         <p className="font-bold text-sm">{u.username}</p>
                         <p className="text-xs text-gray-500 line-clamp-1">{u.bio || 'プロフィール未設定'}</p>
                       </div>
                     </div>
                   ))
                 )}
               </div>
            </div>
         </div>
      )}
      
      {/* 画像拡大モーダル */}
      {activeImageUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setActiveImageUrl(null)}>
              <img src={activeImageUrl} className="max-h-[90vh] rounded-lg object-contain" alt="Expanded media" />
          </div>
      )}

      {/* 返信モーダル */}
      {isReplyModalOpen && replyTargetPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setIsReplyModalOpen(false)}>
          <div className="relative bg-white w-full max-w-md rounded-2xl p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold">返信</h2>
              <button onClick={() => setIsReplyModalOpen(false)} className="text-sm text-gray-500 hover:text-gray-800">閉じる</button>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm">
              <p className="text-gray-600 line-clamp-2">{replyTargetPost.text}</p>
            </div>

            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="w-full h-24 p-2 border border-gray-200 rounded-xl outline-none focus:border-blue-500 resize-none text-sm"
              placeholder="返信を投稿..."
            />

            <div className="mt-4 flex justify-end">
              <button 
                onClick={handleCreateReply} 
                className="bg-blue-500 text-white font-bold px-4 py-2 rounded-full text-sm hover:bg-blue-600 transition"
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