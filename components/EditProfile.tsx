"use client";

import { useState, useRef, useEffect } from 'react';
import { Avatar } from '@mui/material';
import { X, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface EditProfileProps {
  initialUsername: string;
  initialGrade: number | null;
  initialDepartmentId: number | null;
  iconSrc: string;
  initialBio: string;
  onClose: () => void;
  onSave: (
    username: string,
    grade: number | null,
    bio: string,
    departmentId: number | null,
    imageFile: File | null
  ) => Promise<void>;
}

type Faculty = { id: number; name: string };
type Department = { id: number; name: string; faculty_id: number };

export default function EditProfile({
  initialUsername,
  initialGrade,
  initialDepartmentId,
  iconSrc,
  initialBio,
  onClose,
  onSave
}: EditProfileProps) {
  const [username, setUsername] = useState(initialUsername);
  const [grade, setGrade] = useState<number | null>(initialGrade ?? null);
  const [bio, setBio] = useState(initialBio || "");
  const [isSaving, setIsSaving] = useState(false);

  // 学部・学科（連動プルダウン）
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facultyId, setFacultyId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(initialDepartmentId ?? null);

  // 学部・学科マスタを取得し、初期学科から所属学部を割り出す
  useEffect(() => {
    (async () => {
      const [{ data: fac }, { data: dep }] = await Promise.all([
        supabase.from('faculty').select('id, name').order('id'),
        supabase.from('department').select('id, name, faculty_id').order('id'),
      ]);
      setFaculties((fac as Faculty[]) ?? []);
      setDepartments((dep as Department[]) ?? []);
      if (initialDepartmentId != null) {
        const d = ((dep as Department[]) ?? []).find((x) => x.id === initialDepartmentId);
        if (d) setFacultyId(d.faculty_id);
      }
    })();
  }, [initialDepartmentId]);

  // 学部を変えたら、選択中の学科がその学部に属さなければクリア
  const handleFacultyChange = (v: number | null) => {
    setFacultyId(v);
    if (v == null) { setDepartmentId(null); return; }
    const d = departments.find((x) => x.id === departmentId);
    if (!d || d.faculty_id !== v) setDepartmentId(null);
  };

  // アバター画像用
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(iconSrc);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // アバター画像が選択されたとき
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      setIsSaving(true);
      await onSave(username, grade, bio, departmentId, imageFile);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="size-full bg-white overflow-auto text-gray-900 selection:bg-blue-100">
      <div className="w-full bg-white text-gray-900 min-h-screen border-l border-gray-100 pb-20">

        {/* ヘッダー */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition"
              disabled={isSaving}
              type="button"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold">プロフィールを編集</h2>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !username.trim()}
            className="bg-gray-900 text-white px-4 py-1.5 rounded-full hover:bg-gray-800 font-bold text-sm transition disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>

        {/* アバター用の隠しインプット */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageChange}
          accept="image/*"
          className="hidden"
        />

        {/* 背景（グラデーション）・アバター画像 */}
        <div className="relative">
          <div className="w-full h-48 sm:h-52 bg-linear-to-r from-blue-500 to-indigo-600" />

          <div className="absolute -bottom-16 left-4 sm:left-6">
            <div onClick={handleAvatarClick} className="relative group cursor-pointer">
              <Avatar
                src={previewUrl}
                sx={{
                  width: { xs: 96, sm: 136 },
                  height: { xs: 96, sm: 136 },
                  border: '4px solid white',
                  backgroundColor: '#e5e7eb'
                }}
              />
              <div className="absolute inset-0 bg-black/30 rounded-full opacity-60 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="bg-black/40 p-2 rounded-full">
                  <Camera size={18} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 入力フォーム */}
        <form onSubmit={handleSubmit} className="pt-20 px-4 sm:px-6 pb-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">名前</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={50}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[15px] transition"
              placeholder="ユーザー名を入力"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">学年</label>
            <select
              value={grade ?? ""}
              onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[15px] bg-white transition"
            >
              <option value="">未設定</option>
              {[1, 2, 3, 4].map((g) => (
                <option key={g} value={g}>{g}年生</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">学部</label>
            <select
              value={facultyId ?? ""}
              onChange={(e) => handleFacultyChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[15px] bg-white transition"
            >
              <option value="">未設定</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">学科</label>
            <select
              value={departmentId ?? ""}
              onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
              disabled={facultyId == null}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[15px] bg-white transition disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{facultyId == null ? "先に学部を選択" : "未設定"}</option>
              {departments
                .filter((d) => d.faculty_id === facultyId)
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-gray-500">自己紹介</label>
              <span className="text-xs text-gray-400">{(bio || "").length} / 160</span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={4}
              placeholder="自己紹介文を入力してください"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[15px] resize-none transition"
            />
          </div>
        </form>

      </div>
    </div>
  );
}
