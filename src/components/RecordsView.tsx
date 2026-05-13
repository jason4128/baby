import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "../lib/utils";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
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
  updateDoc
} from 'firebase/firestore';
import { fileToBase64 } from "../services/gemini";
import { 
  uploadToDrive, 
  deleteFromDrive, 
  getDriveFileUrl, 
  makeFilePublic,
  getOrCreateFolder
} from "../services/googleDrive";

export type RecordEntry = {
  id: string;
  date: string;
  type: "image" | "video" | "text";
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
}

export default function RecordsView({
  pregWeek,
  pregDay,
  conceptionDate,
  onUpdateConceptionDate,
  oauthClientId,
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const isAdmin = auth.currentUser.email === 'jason2134@gmail.com' || auth.currentUser.email === 'user@gmail.com';
    const q = isAdmin
      ? query(collection(db, 'records'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'records'), where('userId', '==', auth.currentUser.uid), orderBy('createdAt', 'desc'));
    
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
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=999${week}`;
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

          <div className="flex flex-col items-center justify-center gap-1 mb-6 mt-4">
            <h3 className="text-[#8B7355] font-bold tracking-widest text-xs uppercase">
              today's
            </h3>
            <span className="text-[#8B7355] font-bold text-xl">點點鯊麻糬</span>
          </div>

          <div className="w-full aspect-square max-w-[320px] mx-auto relative flex items-center justify-center mb-4">
            <div className="absolute inset-0 rounded-full shadow-sm border border-amber-50 overflow-hidden bg-white">
              {/* Cute Baby Fetus Illustration */}
              <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
                <img
                  src={getFetusImagePrompt(pregWeek)}
                  alt="Baby"
                  className="w-full h-full object-contain rounded-full shadow-inner"
                />
              </div>
            </div>

            {/* Floating Icons */}
            <div className="absolute right-0 bottom-12 flex flex-col gap-4">
              <div className="w-12 h-12 bg-[#FFF4E6] rounded-full shadow-sm flex items-center justify-center text-red-400 text-xl border border-amber-50 relative group cursor-pointer hover:scale-105 transition-transform">
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
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" />
              <span>新增紀錄</span>
            </button>
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
                <div
                  key={record.id}
                  className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex gap-4"
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
                        <div className="flex items-center gap-2 text-sm text-indigo-600 font-semibold mb-2 bg-indigo-50 inline-flex px-2 py-1 rounded-md">
                          <Calendar className="w-4 h-4" />第 {record.weekCount} 週{" "}
                          {record.dayCount} 天
                          <span className="text-slate-400 font-normal ml-2">
                            {new Date(record.date).toLocaleDateString()}
                          </span>
                        </div>

                        {record.note && (
                          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed mt-2 mb-4">
                            {record.note}
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
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
