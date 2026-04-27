// components/PostDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageIcon, Smile } from "lucide-react";

interface PostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDialog({ open, onOpenChange }: PostDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>新規投稿</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <textarea 
            className="w-full min-h-[150px] p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="今の気持ちを投稿しよう！"
          />
        </div>
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button variant="ghost" size="icon"><ImageIcon className="w-5 h-5 text-gray-500" /></Button>
            <Button variant="ghost" size="icon"><Smile className="w-5 h-5 text-gray-500" /></Button>
          </div>
          <Button onClick={() => onOpenChange(false)} className="bg-blue-600 hover:bg-blue-700 rounded-full px-6">
            投稿する
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}