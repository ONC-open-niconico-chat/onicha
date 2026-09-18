'use client'

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, User, GraduationCap, BookOpen, School } from 'lucide-react';

export default function Signup() {

  const [faculties, setFaculties] = useState<{id: number,name:string}[]>([]);
  const [allDepartments, setAllDepartments] = useState<{id: number, name: string, faculty_id: number}[]>([]);
  const [filteredDepartments,setFilteredDepartments] = useState<{id:number,name: string}[]>([]);
  const [selectedFaculty,setSelectedFaculty] = useState<string>('');
  // 登録後：確認メール送信済み（ボタンを「メールをご確認ください」に変える）
  const [emailSent, setEmailSent] = useState(false);
  // 利用規約・プライバシーポリシーへの同意
  const [agreed, setAgreed] = useState(false);
  const allowedDomain = 'cs.u-ryukyu.ac.jp';
  
  

  //全学部と全学科を取得
  useEffect(() => {
    const fetchData = async () => {
      const { data:facultyData,error:facultyerror} = await supabase.from('faculty').select('*')
      const { data:deptData} = await supabase.from('department').select('*')
      
      if (facultyerror) console.error('学部取得エラー',facultyerror);
      console.log('取得した学部データ:', facultyData); 

      if (facultyData) setFaculties(facultyData);
      if (deptData) setAllDepartments(deptData);
      console.log('取得した学部データ2:', faculties); 
    };
    fetchData();
  },[]);

  

  //学部が選択されたら、それに対応する学科だけに絞り込む
  useEffect(() => {
    if(selectedFaculty){
      const filtered = allDepartments.filter(
        (d) =>d.faculty_id === parseInt(selectedFaculty)
      );
      setFilteredDepartments(filtered);
    } else {
      setFilteredDepartments([]);
    }
  },[selectedFaculty,allDepartments]);


  

  const handleSignup = async (formData:FormData) => {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const grade = formData.get('grade') as string;
    const deptId = formData.get('department_id') as string;
    const username = formData.get('username') as string;

    const fullEmail = `${email}@${allowedDomain}`;

    
    
    // 2. メールの末尾をチェック
    if (!fullEmail.endsWith(`@${allowedDomain}`)) {
      alert(`琉球大学のメールアドレス（@${allowedDomain}）のみ登録可能です。`);
      return; // ここで処理を中断！
    }
    

    if (password !== confirmPassword) {
      alert('パスワードが一致しません');
      return;
    }

    if (!agreed) {
      alert('利用規約とプライバシーポリシーへの同意が必要です');
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: fullEmail,
      password,
      options : {
        data: {
          username:username,
          grade: grade,
          department_id : parseInt(deptId),
        },
      },
    });

    if (error) {
      alert("エラーが発生しました：");
    } else {
      // ログイン画面へ遷移せず、ボタンを「メールをご確認ください」に変える
      setEmailSent(true);
    }

    
  };

  

  return (
    <div className="size-full flex items-center justify-center bg-linear-to-br from-purple-50 to-blue-50 overflow-auto py-8">
      <div className="w-full max-w-4xl mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">新規登録</h1>
            <p className="text-gray-600">アカウントを作成してください</p>
          </div>

          <form action={handleSignup}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  ユーザーネーム
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    name="username"
                    type="text"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    autoComplete="off"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
                  学年 (任意)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <GraduationCap className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    name="grade"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition appearance-none bg-white"
                  >
                    <option value="">選択してください</option>
                    <option value="1">1年生</option>
                    <option value="2">2年生</option>
                    <option value="3">3年生</option>
                    <option value="4">4年生</option>
                    {/*<option value="master1">修士1年</option>
                    <option value="master2">修士2年</option>
                    <option value="doctor">博士課程</option>*/}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  メールアドレス(eから始まる学籍番号を入力してください)
                </label>
                <div className="flex items-center w-full border border-gray-200 rounded-xl overflow-hidden focus-within:border-blue-500 bg-white transition-colors">
                  <div className="relative flex-1 min-w-0">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      name="email"
                      type="text"
                      className={"block w-full pl-10 pr-3 py-2.5 border border-gray-300 focus:border-purple-500"}
                      placeholder="eXXXXXX"
                      autoComplete="one-time-code"
                      required
                    />
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-gray-500 text-xs sm:text-sm px-2 sm:px-4 py-3 border-l border-gray-200 select-none font-medium">
                    @cs.u-ryukyu.ac.jp
                  </div>
                </div>
              </div>

              {/* 学部セレクト */}
              <div>
                <label htmlFor="faculty" className="block text-sm font-medium text-gray-700 mb-2">
                  学部 (任意)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <School className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    name="faculty"
                    value={selectedFaculty}
                    onChange={(e) => setSelectedFaculty(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    
                  >
                    <option value="">学部を選択してください</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                      
                    ))}
                  </select>
                </div>
              </div>


              {/* 学科セレクト（学部が選ばれるまで無効化） */}
              <div>
                <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-2">
                  学科 (任意)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BookOpen className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    name='department_id'
                    disabled={!selectedFaculty}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  >
                    <option value="">学科を選択してください</option>
                    {filteredDepartments.map((d)=> (
                      <option key ={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
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
                    name="password"
                    type="password"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="8文字以上"
                    minLength={8}
                    autoComplete="off"
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
                    name="confirmPassword"
                    type="password"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    placeholder="パスワードを再入力"
                    minLength={8}
                    autoComplete="off"
                    required
                  />
                </div>
              </div>
            </div>

            

            {!emailSent && (
              <div className="col-span-2 mt-4">
                <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">利用規約</a>
                    ・
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">プライバシーポリシー</a>
                    に同意します
                  </span>
                </label>
              </div>
            )}

            <div className="col-span-2 mt-4">
              <button
                type="submit"
                disabled={emailSent || !agreed}
                className={`w-full py-3 rounded-lg font-medium transition shadow-lg ${
                  emailSent
                    ? "bg-green-600 text-white cursor-default"
                    : "bg-linear-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
              >
                {emailSent ? "メールをご確認ください" : "アカウントを作成"}
              </button>
              {emailSent && (
                <p className="mt-3 text-center text-sm text-gray-600">
                  確認メールを送信しました。メール内のリンクから認証を完了してください。
                </p>
              )}
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