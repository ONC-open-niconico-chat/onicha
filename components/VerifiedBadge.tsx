import { BadgeCheck } from "lucide-react";

// 運営（公式）アカウントの認証マーク。名前の横に表示する。
export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <BadgeCheck
      className={`inline-block w-4 h-4 text-blue-500 shrink-0 ${className}`}
      aria-label="認証済み（運営）"
    />
  );
}
