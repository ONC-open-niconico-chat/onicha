'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

type UserProfile = {
  id: string;
  username: string;
};

type AuthContextType = {
  authUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ authUser: null, userProfile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user')
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
    // onAuthStateChange は購読直後に INITIAL_SESSION を発火するので、
    // 明示的な初期化フェッチは不要。ここに一本化することで
    // getSession()/getUser() の余計な呼び出し（タブ復帰時 hang の原因）を減らす。
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentAuthUser = session?.user ?? null;

      // id が同じなら state を更新しない（参照を維持して useAuth 依存の useEffect を再発火させない）
      // TOKEN_REFRESHED でも Supabase は新しい User オブジェクトを渡してくるので、ここで比較して弾く
      setAuthUser((prev) => {
        if (prev?.id === currentAuthUser?.id) return prev;
        return currentAuthUser;
      });

      // プロフィール取得は「本当にユーザーが変わった」タイミングのみ。
      if (currentAuthUser && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        const profile = await fetchUserProfile(currentAuthUser.id);
        setUserProfile(profile);
      } else if (!currentAuthUser) {
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
