import React, { useState, useEffect, useRef } from 'react';
import { Recipe } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc, addDoc } from 'firebase/firestore';
import { ChefHat, ChevronRight, ArrowLeft, Image as ImageIcon, RefreshCcw, CheckCircle2, ShoppingCart, Loader2, Trash2, Mic, MicOff, Send } from 'lucide-react';
import { cn } from '../lib/utils';

interface RecipesViewProps {
  tools?: string[];
  seasonings?: string[];
  ingredients?: string[];
  pregWeek?: number;
}

export default function RecipesView({ tools = [], seasonings = [], ingredients = [], pregWeek = 0 }: RecipesViewProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'done'>('idle');

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

  const [shoppingItems, setShoppingItems] = useState<string[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'shoppingItems'), where('userId', '==', auth.currentUser.uid), where('isPurchased', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data().name.toLowerCase());
      setShoppingItems(items);
    }, (error) => {
      console.error("Error fetching shopping items:", error);
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const checkIngredientsStatus = async () => {
    if (!selectedRecipe || !auth.currentUser) return;
    
    setIsChecking(true);
    setCheckStatus('checking');

    const allInventory = [...tools, ...seasonings, ...ingredients].map(i => i.toLowerCase());
    
    // Check missing ingredients but filter out those ALREADY in the shopping list
    const missingIngredients = selectedRecipe.ingredients.filter(recipeIng => {
      const name = recipeIng.name.toLowerCase();
      const inInventory = allInventory.some(inv => name.includes(inv) || inv.includes(name));
      const inShoppingList = shoppingItems.some(item => name.includes(item) || item.includes(name));
      return !inInventory && !inShoppingList;
    });

    if (missingIngredients.length > 0) {
      showModal(
        '發現缺失食材',
        <div className="space-y-2">
          <p className="text-sm text-[#5C4D43]">以下食材尚未出現在您的廚備庫存中，確定要加入採購清單嗎？</p>
          <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
            {missingIngredients.map((i, idx) => (
              <div key={idx} className="text-sm font-medium text-amber-900">• {i.name}</div>
            ))}
          </div>
        </div>,
        'confirm',
        async () => {
          try {
            for (const ing of missingIngredients) {
              let category = '食材';
              const lowerName = ing.name.toLowerCase();
              const seasoningKeywords = ['醬', '油', '鹽', '糖', '醋', '粉', '精', '味', '胡椒', '咖哩', '味噌', '露', '草'];
              const toolKeywords = ['鍋', '鏟', '機', '秤', '盒', '切', '磨', '盤', '夾', '刷', '刀', '板', '勺', '碗'];
              
              if (seasoningKeywords.some(k => lowerName.includes(k))) category = '調味料';
              else if (toolKeywords.some(k => lowerName.includes(k))) category = '工具';
              
              await addDoc(collection(db, 'shoppingItems'), {
                userId: auth.currentUser!.uid,
                name: ing.name,
                category: category,
                isPurchased: false,
                suggestedWeek: pregWeek,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            }
            showModal('已加入清單', `已將 ${missingIngredients.length} 項缺失食材加入採購清單！`);
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, 'shoppingItems');
          }
        }
      );
    } else {
      showModal('庫存充足', '所有食材皆已在您的廚備庫存中！ 🎉');
    }
    
    setCheckStatus('done');
    setTimeout(() => {
      setIsChecking(false);
      setCheckStatus('idle');
    }, 2000);
  };

  const handleRegenerateImage = async () => {
    if (!selectedRecipeId) return;
    const recipe = recipes.find(r => r.id === selectedRecipeId);
    if (!recipe) return;

    setIsRegenerating(true);
    try {
      const seed = Math.floor(Math.random() * 1000000);
      const newImageUrl = `https://image.pollinations.ai/prompt/A+delicious+dish,+realistic+food+photography+of+meal+${encodeURIComponent(recipe.title || 'delicious food')}?width=800&height=600&nologo=true&seed=${seed}`;
      
      await updateDoc(doc(db, 'recipes', recipe.id), {
        imageUrl: newImageUrl,
        updatedAt: serverTimestamp()
      });
      // We purposefully DO NOT set isRegenerating to false here.
      // The onLoad event of the image will set it false when the new image arrives.
    } catch (e) {
      setIsRegenerating(false);
      handleFirestoreError(e, OperationType.UPDATE, `recipes/${recipe.id}`);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const isAdmin = auth.currentUser.email === 'jason2134@gmail.com' || auth.currentUser.email === 'user@gmail.com';
    const q = isAdmin
      ? query(collection(db, 'recipes'))
      : query(collection(db, 'recipes'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRecipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
      setRecipes(fetchedRecipes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'recipes');
    });

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const deleteRecipe = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    showModal(
      '刪除食譜',
      '確定要刪除這份食譜嗎？此動作無法復原。',
      'confirm',
      async () => {
        try {
          await deleteDoc(doc(db, 'recipes', id));
          if (selectedRecipeId === id) setSelectedRecipeId(null);
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `recipes/${id}`);
        }
      }
    );
  };

  const getImageUrl = (recipe: Recipe) => {
    if (!recipe.imageUrl || recipe.imageUrl.includes('unsplash') || recipe.imageUrl.includes('cute+japanese') || recipe.imageUrl.includes('top+down+view')) {
      return `https://image.pollinations.ai/prompt/A+delicious+dish,+realistic+food+photography+of+meal+${encodeURIComponent(recipe.title || 'delicious food')}?width=800&height=600&nologo=true`;
    }
    return recipe.imageUrl;
  };

  // AI Consultant state for Recipe Detail
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const isChatLoadingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const isVoiceModeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Scroll chat to bottom when messages change
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading]);

  // When selected recipe changes, clear chat
  useEffect(() => {
    setChatMessages([]);
    setIsVoiceMode(false);
    isVoiceModeRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
  }, [selectedRecipeId]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'cmn-Hant-TW';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setChatInput(prev => {
            const next = prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + finalTranscript;
            chatInputRef.current = next;
            return next;
          });
        }
      };
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
        if (isVoiceModeRef.current && !isChatLoadingRef.current) {
          if (chatInputRef.current.trim().length > 0) {
            handleRecipeChatSendRef.current?.();
          } else {
            setTimeout(() => {
              if (isVoiceModeRef.current && !isChatLoadingRef.current) {
                try { recognitionRef.current.start(); } catch(e) {}
              }
            }, 500);
          }
        }
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const handleRecipeChatSendRef = useRef<() => void>(() => {});

  const toggleVoiceMode = () => {
    if (!recognitionRef.current) {
      showModal('不支援語音辨識', '您的瀏覽器不支援語音功能，推薦使用 Chrome 瀏覽器。');
      return;
    }
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    isVoiceModeRef.current = newMode;
    if (newMode) {
      try { recognitionRef.current.start(); } catch (e) {}
    } else {
      recognitionRef.current.stop();
    }
  };

  const handleRecipeChatSend = async () => {
    handleRecipeChatSendRef.current = handleRecipeChatSend;
    const currentInput = chatInputRef.current;
    if (!currentInput.trim()) return;

    setIsChatLoading(true);
    isChatLoadingRef.current = true;
    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    const newMessage = { role: 'user' as const, text: currentInput.trim() };
    const updatedHistory = [...chatMessages, newMessage];
    setChatMessages(updatedHistory);
    setChatInput('');
    chatInputRef.current = '';

    const systemContext = `
[系統設定]
你是一個專業的食譜解說顧問，現在使用者正在觀看這份食譜：
【食譜名稱】：${selectedRecipe?.title}
【食材】：
${selectedRecipe?.ingredients.map((i: any) => `- ${i.name} (${i.amount})`).join('\n')}
【步驟】：
${selectedRecipe?.steps.map((s: any, idx: number) => `${idx+1}. ${s}`).join('\n')}

[系統庫存與狀態資訊]
- 孕期週數：第 ${pregWeek} 週
- 廚房工具：${(tools && tools.length > 0) ? tools.join('、') : '目前無紀錄'}
- 常備調味：${(seasonings && seasonings.length > 0) ? seasonings.join('、') : '目前無紀錄'}
- 現有食材：${(ingredients && ingredients.length > 0) ? ingredients.join('、') : '目前無紀錄'}

- 目前的問題是針對此食譜的作法、替換食材或相關延伸問題，請直接回答，不要用太多 markdown 標記，盡量口語化。若問及調味料或工具，請參考上方系統庫存提供最適合的建議。
`;
    
    // We can construct a simple prompt
    const prompt = `系統資訊：${systemContext}\n\n歷史對話：${updatedHistory.map(m => m.role + ': ' + m.text).join('\n')}\n\n請根據以上資訊與歷史對話，給出下一個 model 的簡短回覆（不包含 role 標籤）：`;

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const { withKeyFallback } = await import('../services/gemini');
      
      const response = await withKeyFallback(async (client) => {
        return await client.models.generateContent({
          model: "gemini-3-flash-preview", // Use flash since it's just questions about the recipe
          contents: prompt,
          config: { temperature: 0.7 }
        });
      });
      
      const replyText = response.text || "無法回答，請稍後再試。";
      setChatMessages([...updatedHistory, { role: 'model', text: replyText }]);
    } catch (e: any) {
      console.error(e);
      let errorMsg = '⚠️ 系統遇到錯誤。';
      if (e?.message?.includes('API Key')) errorMsg = '⚠️ 請先設定 API Key。';
      setChatMessages([...updatedHistory, { role: 'model', text: errorMsg }]);
    } finally {
      setIsChatLoading(false);
      isChatLoadingRef.current = false;
      if (isVoiceModeRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (isVoiceModeRef.current) {
            try { recognitionRef.current.start(); } catch(e) {}
          }
        }, 500);
      }
    }
  };
  handleRecipeChatSendRef.current = handleRecipeChatSend;

  const normalizeCategory = (cat: string) => {
    if (!cat) return '未分類';
    if (cat.includes('電鍋')) return '電鍋';
    if (cat.includes('氣炸')) return '氣炸鍋';
    if (cat.includes('烤箱')) return '烤箱';
    if (cat.includes('平底鍋') || cat.includes('炒')) return '平底鍋';
    if (cat.includes('微波')) return '微波爐';
    if (cat.includes('湯')) return '湯鍋';
    if (cat.includes('免開火') || cat.includes('涼拌')) return '免開火';
    
    // Map legacy meal-based categories safely
    if (cat.includes('早餐') || cat.includes('點心') || cat.includes('飯糰')) return '免開火';
    return '其他(依食材)'; 
  };

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId);
  const categories = ['all', ...Array.from(new Set(recipes.map(r => normalizeCategory(r.category)).filter(Boolean)))];
  const filteredRecipes = recipes.filter(r => selectedCategory === 'all' || normalizeCategory(r.category) === selectedCategory);

  // List View
  if (!selectedRecipe) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shrink-0">
              <ChefHat className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-amber-900">專屬備餐食譜庫</h2>
              <p className="text-amber-700/70 text-sm mt-1">
                條列式管理，點擊查看詳細材料與可愛的圖文步驟。AI 將會自動為您生成新食譜！
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pb-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm active:scale-95",
                  selectedCategory === cat 
                    ? "bg-amber-600 text-white border-transparent" 
                    : "bg-white text-amber-900 border border-amber-100 hover:bg-amber-50"
                )}
              >
                {cat === 'all' ? '全部食譜' : cat}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredRecipes.length === 0 && (
              <div className="text-center py-12 text-amber-700/50">
                目前此分類還沒有專屬食譜。
              </div>
            )}
            {filteredRecipes.map((recipe) => (
              <div 
                key={recipe.id}
                onClick={() => setSelectedRecipeId(recipe.id)}
                className="w-full text-left bg-white p-4 rounded-2xl shadow-sm border border-amber-50 hover:border-amber-300 hover:shadow-md transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 relative">
                    {getImageUrl(recipe) ? (
                      <img src={getImageUrl(recipe)} alt={recipe.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-amber-50 text-amber-300">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}
                    <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-xl"></div>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-amber-900 mb-1">{recipe.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800">
                        {recipe.category}
                      </span>
                      <span className="text-xs text-amber-700/60 line-clamp-1">{recipe.description}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 py-1">
                  <button 
                    onClick={(e) => deleteRecipe(e, recipe.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    title="刪除食譜"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <div className="shrink-0 w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Detail View
  return (
    <div className="flex-1 overflow-y-auto bg-[#fdfbf7] relative">
      {/* Detail Header area with integrated back button */}
      <div className="bg-white border-b border-amber-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button 
          onClick={() => setSelectedRecipeId(null)}
          className="p-2 -ml-2 text-amber-700 hover:bg-amber-50 rounded-xl transition-colors shrink-0"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="font-bold text-amber-900 truncate flex-1">{selectedRecipe.title}</span>
      </div>

      <div className="p-4 sm:p-6 pb-20">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Main Title Section */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-black text-[#5C4D43] tracking-wider relative inline-block">
              <span className="relative z-10">{selectedRecipe.title} 溫馨食譜</span>
            </h1>
            <p className="text-[#8B7355] max-w-2xl mx-auto leading-relaxed">{selectedRecipe.description}</p>
          </div>

          {/* AI Image Placeholder */}
          <div className="w-full max-w-2xl mx-auto rounded-3xl overflow-hidden shadow-sm relative aspect-video bg-amber-50 border-4 border-white group">
            <img 
              src={getImageUrl(selectedRecipe)} 
              alt={selectedRecipe.title} 
              onLoad={() => setIsRegenerating(false)}
              className={cn("w-full h-full object-cover transition-all duration-500", isRegenerating && "opacity-60 blur-md grayscale sm:grayscale-0")} 
            />
            
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-bold text-amber-800 flex items-center gap-1.5 shadow-sm">
              <ImageIcon className="w-3.5 h-3.5" />
              AI 生成示意圖
            </div>

            <button 
              onClick={handleRegenerateImage}
              disabled={isRegenerating}
              className="absolute bottom-4 right-4 bg-white/90 hover:bg-white backdrop-blur px-4 py-2 rounded-full text-sm font-bold text-amber-800 flex items-center gap-2 shadow-md transition-all shadow-amber-900/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group-hover:translate-y-0 sm:translate-y-2 sm:opacity-0 group-hover:opacity-100"
            >
              <RefreshCcw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
              {isRegenerating ? '重新生成中...' : '更新圖片'}
            </button>

            <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-3xl pointer-events-none"></div>
          </div>

          {/* Recipe Content - 2 column layout mimicking the image */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* Left Col - Ingredients */}
            <div className="lg:col-span-5 bg-[#FFF9F0] border-2 border-[#E8DCCB] rounded-3xl p-6 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#E8DCCB] text-[#5C4D43] px-6 py-1.5 rounded-full text-sm font-bold tracking-widest whitespace-nowrap shadow-sm border-2 border-white">
                美味食材準備
              </div>
              
              <div className="mt-6 mb-6">
                <button
                  onClick={checkIngredientsStatus}
                  disabled={isChecking}
                  className={cn(
                    "w-full py-3 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
                    checkStatus === 'done' 
                      ? "bg-green-100 text-green-700 border-2 border-green-200" 
                      : "bg-white border-2 border-[#E8DCCB] text-[#5C4D43] hover:bg-amber-50"
                  )}
                >
                  {isChecking ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      檢查庫存中...
                    </>
                  ) : checkStatus === 'done' ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      檢查完成
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-5 h-5" />
                      檢查食材庫存
                    </>
                  )}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                {selectedRecipe.ingredients.map((ing, idx) => (
                  <div key={idx} className="flex flex-col items-center text-center group">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-[#E8DCCB] flex items-center justify-center text-3xl mb-2 group-hover:scale-105 transition-transform">
                      {ing.icon}
                    </div>
                    <span className="font-bold text-[#5C4D43] mb-0.5">{ing.name}</span>
                    <span className="text-xs text-[#8B7355]">{ing.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Col - Steps */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#E8DCCB] relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#E8DCCB] text-[#5C4D43] px-6 py-1.5 rounded-full text-sm font-bold tracking-widest shadow-sm border-2 border-white">
                料理步驟
              </div>

              <div className="mt-6 space-y-6">
                {selectedRecipe.steps.map((step, idx) => {
                  const parts = step.split('：');
                  const stepTitle = parts.length > 1 ? parts[0] : null;
                  const stepDesc = parts.length > 1 ? parts.slice(1).join('：') : step;

                  return (
                    <div key={idx} className="flex gap-4 group">
                      <div className="shrink-0 w-8 h-8 bg-[#F4EBE1] text-[#8B7355] rounded-full flex items-center justify-center font-black shadow-sm group-hover:bg-[#E8DCCB] transition-colors">
                        {idx + 1}
                      </div>
                      <div className="pt-1">
                        {stepTitle && <div className="font-bold text-[#5C4D43] mb-1">{stepTitle}</div>}
                        <p className="text-[#8B7355] leading-relaxed text-sm sm:text-base">
                          {stepDesc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* AI Recipe Consultant Chat */}
          <div className="mt-8 bg-white border-2 border-amber-100 rounded-3xl overflow-hidden flex flex-col shadow-sm sm:h-[500px] h-[400px]">
            <div className="bg-amber-50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-amber-100 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600 text-white rounded-xl flex items-center justify-center shrink-0">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-amber-900">食譜小幫手</h3>
                  <p className="text-xs text-amber-700/80">針對這份食譜的作法、替換食材進行發問</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={chatScrollRef}>
              {chatMessages.length === 0 && (
                <div className="text-center text-amber-900/40 text-sm mt-10">
                   對這份食譜有疑問嗎？我可以為您解答，<br/>例如「沒牛肉可以換什麼？」、「烤箱要預熱多久？」。
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={cn("flex flex-col max-w-[80%] animate-in slide-in-from-bottom-2", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div className="text-xs text-amber-900/40 mb-1 ml-1">{m.role === 'user' ? '您' : '小幫手'}</div>
                  <div className={cn("px-4 py-3 rounded-2xl", m.role === 'user' ? "bg-amber-600 text-white rounded-br-sm" : "bg-[#FFF9F0] text-amber-900 border border-amber-100 rounded-bl-sm")}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex items-center gap-2 text-amber-600 font-bold p-4 text-sm animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  小幫手思考中...
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-amber-100">
              <div className="flex items-end gap-2 bg-[#FFF9F0] border border-amber-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-amber-500/50 transition-all shadow-sm">
                <textarea
                  value={chatInput}
                  onChange={(e) => { setChatInput(e.target.value); chatInputRef.current = e.target.value; }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRecipeChatSend(); }
                  }}
                  placeholder={isListening ? "聆聽中... (請說話)" : "輸入問題或點擊麥克風發問..."}
                  className="flex-1 bg-transparent border-none resize-none max-h-32 min-h-[44px] px-3 py-2.5 text-sm md:text-base text-amber-900 placeholder:text-amber-900/40 focus:outline-none"
                  rows={Math.min(4, chatInput.split('\n').length || 1)}
                  disabled={isChatLoading}
                />
                
                {/* Voice Toggle */}
                <button
                  type="button"
                  onClick={toggleVoiceMode}
                  className={cn(
                    "p-3 rounded-xl transition-all shrink-0 relative overflow-hidden group",
                    isVoiceMode 
                      ? "bg-red-500 text-white shadow-md shadow-red-500/20" 
                      : "bg-[#F4EBE1] text-amber-700/60 hover:bg-[#E8DCCB] hover:text-amber-800"
                  )}
                  title={isVoiceMode ? "點擊停止語音" : "連續語音對話模式"}
                >
                  {isVoiceMode && (
                    <span className="absolute inset-0 block animate-ping rounded-xl bg-red-400 opacity-20"></span>
                  )}
                  {isVoiceMode ? <Mic className="w-5 h-5 relative z-10 animate-pulse" /> : <MicOff className="w-5 h-5" />}
                </button>

                <button
                  type="button"
                  onClick={handleRecipeChatSend}
                  disabled={isChatLoading || (!chatInput.trim() && !isVoiceMode)}
                  className="bg-amber-600 text-white p-3 rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shrink-0 flex items-center justify-center active:scale-95"
                >
                  <Send className="w-5 h-5 translate-x-[-1px] translate-y-[1px]" />
                </button>
              </div>
              {isVoiceMode && (
                <div className="text-center text-xs text-red-500 font-bold mt-3 animate-pulse">
                  🎙️ 連續語音模式開啟中：說完問題將自動翻譯與送出，小幫手回答後會自動繼續聆聽...
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Custom Modal */}
      {modalConfig.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#5C4D43] mb-2">{modalConfig.title}</h3>
              <div className="text-[#5C4D43]/80 leading-relaxed">
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
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-[#E8DCCB] text-[#5C4D43] hover:bg-[#DFCDB8] transition-all"
                  >
                    確定
                  </button>
                </>
              ) : (
                <button
                  onClick={closeModals}
                  className="w-full py-3 px-4 rounded-xl font-bold bg-[#E8DCCB] text-[#5C4D43] hover:bg-[#DFCDB8] transition-all"
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
