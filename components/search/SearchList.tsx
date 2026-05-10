import { SearchResult } from "./SearchResult";
import { Textbook } from "../../types/textbook";

export const SearchList = ({ results }: { results: Textbook[] }) => {
  if (results.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-400">検索結果がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-gray-700 px-1">検索結果：{results.length}件</h2>
      <div className="flex flex-col gap-4">
        {results.map((item) => (
          <SearchResult key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
};