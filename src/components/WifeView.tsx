import React, { useState, useEffect } from 'react';
import { Heart, Edit3, HeartHandshake, Sparkles, Loader2, Save } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LoveNote {
  id: string;
  type: 'letter' | 'trick' | 'discomfort';
  content: string;
  createdAt: any;
}

export default function WifeView({ pregWeek }: { pregWeek: number }) {
  const [notes, setNotes] = useState<LoveNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteType, setNewNoteType] = useState<'letter' | 'trick' | 'discomfort'>('letter');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'wifeNotes'), where('userId', '==', auth.currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoveNote))
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setNotes(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'wifeNotes'));
    return () => unsub();
  }, []);

  const handleSaveNote = async () => {
    if (!newNoteContent.trim() && !aiDraft.trim()) return;
    try {
      await addDoc(collection(db, 'wifeNotes'), {
        userId: auth.currentUser!.uid,
        type: newNoteType,
        content: aiDraft.trim() || newNoteContent.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewNoteContent('');
      setAiDraft('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'wifeNotes');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除這筆紀錄嗎？')) {
      try {
        await deleteDoc(doc(db, 'wifeNotes', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `wifeNotes/${id}`);
      }
    }
  };

  const generateAIContent = async () => {
    setAiLoading(true);
    try {
      const { GoogleGenAI } = await import('@google/genai');
      // @ts-ignore
      const apiKey = localStorage.getItem("GEMINI_API_KEY") || import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
      if (!apiKey) throw new Error("請先設定 Gemini API Key！");
      const client = new GoogleGenAI({ apiKey });

      let prompt = '';
      if (newNoteType === 'letter') {
        prompt = `請幫我寫一封大約 100 字內的簡短情書，哄我懷孕第 ${pregWeek} 週的老婆開心，感謝她的辛勞，語氣溫柔貼心。`;
      } else if (newNoteType === 'trick') {
        prompt = `老婆現在懷孕第 ${pregWeek} 週，請給我 3 個可以哄她開心或讓她放鬆的具體小招數（例如按摩手法、驚喜小禮）。`;
      } else {
        prompt = `老婆現在懷孕第 ${pregWeek} 週，通常會有什麼不舒服？請列出 3 個能改善這些不適的好方法（針對飲食或生活習慣）。`;
      }

      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { temperature: 0.8 }
      });

      setAiDraft(response.text || '');
    } catch (e) {
      console.error(e);
      alert('產生失敗，請確認 API Key 設定。');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-pink-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-2xl flex items-center justify-center shrink-0">
              <Heart className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-pink-900">老婆大人專區</h2>
              <p className="text-pink-700/70 text-sm mt-1">
                哄妻招數、情話紀錄與舒緩不適的貼心筆記，專屬老公的秘密武器。
              </p>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-pink-100 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'letter', label: '寫情書/情話', icon: Edit3 },
              { id: 'trick', label: '哄妻小招數', icon: Sparkles },
              { id: 'discomfort', label: '舒緩不適對策', icon: HeartHandshake }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => { setNewNoteType(type.id as any); setAiDraft(''); setNewNoteContent(''); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  newNoteType === type.id 
                    ? 'bg-pink-100 text-pink-700 border border-pink-200' 
                    : 'bg-slate-50 text-slate-500 hover:bg-pink-50 hover:text-pink-600 border border-transparent'
                }`}
              >
                <type.icon className="w-4 h-4" />
                {type.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <textarea
              className="w-full bg-[#FFF9F0] border border-pink-100 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none h-32 text-pink-900"
              placeholder={
                newNoteType === 'letter' ? '寫下你想對老婆說的貼心話...' :
                newNoteType === 'trick' ? '記錄下發現能讓老婆開心的小動作...' :
                '記下可以改善老婆目前不舒服的方法...'
              }
              value={aiDraft || newNoteContent}
              onChange={e => {
                if (aiDraft) {
                  setNewNoteContent(e.target.value);
                  setAiDraft('');
                } else {
                  setNewNoteContent(e.target.value);
                }
              }}
            />
            <div className="flex justify-between items-center">
              <button
                onClick={generateAIContent}
                disabled={aiLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl hover:opacity-90 font-bold text-sm shadow-sm disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                讓 AI 給個靈感
              </button>
              
              <button
                onClick={handleSaveNote}
                disabled={!newNoteContent.trim() && !aiDraft.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-xl hover:bg-pink-700 font-bold shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                存檔
              </button>
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notes.map(note => (
             <div key={note.id} className="bg-white p-5 rounded-2xl shadow-sm border border-pink-100 group relative">
               <button 
                 onClick={() => handleDelete(note.id)}
                 className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
               >
                 刪除
               </button>
               <div className="text-xs font-bold text-pink-400/80 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  {note.type === 'letter' ? <><Edit3 className="w-3.5 h-3.5"/> 情話</> :
                   note.type === 'trick' ? <><Sparkles className="w-3.5 h-3.5"/> 招數</> :
                   <><HeartHandshake className="w-3.5 h-3.5"/> 舒緩對策</>}
               </div>
               <div className="markdown-body text-pink-900/90 text-sm leading-relaxed prose prose-pink">
                 <Markdown remarkPlugins={[remarkGfm]}>{note.content}</Markdown>
               </div>
             </div>
          ))}
          {notes.length === 0 && (
            <div className="col-span-full text-center py-10 text-pink-300">
              目前還沒有紀錄，快寫下第一篇貼心筆記吧！
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
