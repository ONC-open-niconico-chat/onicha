import { supabase } from "@/lib/supabase";

// 運営（公式）アカウントは user.is_official = true の行で識別する。
// env にも コードにも UUID を書かず、DB のフラグから都度取得する。
// 一度取得したらメモ化して以降はキャッシュを返す。
// undefined = 未取得 / null = 運営アカウント未設定 / string = 運営の user.id
let cachedOfficialId: string | null | undefined;

export async function getOfficialUserId(): Promise<string | null> {
  if (cachedOfficialId !== undefined) return cachedOfficialId;

  const { data, error } = await supabase
    .from("user")
    .select("id")
    .eq("is_official", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("運営アカウントの取得に失敗しました:", error);
    return null; // キャッシュせず、次回リトライできるようにする
  }

  cachedOfficialId = (data?.id as string | undefined) ?? null;
  return cachedOfficialId;
}
