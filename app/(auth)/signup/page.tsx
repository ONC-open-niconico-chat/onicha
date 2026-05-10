'use client'

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, User, GraduationCap, BookOpen, School } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Signup() {

  const router = useRouter();

  const [faculties, setFaculties] = useState<{id: number,name:string}[]>([]);
  const [allDepartments, setAllDepartments] = useState<{id: number, name: string, faculty_id: number}[]>([]);
  const [filteredDepartments,setFilteredDepartments] = useState<{id:number,name: string}[]>([]);
  const [selectedFaculty,setSelectedFaculty] = useState<string>('');
  const allowedDomain = 'cs.u-ryukyu.ac.jp';
  
  

  //全学部と全学科を取得
  useEffect(() => {
    const fetchData = async () => {
      const { data:facultyData,error:facultyerror} = await supabase.from('学部').select('*')
      const { data:deptData} = await supabase.from('学科').select('*')
      
      if (facultyerror) console.error('学部取得エラー',facultyerror);
      console.log('取得した学部データ:', facultyData); // ←ここを確認！

      if (facultyData) setFaculties(facultyData);
      if (deptData) setAllDepartments(deptData);
      console.log('取得した学部データ2:', faculties); // ←ここを確認！
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

    
    
    // 2. メールの末尾をチェック
    if (!email.endsWith(`@${allowedDomain}`)) {
      alert(`琉大の知能情報コースのメールアドレス（@${allowedDomain}）のみ登録可能です。`);
      return; // ここで処理を中断！
    }
    

    if (password !== confirmPassword) {
      alert('パスワードが一致しません');
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options : {
        data: {
          username:username,
          grade: grade,
          department_id : parseInt(deptId),
        },
      },
    });

    console.log(email)
    console.log(password)
    console.log(grade)
    console.log(deptId)
    console.log(username)

    if (error) {
      alert("エラーが発生しました：");
    } else {
      alert("確認メールを送信しました。メールのリンクからログインしてください");
      router.push('/login');
    }

    
  };

  

  return (
    <div className="size-full flex items-center justify-center bg-linear-to-br from-purple-50 to-blue-50 overflow-auto py-8">
      <div className="w-full max-w-4xl mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">新規登録</h1>
            <p className="text-gray-600">アカウントを作成してください</p>
          </div>

          <form action={handleSignup}>
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
                    name="username"
                    type="text"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    
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
                    name="grade"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition appearance-none bg-white"
                    required
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
                  メールアドレス
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    name="email"
                    type="email"
                    className={"block w-full pl-10 pr-3 py-2.5 border border-gray-300 focus:border-purple-500"}
                    placeholder="example@cs.u-ryukyu.ac.jp"
                    required
                  />

                  
                </div>
              </div>

              {/* 学部セレクト */}
              <div>
                <label htmlFor="faculty" className="block text-sm font-medium text-gray-700 mb-2">
                  学部
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
                    
                    required
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
                  学科
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BookOpen className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    name='department_id'
                    disabled={!selectedFaculty}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    required
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