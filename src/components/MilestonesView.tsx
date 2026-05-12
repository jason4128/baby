import React, { useState, useEffect } from 'react';
import { ClipboardList, CheckCircle2, Circle, Trash2, Plus, Loader2, FileDown } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface Milestone {
  id: string;
  task: string;
  category?: 'checkup' | 'equipment' | 'hospital_bag' | 'other';
  isCompleted: boolean;
  createdAt: any;
}

const PRENATAL_CHECKUPS = [
  "第 1 次產檢 (未滿 12 週)：問診、量體重/血壓、常規抽血/驗尿檢查",
  "第 2 次產檢 (13~16 週)：問診、量體重/血壓、驗尿、胎兒心跳",
  "第 3 次產檢 (17~20 週)：例行檢查、產婦常規超音波檢查",
  "第 4 次產檢 (21~24 週)：例行檢查、早產防治衛教",
  "第 5 次產檢 (25~28 週)：例行檢查、妊娠糖尿病篩檢徵詢",
  "第 6 次產檢 (29~32 週)：例行檢查、抽血檢查(B型肝炎/梅毒)",
  "第 7 次產檢 (33~35 週)：例行檢查、超音波檢查、乙型鏈球菌篩檢",
  "第 8 次產檢 (36 週)：例行檢查、生產準備衛教",
  "第 9 次產檢 (37 週)：例行檢查、胎兒監視",
  "第 10 次產檢 (38 週)：例行檢查、待產衛教",
  "第 11 次產檢 (39 週)：例行檢查",
  "第 12 次產檢 (40 週)：例行檢查",
  "第 13 次產檢 (41 週)：例行檢查、催生評估",
  "第 14 次產檢 (視需要延遲產)：例行檢查、引產評估"
];

const HOSPITAL_BAG_ITEMS = [
  "[證件現金] 身分證、健保卡",
  "[證件現金] 孕婦健康手冊",
  "[證件現金] 信用卡、現金等",
  "[盥洗等用品] 個人梳洗用品",
  "[盥洗等用品] 梳子、保養品",
  "[盥洗等用品] 產褥墊",
  "[盥洗等用品] 溢乳墊",
  "[盥洗等用品] 口罩、消毒用品",
  "[換洗衣物] 出院衣物、保暖衣物",
  "[換洗衣物] 哺乳內衣",
  "[換洗衣物] 束腹帶（剖腹產用）",
  "[換洗衣物] 免洗褲",
  "[換洗衣物] 拖鞋",
  "[餐具] 環保餐具",
  "[餐具] 杯子、保溫瓶",
  "[寶寶用品] 寶寶衣物、包巾",
  "[寶寶用品] 適齡之汽車安全座椅",
  "[其他] 手機、行動電源、充電線",
  "[其他] 吸乳器、奶瓶（依個人需求）",
  "[減輕產痛的用品] 按摩工具",
  "[減輕產痛的用品] 熱敷袋",
  "[減輕產痛的用品] 音樂",
  "[減輕產痛的用品] 枕頭（可自己多備）"
];

