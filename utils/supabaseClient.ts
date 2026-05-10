import { createClient } from '@supabase/supabase-js'

// 本来は .env ファイルに書くべきですが、まずは動かすために
// チームのリーダーなどに確認して URL と Anon Key を入れてください
const supabaseUrl = 'あなたのSUPABASE_URL'
const supabaseAnonKey = 'あなたのSUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)