'use client'

import { useState } from 'react';


import { Mail, Lock, User, GraduationCap, BookOpen, School } from 'lucide-react';

export default function Signup() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [grade, setGrade] = useState('');
  const [faculty, setFaculty] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSignup = (e:any) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert('パスワードが一致しません');
      return;
    }

    console.log('新規登録:', { name, username, grade, faculty, department, email, password });
    // ここで実際の登録処理を行います
  };

  return (
    <div className="size-full flex items-center justify-center bg-linear-to-br from-purple-50 to-blue-50 overflow-auto py-8">
      <div className="w-full max-w-4xl mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">新規登録</h1>
            <p className="text-gray-600">アカウントを作成してください</p>
          </div>

          <form onSubmit={handleSignup}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  ユーザーネーム
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="yamada_taro"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
                  学年
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <GraduationCap className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    id="grade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition appearance-none bg-white"
                    required
                  >
                    <option value="">選択してください</option>
                    <option value="1">1年生</option>
                    <option value="2">2年生</option>
                    <option value="3">3年生</option>
                    <option value="4">4年生</option>
                    <option value="master1">修士1年</option>
                    <option value="master2">修士2年</option>
                    <option value="doctor">博士課程</option>
                  </select>
                </div>
              </div>

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
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="example@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="faculty" className="block text-sm font-medium text-gray-700 mb-2">
                  学部
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <School className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="faculty"
                    type="text"
                    value={faculty}
                    onChange={(e) => setFaculty(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="例: 工学部"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-2">
                  学科
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BookOpen className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="department"
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="例: 情報工学科"
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="8文字以上"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  パスワード（確認）
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="パスワードを再入力"
                    minLength={8}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="col-span-2 flex items-start mt-2">
              <input
                id="terms"
                type="checkbox"
                className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                required
              />
              <label htmlFor="terms" className="ml-2 text-sm text-gray-600">
                <a href="#" className="text-purple-600 hover:text-purple-700">利用規約</a>
                {' '}と{' '}
                <a href="#" className="text-purple-600 hover:text-purple-700">プライバシーポリシー</a>
                に同意します
              </label>
            </div>

            <div className="col-span-2 mt-4">
              <button
                type="submit"
                className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition shadow-lg"
              >
                アカウントを作成
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            すでにアカウントをお持ちの方は{' '}
            <a href="login" className="font-medium text-purple-600 hover:text-purple-700">
              ログイン
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}