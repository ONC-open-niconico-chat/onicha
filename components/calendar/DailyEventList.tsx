"use client";

import React from "react";
import { Clock, MapPin, Trash2 } from "lucide-react";

interface EventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  description?: string;
  location?: string;
  circle_id?: string | number;   // 💡 サークルIDの型
  isMyCircleEvent?: boolean;     // 💡 自分が作ったイベントかどうかの判定フラグ
}

interface DailyEventListProps {
  selectedDate: string;
  events: EventItem[];
  onDeleteEvent?: (id: string) => void; 
}

export function DailyEventList({ selectedDate, events, onDeleteEvent }: DailyEventListProps) {
  
  // 💡 選択された日付が「開始日」から「終了日」の期間内にあるかを判定
  const dailyEvents = events.filter((event) => {
    const targetDate = new Date(selectedDate);
    const eventStartDate = new Date(event.start.split("T")[0]);
    const eventEndDate = event.end ? new Date(event.end.split("T")[0]) : new Date(event.start.split("T")[0]);

    return targetDate >= eventStartDate && targetDate <= eventEndDate;
  });

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [_, month, day] = dateStr.split("-");
    return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
  };

  const formatTime = (event: EventItem) => {
    const isMultiDay = event.end && event.start.split("T")[0] !== event.end.split("T")[0];
    
    if (isMultiDay) return "連日イベント";
    if (!event.start.includes("T")) return "終日";
    
    const timePart = event.start.split("T")[1];
    return timePart.substring(0, 5);
  };

  return (
    <div className="mt-6 bg-white p-5 rounded-xl border border-gray-200 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
        <h2 className="text-lg font-bold text-gray-800">
          {formatDisplayDate(selectedDate)} のスケジュール
        </h2>
        <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2 py-1 rounded-full">
          {dailyEvents.length} 件の予定
        </span>
      </div>

      {dailyEvents.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          この日の予定は登録されていません。
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {dailyEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-4 p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors group relative"
            >
              <div
                className="w-1.5 h-12 rounded-full shrink-0"
                style={{ backgroundColor: event.backgroundColor || "#3b82f6" }}
              />

              <div className="flex-1 min-w-0 pr-8">
                <h3 className="font-semibold text-gray-900 truncate">
                  {event.title}
                </h3>
                
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(event)}
                    {!event.end?.includes("T") && event.start.includes("T") && event.end && ` 〜 ${event.end.split("T")[1].substring(0, 5)}`}
                  </span>
                  
                  {event.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.location}
                    </span>
                  )}
                </div>

                {event.description && (
                  <p className="mt-2 text-xs text-gray-600 line-clamp-2 bg-white p-2 rounded border border-gray-100">
                    {event.description}
                  </p>
                )}
              </div>

              {/* 💡 ★ 修正：ログインしており、かつ「自分が今選択しているサークルの予定（isMyCircleEvent）」の時だけゴミ箱ボタンを出現させる */}
              {onDeleteEvent && event.isMyCircleEvent && (
                <button
                  onClick={() => onDeleteEvent(event.id)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-100 md:opacity-0 group-hover:opacity-100"
                  title="予定を削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}