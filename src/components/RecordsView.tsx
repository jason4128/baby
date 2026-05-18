import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Image as ImageIcon,
  Video,
  Plus,
  X,
  Calendar,
  Baby,
  Edit,
  Save,
  Loader2,
  Heart,
  Cloud,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from 'motion/react';
import { cn } from "../lib/utils";
import { BABY_MESSAGES } from '../constants/babyMessages';
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { withKeyFallback } from "../services/gemini";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  updateDoc,
  getDocs,
  limit
} from 'firebase/firestore';
import { 
  MessageSquare,
  Send,
  User,
  Trash2
} from "lucide-react";
import { fileToBase64 } from "../services/gemini";
import { 
  uploadToDrive, 
  deleteFromDrive, 
  getDriveFileUrl, 
  makeFilePublic,
  getOrCreateFolder
} from "../services/googleDrive";
import { SlotMachineModal } from "./SlotMachineModal";

export type RecordEntry = {
  id: string;
  date: string;
  type: "image" | "video" | "text" | "baby_ai";
  url: string;
  driveFileId?: string;
  note: string;
  weekCount: number;
  dayCount: number;
  userId: string;
  createdAt: any;
};

interface RecordsViewProps {
  pregWeek: number;
  pregDay: number;
  conceptionDate: Date;
  onUpdateConceptionDate: (date: Date) => void;
  oauthClientId: string;
  userProfile: any;
}

