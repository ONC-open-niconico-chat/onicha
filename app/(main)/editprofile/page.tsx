"use client";

import { useState, useRef } from 'react';
import { ImageWithFallback } from '../profile/ImageWithFallback';
import { Avatar } from '@mui/material';
import { X, Camera } from 'lucide-react';

interface EditProfileProps {
  initialUsername: string;
  initialGrade: number;
  iconSrc: string;
  initialCoverSrc: string; //初期カバー画像URL
  initialBio: string;
  onClose: () => void;
  // 引数の最後に coverFile を追加
  onSave: (username: string, grade: number, bio: string, imageFile: File | null, coverFile: File | null) => Promise<void>; 
}

export default function EditProfile({
  initialUsername,
  initialGrade,
  iconSrc,
  initialCoverSrc, 
  initialBio,
  onClose,
  onSave
}: EditProfileProps) {
  const [username, setUsername] = useState(initialUsername);
  const [grade, setGrade] = useState(initialGrade);
  const [bio, setBio] = useState(initialBio || "");
  const [isSaving, setIsSaving] = useState(false);

  // アバター画像用
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(iconSrc);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // カバー画像用のStateとRef
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [previewCoverUrl, setPreviewCoverUrl] = useState<string>(initialCoverSrc);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // アバター画像が選択されたとき
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // カバー画像が選択されたとき
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setPreviewCoverUrl(URL.createObjectURL(file));
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  // カバー画像エリアがクリックされたとき
  const handleCoverClick = () => {
    coverInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      setIsSaving(true);
      // imageFile の後ろに coverFile も添えて親に送る
      await onSave(username, grade, bio, imageFile, coverFile); 
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

        {/* カバー画像用の隠しインプット */}
        <input 
          type="file" 
          ref={coverInputRef}
          onChange={handleCoverChange}
          accept="image/*"
          className="hidden"
        />

        {/* カバー・アバター画像 */}
        <div className="relative">
          {/* クリックイベントを追加し、divタグに変更して扱いやすく */}
          <div onClick={handleCoverClick} className="relative group cursor-pointer">
            <ImageWithFallback
              src={previewCoverUrl} // 固定URLからプレビューStateに変更
              alt="Cover"
              className="w-full h-48 sm:h-52 object-cover bg-gray-200"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition flex items-center justify-center">
              <div className="bg-black/60 p-2.5 rounded-full">
                <Camera size={22} className="text-white" />
              </div>
            </div>
          </div>

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
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[15px] bg-white transition"
            >
              {[1, 2, 3, 4].map((g) => (
                <option key={g} value={g}>{g}年生</option>
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