import React, { useState, useEffect } from 'react';
import { ClipboardList, CheckCircle2, Circle, Trash2, Plus, Loader2 } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface Milestone {
  id: string;
  task: string;
  isCompleted: boolean;
  createdAt: any;
}

export default function MilestonesView() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newTask, setNewTask] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'milestones'), 
      where('userId', '==', auth.currentUser.uid)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Milestone))
        .sort((a, b) => {
          // Sort items by status (inc) then by creation date (dec)
          if (a.isCompleted === b.isCompleted) {
            return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
          }
          return a.isCompleted ? 1 : -1;
        });
      setMilestones(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'milestones'));
    
    return () => unsub();
  }, []);

  const handleAddTask = async () => {
    if (!newTask.trim() || !auth.currentUser) return;
    setIsLoading(true);
    try {
      await addDoc(collection(db, 'milestones'), {
        userId: auth.currentUser.uid,
        task: newTask.trim(),
        isCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewTask('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'milestones');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMilestone = async (m: Milestone) => {
    try {
      await updateDoc(doc(db, 'milestones', m.id), {
        isCompleted: !m.isCompleted,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `milestones/${m.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'milestones', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `milestones/${id}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-indigo-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-indigo-900">重要紀事</h2>
            <p className="text-indigo-700/70 text-sm mt-1">
              紀錄孕期重要備忘錄、待辦事項與寶寶用品購買清單。
            </p>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-indigo-50 flex gap-2">
          <input
            type="text"
            className="flex-1 bg-indigo-50/30 border border-indigo-100 rounded-2xl px-4 py-3 text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-indigo-400"
            placeholder="新增重要紀事... 例如：買消毒鍋、預約產檢"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          />
          <button
            onClick={handleAddTask}
            disabled={isLoading || !newTask.trim()}
            className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-200 active:scale-95"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
          </button>
        </div>

        {/* List Areas */}
        <div className="space-y-3">
          {milestones.length === 0 ? (
            <div className="text-center py-20 text-indigo-300 flex flex-col items-center gap-2">
              <ClipboardList className="w-12 h-12 opacity-20" />
              <p>目前還沒有任何紀事，開始規劃您的孕期準備吧！</p>
            </div>
          ) : (
            milestones.map((m) => (
              <div 
                key={m.id} 
                className={cn(
                  "bg-white p-4 rounded-2xl border flex items-center gap-4 group transition-all",
                  m.isCompleted ? "border-slate-100 opacity-60" : "border-indigo-50 hover:border-indigo-200 shadow-sm"
                )}
              >
                <button 
                  onClick={() => toggleMilestone(m)}
                  className={cn(
                    "shrink-0 transition-colors",
                    m.isCompleted ? "text-green-500" : "text-slate-300 hover:text-indigo-400"
                  )}
                >
                  {m.isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                </button>
                
                <span className={cn(
                  "flex-1 text-[15px] font-medium transition-all",
                  m.isCompleted ? "text-slate-400 line-through" : "text-indigo-900"
                )}>
                  {m.task}
                </span>

                <button 
                  onClick={() => handleDelete(m.id)}
                  className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
