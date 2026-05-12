// components/PostList.tsx

interface PostListProps {
  posts: Post[];
}

export function PostList({ posts }: PostListProps) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div key={post.id} className="p-4 border-b hover:bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            {/* ここを変更：onippiiアイコンを表示 */}
            <img 
              src="/onippii.jpg" 
              alt="onippii" 
              className="w-10 h-10 rounded-full object-cover border border-gray-200" 
            />
            <div>
              <p className="font-bold">User {post.user_id}</p>
              <p className="text-xs text-gray-500">{post.created_at}</p>
            </div>
          </div>
          <p className="text-gray-800 text-lg">{post.content}</p>
        </div>
      ))}
    </div>
  );
}