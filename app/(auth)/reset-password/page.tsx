'use client'

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  // 復旧セッションの状態: "checking" | "ready" | "invalid"
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // メールのリンクから来たときに復旧セッションが確立されるのを待つ
  useEffect(() => {
    let settled = false;
    const markReady = () => {
      if (!settled) {
        settled = true;
        setStatus('ready');
      }
    };

    // detectSessionInUrl によりリンクのトークンが処理されるとセッションが張られる
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady();
    });

    // 既にセッションが張られている場合のフォールバック
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    // 一定時間セッションが確立されなければ無効リンクとみなす
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus('invalid');
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (formData: FormData) => {
    setErrorMsg(null);

    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password.length < 8) {
      setErrorMsg('パスワードは8文字以上で入力してください。');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('パスワードが一致しません。');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) await supabase.auth.signOut(); 
    setLoading(false);

    if (error) {
      setErrorMsg('パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります。');
      return;
    }
    setDone(true);
  };

  return (
    <div className="size-full flex items-center justify-center bg-linear-to-br from-purple-50 to-blue-50">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">新しいパスワード</h1>
            <p className="text-gray-600">新しいパスワードを設定してください</p>
          </div>

          {status === 'checking' ? (
            <p className="text-center text-gray-500">リンクを確認しています...</p>
          ) : status === 'invalid' ? (
            <div className="space-y-6">
              <div className="p-4 bg-red-50 text-red-500 text-sm rounded-lg border border-red-100">
                リンクが無効か、有効期限が切れています。お手数ですが再度お試しください。
              </div>
              <a
                href="/forgot-password"
                className="block text-center w-full bg-linear-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition shadow-lg"
              >
                再設定をやり直す
              </a>
            </div>
          ) : done ? (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100">
                パスワードを更新しました。新しいパスワードでログインしてください。
              </div>
              <a
                href="/login"
                className="block text-center w-full bg-linear-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition shadow-lg"
              >
                ログインへ
              </a>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 text-red-500 text-sm rounded-lg border border-red-100">
                  {errorMsg}
                </div>
              )}

              <form action={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    新しいパスワード
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    新しいパスワード（確認）
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition shadow-lg disabled:opacity-60"
                >
                  {loading ? '更新中...' : 'パスワードを更新'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
