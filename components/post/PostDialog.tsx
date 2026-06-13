// components/post/PostDialog.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPost: (content: string) => void;
}

export function PostDialog({ open, onOpenChange, onPost }: PostDialogProps) {
  const [text, setText] = useState("");

  const handlePost = () => {
    if (!text.trim()) return;
    onPost(text);
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="text-center font-bold">新しく投稿する</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <textarea 
            className="w-full min-h-[120px] p-4 bg-gray-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-sm"
            placeholder="今、何を考えてる？"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="flex justify-end mt-4">
          <Button 
            onClick={handlePost} 
            className="bg-blue-600 hover:bg-blue-700 rounded-full px-8 font-bold"
            disabled={!text.trim()}
          >
            投稿
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}