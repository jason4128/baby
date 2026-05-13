import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Send, Baby, User } from 'lucide-react';
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

  const handleSendMessage = async () => {
    if (!input.trim() || !auth.currentUser) return;

    const messageText = input.trim();
    setInput('');

    try {
      await addDoc(collection(db, 'chatMessages'), {
        userId: auth.currentUser.uid,
        nickname: userProfile?.nickname || auth.currentUser.email?.split('@')[0] || '神秘嘉賓',
        avatarUrl: userProfile?.avatarUrl || '',
        role: currentRole,
        text: messageText,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'chatMessages');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fdfbf7] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.userId === auth.currentUser?.uid;
          
          return (
            <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
              <div className="flex items-center gap-2 mb-1 px-1">
                {!isMe && (
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden">
                    {msg.avatarUrl ? (
                      <img src={msg.avatarUrl} alt={msg.nickname} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                )}
                <span className="text-[10px] font-bold text-amber-900/60 uppercase">
                  {msg.nickname} {msg.role === 'mama' ? '🤱' : msg.role === 'papa' ? '👨‍🍼' : '👤'}
                </span>
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm text-sm font-medium",
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

      <div className="p-4 bg-white border-t border-amber-100">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex bg-[#FFF9F0] p-1 rounded-xl border border-[#E8DCCB] w-fit mx-auto sm:mx-0">
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
                {r === 'mama' ? '媽媽 🤱' : r === 'papa' ? '爸爸 👨‍🍼' : '訪客 👤'}
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
              className="p-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
