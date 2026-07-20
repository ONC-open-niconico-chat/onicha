"use client";

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Avatar } from '@mui/material';
import { ArrowLeft, MessageCircle, Heart, Repeat2, Send } from 'lucide-react';

interface Post {
  id: number;
  content: string;
  created_at: string;
  image_url?: string;
  user_id: string;
  number_of_likes: number;
  reply_to_id?: number;
}

interface UserProfile {
  id: string;
  username: string;
  icon_src: string;
}

function formatPostTime(createdAtString: string): string {
  if (!createdAtString) return '';
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

export default function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Post[]>([]);
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: UserProfile }>({});
  const [myId, setMyId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchThread = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setMyId(user.id);
        const { data: pData } = await supabase.from('user').select('*').eq('id', user.id).single();
        if (pData) setMyProfile(pData);
      }

      const { data: mainPost } = await supabase.from('post').select('*').eq('id', id).single();
      setPost(mainPost);

      const { data: replyList } = await supabase.from('post').select('*').eq('reply_to_id', id).order('created_at', { ascending: true });
      setReplies(replyList || []);

      const userIds = new Set<string>();
      if (mainPost?.user_id) userIds.add(mainPost.user_id);
      replyList?.forEach(r => { if (r.user_id) userIds.add(r.user_id); });

      if (userIds.size > 0) {
        const { data: profilesData } = await supabase.from('user').select('*').in('id', Array.from(userIds));
        const profileMap: { [key: string]: UserProfile } = {};
        profilesData?.forEach(p => { profileMap[p.id] = p; });
        setUserProfiles(profileMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
  }, [id]);

  const handleCreateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !myId || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('post')
        .insert({
          user_id: myId,
          content: replyText,
          number_of_likes: 0,
          reply_to_id: Number(id)
        });

      if (error) throw error;

      setReplyText('');
      await fetchThread();
    } catch (error) {
      console.error('返信エラー:', error);
      alert('返信に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;
  if (!post) return <div className="p-6 text-center">投稿が見つかりませんでした</div>;

  const postUser = userProfiles[post.user_id];

 return (
  <div className="w-full bg-white text-gray-900 min-h-screen border-l border-gray-100 pb-20">
    {/* ヘッダー以降... */}
      <div className="sticky top-0 bg-white/90 backdrop-blur p-4 border-b flex items-center gap-4 z-10">
        <button onClick={() => router.back()} className="hover:bg-gray-100 p-2 rounded-full transition"><ArrowLeft size={20} /></button>
        <h1 className="font-bold text-xl">スレッド</h1>
      </div>

      {/* 本体の投稿（通常ポストと同じUI構造） */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex gap-3">
          <Avatar src={postUser?.icon_src} sx={{ width: 40, height: 40 }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
              <span className="font-bold hover:underline">{postUser?.username || 'ユーザー'}</span>
              <span className="text-gray-500 text-sm">·</span>
              <span className="text-gray-500 text-sm hover:underline">{formatPostTime(post.created_at)}</span>
            </div>
            <p className="text-[15px] leading-normal whitespace-pre-wrap">{post.content}</p>
            {post.image_url && <img src={post.image_url} className="mt-2 rounded-xl max-h-60 cursor-pointer object-cover w-full" />}
            
            <div className="flex justify-between mt-3 max-w-xs text-gray-500">
              <button className="flex items-center gap-1 hover:text-blue-500 transition">
                <MessageCircle size={18} />
                <span className="text-xs">{replies.length > 0 ? replies.length : ''}</span>
              </button>
              <button className="flex items-center gap-1 hover:text-green-500 transition">
                <Repeat2 size={18} />
              </button>
              <button className="flex items-center gap-1 hover:text-red-500 transition">
                <Heart size={18} />
                <span className="text-xs">{post.number_of_likes > 0 ? post.number_of_likes : ''}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 返信入力フォーム */}
      <form onSubmit={handleCreateReply} className="p-4 border-b border-gray-200 bg-gray-50/30 flex gap-3">
        <Avatar src={myProfile?.icon_src} sx={{ width: 40, height: 40 }} />
        <div className="flex-1">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="返信する"
            rows={2}
            className="w-full text-[17px] bg-transparent outline-none resize-none placeholder-gray-400 text-gray-900 mb-1"
            disabled={isSubmitting}
          />
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={!replyText.trim() || isSubmitting}
              className="bg-blue-500 text-white font-bold px-4 py-1.5 rounded-full text-sm hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send size={14} />
              {isSubmitting ? '送信中...' : '返信'}
            </button>
          </div>
        </div>
      </form>

      {/* 返信一覧（通常ポストと同じUI構造） */}
      <div className="divide-y divide-gray-200">
        {replies.map((reply) => {
          const replyUser = userProfiles[reply.user_id];
          return (
            <div key={reply.id} className="p-4 hover:bg-gray-50/50 transition flex gap-3">
              <Avatar src={replyUser?.icon_src} sx={{ width: 40, height: 40 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[15px] mb-0.5 flex-wrap">
                  <span className="font-bold hover:underline">{replyUser?.username || 'ユーザー'}</span>
                  <span className="text-gray-500 text-sm">·</span>
                  <span className="text-gray-500 text-sm hover:underline">{formatPostTime(reply.created_at)}</span>
                </div>
                <p className="text-[15px] leading-normal whitespace-pre-wrap">{reply.content}</p>
                {reply.image_url && <img src={reply.image_url} className="mt-2 rounded-xl max-h-60 cursor-pointer object-cover w-full" />}
                
                <div className="flex justify-between mt-3 max-w-xs text-gray-500">
                  <button className="flex items-center gap-1 hover:text-blue-500 transition">
                    <MessageCircle size={18} />
                  </button>
                  <button className="flex items-center gap-1 hover:text-green-500 transition">
                    <Repeat2 size={18} />
                  </button>
                  <button className="flex items-center gap-1 hover:text-red-500 transition">
                    <Heart size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {replies.length === 0 && (
          <div className="py-20 text-center text-sm text-gray-400">
            まだ返信はありません
          </div>
        )}
      </div>
    </div>
  );
}