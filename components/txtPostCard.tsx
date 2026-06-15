import  Link  from "next/link";
import type { Post } from "@/app/(main)/txtpost/page";

interface PostCardProps {
  txtpost: Post;
  
}

export function PostCard({ txtpost }: PostCardProps) {
  return (
    <article className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
      <div className="flex gap-3">
        <Link href={`/profile/${txtpost.user.id}`}>
          <img
            src={txtpost?.user?.icon_src || "https://kvppbmrsywcabytfrhit.supabase.co/storage/v1/object/public/avatar/IMG_1108.JPG"}
            alt={txtpost.user.username}
            className="w-12 h-12 rounded-full"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/profile/${txtpost.user.id}`}
              className="font-bold hover:underline"
            >
              {txtpost.user.username}
            </Link>
            {/*<span className="text-gray-600">{txtpost.user.username}</span>*/}
            <span className="text-gray-600">·</span>
            <span className="text-gray-600">{txtpost.created_at}</span>
          </div>

          <p className="mb-3">{txtpost.description}</p>

          <div
            className={`border rounded-2xl p-4 mb-3 ${
              txtpost.give_type === "offering"
                ? "bg-blue-50 border-blue-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="mb-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  txtpost.give_type === "offering"
                    ? "bg-blue-600 text-white"
                    : "bg-green-600 text-white"
                }`}
              >
                {txtpost.give_type === "offering" ? "譲ります" : "譲ってください"}
              </span>
            </div>

            <h3 className="font-bold text-lg mb-1">{txtpost.book.title}</h3>
            <div className="flex gap-4 text-sm text-gray-700">
              <span>{txtpost.condition?.name || ""}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
