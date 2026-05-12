import React, { useState, useEffect } from 'react';
import { Home, Building2, UploadCloud, Loader2, Plus, Sparkles, Building, MapPin, DollarSign, Stethoscope, ShieldCheck, Utensils, HeartHandshake, Car, Trash2, HeartPulse } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { fileToBase64, withKeyFallback } from '../services/gemini';
import Markdown from 'react-markdown';

interface Center {
  id: string;
  name: string;
  location: string;
  price: string;
  medicalCare: string;
  environment: string;
  meals: string;
  extraServices: string;
  commuteTime: string;
  summary: string;
  createdAt: any;
}

export default function PostpartumView() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [homeLocation, setHomeLocation] = useState('高雄市小港區');
  const [work1Location, setWork1Location] = useState('屏東榮總');
  const [work2Location, setWork2Location] = useState('龍泉分院');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorModal, setErrorModal] = useState<{title: string, message: string} | null>(null);

  useEffect(() => {
    // Load local settings
    const savedHome = localStorage.getItem('postpartum_home');
    const savedWork1 = localStorage.getItem('postpartum_work1');
    const savedWork2 = localStorage.getItem('postpartum_work2');
    if (savedHome) setHomeLocation(savedHome);
    if (savedWork1) setWork1Location(savedWork1);
    if (savedWork2) setWork2Location(savedWork2);

    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'postpartum_centers'), 
      where('userId', '==', auth.currentUser.uid)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Center))
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setCenters(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'postpartum_centers'));
    
    return () => unsub();
  }, []);

  const handleSaveLocations = () => {
    localStorage.setItem('postpartum_home', homeLocation);
    localStorage.setItem('postpartum_work1', work1Location);
    localStorage.setItem('postpartum_work2', work2Location);
  };

  const handleImageUpload = async (file: File) => {
    if (!auth.currentUser) return;
    setIsAnalyzing(true);
    try {
      const base64Image = await fileToBase64(file);
      const { GoogleGenAI } = await import('@google/genai');
      
      const prompt = `這是一張月子中心（產後護理之家）的相關資訊截圖。
我的住家地點：${homeLocation}
工作地點1：${work1Location}
工作地點2：${work2Location}

請幫我整理這間月子中心的資料，使用 JSON 格式回傳，欄位需包含下列 key：
{
  "name": "月子中心名稱或不明",
  "location": "地址或大致區域",
  "price": "價格或方案",
  "medicalCare": "醫療與照護專業相關資訊（醫護比、巡診等）",
  "environment": "建築環境與安全相關資訊",
  "meals": "月子餐點與營養相關資訊",
  "extraServices": "照護細節與附加服務",
  "commuteTime": "預估從我的住家與兩個工作地點到此月子中心的交通時間評估（依據你網際網路的知識或常理推斷）",
  "summary": "整體綜合評估與建議（一小段話）"
}
請只回傳 JSON 格式，不要加 markdown 標記。若圖中無相關資訊，請依你的常識填寫「未提供」或合理推測。`;

      const responseText = await withKeyFallback(async (ai) => {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            { role: "user", parts: [
              { inlineData: { mimeType: base64Image.mimeType, data: base64Image.data } },
              { text: prompt }
            ]}
          ],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
          }
        });
        return response.text;
      });

      if (!responseText) throw new Error("無回應");
      
      const data = JSON.parse(responseText);

      await addDoc(collection(db, 'postpartum_centers'), {
        userId: auth.currentUser.uid,
        name: data.name || '未知月子中心',
        location: data.location || '未提供',
        price: data.price || '未提供',
        medicalCare: data.medicalCare || '未提供',
        environment: data.environment || '未提供',
        meals: data.meals || '未提供',
        extraServices: data.extraServices || '未提供',
        commuteTime: data.commuteTime || '未提供',
        summary: data.summary || '',
        createdAt: serverTimestamp()
      });
    } catch (e: any) {
      console.error(e);
      setErrorModal({
        title: '分析失敗',
        message: e.message || '請確認圖片內容是否清晰，或稍候再試。'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) handleImageUpload(file);
        break; // Process one image at a time
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'postpartum_centers', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `postpartum_centers/${id}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#fdfbf7]" onPaste={handlePaste}>
      {/* Header */}
      <div className="bg-white border-b border-rose-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-rose-900 leading-tight">產後護理</h1>
              <p className="text-xs text-rose-700/70 mt-0.5">月子中心評估與交通時間分析</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm shrink-0",
              isAnalyzing 
                ? "bg-rose-50 text-rose-400 cursor-not-allowed border border-rose-100" 
                : "bg-rose-600 text-white hover:bg-rose-700 cursor-pointer active:scale-95"
            )}>
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {isAnalyzing ? 'AI 正在分析截圖...' : '上傳月子中心截圖'}
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleImageUpload(e.target.files[0]);
                    e.target.value = '';
                  }
                }}
                disabled={isAnalyzing}
              />
            </label>
            <p className="text-[10px] text-rose-900/40 hidden sm:block">或直接貼上 (Ctrl+V)</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Settings Area */}
        <div className="bg-white rounded-3xl p-5 border border-rose-100 shadow-sm">
          <h2 className="text-sm font-bold text-rose-900 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-rose-500" />
            交通時間評估基準 
            <span className="text-xs font-normal text-rose-900/50">AI 會依據這些地點進行距離與時間估算</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-800/70 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" /> 住家地點
              </label>
              <input
                type="text"
                value={homeLocation}
                onChange={e => setHomeLocation(e.target.value)}
                onBlur={handleSaveLocations}
                className="w-full bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 text-rose-900"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-800/70 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> 工作地點 1
              </label>
              <input
                type="text"
                value={work1Location}
                onChange={e => setWork1Location(e.target.value)}
                onBlur={handleSaveLocations}
                className="w-full bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 text-rose-900"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-800/70 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> 工作地點 2
              </label>
              <input
                type="text"
                value={work2Location}
                onChange={e => setWork2Location(e.target.value)}
                onBlur={handleSaveLocations}
                className="w-full bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 text-rose-900"
              />
            </div>
          </div>
        </div>

        {/* Guides/Tips */}
        {centers.length === 0 && (
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 p-6 rounded-3xl border border-rose-100 text-rose-900">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-500" />
              如何挑選月子中心？
            </h3>
            <p className="text-sm mb-4 leading-relaxed">
              建議在懷孕 12~16 週左右就開始參觀並下訂，挑選時可以從以下五大維度來評估：
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-white/60 p-3 rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1"><Stethoscope className="w-4 h-4 text-rose-600"/> 1. 醫療與照護專業</div>
                <div className="text-rose-800/80 text-xs">醫護比需為 1:5，照護者需具備護理師執照。是否有小兒科、婦產科固定巡診，醫療後援是否充足。</div>
              </div>
              <div className="bg-white/60 p-3 rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-rose-600"/> 2. 建築環境與安全</div>
                <div className="text-rose-800/80 text-xs">是否為合法立案「產後護理之家」，消防逃生路線、嚴格訪客與感控機制、獨立空調。</div>
              </div>
              <div className="bg-white/60 p-3 rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1"><Utensils className="w-4 h-4 text-rose-600"/> 3. 月子餐點與營養</div>
                <div className="text-rose-800/80 text-xs">是否為自有廚房現做，菜單能否客製調整（生化湯、發乳、避雷食材）。</div>
              </div>
              <div className="bg-white/60 p-3 rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1"><HeartHandshake className="w-4 h-4 text-rose-600"/> 4. 照護細節</div>
                <div className="text-rose-800/80 text-xs">泌乳師指導、24小時嬰兒視訊、衛教實作課程、彈性母嬰同室不情緒勒索。</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-rose-200/50 text-xs text-rose-800 font-medium">
              💡 參觀小撇步：聞味道（無消毒水或油煙）、看氣氛（人員從容）、問合約（違約金與無房處理）。
            </div>
          </div>
        )}

        {/* Centers List */}
        <div className="space-y-6">
          {centers.map(center => (
            <div key={center.id} className="bg-white rounded-3xl border border-rose-100 overflow-hidden shadow-sm group">
              <div className="bg-rose-50/50 px-6 py-4 border-b border-rose-100 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-rose-900 flex items-center gap-2">
                    <Building className="w-5 h-5 text-rose-500" />
                    {center.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-rose-800/70">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/> {center.location}</span>
                    <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5"/> {center.price}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(center.id)}
                  className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6">
                <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100/50 mb-5 text-sm flex gap-3">
                  <Car className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-900 mb-1">AI 交通評估</div>
                    <div className="text-amber-800 leading-relaxed"><Markdown>{center.commuteTime}</Markdown></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <div className="font-bold text-sm text-rose-900 mb-1 flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-rose-600" /> 醫療與照護
                    </div>
                    <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl min-h-[4rem]">{center.medicalCare}</div>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-rose-900 mb-1 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-rose-600" /> 環境與安全
                    </div>
                    <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl min-h-[4rem]">{center.environment}</div>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-rose-900 mb-1 flex items-center gap-1.5">
                      <Utensils className="w-4 h-4 text-rose-600" /> 餐點與營養
                    </div>
                    <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl min-h-[4rem]">{center.meals}</div>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-rose-900 mb-1 flex items-center gap-1.5">
                      <HeartHandshake className="w-4 h-4 text-rose-600" /> 照護細節與附加服務
                    </div>
                    <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl min-h-[4rem]">{center.extraServices}</div>
                  </div>
                </div>

                {center.summary && (
                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="text-sm font-bold text-rose-900 mb-1 flex items-center gap-2">
                       <Sparkles className="w-4 h-4 text-rose-500" /> 綜合評估
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{center.summary}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-rose-900 mb-2">{errorModal.title}</h3>
            <p className="text-rose-800/80 mb-6">{errorModal.message}</p>
            <button 
              onClick={() => setErrorModal(null)}
              className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 active:scale-95 transition-all text-sm mb-2"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
