import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. まずレスポンスオブジェクトを作成
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 2. Supabaseクライアントの初期化
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // 全てのクッキーを取得
        getAll() {
          return request.cookies.getAll()
        },
        // 全てのクッキーを一括で設定
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. セッションの有効チェック
  const { data: { user } } = await supabase.auth.getUser()

  // 4. 【リダイレクト設定】ログインしていない場合はログイン画面へ
  if (!user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

// 適用するパスを指定（重要：静的ファイルなどは除外する）
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}