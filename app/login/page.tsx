'use client'

import { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createBrowserClient } from '@supabase/ssr';

export default function Login() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading,setLoading] = useState(false);

  const handleLogin = async (formData:FormData) => {
    setLoading(true);
    setErrorMsg(null);
    

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setErrorMsg("ログインに失敗しました。")
      setLoading(false);
    } else {
      //window.location.href = '/';
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="size-full flex items-center justify-center bg-linear-to-br from-purple-50 to-blue-50">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ログイン</h1>
            <p className="text-gray-600">アカウントにログインしてください</p>
          </div>

          <form action={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                メールアドレス
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name='email'
                  type="email"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  placeholder="example@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                パスワード
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  name='password'
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="ml-2 text-sm text-gray-600">ログイン状態を保持</span>
              </label>
              <a href="#" className="text-sm text-purple-600 hover:text-purple-700">
                パスワードを忘れた場合
              </a>
            </div>

            <button
              type="submit"
              className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition shadow-lg"
            >
              ログイン
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-600">
            アカウントをお持ちでない方は{' '}
            <a href="/signup" className="font-medium text-purple-600 hover:text-purple-700">
              新規登録
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}