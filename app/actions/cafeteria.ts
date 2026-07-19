"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// サーバー側で毎回最新のクッキーを持ったクライアントを生成する関数
async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component から呼ばれたときは無視
        }
      },
    },
  });
}

// 1. 食堂の最新ステータスを取得する関数
export async function getCafeteriaStatus() {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase
    .from("cafeterias")
    .select("id, name, name_en, percent")
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// 2. 投票データから時間帯別平均を計算する関数
export async function getHourlyDataFromVotes(cafeteriaId?: string) {
  // 🌟【修正】ここでサーバー用のSupabaseクライアントを先に取得します
  const supabase = await getSupabaseServer(); 
  
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // クエリを変数に受けます
  let query = supabase
    .from("votes")
    .select("percent, created_at")
    .gte("created_at", oneDayAgo);

  // IDが渡されたときだけ、その食堂で絞り込む
  if (cafeteriaId) {
    query = query.eq("cafeteria_id", cafeteriaId);
  }

  const { data: votes, error } = await query;

  if (error) throw new Error(error.message);

  const hours = ["8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
  const hourlySum: Record<string, { total: number; count: number }> = {};
  hours.forEach(h => { hourlySum[h] = { total: 0, count: 0 }; });

  votes?.forEach((v) => {
    const date = new Date(v.created_at);
    const hourStr = `${date.getHours()}:00`;
    if (hourlySum[hourStr] !== undefined) {
      hourlySum[hourStr].total += v.percent;
      hourlySum[hourStr].count += 1;
    }
  });

  const defaultLevels: Record<string, number> = {
    "8:00": 15, "9:00": 22, "10:00": 18, "11:00": 45, "12:00": 95, 
    "13:00": 70, "14:00": 28, "15:00": 20, "16:00": 18, "17:00": 30, "18:00": 38, "19:00": 25
  };

  return hours.map((h) => {
    const group = hourlySum[h];
    return {
      time: h,
      level: group.count > 0 ? Math.round(group.total / group.count) : defaultLevels[h],
    };
  });
}

// 3. ユーザーからの投票を処理する関数
export async function submitCafeteriaVote(cafeteriaId: string, userPercent: number) {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error("投票するにはログインが必要です");
  }

  const userId = user.id; 

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentVotes } = await supabase
    .from("votes")
    .select("id")
    .eq("cafeteria_id", cafeteriaId)
    .eq("user_id", userId) 
    .gte("created_at", oneHourAgo);

  if (recentVotes && recentVotes.length > 0) {
    throw new Error("前回の投票から1時間経過していません");
  }

  const { error: voteError } = await supabase
    .from("votes")
    .insert([
      { 
        cafeteria_id: cafeteriaId, 
        percent: userPercent,
        user_id: userId 
      }
    ]);

  if (voteError) throw new Error(voteError.message);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: allVotes, error: fetchVotesError } = await supabase
    .from("votes")
    .select("percent")
    .eq("cafeteria_id", cafeteriaId)
    .gte("created_at", oneDayAgo);

  if (fetchVotesError) throw new Error(fetchVotesError.message);

  let finalPercent = userPercent;
  if (allVotes && allVotes.length > 0) {
    const totalSum = allVotes.reduce((sum, vote) => sum + vote.percent, 0);
    finalPercent = Math.round(totalSum / allVotes.length);
  }

  const { error: updateError } = await supabase
    .from("cafeterias")
    .update({ percent: finalPercent })
    .eq("id", cafeteriaId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/cafeteria");
}