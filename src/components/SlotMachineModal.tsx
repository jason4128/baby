import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export const SLOT_FOODS = [
  { id: 'bread', emoji: '🍞', name: '白吐司', message: "哇！是白吐司！剛烤好的最軟最香了，澱粉能量充電完畢！⚡🍞" },
  { id: 'croissant', emoji: '🥐', name: '可頌', message: "是可頌！好多層的千層酥皮，我要數數看有幾層！🥐✨" },
  { id: 'baguette', emoji: '🥖', name: '大蒜法國', message: "沒錯！就是大蒜法國長棍！我的最愛！這香味太無敵了！🧄🥖🤤" },
  { id: 'bagel', emoji: '🥯', name: '貝果', message: "貝果！QQ的超有嚼勁，配上厚厚的奶油乳酪最完美！🥯🧈" },
  { id: 'sweet_potato', emoji: '🍠', name: '烤地瓜', message: "烤地瓜！熱騰騰又甜甜糯糯的，感覺整個肚子都溫暖起來了！🍠🔥" },
  { id: 'mochi', emoji: '🍡', name: '麻糬', message: "麻糬！QQ軟軟跟我未來的臉頰一樣彈！花生粉多加一點喔！🍡🥜" },
  { id: 'pizza', emoji: '🍕', name: '披薩', message: "披薩！那個起司牽絲，我可以拉到外太空去！🍕🧀🚀" },
  { id: 'donut', emoji: '🍩', name: '甜甜圈', message: "甜甜圈！糖粉灑滿滿，今天的心情也是甜甜圈形狀的！🍩💖" },
];

export function SlotMachineModal({ isOpen, onClose, onWin }: { isOpen: boolean, onClose: () => void, onWin: (food: any) => void }) {
  const [step, setStep] = useState(0); 
  const [targetFood, setTargetFood] = useState(SLOT_FOODS[0]);
  const [isLeverPulled, setIsLeverPulled] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setTargetFood(SLOT_FOODS[Math.floor(Math.random() * SLOT_FOODS.length)]);
      setIsLeverPulled(false);
    }
  }, [isOpen]);

  const handlePress = () => {
    setIsLeverPulled(true);
    setTimeout(() => setIsLeverPulled(false), 200);

    if (step === 0) setStep(1);
    else if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) {
      setStep(4);
      setTimeout(() => {
        onWin(targetFood);
        onClose();
      }, 1500);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-[#FFF8ED] rounded-[2rem] p-6 w-full max-w-sm relative flex flex-col items-center border-[6px] border-amber-400 shadow-2xl"
          >
            <button onClick={onClose} className="absolute top-4 right-4 bg-amber-200 text-amber-800 rounded-full p-1 border-2 border-amber-400 hover:bg-amber-300">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-amber-800 mb-6 flex items-center gap-2">
              🎰 澱粉拉霸機 🎰
            </h2>

            <div className="flex gap-4 items-center w-full justify-center">
                <div className="bg-amber-500 p-4 rounded-2xl shadow-inner border-[6px] border-amber-700 flex gap-2">
                  <SpinSlot spinning={step >= 1 && step < 2} targetEmoji={targetFood.emoji} isIdle={step === 0} />
                  <SpinSlot spinning={step >= 1 && step < 3} targetEmoji={targetFood.emoji} isIdle={step === 0} />
                  <SpinSlot spinning={step >= 1 && step < 4} targetEmoji={targetFood.emoji} isIdle={step === 0} />
                </div>

                <div className="relative h-24 flex items-center -mt-2">
                  <div className="w-4 h-[72px] bg-slate-300 border-[3px] border-slate-400 rounded-full relative">
                     <motion.div 
                       animate={isLeverPulled ? { y: 40 } : { y: -10 }}
                       transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                       className="absolute -left-[14px] w-10 h-10 rounded-full bg-red-500 border-[3px] border-red-700 shadow-md cursor-pointer"
                       onClick={handlePress}
                     />
                  </div>
                </div>
            </div>
            
            <button 
              onClick={handlePress}
              className="mt-8 bg-amber-400 hover:bg-amber-500 text-amber-900 font-bold py-3 px-8 rounded-full border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 transition-all text-lg"
            >
              {step === 0 ? "搖下去！" : step === 4 ? "中獎啦！" : "停！"}
            </button>
            
            {step === 4 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -bottom-[26px] text-lg font-bold text-white drop-shadow-md bg-amber-500 px-6 py-2 rounded-full border-[3px] border-white max-w-[90%] text-center break-words"
              >
                🎊 獲得 {targetFood.name} 🎊
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const SpinSlot = ({ spinning, targetEmoji, isIdle }: { spinning: boolean, targetEmoji: string, isIdle: boolean }) => {
  const emojis = ['🍞', '🥐', '🥖', '🥯', '🍠', '🍡', '🍕', '🍩'];
  const [displayoji, setDisplayoji] = useState(emojis[0]);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (spinning) {
      interval = setInterval(() => {
        setDisplayoji(emojis[Math.floor(Math.random() * emojis.length)]);
      }, 80);
    } else {
      if (!isIdle) {
        setDisplayoji(targetEmoji);
      } else {
        setDisplayoji('❓');
      }
    }
    return () => clearInterval(interval);
  }, [spinning, targetEmoji, isIdle]);

  return (
    <div className="text-[40px] flex items-center justify-center h-[72px] w-[60px] bg-[#fffdf8] border-[3px] border-amber-800 rounded-xl shadow-inner overflow-hidden">
      {displayoji}
    </div>
  );
}
