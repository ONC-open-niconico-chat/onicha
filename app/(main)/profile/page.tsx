"use client";

import { useState } from 'react';
import { ImageWithFallback } from '../../../components/profile/ImageWithFallback';
import { Avatar } from '@mui/material';
import { Heart, MessageCircle, Repeat2, Share, Settings } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';

export default function App() {
  const [activeTab, setActiveTab] = useState('posts');

  const posts = [
    {
      id: 1,
      text: '今日は天気が良かったので近所の公園を散歩してきました。桜が綺麗でした🌸',
      time: '2時間前',
      likes: 342,
      retweets: 23,
      comments: 12
    },
    {
      id: 2,
      text: '新しいカメラを買いました！週末にいろいろ撮影してみようと思います📷',
      time: '5時間前',
      likes: 521,
      retweets: 45,
      comments: 28
    },
    {
      id: 3,
      text: 'おすすめのラーメン屋さん見つけた。スープが絶品でした🍜',
      time: '1日前',
      likes: 289,
      retweets: 18,
      comments: 34
    },
    {
      id: 4,
      text: '最近読んだ本がとても面白かった。みなさんにもおすすめしたいです📚',
      time: '2日前',
      likes: 456,
      retweets: 32,
      comments: 19
    },
    {
      id: 5,
      text: '朝のコーヒータイム☕️ 今日も一日頑張ります',
      time: '3日前',
      likes: 678,
      retweets: 54,
      comments: 41
    },
  ];

  return (
    <div className="size-full bg-white overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1659514841224-f4872843f5b9?w=1200&h=300&fit=crop"
            alt="Cover"
            className="w-full h-64 object-cover"
          />

          <div className="absolute -bottom-16 left-8">
            <Avatar
              src="https://images.unsplash.com/photo-1652781335326-b7e64b014c90?w=160"
              sx={{ width: 128, height: 128, border: '4px solid white' }}
            />
          </div>

          <button className="absolute top-4 right-4 bg-white px-4 py-2 rounded-full shadow-md hover:bg-gray-50 flex items-center gap-2">
            <Settings size={18} />
            プロフィール編集
          </button>
        </div>

        <div className="pt-20 px-8 pb-6 border-b border-gray-200">
          <div className="mb-4">
            <p className="font-medium">田中 太郎</p>
            <p className="text-gray-500">@tanaka_taro</p>
          </div>

          <p className="text-gray-700">
            写真と旅行が好きです 📸 | 自然の美しさを記録しています | 東京在住 🗼
          </p>
        </div>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="flex border-b border-gray-200">
            <Tabs.Trigger
              value="posts"
              className="flex-1 py-4 text-center data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 hover:bg-gray-50"
            >
              ツイート
            </Tabs.Trigger>
            <Tabs.Trigger
              value="liked"
              className="flex-1 py-4 text-center data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 hover:bg-gray-50"
            >
              返信
            </Tabs.Trigger>
            <Tabs.Trigger
              value="saved"
              className="flex-1 py-4 text-center data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 hover:bg-gray-50"
            >
              メディア
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="posts">
            <div>
              {posts.map((post) => (
                <div key={post.id} className="border-b border-gray-200 p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex gap-3">
                    <Avatar
                      src="https://images.unsplash.com/photo-1652781335326-b7e64b014c90?w=40"
                      sx={{ width: 40, height: 40 }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">田中 太郎</span>
                        <span className="text-gray-500">@tanaka_taro</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-500">{post.time}</span>
                      </div>
                      <p className="mb-3">{post.text}</p>
                      <div className="flex gap-8 text-gray-500">
                        <button className="flex items-center gap-2 hover:text-blue-500 group">
                          <MessageCircle size={18} className="group-hover:bg-blue-50 rounded-full p-1 box-content" />
                          <span>{post.comments}</span>
                        </button>
                        <button className="flex items-center gap-2 hover:text-green-500 group">
                          <Repeat2 size={18} className="group-hover:bg-green-50 rounded-full p-1 box-content" />
                          <span>{post.retweets}</span>
                        </button>
                        <button className="flex items-center gap-2 hover:text-red-500 group">
                          <Heart size={18} className="group-hover:bg-red-50 rounded-full p-1 box-content" />
                          <span>{post.likes}</span>
                        </button>
                        <button className="flex items-center gap-2 hover:text-blue-500 group">
                          <Share size={18} className="group-hover:bg-blue-50 rounded-full p-1 box-content" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Tabs.Content>

          <Tabs.Content value="liked">
            <div className="py-20 text-center text-gray-500">
              返信がここに表示されます
            </div>
          </Tabs.Content>

          <Tabs.Content value="saved">
            <div className="py-20 text-center text-gray-500">
              メディアがここに表示されます
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}