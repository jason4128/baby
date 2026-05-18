import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calculator, Plus, Trash2, Save, BadgeDollarSign } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export interface DiscountTier {
  id: string;
  startDay: number;
  endDay: number;
  discountValue: number; // e.g., 9 means 90%, 8.5 means 85%
}

export interface CostEstimate {
  totalDays: number;
  roomRate: number;
  mealRate: number;
  babyRate: number;
  discounts: DiscountTier[];
}

interface CostCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerId: string;
  centerName: string;
  initialData?: CostEstimate;
}

export function CostCalculatorModal({ isOpen, onClose, centerId, centerName, initialData }: CostCalculatorModalProps) {
  const [totalDays, setTotalDays] = useState(initialData?.totalDays || 30);
  const [roomRate, setRoomRate] = useState(initialData?.roomRate || 0);
  const [mealRate, setMealRate] = useState(initialData?.mealRate || 0);
  const [babyRate, setBabyRate] = useState(initialData?.babyRate || 0);
  const [discounts, setDiscounts] = useState<DiscountTier[]>(initialData?.discounts || []);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTotalDays(initialData?.totalDays || 30);
      setRoomRate(initialData?.roomRate || 0);
      setMealRate(initialData?.mealRate || 0);
      setBabyRate(initialData?.babyRate || 0);
      setDiscounts(initialData?.discounts || []);
    }
  }, [isOpen, initialData]);

  const addDiscountTier = () => {
    const newStart = discounts.length > 0 ? Math.max(...discounts.map(d => d.endDay)) + 1 : 1;
    const newEnd = totalDays;
    setDiscounts([...discounts, {
      id: Math.random().toString(36).substring(7),
      startDay: newStart,
      endDay: newEnd,
      discountValue: 9
    }]);
  };

  const removeDiscountTier = (id: string) => {
    setDiscounts(discounts.filter(d => d.id !== id));
  };

  const calculateCost = () => {
    let totalRoom = 0;
    let totalMeal = mealRate * totalDays;
    let totalBaby = babyRate * totalDays;

    for (let day = 1; day <= totalDays; day++) {
      let discountMult = 1;
      const tier = discounts.find(d => day >= d.startDay && day <= d.endDay);
      if (tier && tier.discountValue > 0 && tier.discountValue <= 10) {
        discountMult = tier.discountValue / 10;
      }
      totalRoom += roomRate * discountMult;
    }

    return { totalRoom, totalMeal, totalBaby, total: totalRoom + totalMeal + totalBaby };
  };

  const { totalRoom, totalMeal, totalBaby, total } = calculateCost();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const costEstimate: CostEstimate = {
        totalDays,
        roomRate,
        mealRate,
        babyRate,
        discounts
      };
      await updateDoc(doc(db, 'postpartum_centers', centerId), {
        costEstimate
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `postpartum_centers/${centerId}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-[#FAFAFA] rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden border-4 border-slate-200 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="bg-slate-100 p-5 flex items-center justify-between border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 leading-tight">費用試算</h2>
                  <p className="text-xs text-slate-500 font-medium">{centerName}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {/* Basic Rates */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <BadgeDollarSign className="w-4 h-4 text-indigo-500" /> 基本每日費用
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">入住天數</label>
                    <input 
                      type="number" 
                      value={totalDays || ''} 
                      onChange={e => setTotalDays(Number(e.target.value))}
                      className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl font-medium focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">房間費/天</label>
                    <input 
                      type="number" 
                      value={roomRate || ''} 
                      onChange={e => setRoomRate(Number(e.target.value))}
                      className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl font-medium focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">月子餐/天</label>
                    <input 
                      type="number" 
                      value={mealRate || ''} 
                      onChange={e => setMealRate(Number(e.target.value))}
                      className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl font-medium focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">嬰兒照護/天</label>
                    <input 
                      type="number" 
                      value={babyRate || ''} 
                      onChange={e => setBabyRate(Number(e.target.value))}
                      className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl font-medium focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Discounts */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">房間折扣級距</h3>
                  <button 
                    onClick={addDiscountTier}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新增折扣
                  </button>
                </div>
                
                {discounts.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium">目前無設定折扣。(例如：第1-10天9折)</p>
                ) : (
                  <div className="space-y-3">
                    {discounts.map((tier, index) => (
                      <div key={tier.id} className="flex flex-wrap items-center gap-2 bg-white border-2 border-slate-200 p-3 rounded-xl relative group">
                        <span className="text-xs font-bold text-slate-400">第</span>
                        <input 
                          type="number" 
                          value={tier.startDay}
                          onChange={e => {
                            const newArr = [...discounts];
                            newArr[index].startDay = Number(e.target.value);
                            setDiscounts(newArr);
                          }}
                          className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-sm text-center focus:border-indigo-400 outline-none"
                        />
                        <span className="text-xs font-bold text-slate-400">天 ~</span>
                        <input 
                          type="number" 
                          value={tier.endDay}
                          onChange={e => {
                            const newArr = [...discounts];
                            newArr[index].endDay = Number(e.target.value);
                            setDiscounts(newArr);
                          }}
                          className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-sm text-center focus:border-indigo-400 outline-none"
                        />
                        <span className="text-xs font-bold text-slate-400">天</span>
                        
                        <div className="flex-1 min-w-[80px] flex justify-end items-center gap-2">
                          <input 
                            type="number" 
                            step="0.1"
                            value={tier.discountValue}
                            onChange={e => {
                              const newArr = [...discounts];
                              newArr[index].discountValue = Number(e.target.value);
                              setDiscounts(newArr);
                            }}
                            className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-sm text-center focus:border-indigo-400 outline-none font-bold text-indigo-700"
                          />
                          <span className="text-xs font-bold text-slate-500">折</span>
                        </div>
                        
                        <button 
                          onClick={() => removeDiscountTier(tier.id)}
                          className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 bg-slate-50 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Calculation */}
            <div className="bg-slate-50 p-6 border-t border-slate-200 shrink-0">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm font-medium text-slate-500">
                  <span>房間總計 (含折扣)</span>
                  <span>${Math.round(totalRoom).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-medium text-slate-500">
                  <span>月子餐總計</span>
                  <span>${Math.round(totalMeal).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-medium text-slate-500">
                  <span>嬰兒照護總計</span>
                  <span>${Math.round(totalBaby).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-slate-800 pt-2 border-t border-slate-200">
                  <span>預估總費用</span>
                  <span className="text-indigo-600">${Math.round(total).toLocaleString()}</span>
                </div>
              </div>
              
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Save className="w-4 h-4" /> 儲存紀錄
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
