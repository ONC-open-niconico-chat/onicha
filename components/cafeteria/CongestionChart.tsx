"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// 🌟 受け取るデータの型を定義
interface CongestionChartProps {
  data: {
    time: string;
    level: number;
  }[];
}

export function CongestionChart({ data }: CongestionChartProps) {
  return (
    <div className="w-full h-[200px]" style={{ fontSize: "12px" }}>
      <ResponsiveContainer width="100%" height="100%">
        {/* 🌟 親から渡された本物の data をセット */}
        <AreaChart data={data} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(17,17,16,0.06)" />
          <XAxis 
            dataKey="time" 
            tickLine={false} 
            axisLine={false} 
            stroke="rgba(17,17,16,0.4)"
            style={{ fontFamily: "'DM Mono', monospace" }}
          />
          <YAxis 
            domain={[0, 100]} 
            tickLine={false} 
            axisLine={false} 
            stroke="rgba(17,17,16,0.4)"
            style={{ fontFamily: "'DM Mono', monospace" }}
          />
          <Tooltip 
            contentStyle={{ 
              background: "var(--background)", 
              border: "1px border var(--border)",
              borderRadius: "8px" 
            }} 
          />
          <Area 
            type="monotone" 
            dataKey="level" 
            stroke="#22c55e" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorLevel)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}