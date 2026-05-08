import React, { useState, useEffect, useRef } from 'react';
import { differenceInDays } from 'date-fns';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Camera, Send, X, ChefHat, Settings, Info, Menu, Utensils, MessageSquare, Baby, ShoppingBag, LogIn } from 'lucide-react';
import { chatWithConsultant, fileToBase64 } from './services/gemini';
import { BASE_SYSTEM_PROMPT, INITIAL_TOOLS, INITIAL_SEASONINGS, INITIAL_INGREDIENTS, CONCEPTION_DATE } from './constants';
import { cn } from './lib/utils';
import { AppTab } from './types';
import RecipesView from './components/RecipesView';
import RecordsView from './components/RecordsView';
import ShoppingView from './components/ShoppingView';

import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('chat');

  const [tools, setTools] = useState<string[]>(INITIAL_TOOLS);
  const [seasonings, setSeasonings] = useState<string[]>(INITIAL_SEASONINGS);
  const [ingredients, setIngredients] = useState<string[]>(INITIAL_INGREDIENTS);
  
  const [newTool, setNewTool] = useState('');
  const [newSeasoning, setNewSeasoning] = useState('');
  const [newIngredient, setNewIngredient] = useState('');

  const [messages, setMessages] = useState<{ role: 'user' | 'model'; parts: { text: string; inlineData?: any }[] }[]>([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [pregWeek, setPregWeek] = useState(0);
  const [pregDay, setPregDay] = useState(0);

  useEffect(() => {
    // Calculate current pregnancy week
    const now = new Date();
    const diffDays = differenceInDays(now, CONCEPTION_DATE);
    setPregWeek(Math.floor(diffDays / 7));
    setPregDay(diffDays % 7);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setTools(data.tools || []);
            setSeasonings(data.seasonings || []);
            setIngredients(data.ingredients || []);
          } else {
            try {
              await setDoc(docRef, {
                userId: u.uid,
                tools: INITIAL_TOOLS,
                seasonings: INITIAL_SEASONINGS,
                ingredients: INITIAL_INGREDIENTS,
                conceptionDate: CONCEPTION_DATE.toISOString(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            } catch (createErr) {
              handleFirestoreError(createErr, OperationType.CREATE, `users/${u.uid}`);
            }
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `users/${u.uid}`);
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        signInAnonymously(auth).catch(e => {
          console.error("Anonymous authentication failed", e);
          setIsAuthLoading(false);
        });
      }
    });
    return () => unsub();
  }, []);

  const saveToFirebase = async (updates: any) => {
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          ...updates,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, activeTab]);

  const addTool = () => {
    if (newTool.trim() && !tools.includes(newTool.trim())) {
      const ts = [...tools, newTool.trim()];
      setTools(ts);
      saveToFirebase({ tools: ts });
      setNewTool('');
    }
  };

  const removeTool = (t: string) => {
    const ts = tools.filter(tool => tool !== t);
    setTools(ts);
    saveToFirebase({ tools: ts });
  };

  const addSeasoning = () => {
    if (newSeasoning.trim() && !seasonings.includes(newSeasoning.trim())) {
      const ss = [...seasonings, newSeasoning.trim()];
      setSeasonings(ss);
      saveToFirebase({ seasonings: ss });
      setNewSeasoning('');
    }
  };

  const removeSeasoning = (s: string) => {
    const ss = seasonings.filter(seasoning => seasoning !== s);
    setSeasonings(ss);
    saveToFirebase({ seasonings: ss });
  };

  const addIngredient = () => {
    if (newIngredient.trim() && !ingredients.includes(newIngredient.trim())) {
      const is = [...ingredients, newIngredient.trim()];
      setIngredients(is);
      saveToFirebase({ ingredients: is });
      setNewIngredient('');
    }
  };

  const removeIngredient = (i: string) => {
    const is = ingredients.filter(ing => ing !== i);
    setIngredients(is);
    saveToFirebase({ ingredients: is });
  };

  const handleSend = async () => {
    if (!input.trim() && images.length === 0) return;
    
    setIsLoading(true);
    let base64Images: { mimeType: string; data: string }[] = [];
    
    // add user message immediately
    const userParts: any[] = [];
    if (input.trim()) userParts.push({ text: input.trim() });
    
    try {
      if (images.length > 0) {
        for (const img of images) {
          const b64 = await fileToBase64(img);
          base64Images.push({ mimeType: img.type, data: b64 });
          userParts.unshift({ inlineData: { mimeType: img.type, data: b64 } });
        }
      }
      
      const newMsg = { role: 'user' as const, parts: userParts };
      const updatedHistory = [...messages, newMsg];
      setMessages(updatedHistory);
      setInput('');
      setImages([]);

      // Generate dynamic prompt
      const systemPrompt = BASE_SYSTEM_PROMPT
        .replace('{tools}', tools.join('、'))
        .replace('{seasonings}', seasonings.join('、'))
        .replace('{ingredients}', ingredients.join('、'))
        .replace('{week}', pregWeek.toString())
        .replace('{day}', pregDay.toString());

      const responseObj: any = await chatWithConsultant(systemPrompt, messages, input, base64Images);
      
      let replyText = "";
      if (responseObj.consultantReply) {
        replyText = responseObj.consultantReply;
      }
      
      if (responseObj.recipes && Array.isArray(responseObj.recipes) && user) {
        // save recipes to db
        for (const r of responseObj.recipes) {
          try {
            await addDoc(collection(db, 'recipes'), {
              userId: user.uid,
              title: r.title || '無標題',
              category: r.category || 'AI 生成',
              description: r.description || '',
              imageUrl: `https://image.pollinations.ai/prompt/A+delicious+dish,+realistic+food+photography+of+meal+${encodeURIComponent(r.title || 'delicious food')}?width=800&height=600&nologo=true`,
              ingredients: r.ingredients || [],
              steps: r.steps || [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            replyText += `\n\n📌 已將【${r.title}】自動存入專屬食譜區！`;
          } catch(e) {
            handleFirestoreError(e, OperationType.CREATE, 'recipes');
          }
        }
      }

      if (responseObj.shoppingItems && Array.isArray(responseObj.shoppingItems) && user) {
        for (const item of responseObj.shoppingItems) {
          try {
            await addDoc(collection(db, 'shoppingItems'), {
              userId: user.uid,
              name: item.name || '未命名',
              category: item.category || '採購建議',
              isPurchased: false,
              suggestedWeek: item.suggestedWeek || pregWeek,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            replyText += `\n\n🛒 已將【${item.name}】加入採購清單！`;
          } catch(e) {
            handleFirestoreError(e, OperationType.CREATE, 'shoppingItems');
          }
        }
      }

      setMessages([...updatedHistory, { role: 'model', parts: [{ text: replyText || '沒有回覆文字' }] }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: '⚠️ 顧問系統遇到錯誤，請確認網路或 API KEY 設定後再試一次。' }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      setImages(prev => [...prev, ...Array.from(e.clipboardData.files).filter(file => file.type.startsWith('image/'))]);
    }
  };

  const navItems = [
    { id: 'chat', label: 'AI顧問', icon: MessageSquare },
    { id: 'recipes', label: '專屬食譜', icon: Utensils },
    { id: 'records', label: '寶寶紀錄', icon: Baby },
    { id: 'shopping', label: '採購規劃', icon: ShoppingBag },
    { id: 'settings', label: '廚備設定', icon: Settings },
  ] as const;

  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#fdfbf7] p-6 text-center">
        <div className="flex gap-1.5 mb-4">
           <span className="w-3 h-3 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
           <span className="w-3 h-3 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
           <span className="w-3 h-3 bg-amber-400 rounded-full animate-bounce"></span>
        </div>
        <p className="text-amber-800 font-bold tracking-widest">系統初始化中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#fdfbf7] p-6 text-center">
        <h1 className="text-3xl font-black text-[#5C4D43] mb-4 flex items-center gap-2">
          <Baby className="w-8 h-8 text-amber-600" />
          需要啟用匿名登入
        </h1>
        <p className="text-[#8B7355] mb-4 max-w-sm">
          為了在不使用 Google 帳號的情況下儲存您的個人資料，請前往 Firebase 控制台啟用「匿名登入 (Anonymous Auth)」：
        </p>
        <ol className="text-left text-[#5C4D43] font-medium space-y-2 mb-8 bg-white p-4 rounded-xl border border-amber-100">
          <li>1. 前往 <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-amber-600 underline">Firebase 控制台</a></li>
          <li>2. 選擇專案 <strong>japantravel-8e369</strong></li>
          <li>3. 點擊左側 <strong>Authentication</strong> (驗證)</li>
          <li>4. 選擇 <strong>Sign-in method</strong> (登入方式) 頁籤</li>
          <li>5. 新增提供商，選擇 <strong>Anonymous</strong> (匿名) 並啟用</li>
          <li>6. 回到這裡重新整理頁面</li>
        </ol>
      </div>
    );
  }

  const renderContent = () => {
    if (activeTab === 'recipes') return <RecipesView />;
    if (activeTab === 'records') return <RecordsView pregWeek={pregWeek} pregDay={pregDay} />;
    if (activeTab === 'shopping') return <ShoppingView pregWeek={pregWeek} />;
    if (activeTab === 'settings') return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shrink-0">
              <Settings className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-amber-900">廚備與偏好設定</h2>
              <p className="text-amber-700/70 text-sm mt-1">
                記錄家中現有的工具和食材，AI 將能給予更精準的食譜與採買建議。
              </p>
            </div>
          </div>
            
          <div className="space-y-6 bg-white p-6 rounded-3xl shadow-sm border border-amber-50">
            {/* Tools */}
            <div>
              <h3 className="text-sm font-bold text-[#5C4D43] mb-3 flex items-center gap-2">烹調工具</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {tools.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-[#5C4D43] font-medium text-sm rounded-xl border border-slate-200">
                    {t}
                    <button onClick={() => removeTool(t)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newTool} 
                  onChange={e => setNewTool(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTool()}
                  className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                  placeholder="新增工具...例如: 大同電鍋"
                />
                <button onClick={addTool} className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold transition-colors">
                  新增
                </button>
              </div>
            </div>

            {/* Seasonings */}
            <div>
              <h3 className="text-sm font-bold text-[#5C4D43] mb-3 flex items-center gap-2">調味料庫</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {seasonings.map(s => (
                  <span key={s} className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-[#5C4D43] font-medium text-sm rounded-xl border border-slate-200">
                    {s}
                    <button onClick={() => removeSeasoning(s)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newSeasoning} 
                  onChange={e => setNewSeasoning(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSeasoning()}
                  className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                  placeholder="新增調味...例如: 和風醬油"
                />
                <button onClick={addSeasoning} className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold transition-colors">
                  新增
                </button>
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <h3 className="text-sm font-bold text-[#5C4D43] mb-3 flex items-center gap-2">現有食材</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {ingredients.map(i => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-900 font-medium text-sm rounded-xl border border-amber-200">
                    {i}
                    <button onClick={() => removeIngredient(i)} className="text-amber-700/60 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newIngredient} 
                  onChange={e => setNewIngredient(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addIngredient()}
                  className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                  placeholder="新增食材...例如: 雞胸肉"
                />
                <button onClick={addIngredient} className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold transition-colors">
                  新增
                </button>
              </div>
            </div>

            <div className="bg-[#FFF9F0] rounded-xl p-4 border border-[#E8DCCB] mt-6">
              <h4 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                <Info className="w-4 h-4" /> 系統提示
              </h4>
              <p className="text-sm text-amber-800/80 leading-relaxed font-medium">
                您的廚房裝備、調味料與食材會自動同步給育產顧問，顧問將依據這些條件為您設計孕期專屬的冷凍快速包食譜，以及在採購規劃中標記需要購買的食材。
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    // Default Chat
    return (
      <>
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 animate-in fade-in zoom-in duration-500 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FFF9F0] to-[#FDFBF7] opacity-50 block md:hidden blur-3xl pointer-events-none" />
            
            <div className="w-20 h-20 bg-gradient-to-tr from-amber-400 to-orange-300 rounded-3xl shadow-xl flex items-center justify-center mb-6 z-10 
              transform -rotate-6 hover:rotate-0 transition-transform duration-300 group ring-4 ring-white">
              <Baby className="w-10 h-10 text-white drop-shadow-sm group-hover:scale-110 transition-transform" />
            </div>
            
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#5C4D43] mb-3 text-center tracking-tight z-10">
              最懂你的育產助理
            </h2>
            <p className="text-[#8B7355] text-center text-sm sm:text-base max-w-md my-4 font-medium leading-relaxed bg-white/50 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-amber-50">
              嗨！我是專為爸爸打造的全方位顧問。<br/>
              無論是 <span className="text-amber-700 font-bold">食材庫存</span>、<span className="text-amber-700 font-bold">冷凍包食譜</span>、還是 <span className="text-amber-700 font-bold">食譜截圖辨識</span> 都可以問我！
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-4 z-10">
              <button 
                onClick={() => setInput('下週老婆要產檢了，能給我一些加油鼓勵陪伴的建議嗎？還有準備什麼必備採購品？')}
                className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl text-left border border-amber-100 hover:border-amber-300 shadow-sm hover:shadow transition-all group flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">💬</div>
                <div>
                  <h4 className="font-bold text-[#5C4D43] text-sm mb-0.5 group-hover:text-amber-700 transition">產檢陪伴指南</h4>
                  <p className="text-xs text-[#8B7355]/80">點擊發送對話</p>
                </div>
              </button>
              
              <button 
                onClick={() => {
                  setInput('我現在有花椰菜跟雞胸肉，請幫我設計一個烤箱食譜，這週適合吃嗎？（如果現有食材夠用就標記，不夠的加入購物清單）');
                }}
                className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl text-left border border-amber-100 hover:border-amber-300 shadow-sm hover:shadow transition-all group flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">🍱</div>
                <div>
                  <h4 className="font-bold text-[#5C4D43] text-sm mb-0.5 group-hover:text-orange-700 transition">快速食譜提案</h4>
                  <p className="text-xs text-[#8B7355]/80">點擊發送對話</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {messages.map((m, idx) => (
              <div key={idx} className={cn("flex", m.role === 'model' ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 sm:p-5 shadow-sm overflow-hidden",
                  m.role === 'model' 
                  ? "bg-white border text-[#5C4D43]"
                  : "bg-gradient-to-r from-amber-600 to-amber-700 text-white"
                )}>
                  {m.role === 'model' && (
                    <div className="flex items-center gap-2 font-black mb-3 text-amber-800 tracking-tight">
                      <div className="w-6 h-6 bg-amber-100 rounded-md flex items-center justify-center"><Baby className="w-4 h-4 text-amber-700"/></div>
                      顧問
                    </div>
                  )}
                  {m.parts.map((p, pIdx) => {
                    if (p.inlineData) {
                      return <img key={pIdx} src={`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`} alt="upload" className="max-w-[200px] mb-3 rounded-xl shadow-md border-2 border-white/20" />;
                    }
                    if (p.text && m.role === 'model') {
                      return (
                        <div className="markdown-body text-sm font-medium leading-relaxed" key={pIdx}>
                          <Markdown remarkPlugins={[remarkGfm]}>{p.text}</Markdown>
                        </div>
                      )
                    }
                    return <p key={pIdx} className="leading-relaxed font-medium whitespace-pre-wrap">{p.text}</p>;
                  })}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border text-amber-700/60 font-medium rounded-2xl px-6 py-5 shadow-sm flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"></span>
                  </div>
                  顧問思考中...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        <div className="p-4 sm:p-6 bg-white border-t sm:relative shrink-0">
           {images.length > 0 && (
            <div className="flex gap-3 mb-4 overflow-x-auto pb-2 px-1">
              {images.map((img, i) => (
                <div key={i} className="relative w-20 h-20 shrink-0 group">
                  <img src={URL.createObjectURL(img)} className="w-full h-full object-cover rounded-xl shadow-sm border border-slate-200" />
                  <button 
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                    className="absolute -top-2 -right-2 bg-slate-800 text-white p-1 rounded-full text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-3 max-w-4xl mx-auto focus-within:ring-4 ring-amber-50/50 rounded-2xl transition-all">
            <label className="shrink-0 p-3 bg-[#FFF9F0] text-amber-700 rounded-2xl cursor-pointer hover:bg-amber-100 transition-colors border border-amber-200 shadow-sm flex items-center justify-center">
              <Camera className="w-5 h-5" />
              <input 
                type="file" 
                multiple 
                accept="image/*" 
                className="hidden" 
                onChange={e => {
                  if (e.target.files) {
                    setImages(prev => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
            </label>
            <textarea
              className="flex-1 max-h-40 min-h-[52px] bg-[#FFF9F0] text-[#5C4D43] rounded-2xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500 border border-[#E8DCCB] shadow-inner resize-none text-[15px] leading-relaxed placeholder:text-amber-800/40 font-medium"
              placeholder="貼上食譜截圖 (Ctrl+V) 或是直接詢問孕期建議..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={handlePaste}
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && images.length === 0)}
              className="shrink-0 p-3.5 bg-amber-600 text-white rounded-2xl cursor-pointer hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-200 focus:scale-95 active:scale-90"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-[100dvh] bg-[#fdfbf7] font-sans selection:bg-amber-100">
      <div className={cn(
        "fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity",
        showMobileNav ? "opacity-100" : "opacity-0 pointer-events-none"
      )} onClick={() => setShowMobileNav(false)} />

      <nav className={cn(
        "fixed md:static inset-y-0 left-0 w-[240px] xl:w-[280px] bg-white border-r border-[#E8DCCB] flex flex-col z-50 transform transition-transform duration-300 shadow-2xl md:shadow-none",
        showMobileNav ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-[#5C4D43] font-black text-xl flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#E8DCCB] text-amber-800 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-white/40 blur-[2px]"></div>
                <Baby className="w-5 h-5 relative z-10" />
              </div>
              <span className="tracking-tight">奶爸陪產助理</span>
            </h1>
            <button className="md:hidden text-slate-400 p-2" onClick={() => setShowMobileNav(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setShowMobileNav(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all duration-200",
                  activeTab === item.id 
                    ? "bg-[#5C4D43] text-white shadow-md shadow-amber-900/10 translate-x-1" 
                    : "text-[#8B7355] hover:bg-[#F4EBE1] hover:text-[#5C4D43]"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-6">
          <div className="bg-[#FFF9F0] rounded-3xl p-5 border border-[#E8DCCB] relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/40 rounded-full blur-xl -mr-4 -mt-4 mix-blend-overlay"></div>
            
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800/80 mb-3 tracking-widest">
              <Baby className="w-3.5 h-3.5" /> 本週狀態
            </div>
            <div className="font-bold text-[#5C4D43]">
              目前：<span className="text-xl mx-0.5 font-black text-amber-700">W{pregWeek}</span> 
              <span className="text-sm font-medium text-amber-800/70 ml-1">+{pregDay}D</span>
            </div>
            
            {pregWeek >= 7 && (
              <div className="mt-4 pt-4 border-t border-[#E8DCCB] text-xs font-medium text-[#8B7355] leading-relaxed relative z-10">
                <span className="inline-block bg-[#E8DCCB] text-[#5C4D43] px-2 py-0.5 rounded mr-1 leading-none shadow-sm">提醒</span>
                心跳已確認！記得提醒媽咪攝取足夠優質蛋白質喔。
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#fdfbf7]">
        <header className="h-[60px] sm:h-[72px] bg-white/80 backdrop-blur-md border-b border-[#E8DCCB] flex items-center px-4 sm:px-6 shrink-0 sticky top-0 z-30 shadow-sm">
          <button 
            className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg md:hidden transition-colors"
            onClick={() => setShowMobileNav(true)}
          >
            <Menu className="w-5 h-5 text-amber-900" />
          </button>
          
          <div className="ml-2 font-bold text-[#5C4D43] md:hidden truncate">
            {navItems.find(i => i.id === activeTab)?.label}
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}
