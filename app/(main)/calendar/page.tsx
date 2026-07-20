"use client";

import React, { useState, useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { ArrowLeft, Plus, Loader2, Calendar as CalendarIcon, ShieldCheck, CheckCircle2, Palette, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button"; 
import { supabase } from "@/lib/supabase";
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
  // 🔑 サークル管理者（書き込み権限あり）かどうかを管理するステート
  const [isCircleAdmin, setIsCircleAdmin] = useState(false);
  // 🔑 管理しているサークルのIDを保持するステート（予定追加時に使用）
  const [myCircleId, setMyCircleId] = useState<string | null>(null);
  const [isCircleModalOpen, setIsCircleModalOpen] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  
  // 📋 全サークル一覧を保存するステート
  const [allCircles, setAllCircles] = useState<any[]>([]);
  const [loadingCircles, setLoadingCircles] = useState(false);

  // 📝 予定追加モーダルのステート管理
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formStartDate, setFormStartDate] = useState(todayStr);
  const [formEndDate, setFormEndDate] = useState(todayStr);
  
  // ★ 好きな色を自由・適当に選べるカラー用のステート
  const [formColor, setFormColor] = useState("#3b82f6");
  
  // ★ 「終日」かどうかを管理するステート
  const [formIsAllDay, setFormIsAllDay] = useState(false);
  
  const [formStartTime, setFormStartTime] = useState("10:00");
  const [formEndTime, setFormEndTime] = useState("12:00");

  // 🎨 ワンタップで適当に選べるおすすめのサークルカラーパレット
  const PRESET_COLORS = [
    "#3b82f6", // 🟦 ブルー
    "#ef4444", // 🟥 レッド
    "#10b981", // 🟩 グリーン
    "#f59e0b", // 🟨 オレンジ
    "#8b5cf6", // 🟪 パープル
    "#ec4899", // 🟫 ピンク
    "#14b8a6", // 🟩 ターコイズ
    "#111827"  // ⬛ ダーク
  ];

  // 🔑 ★ サークル管理者チェックロジック（複数サークル対応版）
  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsCircleAdmin(false);
        setMyCircleId(null);
        return;
      }

      const { data: memberData, error } = await supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (memberData && memberData.length > 0) {
        setIsCircleAdmin(true);
        setMyCircleId(memberData[0].circle_id);
      } else {
        setIsCircleAdmin(false);
        setMyCircleId(null);
      }
    } catch (err) {
      console.error("ユーザー権限の確認に失敗:", err);
      setIsCircleAdmin(false);
      setMyCircleId(null);
    }
  };

  // 📋 DBからすべてのサークル一覧を取得する関数
  const fetchAllCircles = async () => {
    try {
      setLoadingCircles(true);
      const { data, error } = await supabase
        .from("circles")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setAllCircles(data || []);
    } catch (err) {
      console.error("サークル一覧の取得に失敗:", err);
    } finally {
      setLoadingCircles(false);
    }
  };

  // 🚪 選択した任意のサークルにその場でワンタップ参加する関数
  const handleJoinCircle = async (circleId: string, circleName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("アプリにログインが必要です！");

      setLoading(true);

      const { data: existingMember, error: findError } = await supabase
        .from("circle_members")
        .select("id")
        .eq("circle_id", circleId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (findError) throw findError;

      if (existingMember) {
        const { error: updateError } = await supabase
          .from("circle_members")
          .update({ role: "admin", created_at: new Date().toISOString() })
          .eq("id", existingMember.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("circle_members")
          .insert({
            circle_id: circleId,
            user_id: user.id,
            role: "admin"
          });

        if (insertError) throw insertError;
      }

      alert(`サークル「${circleName}」の管理者に切り替えました！`);
      setIsCircleModalOpen(false);
      
      await checkUserRole();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      alert("サークルへの参加に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 🏃‍♂️ サークルからログアウト（所属権限を解除）する関数
  const handleLeaveCircle = async () => {
    if (!window.confirm("現在のサークルアカウントからログアウトしますか？（閲覧モードに戻ります）")) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setLoading(true);

      const { error } = await supabase
        .from("circle_members")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      alert("ログアウトしました。閲覧専用モードに戻ります。");
      setIsCircleModalOpen(false);

      await checkUserRole();
      await fetchEvents();
    } catch (err) {
      console.error("ログアウトエラー:", err);
      alert("ログアウトに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // ➕ 新しくサークルを自由な名前で作る関数
  const handleCreateNewCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCircleName.trim()) return alert("サークル名を入力してください！");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("アプリにログインが必要です！");

      setLoading(true);

      // 1. 入力された名前でサークルを作成
      const { data: circleData, error: circleError } = await supabase
        .from("circles")
        .insert({ name: newCircleName, description: "新しく作成されたサークル" })
        .select()
        .single();

      if (circleError) throw circleError;

      // 2. 自分を管理者に紐付け
      const { error: memberError } = await supabase
        .from("circle_members")
        .insert({
          circle_id: circleData.id,
          user_id: user.id,
          role: "admin"
        });

      if (memberError) throw memberError;

      alert(`サークル「${newCircleName}」を作成し、管理者になりました！`);
      setNewCircleName("");
      setIsCircleModalOpen(false);

      await checkUserRole();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      alert("サークルの作成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      await checkUserRole();

      const { data, error } = await supabase
        .from("event")
        .select(`
          *,
          circles (
            name
          )
        `);
      if (error) throw error;

      const formattedEvents = data.map((item: any) => {
        const hasTime = item.start_at.includes("T") && 
                        !item.start_at.includes("T00:00:00") && 
                        !item.start_at.includes("T23:59:59");
        
        let startStr = hasTime ? item.start_at : item.start_at.split("T")[0];
        let endStr = hasTime ? item.end_at : item.end_at.split("T")[0];

        if (!hasTime && endStr) {
          const endDateObj = new Date(endStr);
          endDateObj.setDate(endDateObj.getDate() + 1);
          endStr = endDateObj.toISOString().split("T")[0];
        }

        const circlePrefix = item.circles?.name ? `[${item.circles.name}] ` : "";
        
        return {
          id: item.id.toString(),
          title: circlePrefix + item.title,
          start: startStr,
          end: endStr,
          backgroundColor: item.bg_color || "#3b82f6",
          borderColor: item.bg_color || "#3b82f6",
          description: item.description,
          location: item.location,
          allDay: !hasTime,
          rawEnd: item.end_at,
          circle_id: item.circle_id // 💡 リスト側のフィルタリング判定に使用するためしっかり引き継ぐ
        };
      });

      setEvents(formattedEvents);
    } catch (err) {
      console.error("イベントの取得に失敗:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchAllCircles();
  }, []);

  useEffect(() => {
    if (isCircleModalOpen) {
      fetchAllCircles();
    }
  }, [isCircleModalOpen]);

  // 🗑️ イベント削除関数（裏側のセキュリティガードを追加）
  const handleDeleteEvent = async (id: string) => {
    if (!isCircleAdmin) return alert("閲覧モードではイベントの削除はできません。");
    if (!window.confirm("この予定を削除してもよろしいですか？")) return;

    try {
      const { error } = await supabase
        .from("event")
        .delete()
        .eq("id", parseInt(id, 10));

      if (error) throw error;
      setEvents((prev) => prev.filter((event) => event.id !== id.toString()));
    } catch (err) {
      console.error("削除エラー:", err);
      alert("予定の削除に失敗しました。");
    }
  };

  const handleOpenAddModal = () => {
    setFormTitle("");
    setFormDescription("");
    setFormLocation("");
    setFormStartDate(selectedDate);
    setFormEndDate(selectedDate);
    setFormColor("#3b82f6");
    setFormIsAllDay(false);
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
    if (!isCircleAdmin) return alert("権限がありません。");
    if (!formTitle.trim()) return alert("タイトルを入力してください！");

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return alert("ログインが必要です！");

      let startValue = "";
      let endValue = "";

      if (formIsAllDay) {
        startValue = formStartDate; 
        endValue = formEndDate;     
      } else {
        startValue = new Date(`${formStartDate}T${formStartTime}:00`).toISOString();
        endValue = new Date(`${formEndDate}T${formEndTime}:00`).toISOString();
      }

      const { error } = await supabase.from("event").insert({
        title: formTitle,
        description: formDescription,
        location: formLocation,
        start_at: startValue,
        end_at: endValue,
        category: "circle",
        bg_color: formColor,
        created_by: userData.user.id,
        circle_id: myCircleId
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

  const renderEventContent = (eventInfo: any) => {
    const isAllDay = eventInfo.event.allDay;
    let timeDisplay = "";

    if (!isAllDay && eventInfo.event.start) {
      const startDate = new Date(eventInfo.event.start);
      const hours = startDate.getHours().toString().padStart(2, "0");
      const minutes = startDate.getMinutes().toString().padStart(2, "0");
      timeDisplay = `${hours}:${minutes}`;
    }

    return (
      <div className="flex items-center gap-1 overflow-hidden px-1 w-full text-white">
        {isAllDay ? (
          <span className="text-[9px] bg-white/20 font-bold px-1 rounded shrink-0">終日</span>
        ) : (
          <span className="font-bold text-[9px] opacity-90 shrink-0 bg-white/20 px-1 rounded">
            {timeDisplay}
          </span>
        )}
        <span className="truncate font-medium text-[11px]">{eventInfo.event.title}</span>
      </div>
    );
  };

  const years = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

  const eventsForDailyList = events.map(ev => ({
    ...ev,
    end: ev.rawEnd || ev.end
  }));

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900 relative">

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

                  <div className="flex items-center gap-4 self-start sm:self-auto">
                    <button
                      onClick={() => setIsCircleModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm shrink-0"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>サークルに参加・作成</span>
                    </button>

                    <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 shadow-sm">
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
                    eventContent={renderEventContent}
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

                {isCircleAdmin && (
                  <button
                    onClick={handleOpenAddModal}
                    className="fixed bottom-24 right-6 md:right-12 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-50 group gap-1"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-out text-sm font-bold whitespace-nowrap px-0 group-hover:px-1">
                      予定を追加
                    </span>
                  </button>
                )}
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

                  {isCircleAdmin && (
                    <Button
                      onClick={handleOpenAddModal}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 rounded-full px-4"
                    >
                      <Plus className="w-4 h-4" />
                      <span>予定を追加</span>
                    </Button>
                  )}
                </div>

                {/* 💡 各イベントに、いま自分がログインしているサークルの予定かどうかのフラグ（myCircleIdとの一致判定）を埋め込んで連動させる */}
                <DailyEventList 
                  selectedDate={selectedDate} 
                  events={eventsForDailyList.map(ev => ({
                    ...ev,
                    isMyCircleEvent: isCircleAdmin && myCircleId !== null && String(ev.circle_id) === String(myCircleId)
                  }))} 
                  onDeleteEvent={isCircleAdmin ? handleDeleteEvent : undefined} 
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

            {/* 🎨 カラーピッカーUI */}
            <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
              <Label className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-gray-500" />
                <span>イベントの表示色を選択</span>
              </Label>
              
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 bg-white p-0.5"
                />
                
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={`w-6 h-6 rounded-full border border-black/10 transition-all ${
                        formColor === color ? "scale-125 ring-2 ring-blue-500/40" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

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

      {/* 🚪 サークル参加・自由切り替え・作成用ポップアップ */}
      <Dialog open={isCircleModalOpen} onOpenChange={setIsCircleModalOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl bg-white p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-3">
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>サークル管理・切り替え</span>
            </DialogTitle>
            
            {isCircleAdmin && (
              <button
                onClick={handleLeaveCircle}
                className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors border border-red-100 bg-white shadow-sm shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ログアウト</span>
              </button>
            )}
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* パターンA: 自由に入れるサークル一覧 */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
              <h3 className="text-sm font-bold text-gray-700">① サークル一覧から選んで参加・切り替え</h3>
              <p className="text-xs text-gray-500">現在作成されているサークルです。タップするだけで誰でも自由に管理者権限を切り替えられます。</p>
              
              {loadingCircles ? (
                <div className="flex items-center justify-center py-4 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  <span className="text-xs text-gray-400">サークル一覧を読込中...</span>
                </div>
              ) : allCircles.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">作成されたサークルがまだありません</p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {allCircles.map((circle) => {
                    const isCurrent = myCircleId === circle.id;
                    return (
                      <button
                        key={circle.id}
                        onClick={() => handleJoinCircle(circle.id, circle.name)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all text-xs font-medium border ${
                          isCurrent 
                            ? "bg-blue-50/70 border-blue-200 text-blue-700 ring-2 ring-blue-500/10" 
                            : "bg-white hover:bg-gray-100 border-gray-200 text-gray-700"
                        }`}
                      >
                        <span className="truncate">{circle.name}</span>
                        {isCurrent ? (
                          <span className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded-full shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-blue-600" />
                            選択中
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                            切り替える
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="flex-shrink mx-4 text-gray-400 text-xs">または</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            {/* パターンB: 新しく作る */}
            <form onSubmit={handleCreateNewCircle} className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
              <h3 className="text-sm font-bold text-gray-700">② 新しくサークルを作る</h3>
              <p className="text-xs text-gray-500">一覧にない新しいサークルをその場で作って管理者になります。</p>
              <div className="space-y-1">
                <Input
                  placeholder="サークル名を入力（例: 琉大テニス部）"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  className="rounded-lg border-gray-200 bg-white h-9 text-xs"
                />
              </div>
              <Button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg h-9"
              >
                新しくサークルを作成
              </Button>
            </form>
          </div>
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
        
        .fc .fc-event,
        .fc .fc-daygrid-dot-event {
          cursor: pointer;
          padding: 2px 4px !important;
          font-size: 0.75rem;
          border-radius: 5px !important;
          font-weight: 600;
          border: none !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
          opacity: 1 !important;
          display: flex !important;
          align-items: center;
        }

        .fc-daygrid-dot-event {
          background-color: var(--fc-event-bg-color, #3b82f6) !important;
          color: #fff !important;
        }
        
        .fc-daygrid-event-dot {
          display: none !important;
        }

        .fc-daygrid-block-event {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}