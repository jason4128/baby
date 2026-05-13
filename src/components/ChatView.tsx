import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Send, Baby, User, Trash2, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';

type ChatMessage = {
  id: string;
  userId: string;
  nickname: string;
  avatarUrl?: string;
  role: string;
  text: string;
  createdAt: any;
};

interface ChatViewProps {
  userProfile: any;
}

export default function ChatView({ userProfile }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isAdmin = auth.currentUser?.email === 'jason2134@gmail.com' || auth.currentUser?.email === 'user@gmail.com';

  useEffect(() => {
    const q = query(
      collection(db, 'chatMessages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'chatMessages');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [currentRole, setCurrentRole] = useState(userProfile?.role || 'guest');

  useEffect(() => {
    if (userProfile?.role) setCurrentRole(userProfile.role);
  }, [userProfile?.role]);

  const getActiveProfile = () => {
    const isMainAccount = auth.currentUser?.email === 'jason2134@gmail.com' || auth.currentUser?.email === 'user@gmail.com';
    if (isMainAccount) {
      if (currentRole === 'mama') return { nickname: '茶', avatarUrl: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Mama&backgroundColor=ffdfbf' };
      if (currentRole === 'papa') return { nickname: '傑', avatarUrl: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Papa&backgroundColor=b6e3f4' };
    }
    return {
      nickname: userProfile?.nickname || auth.currentUser?.email?.split('@')[0] || '神秘嘉賓',
      avatarUrl: userProfile?.avatarUrl || ''
    };
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !auth.currentUser) return;

    const messageText = input.trim();
    setInput('');

    const profile = getActiveProfile();

    try {
      await addDoc(collection(db, 'chatMessages'), {
        userId: auth.currentUser.uid,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        role: currentRole,
        text: messageText,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'chatMessages');
    }
  };

  const deleteMessage = async (id: string) => {
    if (!window.confirm("確定要刪除這則訊息嗎？")) return;
    try {
      await deleteDoc(doc(db, 'chatMessages', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `chatMessages/${id}`);
    }
  };

  const clearChatroom = async () => {
    if (!window.confirm("⚠️ 確定要清除所有聊天紀錄嗎？這項操作無法復原。")) return;
    try {
      const q = query(collection(db, 'chatMessages'), limit(100));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'chatMessages');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fdfbf7] overflow-hidden">
      {/* Header with Admin UI */}
      <div className="p-4 bg-white border-b border-amber-100 flex justify-between items-center shrink-0">
        <h2 className="text-sm font-bold text-[#5C4D43] flex items-center gap-2">
          <Baby className="w-5 h-5 text-amber-600" />
          全家參與聊天室
        </h2>
        {isAdmin && (
          <button 
            onClick={clearChatroom}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition shadow-sm"
          >
            <ShieldAlert className="w-4 h-4" />
            清除聊天室
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.userId === auth.currentUser?.uid;
          
          return (
            <div key={msg.id} className={cn("flex flex-col group", isMe ? "items-end" : "items-start")}>
              <div className={cn("flex items-center gap-2 mb-1 px-1", isMe ? "flex-row-reverse" : "flex-row")}>
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden border border-amber-200">
                  {msg.avatarUrl ? (
                    <img src={msg.avatarUrl} alt={msg.nickname} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <span className="text-[10px] font-bold text-amber-900/60 uppercase">
                  {msg.nickname} {msg.role === 'mama' ? '🤱' : msg.role === 'papa' ? '👨‍🍼' : '👤'}
                </span>
                {isAdmin && (
                  <button 
                    onClick={() => deleteMessage(msg.id)}
                    className={cn(
                      "p-1 text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100",
                      isMe ? "scale-x-[-1]" : ""
                    )}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm text-sm font-medium leading-relaxed",
                  isMe 
                    ? "bg-amber-600 text-white rounded-tr-none" 
                    : "bg-white border border-amber-100 text-[#5C4D43] rounded-tl-none"
                )}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-amber-100 shrink-0">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex bg-[#FFF9F0] p-1 rounded-xl border border-[#E8DCCB] w-fit mx-auto sm:mx-0 shadow-inner">
            {['mama', 'papa', 'guest'].map((r) => (
              <button
                key={r}
                onClick={() => {
                  setCurrentRole(r);
                  if (auth.currentUser) {
                    updateDoc(doc(db, 'users', auth.currentUser.uid), { role: r });
                  }
                }}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                  currentRole === r 
                    ? "bg-amber-600 text-white shadow-sm" 
                    : "text-[#8B7355] hover:bg-white/50"
                )}
              >
                {r === 'mama' ? '媽媽 🤱' : r === 'papa' ? '爸爸 👨‍🍼' : 'Guest 👤'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="輸入訊息參與討論..."
              className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim()}
              className="p-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition disabled:opacity-50 shadow-md active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
