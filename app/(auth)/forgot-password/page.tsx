'use client'

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ForgotPassword() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const allowedDomain = 'cs.u-ryukyu.ac.jp';

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);
    setErrorMsg(null);

    const email = formData.get('email') as string;
    const fullEmail = `${email}@${allowedDomain}`;

    const { error } = await supabase.auth.resetPasswordForEmail(fullEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      // メールアドレスの存在有無は伝えず、汎用エラーのみ
      setErrorMsg('送信に失敗しました。時間をおいて再度お試しください。');
      return;
    }
    setSent(true);
  };

  return (
    <div className="size-full flex items-center justify-center bg-linear-to-br from-purple-50 to-blue-50">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">パスワード再設定</h1>
            <p className="text-gray-600">登録メールアドレスに再設定リンクを送ります</p>
          </div>

          {sent ? (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100">
                再設定用のリンクをメールで送信しました。メール内のリンクから新しいパスワードを設定してください。
              </div>
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
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    メールアドレス(eから始まる学籍番号を入力してください)
                  </label>
                  <div className="flex items-center w-full max-w-sm border border-gray-300 rounded-xl overflow-hidden focus-within:border-purple-500 bg-white transition-colors">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-gray-400" />
                      </div>
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
                    <div className="bg-gray-50 text-gray-500 text-sm px-4 py-3 border-l border-gray-200 select-none font-medium whitespace-nowrap">
                      @cs.u-ryukyu.ac.jp
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition shadow-lg disabled:opacity-60"
                >
                  {loading ? '送信中...' : '再設定リンクを送信'}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-gray-600">
                <a href="/login" className="font-medium text-purple-600 hover:text-purple-700">
                  ログインへ戻る
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