export default function RecordsView({
  pregWeek,
  pregDay,
  conceptionDate,
  onUpdateConceptionDate,
  oauthClientId,
  userProfile,
}: RecordsViewProps) {
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [babyMessage, setBabyMessage] = useState<any>(null);
  const [showBabyBubble, setShowBabyBubble] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [babyResponse, setBabyResponse] = useState<string | null>(null);
  const [lastMessageIndex, setLastMessageIndex] = useState(-1);
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isSlotMachineOpen, setIsSlotMachineOpen] = useState(false);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);

  const handleBabyClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
    }

    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * BABY_MESSAGES.length);
    } while (nextIndex === lastMessageIndex && BABY_MESSAGES.length > 1);

    setLastMessageIndex(nextIndex);
    const msg = BABY_MESSAGES[nextIndex];
    
    const normalizedMsg = typeof msg === 'string' ? { text: msg } : msg;
    setBabyMessage(normalizedMsg as any);
    setBabyResponse(null);
    setShowOptions(!!(normalizedMsg as any).options);
    setShowBabyBubble(true);

    if (!(normalizedMsg as any).options) {
      bubbleTimerRef.current = setTimeout(() => {
        setShowBabyBubble(false);
        bubbleTimerRef.current = null;
      }, 7000);
    }
  };

  const handleOptionClick = (response: string) => {
    setBabyResponse(response);
    setShowOptions(false);
    
    if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
    }
    bubbleTimerRef.current = setTimeout(() => {
      setShowBabyBubble(false);
      bubbleTimerRef.current = null;
    }, 7000);
  };

  const handleSlotMachineWin = (food: any) => {
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
    }
    setBabyMessage({ text: food.message });
    setBabyResponse(null);
    setShowOptions(false);
    setShowBabyBubble(true);

    bubbleTimerRef.current = setTimeout(() => {
      setShowBabyBubble(false);
      bubbleTimerRef.current = null;
    }, 7000);
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Check if daily baby message needs to be generated
    const checkDailyMessage = async () => {
      if (!auth.currentUser || isGeneratingDaily) return;
      
      const todayStr = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, 'records'), 
        where('userId', '==', auth.currentUser.uid),
        where('type', '==', 'baby_ai'),
        where('date', '>=', todayStr),
        limit(1)
      );
      
      try {
        const snap = await getDocs(q);
        if (snap.empty) {
          setIsGeneratingDaily(true);
          await generateDailyBabyNote();
        } else {
          // If we have today's message but no image, let's retroactively generate it
          const existingDoc = snap.docs[0];
          const existingData = existingDoc.data();
          if (!existingData.url || existingData.url === "") {
            setIsGeneratingDaily(true);
            try {
              const imagePrompt = `Cute very simple flat vector illustration of a baby, wearing a light blue whale shark costume with white polka dots, doing activities related to this thought: "${existingData.note}". Minimalistic icon style, round baby shape, simple beige circular background, pure white backdrop, centered, no shading, simple pastel colors`;
              
              const responseImageUrl = await withKeyFallback(async (ai) => {
                const response = await ai.models.generateContent({
                  model: 'gemini-3.1-flash-image-preview',
                  contents: {
                    parts: [{ text: imagePrompt }],
                  },
                  config: {
                    // @ts-ignore
                    imageConfig: {
                      aspectRatio: "1:1",
                      imageSize: "512px" /* to keep payload small for firestore */
                    }
                  }
                });
        
                const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (part && part.inlineData) {
                  return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                }
                return null;
              });

              if (responseImageUrl) {
                await updateDoc(doc(db, 'records', existingDoc.id), {
                  url: responseImageUrl
                });
              }
            } catch (err) {
               console.error("Failed to generate image for existing baby note", err);
            } finally {
              setIsGeneratingDaily(false);
            }
          }
        }
      } catch (err) {
        console.error("Failed to check daily message", err);
      } finally {
        setIsGeneratingDaily(false);
      }
    };

    checkDailyMessage();

    const isMainAccount = auth.currentUser.email === 'jason2134@gmail.com' || auth.currentUser.email === 'user@gmail.com';
    const isGuestUser = userProfile?.isGuest || userProfile?.role === 'guest';
    const q = (isMainAccount || isGuestUser)
      ? query(collection(db, 'records'), orderBy('date', 'desc'))
      : query(collection(db, 'records'), where('userId', '==', auth.currentUser.uid), orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRecords = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as RecordEntry));
      setRecords(fetchedRecords);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'records');
    });

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const calculateWeekDay = (targetDate: Date, start: Date) => {
    const diffTime = targetDate.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const week = Math.floor(diffDays / 7);
    const day = diffDays % 7;
    return { week, day };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMediaFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const generateDailyBabyNote = async () => {
    if (!auth.currentUser) return;

    try {
      const prompt = `你是一個在媽媽肚子裡的寶寶，現在是第 ${pregWeek} 週第 ${pregDay} 天。
你的個性：
1. 超級愛澱粉（麵包、吐司、米飯、地瓜、麻糬等）。
2. 把自己想像成一隻「點點鯊」（鯨鯊），肚子圓圓軟軟。
3. 語氣可愛、調皮，有時候會跟爸爸媽媽撒嬌，有時候會吐槽爸爸。

請幫我寫一段「寶寶每日心情紀錄」，約 50-100 字。
內容可以包含：
- 我在肚子裡做了什麼（游泳、翻身、打嗝、睡覺）。
- 我對媽媽今天（或最近）吃的東西的評價（如果是澱粉就大讚，如果是苦的菜或腥的魚就撒嬌要澱粉壓驚）。
- 對爸爸的叮嚀（要幫媽媽按摩、要買好吃的、要跟小窩說話）。

請只回傳一段純文字內容，不要有任何標題或 Markdown 標記。`;

      const responseText = await withKeyFallback(async (ai) => {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: 1.0 }
        });
        return response.text;
      });

      let imageUrl = "";
      if (responseText) {
        try {
          const imagePrompt = `Cute very simple flat vector illustration of a baby, wearing a light blue whale shark costume with white polka dots, doing activities related to this thought: "${responseText}". Minimalistic icon style, round baby shape, simple beige circular background, pure white backdrop, centered, no shading, simple pastel colors`;
          imageUrl = await withKeyFallback(async (ai) => {
            const imgRes = await ai.models.generateContent({
              model: 'gemini-3.1-flash-image-preview',
              contents: { parts: [{ text: imagePrompt }] },
              config: {
                // @ts-ignore
                imageConfig: { aspectRatio: "1:1", imageSize: "512px" }
              }
            });
            const part = imgRes.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part && part.inlineData) {
              return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            }
            return "";
          });
        } catch (imgErr) {
          console.error("Failed to generate image", imgErr);
        }
        
        await addDoc(collection(db, 'records'), {
          userId: auth.currentUser.uid,
          date: new Date().toISOString(),
          type: "baby_ai",
          url: imageUrl,
          note: responseText.trim(),
          weekCount: pregWeek,
          dayCount: pregDay,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Failed to generate daily baby note", e);
    }
  };

  const handleRegenerateBabyImage = async (record: RecordEntry) => {
    setIsGeneratingDaily(true);
    try {
      const imagePrompt = `Cute very simple flat vector illustration of a baby, wearing a light blue whale shark costume with white polka dots, doing activities related to this thought: "${record.note}". Minimalistic icon style, round baby shape, simple beige circular background, pure white backdrop, centered, no shading, simple pastel colors`;
      
      const responseImageUrl = await withKeyFallback(async (ai) => {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: { parts: [{ text: imagePrompt }] },
          config: {
            // @ts-ignore
            imageConfig: { aspectRatio: "1:1", imageSize: "512px" }
          }
        });

        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part && part.inlineData) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
        return null;
      });

      if (responseImageUrl) {
        await updateDoc(doc(db, 'records', record.id), {
          url: responseImageUrl
        });
      }
    } catch (err) {
       console.error("Failed to regenerate image for existing baby note", err);
    } finally {
      setIsGeneratingDaily(false);
    }
  };

  const handleAddRecord = async () => {
    if (!auth.currentUser || (!mediaFile && !note.trim())) return;
    
    if (mediaFile && !oauthClientId) {
      alert("請先前往「廚備設定」設定 Google OAuth Client ID，才能上傳照片或影片到 Google Drive。");
      return;
    }

    setIsSaving(true);

    try {
      let finalUrl = "";
      let driveFileId = "";

      if (mediaFile) {
        // Upload to Google Drive instead of Base64 to Firestore
        try {
          const isVideo = mediaFile.type.startsWith("video");
          const folderId = await getOrCreateFolder("戰友奶爸指揮中心");
          const driveFile = await uploadToDrive(mediaFile, folderId);
          driveFileId = driveFile.id;
          finalUrl = getDriveFileUrl(driveFile.id, isVideo);
          
          // Make file accessible to anyone with the link so it can be seen on other devices
          await makeFilePublic(driveFile.id);
        } catch (driveErr) {
          console.error("Drive upload failed", driveErr);
          throw new Error("雲端硬碟上傳失敗，請確認已授權或 Client ID 正確。");
        }
      }
      
      const { week, day } = calculateWeekDay(new Date(recordDate), conceptionDate);
      
      await addDoc(collection(db, 'records'), {
        userId: auth.currentUser.uid,
        date: new Date(recordDate).toISOString(),
        type: mediaFile?.type.startsWith("video") ? "video" : (mediaFile ? "image" : "text"),
        url: finalUrl,
        driveFileId: driveFileId,
        note: note.trim(),
        weekCount: week,
        dayCount: day,
        createdAt: serverTimestamp()
      });

      setIsAdding(false);
      setMediaFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setNote("");
      setRecordDate(new Date().toISOString().split('T')[0]);
    } catch (e: any) {
      alert(e.message || "上傳失敗，請稍後再試。");
      handleFirestoreError(e, OperationType.CREATE, 'records');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRecord = async (record: RecordEntry, newDate: string, newNote: string) => {
    if (!auth.currentUser) return;
    setIsSaving(true);
    try {
      const { week, day } = calculateWeekDay(new Date(newDate), conceptionDate);
      await updateDoc(doc(db, 'records', record.id), {
        date: new Date(newDate).toISOString(),
        note: newNote.trim(),
        weekCount: week,
        dayCount: day
      });
      setEditingRecordId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `records/${record.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const removeRecord = async (record: RecordEntry) => {
    if (!window.confirm("確定要刪除此筆紀錄嗎？")) return;
    try {
      if (record.driveFileId) {
        try {
          await deleteFromDrive(record.driveFileId);
        } catch (e) {
          console.error("Failed to delete from Drive, but proceeding with Firestore deletion", e);
        }
      }
      await deleteDoc(doc(db, 'records', record.id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `records/${record.id}`);
    }
  };

  const daysPassed = pregWeek * 7 + pregDay;
  const daysLeft = Math.max(0, 280 - daysPassed);
  const currentMonth = Math.floor(pregWeek / 4) + 1;
  const today = new Date();
  const formattedDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")} (${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][today.getDay()]})`;
  
  // Calculate due date (LMP + 280 days)
  const dueDate = new Date(conceptionDate.getTime() + 280 * 24 * 60 * 60 * 1000);
  const formattedDueDate = `${dueDate.getFullYear()}/${String(dueDate.getMonth() + 1).padStart(2, "0")}/${String(dueDate.getDate()).padStart(2, "0")}`;

  const getFetusImagePrompt = (week: number) => {
    let size = "";
    if (week <= 4) size = "fertilized egg or very early cell stage";
    else if (week <= 8) size = "early embryo state, tiny and curved";
    else if (week <= 12) size = "small fetus with developing features";
    else if (week <= 16) size = "palm-sized fetus with distinct shape";
    else if (week <= 20) size = "well-formed small baby fetus";
    else if (week <= 24) size = "growing baby with visible limbs";
    else if (week <= 28) size = "plump sleeping premature baby";
    else if (week <= 32) size = "chubby sleeping baby";
    else if (week <= 36) size = "fully developed sleeping baby";
    else size = "newborn chubby baby ready to be born";

    const prompt = `cute very simple flat vector illustration of ${size}, wearing a light blue whale shark costume with white polka dots, minimalistic icon style, round baby shape, simple beige circular background, pure white backdrop, centered, no shading, simple pastel colors`;
    const seed = week === 7 ? `888123` : `999${week}`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=${seed}`;
  };

  const handleDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditingDate(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FDFBF7]">
      <div className="max-w-md mx-auto min-h-full pb-20 shadow-sm border-x border-[#E8DCCB] bg-white">
        {/* Baby Simulation Dashboard */}
        <div className="relative pt-6 px-6">
          <div className="flex justify-center mb-6 min-h-[40px]">
            {isEditingDate ? (
              <form
                onSubmit={handleDateSubmit}
                className="flex flex-col items-center gap-2 bg-[#FFF9F0] p-3 rounded-xl border border-amber-200 shadow-sm z-20"
              >
                <label className="text-xs font-bold text-amber-800">
                  最後一次月經首日 / 懷孕第一天
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={conceptionDate.toISOString().split("T")[0]}
                    onChange={(e) =>
                      onUpdateConceptionDate(new Date(e.target.value))
                    }
                    className="text-sm px-2 py-1 border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                  <button
                    type="submit"
                    className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-bold"
                  >
                    完成
                  </button>
                </div>
                <div className="text-[10px] text-amber-700 mt-1">
                  （推測預產期：{formattedDueDate}）
                </div>
              </form>
            ) : (
              <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={() => setIsEditingDate(true)} title="點擊修改懷孕日期">
                <div className="text-center font-bold text-gray-700 group-hover:text-amber-700 tracking-wider flex items-center gap-2 transition-colors px-3 py-1 rounded-full group-hover:bg-amber-50">
                  {formattedDate}
                  <span className="text-[10px] bg-[#E8DCCB] px-1.5 py-0.5 rounded text-amber-800">
                    修改週期 ▼
                  </span>
                </div>
                <div className="text-xs text-amber-800/60 font-medium">預產期：{formattedDueDate}</div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center gap-1 mb-2 mt-4">
            <h3 className="text-[#8B7355] font-bold tracking-widest text-xs uppercase">
              today's
            </h3>
            <span className="text-[#8B7355] font-bold text-xl">點點鯊麻糬</span>
          </div>

          <div className="w-full aspect-square max-w-[320px] mx-auto relative flex items-center justify-center mb-4">
            {/* Speech Bubble */}
            <AnimatePresence>
              {showBabyBubble && babyMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                  className="absolute bottom-[calc(100%-10px)] left-1/2 -translate-x-1/2 z-30 w-full max-w-[280px]"
                >
                  <div className="relative bg-white border-2 border-amber-200 rounded-3xl p-4 shadow-xl shadow-amber-900/10 text-center">
                    <p className="text-[#5C4D43] font-bold text-sm leading-relaxed mb-1">
                      {babyResponse ? babyResponse : babyMessage.text}
                    </p>
                    
                    {showOptions && babyMessage.options && (
                      <div className="flex flex-col gap-2 mt-3">
                        {babyMessage.options.map((opt: any, i: number) => (
                          <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); handleOptionClick(opt.response); }}
                            className="bg-amber-100/50 hover:bg-amber-200 text-amber-900 text-xs py-2 px-3 rounded-xl transition font-bold border border-amber-200/50"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {/* Triangle arrow */}
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b-2 border-r-2 border-amber-200 rotate-45"></div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div 
              whileTap={{ scale: 0.95, rotate: [0, -2, 2, 0] }}
              onClick={handleBabyClick}
              className="absolute inset-0 rounded-full shadow-sm border border-amber-50 overflow-hidden bg-white cursor-pointer z-10"
            >
              {/* Cute Baby Fetus Illustration */}
              <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
                <img
                  src={getFetusImagePrompt(pregWeek)}
                  alt="Baby"
                  className="w-full h-full object-contain rounded-full shadow-inner"
                />
              </div>
            </motion.div>

            {/* Floating Icons */}
            <div className="absolute right-0 bottom-12 flex flex-col gap-4 z-20">
              <div 
                onClick={() => setIsSlotMachineOpen(true)}
                className="w-12 h-12 bg-[#FFF4E6] rounded-full shadow-sm flex items-center justify-center text-red-400 text-xl border border-amber-50 relative group cursor-pointer hover:scale-105 transition-transform"
              >
                <span className="absolute -top-6 text-[10px] text-gray-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  \ 推薦 /
                </span>
                🎁
              </div>
              <div className="w-12 h-12 bg-[#FDE68A] text-[#B45309] rounded-full shadow-sm flex items-center justify-center text-xl cursor-pointer hover:scale-105 transition-transform">
                ⭐
              </div>
            </div>
          </div>

          <SlotMachineModal 
            isOpen={isSlotMachineOpen} 
            onClose={() => setIsSlotMachineOpen(false)} 
            onWin={handleSlotMachineWin} 
          />

          <div className="mt-8 flex justify-between items-end w-full border-b-2 border-[#D4C4B7] pb-2 px-2">
            <div className="text-[#5C4D43] font-bold text-xs">
              距離出生
              <br />
              還有
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-6xl font-black text-[#5C4D43] tracking-tighter leading-none">
                {daysLeft}
              </span>
              <span className="text-[#5C4D43] font-bold text-sm">天</span>
            </div>
            <div className="text-right text-[#5C4D43] font-bold text-xs mt-2 relative top-1">
              <div className="mb-0.5">第{daysPassed}天</div>
              <div>
                {currentMonth}個月 ({pregWeek}週{pregDay}天)
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-6 mb-8">
            <button className="px-12 py-3 bg-[#FFF9F0] text-[#8B7355] font-bold rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] border border-[#E8DCCB] hover:bg-amber-50 hover:shadow-md transition">
              今日建議
            </button>
          </div>
        </div>

        <div className="px-4 pb-8 space-y-6">
          <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-2xl flex items-center justify-center">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">
                  寶寶成長紀錄
                </h2>
                <p className="text-sm text-slate-500">
                  上傳超音波照片、影片或生活點滴📝
                </p>
              </div>
            </div>
            {!userProfile?.isGuest && (
              <button
                onClick={() => setIsAdding(!isAdding)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>新增紀錄</span>
              </button>
            )}
          </div>

          {isAdding && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100 animate-in fade-in slide-in-from-top-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800">
                  今日紀錄 (第 {pregWeek} 週 {pregDay} 天)
                </h3>
                <button
                  onClick={() => setIsAdding(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 ml-1">選擇日期</label>
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-indigo-50/30 font-medium"
                  />
                </div>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="寫下今天的感想或要對寶寶說的話..."
                  className="w-full h-24 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                />

                <div className="flex items-center gap-4">
                  <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition">
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">上傳照片</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>

                  <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition">
                    <Video className="w-4 h-4" />
                    <span className="text-sm font-medium">上傳影片</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 ml-1 italic">
                  * 註：照片與影片將儲存於您的 Google Drive，不佔用資料庫空間。
                </p>

                {mediaFile && previewUrl && (
                  <div className="relative inline-block mt-4">
                    {mediaFile.type.startsWith("video") ? (
                      <video
                        src={previewUrl}
                        className="h-40 rounded-lg border border-slate-200 object-cover"
                        controls
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt="preview"
                        className="h-40 rounded-lg border border-slate-200 object-cover"
                      />
                    )}
                    <button
                      onClick={() => {
                        setMediaFile(null);
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }}
                      className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleAddRecord}
                    disabled={!mediaFile && !note.trim()}
                    className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition"
                  >
                    儲存
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {records.length === 0 && !isAdding ? (
              <div className="text-center py-12 text-slate-400">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>目前還沒有任何紀錄，趕快點擊上方「新增紀錄」吧！</p>
              </div>
            ) : (
              records.map((record) => (
        <div key={record.id} className="space-y-2">
          <div
            className={cn(
              "p-5 rounded-2xl shadow-sm border flex gap-4 transition-all duration-300",
              record.type === 'baby_ai' 
                ? "bg-gradient-to-br from-amber-50 to-white border-amber-200 ring-1 ring-amber-100" 
                : "bg-white border-slate-100"
            )}
          >
            <div className="flex-1">
              {editingRecordId === record.id ? (
                <div className="space-y-3 mb-2 animate-in fade-in zoom-in-95 duration-200">
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full text-sm px-2 py-1 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="w-full h-24 p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingRecordId(null)}
                      className="px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-md transition"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleUpdateRecord(record, editDate, editNote)}
                      disabled={isSaving}
                      className="px-4 py-1 text-xs font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition flex items-center gap-1"
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      儲存修改
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={cn(
                    "flex items-center gap-2 text-sm font-semibold mb-2 px-2 py-1 rounded-md w-full",
                    record.type === 'baby_ai' ? "text-amber-700 bg-amber-100/50" : "text-indigo-600 bg-indigo-50 inline-flex w-max"
                  )}>
                    {record.type === 'baby_ai' ? <Sparkles className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    {record.type === 'baby_ai' ? "寶寶每日日記" : `第 ${record.weekCount} 週 ${record.dayCount} 天`}
                    <span className={cn(
                      "font-normal ml-2 flex-1",
                      record.type === 'baby_ai' ? "text-amber-600/70" : "text-slate-400"
                    )}>
                      {new Date(record.date).toLocaleDateString()}
                    </span>
                    {record.type === 'baby_ai' && (
                      <button
                        onClick={() => handleRegenerateBabyImage(record)}
                        disabled={isGeneratingDaily}
                        className="ml-auto text-xs flex items-center gap-1 bg-white/50 hover:bg-white text-amber-600 border border-amber-200 px-2 py-0.5 rounded shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                        title="重新生成這張照片"
                      >
                        {isGeneratingDaily ? <Loader2 className="w-3 h-3 animate-spin"/> : <Cloud className="w-3 h-3" />}
                        {isGeneratingDaily ? '生成中...' : '重新生成照片'}
                      </button>
                    )}
                  </div>

                  {record.note && (
                    <p className={cn(
                      "whitespace-pre-wrap leading-relaxed mt-2 mb-4",
                      record.type === 'baby_ai' ? "text-amber-900 font-medium italic" : "text-slate-700"
                    )}>
                      {record.type === 'baby_ai' && "「"}{record.note}{record.type === 'baby_ai' && "」"}
                    </p>
                  )}
                </>
              )}

              {record.url && (
                <div className="mt-2 rounded-xl overflow-hidden border border-slate-100 inline-block max-w-full">
                  {record.url.startsWith("blob:") ? (
                    <div className="bg-amber-50 p-4 border border-amber-200 rounded-xl text-center">
                      <p className="text-xs text-amber-800 font-bold mb-1">
                        ⚠️ 舊式資料無法在其他裝置顯示
                      </p>
                      <p className="text-[10px] text-amber-600">
                        此紀錄是在舊版本上傳的，請刪除並重新上傳。
                      </p>
                    </div>
                  ) : record.type === "video" ? (
                    record.driveFileId ? (
                      <div className="w-full sm:w-[400px] aspect-video">
                        <iframe
                          src={record.url}
                          className="w-full h-full border-0 rounded-lg"
                          allow="autoplay"
                        />
                      </div>
                    ) : (
                      <video
                        src={record.url}
                        controls
                        className="max-h-80 w-auto rounded-lg"
                      />
                    )
                  ) : (
                    <img
                      src={record.url}
                      alt="Record"
                      className="max-h-80 w-auto rounded-lg"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              )}
            </div>
            {!userProfile?.isGuest && (
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => {
                    setEditingRecordId(record.id);
                    setEditNote(record.note || "");
                    setEditDate(new Date(record.date).toISOString().split('T')[0]);
                  }}
                  className="p-2 text-slate-300 hover:text-indigo-500 transition h-fit rounded-lg hover:bg-indigo-50"
                  title="修改"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeRecord(record)}
                  className="p-2 text-slate-300 hover:text-red-500 transition h-fit rounded-lg hover:bg-red-50"
                  title="刪除"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          
          {/* Comments Section */}
          <CommentSection recordId={record.id} userProfile={userProfile} />
        </div>
      ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentSection({ recordId, userProfile }: { recordId: string; userProfile: any }) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'records', recordId, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `records/${recordId}/comments`);
    });

    return () => unsubscribe();
  }, [recordId]);

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
      nickname: userProfile?.nickname || auth.currentUser?.email?.split('@')[0] || '訪客',
      avatarUrl: userProfile?.avatarUrl || ''
    };
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !auth.currentUser) return;
    const profile = getActiveProfile();
    try {
      await addDoc(collection(db, 'records', recordId, 'comments'), {
        userId: auth.currentUser.uid,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        role: currentRole,
        text: newComment.trim(),
        createdAt: serverTimestamp()
      });
      setNewComment("");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `records/${recordId}/comments`);
    }
  };

  const isAdmin = auth.currentUser?.email === 'jason2134@gmail.com' || auth.currentUser?.email === 'user@gmail.com';

  const deleteComment = async (commentId: string) => {
    if (!window.confirm("確定要刪除這則留言嗎？")) return;
    try {
      await deleteDoc(doc(db, 'records', recordId, 'comments', commentId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `records/${recordId}/comments/${commentId}`);
    }
  };

  return (
    <div className="mt-2 bg-slate-50/50 rounded-2xl overflow-hidden border border-slate-100">
      <button 
        onClick={() => setShowComments(!showComments)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2 text-slate-600 font-bold text-xs uppercase tracking-wider">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          {comments.length} 則留言
        </div>
        <span className="text-slate-400 text-xs font-bold">
          {showComments ? "收合 △" : "查看 ▽"}
        </span>
      </button>

      {showComments && (
        <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-2">
          {comments.map((comment) => {
            const isMe = comment.userId === auth.currentUser?.uid;
            return (
              <div key={comment.id} className="flex gap-3 items-start group">
                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 overflow-hidden">
                  {comment.avatarUrl ? (
                    <img src={comment.avatarUrl} alt={comment.nickname} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-indigo-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-800">{comment.nickname}</span>
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase overflow-hidden text-ellipsis whitespace-nowrap max-w-[60px]">
                      {comment.role === 'mama' ? '媽媽' : comment.role === 'papa' ? '爸爸' : '訪客'}
                    </span>
                    {(isMe || isAdmin) && (
                      <button 
                        onClick={() => deleteComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition ml-auto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed break-words">{comment.text}</p>
                </div>
              </div>
            );
          })}

          <div className="space-y-2 pt-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
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
                    "flex-1 py-1 rounded-lg text-[10px] font-bold transition-all capitalize",
                    currentRole === r 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "text-slate-500 hover:bg-white/50"
                  )}
                >
                  {r === 'mama' ? '媽媽 🤱' : r === 'papa' ? '爸爸 👨‍🍼' : '訪客 👤'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                placeholder="寫下留言..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
