// components/post/PostDialog.tsx
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, X } from "lucide-react";

interface PostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPost: (content: string, file: File | null) => void;
}

export function PostDialog({ open, onOpenChange, onPost }: PostDialogProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setFile(null);
    setPreview(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handlePost = () => {
    // テキストか画像のどちらかがあれば投稿できる
    if (!text.trim() && !file) return;
    onPost(text, file);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
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

          {/* 画像プレビュー */}
          {preview && (
            <div className="relative mt-3 rounded-2xl overflow-hidden border border-gray-100">
              <img src={preview} alt="プレビュー" className="w-full max-h-72 object-cover" />
              <button
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                title="画像を削除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-4">
          {/* 画像を選ぶボタン */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-600 p-2 hover:bg-blue-50 rounded-full transition"
            title="画像を追加"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            onClick={handlePost}
            className="bg-blue-600 hover:bg-blue-700 rounded-full px-8 font-bold"
            disabled={!text.trim() && !file}
          >
            投稿
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
