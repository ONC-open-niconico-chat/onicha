"use client";

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ProfileIndex() {
  const router = useRouter();

  useEffect(() => {
    async function redirectToMyProfile() {
      // ログイン中のユーザー情報を取得（getSession はローカル即時取得で高速・安定）
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
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
