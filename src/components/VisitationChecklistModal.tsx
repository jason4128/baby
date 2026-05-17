import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Circle, ClipboardList, Info, AlertCircle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export const CHECKLIST_GROUPS = [
  {
    id: 'care',
    title: '照護專業與醫療',
    items: [
      { id: 'ratio', label: '嬰護比是否達到 1:5？' },
      { id: 'license', label: '全體照護員是否皆具護理師執照？' },
      { id: 'ped_visit', label: '小兒科醫師巡診頻率（建議每週2-3次）？' },
      { id: 'ob_visit', label: '婦產科醫師巡診頻率？' },
      { id: 'emergency', label: '緊急醫療後援醫院是否鄰近？' },
      { id: 'observation', label: '是否有新進嬰兒觀察室（隔離機制）？' }
    ]
  },
  {
    id: 'env',
    title: '建築環境與安全',
    items: [
      { id: 'legal', label: '是否有政府合法立案證照？' },
      { id: 'control', label: '訪客控管機制是否嚴格（感控規定）？' },
      { id: 'ac', label: '是否具備獨立空調系統（非中央空調）？' },
      { id: 'fire', label: '消防逃生動線是否暢通且合規？' },
      { id: 'sound', label: '房間隔音效果與採光是否滿意？' },
      { id: 'water', label: '室內水龍頭是否為熟水（煮沸水）？' }
    ]
  },
  {
    id: 'mother',
    title: '母嬰照護細節',
    items: [
      { id: 'lactation', label: '有無專業泌乳指導（且收費透明）？' },
      { id: 'together', label: '是否支持彈性母嬰同室（不情緒勒索）？' },
      { id: 'monitor', label: '嬰兒室是否有 24 小時遠端視訊監看？' },
      { id: 'big_kid', label: '是否允許大寶入室（若有二胎需求）？' },
      { id: 'health_edu', label: '是否提供產後衛教實作課程（洗澡、換奶）？' }
    ]
  },
  {
    id: 'meal_service',
    title: '餐點與額外服務',
    items: [
      { id: 'kitchen', label: '月子餐是否為館內自有廚房現煮？' },
      { id: 'custom', label: '菜單能否依體質客製（如避嫌食材）？' },
      { id: 'parking', label: '是否提供專屬停車位（且包含在費用內）？' },
      { id: 'spa', label: '有無提供洗頭、SPA 等放鬆服務？' },
      { id: 'laundry', label: '是否有提供媽媽換洗衣物清洗服務？' }
    ]
  },
  {
    id: 'contract',
    title: '合約與彈性規定',
    items: [
      { id: 'availability', label: '若提早生或延後生無房時的配套方案？' },
      { id: 'extra_cost', label: '耗材（尿布、奶瓶等）是否包含在房費內？' },
      { id: 'deposit', label: '訂金退款基準與解約條款是否合理？' },
      { id: 'extension', label: '臨時需延長入住或提早退房的機制？' }
    ]
  }
];

interface VisitationChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerId: string;
  centerName: string;
  initialChecklist: Record<string, boolean> | undefined;
}

export function VisitationChecklistModal({ isOpen, onClose, centerId, centerName, initialChecklist }: VisitationChecklistModalProps) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initialChecklist || {});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setChecklist(initialChecklist || {});
  }, [initialChecklist, isOpen]);

  const toggleItem = (itemId: string) => {
    setChecklist(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'postpartum_centers', centerId), {
        checklist: checklist
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `postpartum_centers/${centerId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const totalCount = CHECKLIST_GROUPS.reduce((acc, group) => acc + group.items.length, 0);
  const checkedCount = Object.values(checklist).filter(Boolean).length;
  const progress = Math.round((checkedCount / totalCount) * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white rounded-[2.5rem] w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border-[6px] border-rose-100"
          >
            {/* Header */}
            <div className="bg-rose-50 p-6 flex items-center justify-between border-b border-rose-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-rose-900 leading-tight">參訪勾選表</h2>
                  <p className="text-sm text-rose-700/70 font-medium">{centerName}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-rose-100 rounded-full text-rose-400 transition-colors"
                title="關閉"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="px-6 py-4 bg-white border-b border-rose-50 shrink-0">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold text-rose-900/60 uppercase tracking-wider">完成進度</span>
                <span className="text-lg font-black text-rose-600">{progress}%</span>
              </div>
              <div className="h-2.5 bg-rose-50 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3 text-amber-900 border-l-4">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-xs leading-relaxed font-medium">
                  參觀時可以直接開啟此表一項一項確認。勾選後按「儲存」即可永久記錄該館的評估結果，方便日後進行多館比較。
                </p>
              </div>

              {CHECKLIST_GROUPS.map((group) => (
                <div key={group.id} className="space-y-4">
                  <h3 className="text-base font-bold text-rose-900 flex items-center gap-2 px-2">
                    <span className="w-1.5 h-6 bg-rose-400 rounded-full" />
                    {group.title}
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {group.items.map((item) => {
                      const isChecked = !!checklist[item.id];
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={`flex items-start gap-4 p-4 rounded-3xl text-left transition-all border-2 ${
                            isChecked 
                              ? 'bg-rose-50/50 border-rose-200 text-rose-900 shadow-sm' 
                              : 'bg-white border-slate-100 text-slate-600 hover:border-rose-100'
                          }`}
                        >
                          <div className={`mt-0.5 shrink-0 transition-colors ${isChecked ? 'text-rose-500' : 'text-slate-200'}`}>
                            {isChecked ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                          </div>
                          <span className="text-sm font-bold leading-snug">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              <div className="flex items-center gap-2 p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs font-medium border border-rose-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>以上項目僅供參考，請以各產後護理之家的官方最新說明與現行法規為準。</span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-white border-t border-rose-50 shrink-0">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-bold text-lg shadow-lg hover:from-rose-600 hover:to-pink-700 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                儲存勾選結果
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
