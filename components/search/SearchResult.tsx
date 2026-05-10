import { Card, CardContent } from "@/components/ui/card";
import { BookText, User, Calendar, GraduationCap } from "lucide-react";
import { Textbook } from "../../types/textbook";

export const SearchResult = ({ item }: { item: Textbook }) => {
  return (
    <Card className="bg-white border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-gray-900">{item.textbook_title}</p>
            {item.edition && <p className="text-sm text-gray-500">{item.edition}</p>}
          </div>
          <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">教科書</span>
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-blue-500" />
            <span>{item.course_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span>{item.schedule}</span>
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <User className="w-4 h-4 text-blue-500" />
            <span>{item.professor_name} 教授</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};