"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
// 💡 あなたのプロジェクトのSupabaseクライアントのパスに書き換えてください
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { useAuth } from "@/components/loginUser";

// メッセージ1件分の型定義
interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_content?: string | null;
  image_url?: string | null;
  // 💡 TypeScriptのエラーを防ぐため、オプションで追加できるように型を拡張
  reply_user_name?: string | null;
  reply_user_avatar?: string | null;
}

// チャット相手のプロフィール型定義
interface UserProfile {
  id: string;
  username: string;
  icon_src?: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const { authUser, loading: authLoading } = useAuth();

  // URLから相手のIDを取得（/messages/abc -> "abc"）
  const receiverId = params.id as string;

  // 状態管理
  const myId = authUser?.id ?? null;
  // 💡 【追加】ログイン中の「自分」のユーザー情報を保持するState
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [partner, setPartner] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 画像
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // 💡 右クリックメニューの表示状態を管理するステート
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    messageId: string;
    messageContent: string;
    isMe: boolean;
  } | null>(null);
  // 💡 現在リプライ（返信）しようとしているメッセージを管理するState
  const [replyingMessage, setReplyingMessage] = useState<{
    id: string;
    content: string;
  } | null>(null);

  // 最下部へスクロールするための参照
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 1. ログイン中の「自分」のユーザー情報を取得する
  //    myId は useAuth() から取得しているので、ここではプロフィールのみ取得
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      router.push("/login");
      return;
    }

    const fetchMyProfile = async () => {
      const { data: myData } = await supabase
        .from("user")
        .select("id, username, icon_src")
        .eq("id", authUser.id)
        .single();

      if (myData) {
        setCurrentUser(myData);
      }
    };
    fetchMyProfile();
  }, [authUser, authLoading, router]);

  // 2. 相手のプロフィールと、過去のチャット履歴を取得する
  useEffect(() => {
    if (!myId || !receiverId) return;

    const fetchChatData = async () => {
      setLoading(true);
      try {
        // ① 相手のユーザー情報を user テーブルから取得
        const { data: userData, error: userError } = await supabase
          .from("user")
          .select("id, username, icon_src")
          .eq("id", receiverId)
          .single();

        if (userData) setPartner(userData);

        // ② 過去のメッセージ履歴を取得
        const { data: chatData, error: chatError } = await supabase
          .from("chat")
          .select("*")
          .or(`and(sender_id.eq.${myId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${myId})`)
          .order("created_at", { ascending: true });

        if (chatData) {
          setMessages(chatData);
          // 💡 リロード時も画像などの読み込みを少し待ってから、確実に最下部へスクロールさせる
          setTimeout(() => {
            if (messagesEndRef.current) {
              // 親要素（タイムラインコンテナ）を直接一番下までスクロールさせる
              const container = messagesEndRef.current.parentElement;
              if (container) {
                container.scrollTop = container.scrollHeight;
              } else {
                messagesEndRef.current.scrollIntoView({ behavior: "auto" });
              }
            }
          }, 200); // 200ミリ秒ほど余裕を持たせることで描画ズレを防ぎます
        }

        // ③ このチャット相手からのメッセージ通知を既読にする
        await supabase
          .from("notification")
          .update({ is_read: true })
          .eq("receiver_id", myId)
          .eq("sender_id", receiverId)
          .eq("notification_type", "message")
          .eq("is_read", false);
      } catch (error) {
        console.error("データの取得に失敗しました:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChatData();
  }, [myId, receiverId]);

  // 3. 🔥 Supabase Realtime の設定
  useEffect(() => {
    if (!myId || !receiverId) return;

    const channel = supabase
      .channel("realtime-chats")
      .on(
        "postgres_changes",
        {
          event: "*", 
          schema: "public",
          table: "chat",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as ChatMessage;
            const isRelevant = 
              (newMsg.sender_id === myId && newMsg.receiver_id === receiverId) ||
              (newMsg.sender_id === receiverId && newMsg.receiver_id === myId);

            if (isRelevant) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              // 💡 リアルタイムで新しいメッセージが入ってきたときは「なめらかに」スクロール
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }, 50);
            }
          }
          
          if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            if (deletedId) {
              setMessages((prev) => prev.filter((msg) => msg.id !== deletedId));
            } else {
              console.warn("削除されたメッセージのIDが取得できませんでした。");
            }   
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, receiverId]);

  // 💡 画面のどこかを左クリックしたらメニューを閉じる
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  // 💡 画像が選ばれたときの処理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // 4. メッセージを送信する処理
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !myId || !receiverId) return;

    let uploadedImageUrl = null;

    if (selectedFile) {
      try {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${myId}/${fileName}`;

        const { data: storageData, error: storageError } = await supabase.storage
          .from("images")
          .upload(filePath, selectedFile);

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage
          .from("images")
          .getPublicUrl(filePath);

        uploadedImageUrl = publicUrl;
      } catch (uploadErr) {
        console.error("画像のアップロードに失敗しました:", uploadErr);
        alert("画像のアップロードに失敗しました。");
        return;
      }
    }

    const messageContent = inputText;
    const replyToId = replyingMessage?.id || null;
    const replyContent = replyingMessage?.content || null;
    
    setInputText("");
    setReplyingMessage(null);
    handleCancelImage();

    const { data: inserted, error } = await supabase
      .from("chat")
      .insert([
        {
          sender_id: myId,
          receiver_id: receiverId,
          content: messageContent,
          reply_to_id: replyToId,      
          reply_content: replyContent,
          image_url: uploadedImageUrl
        },
      ])
      .select("id")
      .single();

    if (error) {
      const errorDetails = JSON.stringify(error, null, 2);
      alert(`⚠️ 送信に失敗しました！\n\n【エラーコード】\n${error.code}\n\n【エラーメッセージ】\n${error.message}`);
      return;
    }

    await createNotification({
      receiverId,
      senderId: myId,
      type: "message",
      chatId: inserted?.id ?? null,
    });
  };

  // 💡 選んだ画像をキャンセルする処理
  const handleCancelImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 時間の表示を整形する関数
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  // メッセージを送信取り消しする処理
  const handleUnsendMessage = async (messageId: string) => {
    if (!confirm("このメッセージの送信を取り消しますか？")) return;

    try {
      const { error } = await supabase
        .from("chat")
        .delete()
        .eq("id", messageId);

      if (error) throw error;

      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    } catch (error) {
      console.error("送信取消に失敗しました:", error);
      alert("送信取消に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setContextMenu(null);
    }
  };

  const formatDateLine = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}/${day}`;
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white text-gray-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="flex bg-white h-screen text-black w-full">
      
      <div className="w-full flex flex-col h-full bg-white relative">
        
        {/* ヘッダー部分 */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center border-b border-gray-100 p-4">
          <button 
            onClick={() => router.back()} 
            className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600 mr-4"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="lucide lucide-chevron-left"
            >
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 mr-3 flex items-center justify-center border border-gray-100">
            {partner?.icon_src ? (
              <img src={partner.icon_src} alt={partner.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-500 text-sm">👤</span>
            )}
          </div>

          <div className="flex flex-col flex-1">
            <span className="font-bold text-lg">{partner?.username || "ユーザー"}</span>
            <span className="text-xs text-gray-500">@{partner?.username || "user"}</span>
          </div>
          <button className="text-gray-500 font-bold p-2 hover:bg-gray-100 rounded-full w-10 h-10 flex items-center justify-center">ⓘ</button>
        </div>

        {/* チャットタイムライン部分 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-28">
          
          {/* 中央のプロフィール紹介部分 */}
          <div className="flex flex-col items-center py-8 border-b border-gray-50 mb-6">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center border border-gray-100 mb-3 shadow-sm">
              {partner?.icon_src ? (
                <img 
                  src={partner.icon_src} 
                  alt={partner.username} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-500 text-3xl">👤</span>
              )}
            </div>
            <span className="font-bold text-xl">{partner?.username || "ユーザー"}</span>
            <span className="text-gray-500 text-sm">@{partner?.username || "user"}</span>
          </div>

          <div className="text-center text-xs text-gray-400 my-4 font-bold">トークの開始</div>

          {messages.map((msg, index) => {
            const isMe = msg.sender_id === myId;
            let showDateLine = false;
            if (index === 0) {
              showDateLine = true; 
            } else {
              const prevMsgDate = new Date(messages[index - 1].created_at).toDateString();
              const currentMsgDate = new Date(msg.created_at).toDateString();
              if (prevMsgDate !== currentMsgDate) {
                showDateLine = true; 
              }
            }

            const scrollToOriginalMessage = (replyId: string) => {
              const element = document.getElementById(`msg-${replyId}`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('bg-blue-50', 'transition-colors');
                setTimeout(() => element.classList.remove('bg-blue-50'), 1500);
              } else {
                alert("元のメッセージが見つかりません。");
              }
            };

            // 1. リプライ元のオリジナルメッセージを検索
            const originalMsg = msg.reply_to_id 
              ? messages.find(m => m.id === msg.reply_to_id) 
              : null;

            // 2. リプライ元のメッセージの送信者が「自分」かどうかを判定
            const isReplyToMe = originalMsg 
              ? originalMsg.sender_id === myId 
              : false;

            // 3. 💡 リプライ元メッセージの「名前」と「アイコン」をデータベースの実データに基づいて動的に決定
            const replyName = isReplyToMe 
              ? (currentUser?.username || "あなた") 
              : (partner?.username || "ユーザー");

            const replyIcon = isReplyToMe 
              ? currentUser?.icon_src 
              : partner?.icon_src;

            return (
              <div key={msg.id} id={`msg-${msg.id}`} className="w-full">
                {showDateLine && (
                  <div className="flex justify-center my-6">
                    <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                      {formatDateLine(msg.created_at)}
                    </span>
                  </div>
                )}
      
                {/* メッセージ全体のコンテナ */}
                <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} mb-4 w-full`}>
                  <div className={`flex flex-col max-w-[70%] rounded-2xl overflow-hidden shadow-sm border border-gray-200/80 ${
                    isMe ? "bg-[#1D9BF0] text-white rounded-br-none" : "bg-[#EFF3F4] text-black rounded-bl-none"
                  }`}>
                    {/* 🔼 線から上のリプライ部分 */}
                    {msg.reply_content && (
                      <div 
                        onClick={() => msg.reply_to_id && scrollToOriginalMessage(msg.reply_to_id)}
                        className={`flex flex-col gap-1 px-4 pt-3 pb-2 text-xs border-b cursor-pointer transition-colors active:opacity-70 ${
                          isMe 
                            ? "bg-black/10 hover:bg-black/20 border-white/20 text-white/90" 
                            : "bg-black/5 hover:bg-black/10 border-gray-200 text-gray-600"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold">
                          {/* 💡 リプライ元ユーザーのアイコンを表示 */}
                          <div className="w-4 h-4 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center shrink-0">
                            {replyIcon ? (
                              <img src={replyIcon} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[9px]">👤</span>
                            )}
                          </div>
                          {/* 💡 リプライ元ユーザーの名前を表示 */}
                          <span>{replyName}</span>
                          <span className="font-normal text-[10px] opacity-60"></span>
                        </div>
                        <div className="truncate pl-5 italic opacity-80">
                          {msg.reply_content}
                        </div>
                      </div>
                    )}

                    {/* 🔽 線から下の現在のメッセージ部分 */}
                    <div 
                      className="p-3 flex flex-col gap-1.5"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          visible: true,
                          x: e.clientX,
                          y: e.clientY,
                          messageId: msg.id,
                          messageContent: msg.content || "画像メッセージ",
                          isMe: isMe,
                        });
                      }}
                    >
                      {/* 画像メッセージ */}
                      {msg.image_url && (
                        <div 
                          className="max-w-xs rounded-xl overflow-hidden cursor-pointer border border-black/5 active:scale-[0.99] transition-transform"
                          onClick={() => {
                            if (msg.image_url) setPreviewImage(msg.image_url);
                          }}
                        >
                          <img 
                            src={msg.image_url} 
                            alt="添付画像" 
                            className="w-full h-auto max-h-60 object-cover" 
                          />
                        </div>
                      )}

                      {/* テキストメッセージ */}
                      {msg.content && msg.content.trim() !== "" && (
                        <div className="text-[15px] leading-snug select-none px-1">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  
                  </div>

                  {/* タイムスタンプ */}
                  <span className="text-[11px] text-gray-400 mt-1 px-1">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* フッター（メッセージ入力）部分 */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100">
          {replyingMessage && (
            <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gray-100 animate-in slide-in-from-bottom duration-150">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0 flex items-center justify-center border border-gray-100 shadow-inner">
                {partner?.icon_src ? (
                  <img src={partner.icon_src} alt={partner.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm">👤</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-black truncate">
                  {partner?.username || "ユーザー"}
                </p>
                <p className="text-sm text-gray-500 truncate mt-px">
                  {replyingMessage.content}
                </p>
              </div>

              <button 
                type="button"
                onClick={() => setReplyingMessage(null)}
                className="text-gray-400 p-1.5 hover:bg-gray-100 rounded-full transition flex items-center justify-center"
                title="リプライをキャンセル"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="lucide lucide-x"
                >
                  <path d="M18 6 6 18"/>
                  <path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
          )}

          {imagePreview && (
            <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gray-100 animate-in slide-in-from-bottom duration-150 relative bg-gray-50/50">
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 relative shrink-0">
                <img src={imagePreview} alt="プレビュー" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">送信される画像</p>
                <p className="text-xs font-bold text-gray-400 truncate">{selectedFile?.name}</p>
              </div>
              <button 
                type="button"
                onClick={handleCancelImage}
                className="text-gray-400 p-1.5 hover:bg-200 rounded-full transition flex items-center justify-center"
                title="画像をキャンセル"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-3 bg-[#EFF3F4] rounded-full px-5 py-2.5 m-4">
    
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="text-[#1D9BF0] p-1 hover:bg-blue-50 rounded-full transition flex items-center justify-center"
              title="画像を選択"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="22" 
                height="22" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="lucide lucide-album"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <polyline points="11 3 11 11 14 8 17 11 17 3"/>
              </svg>
            </button>

            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden" 
            />

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="メッセージを入力してください"
              className="flex-1 bg-transparent text-[15px] focus:outline-none placeholder-gray-500 text-black py-1"
            />
    
            <button
              type="submit"
              disabled={!inputText.trim() && !selectedFile}
              className={`p-2 rounded-full transition flex items-center justify-center ${
                (inputText.trim() || selectedFile)
                  ? "text-[#1D9BF0] hover:bg-blue-50" 
                  : "text-gray-300"
              }`}
              title="メッセージを送信"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="lucide lucide-send"
              >
                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>
                <path d="m21.854 2.147-10.94 10.939"/>
              </svg>
            </button>
          </form>
        </div>

        {/* カスタム右クリックメニュー */}
        {contextMenu?.visible && (
          <div
            className="fixed bg-white border border-gray-200 rounded-xl shadow-xl w-40 py-1.5 z-50 text-sm font-medium text-black select-none"
            style={{ 
              top: contextMenu.y + 5, 
              left: Math.min(contextMenu.x + 5, window.innerWidth - 170)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="w-full text-left px-4 py-2 hover:bg-gray-50 transition"
              onClick={() => {
                setReplyingMessage({
                  id: contextMenu.messageId,
                  content: contextMenu.messageContent
                });
                setContextMenu(null);
              }}
            >
              リプライ
            </button>
            
            <button 
              className="w-full text-left px-4 py-2 hover:bg-gray-50 transition"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(contextMenu.messageContent);
                } catch (err) {
                  console.error("コピーに失敗しました", err);
                }
                setContextMenu(null);
              }}
            >
              コピー
            </button>

            {contextMenu.isMe && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 border-t border-gray-100 transition"
                onClick={() => handleUnsendMessage(contextMenu.messageId)}
              >
                送信取消
              </button>
            )}
          </div>
        )}

      </div>
      
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white bg-white/20 p-2 rounded-full hover:bg-white/30 transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            ✕
          </button>
          <img 
            src={previewImage} 
            alt="プレビュー大画像" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          ></img>
        </div>
      )}
    </div>
  );
}