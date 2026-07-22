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

interface FFUser {
  id: string;
  username: string;
  grade: number;
  icon_src: string;
  bio: string;
}

interface Props {
  params: Promise<{
    id: string;
  }>;
}

// 画像アップロードの制限（バリデーション用）
const MAX_IMAGE_SIZE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// 投稿日時を「〇分前」「〇日前」「〇週間前」に変換する関数
function formatPostTime(createdAtString: string): string {
  const postDate = new Date(createdAtString);
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

// 画像ファイルのバリデーション（種類・サイズ）
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
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // 新規投稿・画像アップロードの状態管理
  const [newPostText, setNewPostText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 画像拡大表示用の状態管理
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  // フォロー・フォロワー数の状態管理
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

  // ログイン情報・フォロー状態の管理
  const [myId, setMyId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowPending, setIsFollowPending] = useState(false); // フォロー連打防止

  // FF欄モーダルの状態管理
  const [ffModalOpen, setFfModalOpen] = useState(false);
  const [ffModalTitle, setFfModalTitle] = useState<'フォロー中' | 'フォロワー'>('フォロー中');
  const [ffUsers, setFfUsers] = useState<FFUser[]>([]);
  const [loadingFF, setLoadingFF] = useState(false);

  // いいね連打防止（処理中の投稿IDを保持）
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<number>>(new Set());

  // alert()の代わりに使うエラーバナー
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMe = myId === userId;

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  // 投稿後に直接呼び出して画面を完全同期するため、fetchDataを共通関数として定義
  const fetchAllData = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }

      setMyId(user.id);

      // プロフィール情報の取得
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

      // フォロー・フォロワー数の取得
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

      // 自分がこのユーザーをフォローしているかチェック
      if (user.id !== userId) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', userId)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      // ページの主(userId)の投稿をすべて取得
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

        // 画面表示用のデータ構造に変換（正確な時間ヘルパーを使用）
        const formattedPosts = postsData.map(post => {
          const isLikedByMe = myLikes?.some(l => l.post_id === post.id) || false;

          return {
            id: post.id,
            text: post.content || '',
            time: formatPostTime(post.created_at), // 〇分前・〇日前に自動変換
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
      showError('データの取得に失敗しました。再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, [router, userId, showError]);

  // 初回読み込み時の実行（userIdが変わった時のみ再取得）
  useEffect(() => {
    setLoading(true);
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 画像が選択された時の処理（バリデーション付き）
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validationError = validateImageFile(file);
      if (validationError) {
        showError(validationError);
        e.target.value = ''; // 同じファイルを選び直せるようにリセット
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file)); // プレビュー用URLの生成
    }
  };

  // 画像アップロード対応の新規投稿関数
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newPostText.trim() && !selectedImage) || !myId || isSubmitting) return;

    try {
      setIsSubmitting(true);
      let uploadedImageUrl = undefined;

      // 画像が選択されている場合はStorageにアップロード
      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `post-${myId}-${Date.now()}.${fileExt}`;
        const filePath = `posts/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatar')
          .upload(filePath, selectedImage, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatar')
          .getPublicUrl(filePath);

        uploadedImageUrl = publicUrl;
      }

      // Supabaseの「post」テーブルにデータを挿入
      const { error } = await supabase
        .from('post')
        .insert({
          user_id: myId,
          content: newPostText,
          number_of_likes: 0,
          image_url: uploadedImageUrl
        });

      if (error) throw error;

      // フォーム入力をクリア
      setNewPostText('');
      setSelectedImage(null);
      setImagePreview(null);

      // 最新状態を再取得して完全同期
      await fetchAllData();

    } catch (error: any) {
      console.error('投稿に失敗しました詳細:', error?.message || JSON.stringify(error));
      showError(`投稿に失敗しました: ${error?.message || '不明なエラー'}`);
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

    //  アップロード前にまとめてバリデーション
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

  //  いいね連打防止つき + 楽観的アップデート
  const handleLikeToggle = async (postId: number, isLikedByMe: boolean) => {
    if (!myId || pendingLikeIds.has(postId)) return;

    setPendingLikeIds(prev => new Set(prev).add(postId));

    // 画面の数値を先行して切り替える（楽観的アップデート）
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
      await fetchAllData(); // 失敗時は正しい状態に再取得
    } finally {
      setPendingLikeIds(prev => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  // 自分の投稿を削除する
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

  // フォロー連打防止つき
  const handleFollowToggle = async () => {
    if (!myId || !profile || isMe || isFollowPending) return;

    setIsFollowPending(true);
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
      showError('フォロー処理に失敗しました。');
      setIsFollowing(isFollowing);
      setFollowerCount(prev => prev + (isFollowing ? 1 : -1));
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
      if (type === 'following') {
        const { data: followData, error: followError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId);

        if (followError) throw followError;

        if (followData && followData.length > 0) {
          const targetIds = followData.map(f => f.following_id);
          const { data: userData, error: userError } = await supabase
            .from('user')
            .select('id, username, grade, icon_src, bio')
            .in('id', targetIds);

          if (userError) throw userError;
          setFfUsers(userData || []);
        }
      } else {
        const { data: followData, error: followError } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', userId);

        if (followError) throw followError;

        if (followData && followData.length > 0) {
          const targetIds = followData.map(f => f.follower_id);
          const { data: userData, error: userError } = await supabase
            .from('user')
            .select('id, username, grade, icon_src, bio')
            .in('id', targetIds);

          if (userError) throw userError;
          setFfUsers(userData || []);
        }
      }
    } catch (error) {
      console.error('FFリストの取得に失敗しました:', error instanceof Error ? error.message : error);
      showError('リストの取得に失敗しました。');
    } finally {
      setLoadingFF(false);
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
    <div className="w-full bg-white overflow-auto text-gray-900 selection:bg-blue-100">
      {/*  エラーバナー（alert()の代替） */}
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

      <div className="w-full min-h-screen border-l border-gray-100">

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
        {/* タブ・タイムライン */}
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
            {/*  画像アップロード・プレビューに対応した新規投稿フォーム */}
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

                  {/*  画像が選択されている場合はプレビューと削除ボタンを表示 */}
                  {imagePreview && (
                    <div className="relative mt-2 mb-3 max-h-60 rounded-xl overflow-hidden border border-gray-200 inline-block">
                      <img src={imagePreview} alt="Selected preview" className="max-h-60 object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(null);
                          setImagePreview(null);
                        }}
                        className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-full hover:bg-black/90 transition"
                      >
                        削除
                      </button>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-gray-100/50 mt-1">
                    {/* 画像アイコンをクリックすると隠しinput[type=file]が動く仕組み */}
                    <label className="text-blue-500 hover:bg-blue-50 p-2 rounded-full cursor-pointer transition flex items-center justify-center">
                      <ImageIcon size={18} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={isSubmitting}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={(!newPostText.trim() && !selectedImage) || isSubmitting}
                      className="bg-blue-500 text-white font-bold px-4 py-1.5 rounded-full text-sm hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Send size={14} />
                      {isSubmitting ? '送信中...' : 'ツイート'}
                    </button>
                  </div>
                </div>
              </form>
            )}
            {/* 投稿一覧（タイムライン） */}
            <div className="divide-y divide-gray-200">
              {posts.map((post) => {
                const isLikePending = pendingLikeIds.has(post.id);
                return (
                  <div key={post.id} className="p-4 hover:bg-gray-50/50 cursor-pointer transition flex gap-3">
                    <Avatar src={displayProfile.icon_src} sx={{ width: 40, height: 40 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
                        <span className="font-bold hover:underline">{displayProfile.username}</span>
                        <span className="text-gray-500 text-sm">·</span>
                        <span className="text-gray-500 text-sm hover:underline">{post.time}</span>
                        {isMe && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePost(post.id);
                            }}
                            className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                            title="投稿を削除"
                          >
                            <Trash2 className='w-5 h-5' />
                          </button>
                        )}
                      </div>
                      <p className="text-[15px] leading-normal mb-3 whitespace-pre-wrap">{post.text}</p>

                      {/*  Supabaseから取得した画像URLがある場合に16:9で綺麗に表示 */}
                      {post.image_url && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation(); // 投稿自体のクリックイベント（詳細画面遷移など）を防止
                            setActiveImageUrl(post.image_url || null); //  クリックされた画像を拡大表示
                          }}
                          className="mt-2 mb-3 w-full aspect-[16/9] max-h-72 rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-zoom-in group relative"
                        >
                          <img
                            src={post.image_url}
                            alt="Post media"
                            className="w-full h-full object-cover group-hover:brightness-95 transition duration-200"
                          />
                        </div>
                      )}

                      {/* アクションボタン（いいね等） */}
                      <div className="flex justify-between max-w-md text-gray-500 text-sm -ml-2">
                        <button type="button" className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition">
                          <MessageCircle size={18} className="group-hover:bg-blue-50 rounded-full transition" />
                          <span className="text-xs">{post.comments}</span>
                        </button>
                        <button type="button" className="flex items-center gap-1.5 hover:text-green-500 group p-2 rounded-full transition">
                          <Repeat2 size={18} className="group-hover:bg-green-50 rounded-full transition" />
                          <span className="text-xs">{post.retweets}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isLikePending}
                          onClick={(e) => {
                            e.stopPropagation(); // 親要素のクリックイベントを防止
                            handleLikeToggle(post.id, post.is_liked_by_me);
                          }}
                          className={`flex items-center gap-1.5 group p-2 rounded-full transition disabled:opacity-60 disabled:cursor-not-allowed ${
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

                        <button type="button" className="flex items-center gap-1.5 hover:text-blue-500 group p-2 rounded-full transition">
                          <Share size={18} className="group-hover:bg-blue-50 rounded-full transition" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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

      {/* FF表示モーダル */}
      {ffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => setFfModalOpen(false)} />
          <div className="relative bg-white w-full max-w-md h-[80vh] rounded-2xl flex flex-col shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{ffModalTitle}</h2>
              <button
                type="button"
                onClick={() => setFfModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 font-bold text-sm transition"
              >
                閉じる
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {loadingFF ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400 font-medium">
                  読み込み中...
                </div>
              ) : ffUsers.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  ユーザーがいません
                </div>
              ) : (
                ffUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      setFfModalOpen(false);
                      router.push(`/profile/${u.id}`);
                    }}
                    className="p-4 flex gap-3 hover:bg-gray-50 transition cursor-pointer"
                  >
                    <Avatar src={u.icon_src} sx={{ width: 40, height: 40 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 truncate hover:underline">{u.username}</span>
                        <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0">
                          {u.grade}年生
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">
                        {u.bio || 'プロフィールは未設定です。'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/*  画像拡大表示用ポップアップモーダル */}
      {activeImageUrl && (
        <div
          onClick={() => setActiveImageUrl(null)} // 黒背景クリックで閉じる
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        >
          <button
            type="button"
            onClick={() => setActiveImageUrl(null)}
            className="absolute top-4 right-4 z-50 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition text-sm font-bold shadow-sm"
          >
            閉じる
          </button>

          <div className="relative max-w-5xl max-h-[90vh] flex items-center justify-center">
            <img
              src={activeImageUrl}
              alt="Expanded media"
              onClick={(e) => e.stopPropagation()} // 画像クリック時は閉じない
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl select-none"
            />
          </div>
        </div>
      )}

    </div>
  );
}