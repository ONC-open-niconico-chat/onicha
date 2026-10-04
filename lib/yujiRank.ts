// ユジランク：譲った相手の人数（user.give_count = distinct な受取者数）に応じたランク定義。
// ポイント（対価）ではなく、譲渡実績＝名誉のゲーミフィケーション。
// 同じ相手との繰り返しでは増えない（distinct 人数）ため、偽取引による水増しに強い。
// min の降順で並べ、getRank は give_count 以上で最初に一致したものを返す。
export interface YujiRank {
  name: string;
  label: string;
  min: number; // この人数以上で該当
  src: string; // public 配下のランクアイコン
}

export const YUJI_RANKS: YujiRank[] = [
  { name: "god", label: "God", min: 30, src: "/rank_icons/7_god.png" },
  { name: "master", label: "Master", min: 20, src: "/rank_icons/6_master.png" },
  { name: "diamond", label: "Diamond", min: 10, src: "/rank_icons/5_diamond.png" },
  { name: "platinum", label: "Platinum", min: 5, src: "/rank_icons/4_platinum.png" },
  { name: "gold", label: "Gold", min: 3, src: "/rank_icons/3_gold.png" },
  { name: "silver", label: "Silver", min: 1, src: "/rank_icons/2_silver.png" },
  { name: "bronze", label: "Bronze", min: 0, src: "/rank_icons/1_bronze.png" },
];

// 譲った相手の人数からランクを求める
export const getYujiRank = (giveCount: number): YujiRank =>
  YUJI_RANKS.find((r) => giveCount >= r.min) ?? YUJI_RANKS[YUJI_RANKS.length - 1];

// 次のランクまでの残り人数（最高ランクなら null）
export const nextYujiRank = (giveCount: number): { rank: YujiRank; remaining: number } | null => {
  // min 昇順で、現在の人数より大きい最初のしきい値が「次」
  const ascending = [...YUJI_RANKS].sort((a, b) => a.min - b.min);
  const next = ascending.find((r) => r.min > giveCount);
  return next ? { rank: next, remaining: next.min - giveCount } : null;
};