export default function MilestonesView() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newTask, setNewTask] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<NonNullable<Milestone['category']>>('equipment');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<Milestone['category'] | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
        category: newTaskCategory,
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

  const handleImportCheckups = async () => {
    if (!auth.currentUser) return;
    setIsImporting(true);
    try {
      const batch = writeBatch(db);
      PRENATAL_CHECKUPS.forEach((task, index) => {
        // Reverse order so they appear chronologically in the list since we sort by desc
        const docRef = doc(collection(db, 'milestones'));
        batch.set(docRef, {
          userId: auth.currentUser!.uid,
          task: task,
          category: 'checkup',
          isCompleted: false,
          // Subtract index seconds to maintain visual ordering
          createdAt: new Date(Date.now() - (PRENATAL_CHECKUPS.length - index) * 1000),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'milestones');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportHospitalBag = async () => {
    if (!auth.currentUser) return;
    setIsImporting(true);
    try {
      const batch = writeBatch(db);
      HOSPITAL_BAG_ITEMS.forEach((task, index) => {
        const docRef = doc(collection(db, 'milestones'));
        batch.set(docRef, {
          userId: auth.currentUser!.uid,
          task: task,
          category: 'hospital_bag',
          isCompleted: false,
          createdAt: new Date(Date.now() - (HOSPITAL_BAG_ITEMS.length - index) * 1000),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'milestones');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-indigo-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
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
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleImportCheckups}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 font-bold text-sm transition-colors border border-indigo-200 disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              匯入公費產檢
            </button>
            <button
              onClick={handleImportHospitalBag}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 font-bold text-sm transition-colors border border-teal-200 disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              匯入待產包清單
            </button>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-indigo-50 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 flex bg-indigo-50/30 border border-indigo-100 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400">
              <select
                value={newTaskCategory}
                onChange={(e) => setNewTaskCategory(e.target.value as any)}
                className="bg-transparent border-r border-indigo-100 px-3 text-sm text-indigo-700 font-bold focus:outline-none cursor-pointer"
              >
                <option value="equipment">設備採購</option>
                <option value="checkup">產檢</option>
                <option value="hospital_bag">待產包</option>
                <option value="other">其他</option>
              </select>
              <input
                type="text"
                className="flex-1 bg-transparent px-4 py-3 text-indigo-900 focus:outline-none placeholder:text-indigo-400"
                placeholder="新增重要紀事... 例如：買消毒鍋、預約產檢"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
              />
            </div>
            <button
              onClick={handleAddTask}
              disabled={isLoading || !newTask.trim()}
              className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-200 active:scale-95 shrink-0"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: '全部' },
            { id: 'equipment', label: '設備採購' },
            { id: 'checkup', label: '產檢' },
            { id: 'hospital_bag', label: '待產包' },
            { id: 'other', label: '其他' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryFilter(cat.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors border",
                activeCategoryFilter === cat.id
                  ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                  : "bg-white text-slate-500 border-transparent hover:bg-slate-50"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* List Areas */}
        <div className="space-y-3">
          {milestones.filter(m => activeCategoryFilter === 'all' || m.category === activeCategoryFilter || (!m.category && activeCategoryFilter === 'other')).length === 0 ? (
            <div className="text-center py-20 text-indigo-300 flex flex-col items-center gap-2">
              <ClipboardList className="w-12 h-12 opacity-20" />
              <p>目前還沒有任何紀事，開始規劃您的孕期準備吧！</p>
            </div>
          ) : (
            milestones
              .filter(m => activeCategoryFilter === 'all' || m.category === activeCategoryFilter || (!m.category && activeCategoryFilter === 'other'))
              .map((m) => (
              <div 
                key={m.id} 
                className={cn(
                  "bg-white p-4 rounded-2xl border flex items-center gap-3 sm:gap-4 group transition-all",
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
                
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-1 overflow-hidden">
                  {m.category && (
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap w-fit",
                      m.category === 'checkup' && "bg-blue-100 text-blue-700",
                      m.category === 'equipment' && "bg-amber-100 text-amber-700",
                      m.category === 'hospital_bag' && "bg-teal-100 text-teal-700",
                      m.category === 'other' && "bg-slate-100 text-slate-700"
                    )}>
                      {m.category === 'checkup' ? '產檢' : 
                       m.category === 'equipment' ? '設備採購' : 
                       m.category === 'hospital_bag' ? '待產包' : '其他'}
                    </span>
                  )}
                  <span className={cn(
                    "text-[15px] font-medium transition-all truncate",
                    m.isCompleted ? "text-slate-400 line-through" : "text-indigo-900"
                  )}>
                    {m.task}
                  </span>
                </div>

                <button 
                  onClick={() => handleDelete(m.id)}
                  className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 shrink-0"
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
