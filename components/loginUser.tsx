'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

// 1. 独自ユーザーテーブルの型定義
type UserProfile = {
  id: string;
  username: string;
};

type AuthContextType = {
  authUser: User | null;         // Supabase Authの認証データ
  userProfile: UserProfile | null; // 追加する、DBのユーザーオブジェクト
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ authUser: null, userProfile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ★該当するuser_idのオブジェクトをDBから1件取得する関数
  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user') // もしテーブル名が 'profiles' なら書き換えてください
      .select('*')
      .eq('id', userId)
      .single(); 

    if (error) {
      console.error('ユーザープロフィールの取得に失敗しました:', error.message);
      return null;
    }
    return data as UserProfile;
  };

  useEffect(() => {
    const initAuth = async () => {
      // 1. まずログイン中のAuthユーザーを取得
      const { data: { user } } = await supabase.auth.getUser();
      setAuthUser(user);

      if (user) {
        // 2. ★ユーザーが存在したら、即座にDBからプロフィールオブジェクトを取得してセット
        const profile = await fetchUserProfile(user.id);
        setUserProfile(profile);
      }
      setLoading(false);
    };
    initAuth();

    // ログイン・ログアウトの状態変化を監視
    // ⚠️ このコールバックは同期関数にすること。内部で await（特に supabase の
    //    getSession()/getUser()/from() 等）を呼ぶと gotrue の認証ロックを保持したまま
    //    待機してデッドロックし、以後すべてのクエリが「読み込み中」のまま固まる。
    //    DB 取得はロック外へ逃がすため setTimeout(…, 0) で別タスクに分離する。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentAuthUser = session?.user ?? null;
      setAuthUser(currentAuthUser);

      if (currentAuthUser) {
        setTimeout(async () => {
          const profile = await fetchUserProfile(currentAuthUser.id);
          setUserProfile(profile);
        }, 0);
      } else {
        // ログアウト（SIGNED_OUT）時はクリア
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ authUser, userProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);