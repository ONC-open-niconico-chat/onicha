"use client";

import { useState } from "react";
import { Search } from "lucide-react";

interface SearchFormProps {
  onSearch: (params: any) => void;
  loading: boolean;
}

export const SearchForm = ({ onSearch, loading }: SearchFormProps) => {
  const [params, setParams] = useState({
    textbookName: "",
    professorName: "",
    schedule: "",
    courseName: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams({ ...params, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(params);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 ml-1">教科書名</label>
          <input
            name="textbookName"
            value={params.textbookName}
            onChange={handleChange}
            placeholder="例：線形代数学"
            className="w-full mt-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 ml-1">教授名</label>
          <input
            name="professorName"
            value={params.professorName}
            onChange={handleChange}
            placeholder="例：宮本武佐彦"
            className="w-full mt-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 ml-1">時間割</label>
          <input
            name="schedule"
            value={params.schedule}
            onChange={handleChange}
            placeholder="例：月2"
            className="w-full mt-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 ml-1">授業名</label>
          <input
            name="courseName"
            value={params.courseName}
            onChange={handleChange}
            placeholder="例：数学"
            className="w-full mt-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
      >
        <Search className="w-5 h-5" />
        {loading ? "検索中..." : "検索する"}
      </button>
    </form>
  );
};