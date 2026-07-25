"use client";

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ProfileIndex() {
  const router = useRouter();

  useEffect(() => {
    async function redirectToMyProfile() {
      // ログイン中のユーザー情報を取得
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        // 未ログインならログイン画面へ
        router.replace('/login');
        return;
      }

      // ログインユーザーのID付きURL（/profile/xxx）へ自動転送
      router.replace(`/profile/${user.id}`);
    }

    redirectToMyProfile();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen text-gray-500 font-medium">
      読み込み中...
    </div>
  );
}
