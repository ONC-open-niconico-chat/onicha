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
  // 無効時に原因を表示するためのデバッグ情報
  const [debug, setDebug] = useState<string | null>(null);

  // メールのリンクから来たときに、URL 内のトークンを明示的に処理して復旧セッションを張る。
  // token_hash（推奨）/ PKCE code / implicit ハッシュ / 既存セッション のすべてに対応。
  useEffect(() => {
    let cancelled = false;
    const fail = (reason: string) => {
      if (!cancelled) {
        setDebug(reason);
        setStatus('invalid');
      }
    };
    const ok = () => {
      if (!cancelled) setStatus('ready');
    };

    const run = async () => {
      const q = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      // 1) エラーが素通りしてきた場合（otp_expired / access_denied など）
      const errCode = q.get('error_code') || hash.get('error_code');
      const errDesc = q.get('error_description') || hash.get('error_description');
      if (errCode) return fail(`${errCode}: ${(errDesc || '').replace(/\+/g, ' ')}`);

      // 2) すでにセッションがある場合はそのまま
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) return ok();

      // 3) token_hash 方式（メールテンプレートを ?token_hash=...&type=recovery にしたとき）
      const token_hash = q.get('token_hash');
      if (token_hash) {
        const type = (q.get('type') || 'recovery') as 'recovery';
        const { error } = await supabase.auth.verifyOtp({ type, token_hash });
        return error ? fail(`verifyOtp: ${error.message}`) : ok();
      }

      // 4) PKCE code 方式（?code=...）
      const code = q.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return error ? fail(`exchangeCodeForSession: ${error.message}`) : ok();
      }

      // 5) implicit 方式（#access_token=...&refresh_token=...）
      const access_token = hash.get('access_token');
      const refresh_token = hash.get('refresh_token');
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        return error ? fail(`setSession: ${error.message}`) : ok();
      }

      // 6) トークンが見当たらない
      fail('URL に認証トークンが見つかりません（token_hash / code / access_token いずれも無し）');
    };

    run();
    return () => {
      cancelled = true;
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
              {debug && (
                <p className="text-xs text-gray-400 text-center break-all">詳細: {debug}</p>
              )}
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
