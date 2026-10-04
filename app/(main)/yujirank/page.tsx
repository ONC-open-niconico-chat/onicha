"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Trophy, Loader2 } from "lucide-react";
import { getYujiRank, nextYujiRank } from "@/lib/yujiRank";

interface RankUser {
  id: string;
  username: string | null;
  icon_src: string | null;
  give_count: number | null;
}

const DEFAULT_ICON = "/yujilink_icon/yujilink_icon.JPG";

// 上位の順位メダル色
const medalClass = (rank: number) =>
  rank === 1
    ? "bg-amber-400 text-white"
    : rank === 2
    ? "bg-gray-300 text-white"
    : rank === 3
    ? "bg-amber-700 text-white"
    : "bg-gray-100 text-gray-500";

// 上位3位は少し大きめのサイズに統一（モバイルで名前が途切れないよう1位を特大にはしない）。
// 4位以降は通常サイズ。li(余白/間隔)・badge(順位バッジ)・img(アイコン/アバター)・name・count のクラス。
const rankSize = (rank: number) => {
  if (rank <= 3)
    return { li: "py-3.5 gap-3.5", badge: "w-10 h-10 text-base", img: "w-12 h-12", name: "text-base", count: "text-base" };
  return { li: "py-3 gap-3", badge: "w-8 h-8 text-sm", img: "w-9 h-9", name: "text-base", count: "text-sm" };
};

// 順位ごとの華やかな行背景（1位=金 / 2位=銀 / 3位=銅）。4位以降は背景なし。
const rowBg = (rank: number) =>
  rank === 1
    ? "bg-linear-to-r from-amber-100 to-yellow-50"
    : rank === 2
    ? "bg-linear-to-r from-slate-100 to-gray-50"
    : rank === 3
    ? "bg-linear-to-r from-orange-100 to-amber-50"
    : "";

export default function YujiRankPage() {
  const [users, setUsers] = useState<RankUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [myCount, setMyCount] = useState<number | null>(null);
  const [myPosition, setMyPosition] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setMyId(uid);

      // ランキング（譲った人数の多い順。実績ゼロは除外）
      const { data, error } = await supabase
        .from("user")
        .select("id, username, icon_src, give_count")
        .gt("give_count", 0)
        .order("give_count", { ascending: false })
        .order("username", { ascending: true })
        .limit(100);

      if (error) {
        console.error("ランキングの取得に失敗しました:", error);
        setLoading(false);
        return;
      }
      setUsers((data ?? []) as RankUser[]);

      // 自分の譲った人数と順位
      if (uid) {
        const { data: me } = await supabase
          .from("user")
          .select("give_count")
          .eq("id", uid)
          .single();
        const count = me?.give_count ?? 0;
        setMyCount(count);
        if (count > 0) {
          // 自分より多い人数 + 1 を順位とする（同数は同順扱いの近似）
          const { count: above } = await supabase
            .from("user")
            .select("*", { count: "exact", head: true })
            .gt("give_count", count);
          setMyPosition((above ?? 0) + 1);
        }
      }

      setLoading(false);
    };

    load();
  }, []);

  // 競技順位（同点は同順位）。users は give_count 降順なので、前の行と同数なら前と同じ順位、
  // 違えば「自分より上の人数 + 1」= その行のインデックス + 1。カードの順位算出と一致する。
  const ranks: number[] = [];
  users.forEach((u, i) => {
    ranks[i] =
      i > 0 && (users[i - 1].give_count ?? 0) === (u.give_count ?? 0)
        ? ranks[i - 1]
        : i + 1;
  });

  return (
    <div className="w-full">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          ユジランク
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          教科書を譲った人数のランキングです。いろんな人に譲ってランクを上げよう！
        </p>
      </div>

      {/* 自分の実績カード */}
      {myId && myCount !== null && (
        <div className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getYujiRank(myCount).src}
              alt={getYujiRank(myCount).label}
              className="w-14 h-14 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-gray-900 text-lg">{getYujiRank(myCount).label}</span>
                {myPosition != null && (
                  <span className="text-sm text-gray-600">現在 {myPosition} 位</span>
                )}
              </div>
              <div className="text-sm text-gray-600">あなたが譲った相手 {myCount.toLocaleString()} 人</div>
              {(() => {
                const nxt = nextYujiRank(myCount);
                return nxt ? (
                  <div className="text-xs text-gray-500 mt-0.5">
                    次の <span className="font-bold">{nxt.rank.label}</span> まであと {nxt.remaining} 人
                  </div>
                ) : (
                  <div className="text-xs text-amber-600 font-bold mt-0.5">最高ランク達成！🎉</div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-20 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          読み込み中...
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm px-6">
          まだ譲渡の実績がありません。
          <br />
          最初の譲り手になってランキングに載りましょう！
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {users.map((u, i) => {
            const rank = ranks[i];
            const count = u.give_count ?? 0;
            const isMe = u.id === myId;
            const sz = rankSize(rank);
            // 上位3位は順位ごとの華やかな背景。それ以外で自分の行は青背景。
            const bg = rank <= 3 ? rowBg(rank) : isMe ? "bg-blue-50" : "";
            // 上位3位で自分の行は、華やかな背景の上に青リングで「あなた」を強調。
            const meRing = isMe && rank <= 3 ? "ring-2 ring-inset ring-blue-300" : "";
            return (
              <li
                key={u.id}
                className={`flex items-center px-4 ${sz.li} ${bg} ${meRing}`}
              >
                {/* 順位 */}
                <span
                  className={`${sz.badge} shrink-0 rounded-full flex items-center justify-center font-bold tabular-nums ${medalClass(
                    rank
                  )}`}
                >
                  {rank}
                </span>

                {/* ランクアイコン */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getYujiRank(count).src}
                  alt={getYujiRank(count).label}
                  className={`${sz.img} rounded-md object-cover shrink-0`}
                  title={getYujiRank(count).label}
                />

                {/* ユーザー */}
                <Link
                  href={`/profile/${u.id}`}
                  className="flex items-center gap-2 min-w-0 flex-1 group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u.icon_src || DEFAULT_ICON}
                    alt=""
                    className={`${sz.img} rounded-full object-cover shrink-0`}
                  />
                  <span className={`truncate font-medium text-gray-800 group-hover:underline ${sz.name}`}>
                    {u.username ?? "名無しユーザー"}
                    {isMe && <span className="ml-1 text-xs text-blue-600 font-bold">（あなた）</span>}
                  </span>
                </Link>

                {/* 譲った相手の人数 */}
                <span className={`shrink-0 font-bold text-gray-700 tabular-nums ${sz.count}`}>
                  {count.toLocaleString()} 人
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
