"use client";

import React, { useState, useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, Plus, Loader2, Calendar as CalendarIcon } from "lucide-react"; 
import { Button } from "@/components/ui/button"; 
import { supabase } from "@/lib/supabase";
import { Checkbox } from "@/components/ui/checkbox"; // ★ ShadcnのCheckbox（無ければinput[type=checkbox]でも動くようにフォールバックしてます）
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DailyEventList } from "@/components/calendar/DailyEventList";

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const todayStr = new Date().toISOString().split("T")[0];
  
  const [currentYear, setCurrentYear] = useState("2026");
  const [currentMonth, setCurrentMonth] = useState("6");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [viewMode, setViewMode] = useState<"calendar" | "daily">("calendar");

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 📝 予定追加モーダルのステート管理
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCategory, setFormCategory] = useState("circle");
  const [formStartDate, setFormStartDate] = useState(todayStr);
  const [formEndDate, setFormEndDate] = useState(todayStr);
  
  // ★ 追加：「終日」かどうかを管理するステート
  const [formIsAllDay, setFormIsAllDay] = useState(false);
  
  const [formStartTime, setFormStartTime] = useState("10:00");
  const [formEndTime, setFormEndTime] = useState("12:00");

  const categoryColors: Record<string, string> = {
    univ: "#ef4444",
    circle: "#3b82f6",
    lecture: "#10b981",
    other: "#f59e0b",
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("event").select("*");
      if (error) throw error;

      const formattedEvents = data.map((item) => ({
        id: item.id.toString(),
        title: item.title,
        start: item.start_at,
        end: item.end_at,
        backgroundColor: item.bg_color,
        borderColor: item.bg_color,
        description: item.description,
        location: item.location,
        // FullCalendarに終日フラグを伝える
        allDay: !item.start_at.includes("T") || item.start_at.endsWith("T00:00:00Z") && item.end_at.endsWith("T23:59:59Z") 
      }));

      setEvents(formattedEvents);
    } catch (err) {
      console.error("イベントの取得に失敗:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm("この予定を削除してもよろしいですか？")) return;

    try {
      const { error } = await supabase
        .from("event")
        .delete()
        .eq("id", parseInt(id, 10));

      if (error) throw error;
      setEvents((prev) => prev.filter((event) => event.id !== id));
    } catch (err) {
      console.error(err);
      alert("予定の削除に失敗しました。");
    }
  };

  const handleOpenAddModal = () => {
    setFormTitle("");
    setFormDescription("");
    setFormLocation("");
    setFormCategory("circle");
    setFormStartDate(selectedDate);
    setFormEndDate(selectedDate);
    setFormIsAllDay(false); // ★ 初期値は通常の時間指定
    setFormStartTime("10:00");
    setFormEndTime("12:00");
    setIsModalOpen(true);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    setFormStartDate(newStartDate);
    if (new Date(formEndDate) < new Date(newStartDate)) {
      setFormEndDate(newStartDate);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return alert("タイトルを入力してください！");

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return alert("ログインが必要です！");

      const baseBgColor = categoryColors[formCategory] || "#3b82f6";
      
      let startISO = "";
      let endISO = "";

      // ★ 終日か時間指定かで、ISO文字列の作り方を変える
      if (formIsAllDay) {
        // 終日の場合は時間の概念をなくす、または当日の00:00から終了日の23:59にする
        startISO = `${formStartDate}T00:00:00`;
        endISO = `${formEndDate}T23:59:59`;
      } else {
        startISO = `${formStartDate}T${formStartTime}:00`;
        endISO = `${formEndDate}T${formEndTime}:00`;
      }

      const { error } = await supabase.from("event").insert({
        title: formTitle,
        description: formDescription,
        location: formLocation,
        start_at: new Date(startISO).toISOString(),
        end_at: new Date(endISO).toISOString(),
        category: formCategory,
        bg_color: baseBgColor,
        created_by: userData.user.id,
      });

      if (error) throw error;

      setIsModalOpen(false);
      fetchEvents(); 
    } catch (err) {
      console.error(err);
      alert("予定の保存に失敗しました。");
    }
  };

  const handleJumpToDate = (year: string, month: string) => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      const formattedMonth = month.padStart(2, "0");
      calendarApi.gotoDate(`${year}-${formattedMonth}-01`);
      setSelectedDate(`${year}-${formattedMonth}-01`);
    }
  };

  const handleYearChange = (year: string) => {
    setCurrentYear(year);
    handleJumpToDate(year, currentMonth);
  };

  const handleMonthChange = (month: string) => {
    setCurrentMonth(month);
    handleJumpToDate(currentYear, month);
  };

  const handleDatesSet = (dateInfo: any) => {
    const currentViewDate = dateInfo.view.currentStart;
    const centerDate = new Date(currentViewDate.getTime() + 15 * 24 * 60 * 60 * 1000);
    setCurrentYear(centerDate.getFullYear().toString());
    setCurrentMonth((centerDate.getMonth() + 1).toString());
  };

  const handleDateClick = (arg: any) => {
    setSelectedDate(arg.dateStr);
    setViewMode("daily");
  };

  const handleEventClick = (arg: any) => {
    const eventDate = arg.event.startStr.split("T")[0];
    setSelectedDate(eventDate);
    setViewMode("daily");
  };

  const years = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900 relative">
      <Header />

      <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto pb-24">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-500 font-medium">カレンダーを読み込み中...</p>
          </div>
        ) : (
          <>
            {/* 1️⃣ カレンダーモード */}
            {viewMode === "calendar" && (
              <div className="animate-in fade-in duration-200 relative">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">イベントカレンダー</h1>
                    <p className="text-sm text-gray-500">学内のイベントやサークルの予定をチェックできます</p>
                  </div>

                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 self-start sm:self-auto shadow-sm">
                    <Select value={currentYear} onValueChange={handleYearChange}>
                      <SelectTrigger className="w-[110px] bg-white font-bold text-gray-700 h-9 rounded-lg">
                        <SelectValue placeholder="年" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={y} className="font-medium">{y}年</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={currentMonth} onValueChange={handleMonthChange}>
                      <SelectTrigger className="w-[90px] bg-white font-bold text-gray-700 h-9 rounded-lg">
                        <SelectValue placeholder="月" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((m) => (
                          <SelectItem key={m} value={m} className="font-medium">{m}月</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale="ja"
                    events={events}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    datesSet={handleDatesSet}
                    headerToolbar={{
                      left: "prev,next today",
                      center: "title",
                      right: "", 
                    }}
                    buttonText={{
                      today: "今日",
                    }}
                    height="auto"
                  />
                </div>

                <button
                  onClick={handleOpenAddModal}
                  className="fixed bottom-24 right-6 md:right-12 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-50 group gap-1"
                >
                  <Plus className="w-6 h-6" />
                  <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-out text-sm font-bold whitespace-nowrap px-0 group-hover:px-1">
                    予定を追加
                  </span>
                </button>
              </div>
            )}

            {/* 2️⃣ 1日スケジュール詳細モード */}
            {viewMode === "daily" && (
              <div className="animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={() => setViewMode("calendar")}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-full text-sm transition-colors shadow-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>カレンダーに戻る</span>
                  </button>

                  <Button
                    onClick={handleOpenAddModal}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 rounded-full px-4"
                  >
                    <Plus className="w-4 h-4" />
                    <span>予定を追加</span>
                  </Button>
                </div>

                <DailyEventList 
                  selectedDate={selectedDate} 
                  events={events} 
                  onDeleteEvent={handleDeleteEvent} 
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* 📥 予定登録用ポップアップ */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              <span>新しい予定の登録</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEvent} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs font-bold text-gray-600">イベント名</Label>
              <Input
                id="title"
                placeholder="例: サークル新歓バーベキュー"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="rounded-lg border-gray-200"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-600">カテゴリ (色分け)</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="w-full bg-white rounded-lg border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle">🟦 サークル日程</SelectItem>
                  <SelectItem value="univ">🟥 大学公式行事 (琉大祭など)</SelectItem>
                  <SelectItem value="lecture">🟩 講義・中間期末テスト</SelectItem>
                  <SelectItem value="other">🟨 その他プライベート</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 📅 期間選択 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="startDate" className="text-xs font-bold text-gray-600">開始日</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formStartDate}
                  onChange={handleStartDateChange}
                  className="rounded-lg border-gray-200"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endDate" className="text-xs font-bold text-gray-600">終了日</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formEndDate}
                  min={formStartDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="rounded-lg border-gray-200"
                />
              </div>
            </div>

            {/* 🕒 ★「終日」チェックボックスを追加 */}
            <div className="flex items-center gap-2 py-1 bg-gray-50 px-3 rounded-lg border border-gray-100">
              <input
                id="allDay"
                type="checkbox"
                checked={formIsAllDay}
                onChange={(e) => setFormIsAllDay(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 accent-blue-600"
              />
              <Label htmlFor="allDay" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                終日（時間を指定しない）
              </Label>
            </div>

            {/* ⏰ 時間設定 (終日チェック時は非表示にして誤入力を防ぐ) */}
            {!formIsAllDay && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <Label htmlFor="startTime" className="text-xs font-bold text-gray-600">開始時間</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="rounded-lg border-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endTime" className="text-xs font-bold text-gray-600">終了時間</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="rounded-lg border-gray-200"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="location" className="text-xs font-bold text-gray-600">場所</Label>
              <Input
                id="location"
                placeholder="例: 千原体育館、Zoomなど"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                className="rounded-lg border-gray-200"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs font-bold text-gray-600">イベントの詳細・メモ</Label>
              <Textarea
                id="description"
                placeholder="持ち物や集合場所など詳しい内容を記入"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="rounded-lg border-gray-200 min-h-[70px]"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full px-6"
              >
                登録する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .fc .fc-toolbar-title {
          font-size: 1.25rem !important;
          font-weight: 700;
          color: #1f2937;
        }
        .fc .fc-button-primary {
          background-color: #f3f4f6 !important;
          border-color: #e5e7eb !important;
          color: #374151 !important;
          font-weight: 600;
        }
        .fc .fc-button-primary:hover {
          background-color: #e5e7eb !important;
        }
        .fc .fc-button-active {
          background-color: #3b82f6 !important;
          color: white !important;
          border-color: #3b82f6 !important;
        }
        .fc-theme-standard td, .fc-theme-standard th {
          border-color: #f3f4f6 !important;
        }
        .fc .fc-daygrid-day-number {
          font-size: 0.85rem;
          color: #4b5563;
          padding: 4px 8px !important;
        }
        .fc .fc-event {
          cursor: pointer;
          padding: 2px 4px;
          font-size: 0.75rem;
          border-radius: 4px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}