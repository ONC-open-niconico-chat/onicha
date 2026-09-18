import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// 利用規約・プライバシーポリシーの共通レイアウト
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
        >
          <ArrowLeft size={16} />
          戻る
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">{title}</h1>
          {updated && <p className="text-xs text-gray-400 mb-8">最終更新：{updated}</p>}

          <div className="space-y-6 text-[15px] leading-relaxed text-gray-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_a]:text-blue-600 [&_a]:underline">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
