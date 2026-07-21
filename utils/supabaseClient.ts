import { createClient } from '@supabase/supabase-js'

// 本来は .env ファイルに書くべきですが、まずは動かすために
// チームのリーダーなどに確認して URL と Anon Key を入れてください
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey)