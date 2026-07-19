"use client";
import { useState, useEffect } from "react";
import { Clock, RefreshCw, TrendingUp, AlertCircle, Utensils } from "lucide-react";
import { CongestionChart } from "../../../components/cafeteria/CongestionChart";
import { WaterGauge } from "../../../components/cafeteria/WaterGauge";
import { CrowdVote } from "../../../components/cafeteria/CrowdVote";

// 👇 作成した Supabase 用のアクションをインポート
import { getCafeteriaStatus, submitCafeteriaVote, getHourlyDataFromVotes } from "@/app/actions/cafeteria";

type Level = "空いている" | "やや混雑" | "混雑" | "非常に混雑";

interface Cafeteria {
  id: string;
  name: string;
  nameEn: string;
  percent: number;
  waitMin: number;
}

function getLevel(percent: number): Level {
  if (percent >= 80) return "非常に混雑";
  if (percent >= 60) return "混雑";
  if (percent >= 35) return "やや混雑";
  return "空いている";
}

export default function App() {
  // ⭕ 初期値をすべて 0% にし、Supabase からのロード待ち状態にします
  const [cafeterias, setCafeterias] = useState<Cafeteria[]>([
    { id: "north", name: "北食堂", nameEn: "North Cafeteria", percent: 0, waitMin: 1 },
    { id: "central", name: "中央食堂", nameEn: "Central Cafeteria", percent: 0, waitMin: 1 },
  ]);
  
  const [chartData, setChartData] = useState<any[]>([]); // グラフ用データ
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // 👇 Supabase から最新データをロードする関数
  const loadSupabaseData = async () => {
    try {
      const [status, hourly] = await Promise.all([
        getCafeteriaStatus(),
        getHourlyDataFromVotes()
      ]);

      const mapped = status.map((c) => ({
        id: c.id,
        name: c.name,
        nameEn: c.name_en,
        percent: Number(c.percent),
        waitMin: Math.max(1, Math.round(Number(c.percent) / 7)),
      }));

      setCafeterias(mapped);
      setChartData(hourly);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("データの取得に失敗しました:", error);
    }
  };

  useEffect(() => {
    const now = new Date();
    setCurrentTime(now);
    setIsMounted(true);

    // 🌟 画面が開いた瞬間に Supabase からデータを取ってくる
    loadSupabaseData();

    // 1秒ごとの時計の更新
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 👇 投票ボタンが押されたときのアクション
  async function handleVote(cafeteriaId: string, percent: number) {
    try {
      // 💡 大文字小文字のズレを防ぐために、小文字に強制統一（North ➔ north）
      const formattedId = cafeteriaId.toLowerCase();
      
      console.log("🔥 投票しようとしている食堂ID:", formattedId);

      // Supabaseに整形したIDを送信
      await submitCafeteriaVote(formattedId, percent);
      await loadSupabaseData();
    } catch (error: any) {
      alert(error.message);
    }
  }

  // 👇 更新ボタンが押されたときのアクション
  async function handleRefresh() {
    setIsRefreshing(true);
    await loadSupabaseData(); // ランダム値ではなく、本物のSupabaseの最新値を取る
    setIsRefreshing(false);
  }

  const alertCafeterias = cafeterias.filter((c) => getLevel(c.percent) === "非常に混雑" || getLevel(c.percent) === "混雑");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Utensils size={20} />
          <div>
            <h1 style={{ fontSize: "17px", fontWeight: 600, lineHeight: 1.2 }}>学食混雑状況</h1>
            <p style={{ fontSize: "11px", opacity: 0.6, fontFamily: "'DM Mono', monospace" }}>Cafeteria Live Status</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "20px", fontWeight: 500, lineHeight: 1 }}>
              {isMounted && currentTime
                ? currentTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
                : "--:--"}
            </p>
            <p style={{ fontSize: "11px", opacity: 0.6, fontFamily: "'DM Mono', monospace" }}>
              {isMounted && currentTime
                ? currentTime.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })
                : "----/--/--"}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ fontSize: "13px" }}
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">更新</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Last update */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span style={{ fontSize: "12px" }}>リアルタイム更新中</span>
          </div>
          <p className="text-muted-foreground" style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace" }}>
            <Clock size={11} className="inline mr-1 mb-0.5" />
            {isMounted && lastUpdate
              ? lastUpdate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
              : "--:--:--"}
          </p>
        </div>

        {/* Alert banner */}
        {alertCafeterias.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "#92400e" }}>混雑情報</p>
              <p style={{ fontSize: "12px", color: "#78350f", marginTop: "2px" }}>
                {alertCafeterias.map((c) => c.name).join("・")}が混雑しています。時間をずらすことをおすすめします。
              </p>
            </div>
          </div>
        )}

        {/* Water gauges */}
        <section>
          <h2 className="mb-3" style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b6b66" }}>
            食堂別混雑レベル
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            {cafeterias.map((c) => (
              <WaterGauge
                key={c.id}
                name={c.name}
                nameEn={c.nameEn}
                percent={c.percent}
                waitMin={c.waitMin}
              />
            ))}
          </div>
        </section>

        {/* Vote */}
        <CrowdVote onVote={handleVote} chartData={chartData} />

        {/* Chart */}
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 600 }}>本日の混雑推移</h2>
              <p className="text-muted-foreground" style={{ fontSize: "12px", marginTop: "2px" }}>全食堂平均（%）</p>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp size={14} />
              <span style={{ fontSize: "12px" }}>ピーク 12:00</span>
            </div>
          </div>
          {/* 👇 投票から集計したデータをグラフに渡す */}
          <CongestionChart data={chartData} />
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-muted-foreground" style={{ fontSize: "11px" }}>空いている (&lt;35%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              <span className="text-muted-foreground" style={{ fontSize: "11px" }}>やや混雑 (35–60%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span className="text-muted-foreground" style={{ fontSize: "11px" }}>混雑 (&gt;60%)</span>
            </div>
          </div>
        </section>

        {/* Quick tips */}
        <section className="bg-primary text-primary-foreground rounded-xl px-5 py-4">
          <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            おすすめ時間帯
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { time: "11:00前", label: "早ランチ", note: "空いています" },
              { time: "13:30–14:00", label: "遅めランチ", note: "混雑が落ち着く" },
              { time: "17:00–18:00", label: "夕食早め", note: "比較的空いてる" },
            ].map((tip) => (
              <div key={tip.time} className="bg-white/10 rounded-lg px-3 py-2.5">
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", fontWeight: 500 }}>{tip.time}</p>
                <p style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px" }}>{tip.label}</p>
                <p style={{ fontSize: "10px", opacity: 0.5, marginTop: "1px" }}>{tip.note}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}