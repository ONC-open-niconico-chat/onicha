'use client'

import { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading,setLoading] = useState(false);
  const allowedDomain = 'cs.u-ryukyu.ac.jp';

  const handleLogin = async (formData:FormData) => {
    setLoading(true);
    setErrorMsg(null);
    

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const fullEmail = `${email}@${allowedDomain}`;

    const { error } = await supabase.auth.signInWithPassword({
      email: fullEmail,
      password
    });

    if (error) {
      setErrorMsg("ログインに失敗しました。")
      setLoading(false);
    } else {
      
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


          {/* エラーメッセージ表示 */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 text-red-500 text-sm rounded-lg border border-red-100">
              {errorMsg}
            </div>
          )}

          <form action={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                メールアドレス(eから始まる学籍番号を入力してください)
              </label>
              <div className="flex items-center w-full max-w-sm border border-gray-300 rounded-xl overflow-hidden focus-within:border-purple-500 bg-white transition-colors">
                
                {/* 入力エリア（アイコンとインプットをここに同居させる） */}
                <div className="relative flex-1">
                  {/* メールアイコン */}
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  
                  {/* インプット*/}
                  <input
                    id="email"
                    name="email"
                    type="text"
                    className="block w-full pl-10 pr-3 py-3 text-sm outline-none bg-transparent"
                    placeholder="eXXXXXX"
                    required
                    autoComplete="one-time-code"
                  />
                </div>

                {/* ドメイン表示部分 */}
                <div className="bg-gray-50 text-gray-500 text-sm px-4 py-3 border-l border-gray-200 select-none font-medium whitespace-nowrap">
                  @cs.u-ryukyu.ac.jp
                </div>
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
                  autoComplete="off"
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
              {loading ? 'ログイン中...' : 'ログイン'}
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