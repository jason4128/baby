import React, { useState, useEffect, useRef } from 'react';
import { differenceInDays } from 'date-fns';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Camera, Send, X, ChefHat, Settings, Info, Menu, Utensils, MessageSquare, Baby, ShoppingBag, LogIn } from 'lucide-react';
import { chatWithConsultant, fileToBase64, getGeminiKey, setGeminiKey } from './services/gemini';
import { BASE_SYSTEM_PROMPT, INITIAL_TOOLS, INITIAL_SEASONINGS, INITIAL_INGREDIENTS, CONCEPTION_DATE } from './constants';
import { cn } from './lib/utils';
import { AppTab } from './types';
import RecipesView from './components/RecipesView';
import RecordsView from './components/RecordsView';
import ShoppingView from './components/ShoppingView';

import LoginView from './components/LoginView';

import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, onSnapshot, getDocs } from 'firebase/firestore';

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
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => getGeminiKey() || '');

  const [messages, setMessages] = useState<{ 
    role: 'user' | 'model'; 
    parts: { text: string; inlineData?: any }[];
    suggestions?: {
      recipes: any[];
      shoppingItems: any[];
    };
    saved?: boolean;
  }[]>([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  
  // Custom Modal State
  const [modalConfig, setModalConfig] = useState<{
    show: boolean;
    title: string;
    message: string | React.ReactNode;
    onConfirm?: () => void;
    type: 'confirm' | 'alert';
  }>({
    show: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showModal = (title: string, message: string | React.ReactNode, type: 'confirm' | 'alert' = 'alert', onConfirm?: () => void) => {
    setModalConfig({ show: true, title, message, type, onConfirm });
  };

  const closeModals = () => {
    setModalConfig(prev => ({ ...prev, show: false }));
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [pregWeek, setPregWeek] = useState(0);
  const [pregDay, setPregDay] = useState(0);
  const [conceptionDate, setConceptionDate] = useState<Date>(CONCEPTION_DATE);

  useEffect(() => {
    // Calculate current pregnancy week
    const now = new Date();
    const diffDays = differenceInDays(now, conceptionDate);
    setPregWeek(Math.floor(diffDays / 7));
    setPregDay(diffDays % 7);
  }, [conceptionDate]);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            await setDoc(docRef, {
              userId: u.uid,
              tools: INITIAL_TOOLS,
              seasonings: INITIAL_SEASONINGS,
              ingredients: INITIAL_INGREDIENTS,
              conceptionDate: CONCEPTION_DATE.toISOString(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          // Real-time listener for user document
          unsubscribeSnapshot = onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setTools(data.tools || []);
              setSeasonings(data.seasonings || []);
              setIngredients(data.ingredients || []);
              if (data.conceptionDate) {
                setConceptionDate(new Date(data.conceptionDate));
              }
              setIsAuthLoading(false);
            }
          }, (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${u.uid}`);
          });

        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `users/${u.uid}`);
          setIsAuthLoading(false);
        }
      } else {
        setUser(null);
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        setIsAuthLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
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

  const handleSaveRecipe = async (msgIdx: number, recipe: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'recipes'), {
        userId: user.uid,
        title: recipe.title || '無標題',
        category: recipe.category || 'AI 生成',
        description: recipe.description || '',
        imageUrl: `https://image.pollinations.ai/prompt/A+delicious+dish,+realistic+food+photography+of+meal+${encodeURIComponent(recipe.title || 'delicious food')}?width=800&height=600&nologo=true`,
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Update message state to show it was saved
      const newMessages = [...messages];
      if (newMessages[msgIdx].suggestions) {
        newMessages[msgIdx].suggestions!.recipes = newMessages[msgIdx].suggestions!.recipes.filter(r => r !== recipe);
      }
      setMessages(newMessages);
      showModal('✅ 已儲存食譜', `已將【${recipe.title}】存入專屬食譜區！`);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'recipes');
    }
  };

  const handleSaveShoppingItem = async (msgIdx: number, item: any) => {
    if (!user) return;
    try {
      // Quick duplicate check: Fetch pending items to see if this one (or similar) exists
      // For simplicity and speed, we check for an exact lowercase name match or containment
      const lowerName = (item.name || '').toLowerCase();
      
      const q = query(
        collection(db, 'shoppingItems'), 
        where('userId', '==', user.uid), 
        where('isPurchased', '==', false),
        where('name', '==', item.name)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        showModal('已在清單中', `【${item.name}】已經在您的採購清單中了！`);
        // Still remove from suggestions to clean up UI
        const newMessages = [...messages];
        if (newMessages[msgIdx].suggestions) {
          newMessages[msgIdx].suggestions!.shoppingItems = newMessages[msgIdx].suggestions!.shoppingItems.filter(i => i !== item);
        }
        setMessages(newMessages);
        return;
      }
      
      await addDoc(collection(db, 'shoppingItems'), {
        userId: user.uid,
        name: item.name || '未命名',
        category: item.category || '採購建議',
        isPurchased: false,
        suggestedWeek: item.suggestedWeek || pregWeek,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      const newMessages = [...messages];
      if (newMessages[msgIdx].suggestions) {
        newMessages[msgIdx].suggestions!.shoppingItems = newMessages[msgIdx].suggestions!.shoppingItems.filter(i => i !== item);
      }
      setMessages(newMessages);
      showModal('🛒 已加入清單', `已將【${item.name}】加入採購清單！`);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'shoppingItems');
    }
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
      // Generate dynamic prompt and attach inventory context directly to the user message for the AI's current awareness
      const inventoryContext = `
系統庫存資訊：
- 工具：${tools.length > 0 ? tools.join('、') : '目前無紀錄'}
- 調味：${seasonings.length > 0 ? seasonings.join('、') : '目前無紀錄'}
- 食材料：${ingredients.length > 0 ? ingredients.join('、') : '目前無紀錄'}
(請優先根據現有食材提供建議，若食材不足請在回覆中建議採購，並放入 shoppingItems 陣列)
`;

      const systemPrompt = BASE_SYSTEM_PROMPT
        .replace('{tools}', tools.join('、'))
        .replace('{seasonings}', seasonings.join('、'))
        .replace('{ingredients}', ingredients.join('、'))
        .replace('{week}', pregWeek.toString())
        .replace('{day}', pregDay.toString());

      const responseObj: any = await chatWithConsultant(systemPrompt, messages, input + "\n\n" + inventoryContext, base64Images);
      
      let replyText = "";
      if (responseObj.consultantReply) {
        replyText = responseObj.consultantReply;
      }
      
      // Pass all generated items to suggestions, UI will handle display
      setMessages([...updatedHistory, { 
        role: 'model', 
        parts: [{ text: replyText || '沒有回覆文字' }],
        suggestions: {
          recipes: Array.isArray(responseObj.recipes) ? responseObj.recipes : [],
          shoppingItems: Array.isArray(responseObj.shoppingItems) ? responseObj.shoppingItems : []
        }
      }]);
    } catch (e: any) {
      console.error(e);
      let errorMsg = '⚠️ 顧問系統遇到錯誤，請確認網路或 API KEY 設定後再試一次。';
      if (e?.message?.includes('quota') || e?.message?.includes('429')) {
        errorMsg = '⚠️ AI 額度已達上限（Quota Exceeded）。如果您是使用自己的 API Key，請檢查 Google AI Studio 的帳單或額度設定；如果是使用系統預設 Key，請稍候再試或在「廚備設定」中設定您自己的 API Key。';
      } else if (e?.message?.includes('API key not valid') || e?.message?.includes('401')) {
        errorMsg = '⚠️ API KEY 無效。請前往「廚備設定」重新檢查並儲存您的 Gemini API Key。';
      }
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: errorMsg }] }]);
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
    return <LoginView />;
  }

  const handleUpdateConceptionDate = async (newDate: Date) => {
    setConceptionDate(newDate);
    if (user) {
      try {
        const docRef = doc(db, 'users', user.uid);
        await updateDoc(docRef, { 
          conceptionDate: newDate.toISOString(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const renderContent = () => {
    if (activeTab === 'recipes') return <RecipesView tools={tools} seasonings={seasonings} ingredients={ingredients} pregWeek={pregWeek} />;
    if (activeTab === 'records') return <RecordsView pregWeek={pregWeek} pregDay={pregDay} conceptionDate={conceptionDate} onUpdateConceptionDate={handleUpdateConceptionDate} />;
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

            {/* API Key */}
            <div className="mt-8 pt-6 border-t border-amber-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#5C4D43] flex items-center gap-2">Gemini API Key</h3>
                {getGeminiKey() ? (
                  <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">已啟用</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">未設定 (使用系統預設)</span>
                )}
              </div>
              <p className="text-sm text-amber-800/70 mb-3">
                部署至 GitHub Pages 等外部平台時，請輸入您的 Gemini API Key 以啟用 AI 顧問功能。（您的 Key 將只會存在您的瀏覽器中，不會上傳至伺服器）
              </p>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={geminiKeyInput} 
                  onChange={e => setGeminiKeyInput(e.target.value)}
                  className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                  placeholder="輸入您的 Gemini API Key..."
                />
                <button 
                  onClick={() => {
                    if (!geminiKeyInput.trim()) {
                      setGeminiKey('');
                      showModal('API Key 已清除', '已清除自訂 API Key，系統將嘗試使用預設金鑰。');
                    } else {
                      setGeminiKey(geminiKeyInput);
                      showModal('✅ API Key 已儲存', 'API Key 已儲存至瀏覽器！顧問功能現在將使用您的金鑰。');
                    }
                    // Refresh current key input display
                    setGeminiKeyInput(getGeminiKey() || '');
                  }} 
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold transition-colors shrink-0">
                  儲存金鑰
                </button>
              </div>
            </div>

            {/* Logout */}
            <div className="mt-8 pt-6 border-t border-amber-100 text-center">
               <button 
                  onClick={() => signOut(auth)}
                  className="px-6 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-bold transition-colors">
                  登出帳號
               </button>
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
                        <div key={pIdx}>
                          <div className="markdown-body text-sm font-medium leading-relaxed">
                            <Markdown remarkPlugins={[remarkGfm]}>{p.text}</Markdown>
                          </div>
                          
                          {(m.suggestions?.recipes.length! > 0 || m.suggestions?.shoppingItems.length! > 0) && (
                            <div className="mt-4 pt-4 border-t border-amber-50 space-y-3">
                              <p className="text-[10px] font-bold text-amber-900/40 uppercase tracking-widest">顧問建議動作</p>
                              <div className="flex flex-wrap gap-2">
                                {m.suggestions?.recipes.map((r, rIdx) => (
                                  <button 
                                    key={rIdx}
                                    onClick={() => handleSaveRecipe(idx, r)}
                                    className="px-3 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                                  >
                                    <ChefHat className="w-3.5 h-3.5" />
                                    存下食譜：{r.title}
                                  </button>
                                ))}
                                {m.suggestions?.shoppingItems.map((s, sIdx) => (
                                  <button 
                                    key={sIdx}
                                    onClick={() => handleSaveShoppingItem(idx, s)}
                                    className="px-3 py-2 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold border border-orange-100 hover:bg-orange-100 transition-colors flex items-center gap-1.5"
                                  >
                                    <ShoppingBag className="w-3.5 h-3.5" />
                                    加入採購：{s.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
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

      {/* Custom Modal */}
      {modalConfig.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#5C4D43] mb-2">{modalConfig.title}</h3>
              <div className="text-[#5C4D43]/80 leading-relaxed text-sm">
                {modalConfig.message}
              </div>
            </div>
            <div className="bg-amber-50/50 p-4 flex gap-3">
              {modalConfig.type === 'confirm' ? (
                <>
                  <button
                    onClick={closeModals}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-[#5C4D43]/60 hover:bg-white transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      modalConfig.onConfirm?.();
                      closeModals();
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-md shadow-amber-200"
                  >
                    確定
                  </button>
                </>
              ) : (
                <button
                  onClick={closeModals}
                  className="w-full py-3 px-4 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-md shadow-amber-200"
                >
                  我知道了
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
