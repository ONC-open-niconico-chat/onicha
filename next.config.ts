import type { NextConfig } from "next";

// すべての応答に付与するセキュリティヘッダ。
// 表示制限系のみ（scriptは縛らない）なので既存機能を壊さない。
// ※ Strict-Transport-Security(HSTS) は Vercel が自動付与するためここでは省略。
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // クリックジャッキング対策（埋め込み制限のみ。script-src等は設定しないので安全）。
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
