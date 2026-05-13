import React, { useState, useEffect, useRef } from 'react';
import { differenceInDays } from 'date-fns';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Camera, Send, X, ChefHat, Settings, Info, Menu, Utensils, MessageSquare, Baby, ShoppingBag, LogIn, Mic, MicOff, ImagePlus, Loader2, Heart, ClipboardList, Building2 } from 'lucide-react';
import { chatWithConsultant, fileToBase64, getGeminiKeys, setGeminiKeys, analyzeSettingsImage } from './services/gemini';
import { BASE_SYSTEM_PROMPT, INITIAL_TOOLS, INITIAL_SEASONINGS, INITIAL_INGREDIENTS, CONCEPTION_DATE } from './constants';
import { cn } from './lib/utils';
import { AppTab } from './types';
import RecipesView from './components/RecipesView';
import RecordsView from './components/RecordsView';
import ShoppingView from './components/ShoppingView';
import WifeView from './components/WifeView';
import MilestonesView from './components/MilestonesView';
import PostpartumView from './components/PostpartumView';
import ChatView from './components/ChatView';

import LoginView from './components/LoginView';

import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, onSnapshot, getDocs, query, where } from 'firebase/firestore';

import { initDriveAuth } from './services/googleDrive';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('chat');

  const [tools, setTools] = useState<string[]>(INITIAL_TOOLS);
  const [seasonings, setSeasonings] = useState<string[]>(INITIAL_SEASONINGS);
  const [ingredients, setIngredients] = useState<string[]>(INITIAL_INGREDIENTS);
  
  const [newTool, setNewTool] = useState('');
  const [newSeasoning, setNewSeasoning] = useState('');
  const [newIngredient, setNewIngredient] = useState('');
  const [geminiKeysInput, setGeminiKeysInput] = useState<string[]>(() => {
    const keys = getGeminiKeys();
    return [
      keys[0] || '',
      keys[1] || '',
      keys[2] || ''
    ];
  });

  const [messages, setMessages] = useState<{ 
    role: 'user' | 'model'; 
    parts: { text: string; inlineData?: any }[];
    suggestions?: {
      recipes: any[];
      shoppingItems: any[];
    };
    saved?: boolean;
  }[]>([]);
  const [activeShoppingItems, setActiveShoppingItems] = useState<{id: string, name: string}[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  const [images, setImages] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isVoiceModeRef = useRef<boolean>(false);
  
  // Cleanup duplicates state
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [potentialDuplicates, setPotentialDuplicates] = useState<{group: string, items: string[]}[]>([]);
  const [cleanupSelection, setCleanupSelection] = useState<string[]>([]);

  // Import Image State
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importDrafts, setImportDrafts] = useState<{
    tools: {name: string, checked: boolean, exists: boolean}[],
    seasonings: {name: string, checked: boolean, exists: boolean}[],
    ingredients: {name: string, checked: boolean, exists: boolean}[]
  }>({ tools: [], seasonings: [], ingredients: [] });
  const settingsInputRef = useRef<HTMLInputElement>(null);

  const processSettingsImage = async (file: File) => {
    setIsImporting(true);
    try {
      const base64 = await fileToBase64(file);
      const data = await analyzeSettingsImage({ mimeType: file.type, data: base64 });
      
      const checkExists = (list: string[], item: string) => list.some(ex => ex.includes(item) || item.includes(ex));

      const newDrafts = {
        tools: (data.tools || []).map((t: string) => ({ name: t, exists: checkExists(tools, t), checked: !checkExists(tools, t) })),
        seasonings: (data.seasonings || []).map((t: string) => ({ name: t, exists: checkExists(seasonings, t), checked: !checkExists(seasonings, t) })),
        ingredients: (data.ingredients || []).map((t: string) => ({ name: t, exists: checkExists(ingredients, t), checked: !checkExists(ingredients, t) })),
      };

      if (newDrafts.tools.length === 0 && newDrafts.seasonings.length === 0 && newDrafts.ingredients.length === 0) {
        showModal('未偵測到內容', '無法從圖片中辨識出任何工具、調味料或食材。');
        setIsImporting(false);
        return;
      }

      setImportDrafts(newDrafts);
      setShowImportModal(true);
    } catch(err: any) {
      console.error(err);
      if (err.message?.includes('API Key')) {
        showModal('需要設定 API Key', err.message);
      } else {
        showModal('解析失敗', '無法解析圖片內容，請確認 API Key 可用或圖片清晰。');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleSettingsImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    await processSettingsImage(file);
    e.target.value = '';
  };

  const handleSettingsPaste = async (e: React.ClipboardEvent) => {
    // Only capture paste if we are in the settings tab
    if (activeTab !== 'settings') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) await processSettingsImage(file);
        break; // Process one image at a time
      }
    }
  };

  const confirmImport = () => {
    const newTools = importDrafts.tools.filter(t => t.checked).map(t => t.name);
    const newSeasonings = importDrafts.seasonings.filter(t => t.checked).map(t => t.name);
    const newIngredients = importDrafts.ingredients.filter(t => t.checked).map(t => t.name);

    if (newTools.length === 0 && newSeasonings.length === 0 && newIngredients.length === 0) {
      setShowImportModal(false);
      return;
    }

    const t = Array.from(new Set([...tools, ...newTools]));
    const s = Array.from(new Set([...seasonings, ...newSeasonings]));
    const i = Array.from(new Set([...ingredients, ...newIngredients]));

    setTools(t);
    setSeasonings(s);
    setIngredients(i);
    saveToFirebase({ tools: t, seasonings: s, ingredients: i });

    setShowImportModal(false);
    showModal('新增完成', `已成功新增備品！`);
  };

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
  const [oauthClientId, setOauthClientId] = useState<string>('');

  useEffect(() => {
    // Load oauthClientId from Firestore if exists
    if (user) {
      const loadConfig = async () => {
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().oauthClientId) {
          const clientId = snap.data().oauthClientId;
          setOauthClientId(clientId);
          initDriveAuth(clientId);
        }
      };
      loadConfig();
    }
  }, [user]);

  useEffect(() => {
    // Calculate current pregnancy week
    const now = new Date();
    const diffDays = differenceInDays(now, conceptionDate);
    setPregWeek(Math.floor(diffDays / 7));
    setPregDay(diffDays % 7);
  }, [conceptionDate]);

  useEffect(() => {
    if (!user) {
      setActiveShoppingItems([]);
      return;
    }
    const q = query(
      collection(db, 'shoppingItems'),
      where('userId', '==', user.uid),
      where('isPurchased', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveShoppingItems(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    }, (error) => {
      console.error(error);
    });
    return () => unsub();
  }, [user]);

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
              setUserProfile(data);
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

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'cmn-Hant-TW'; // Default to Traditional Chinese (Taiwan).

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setInput(prev => {
            const next = prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + finalTranscript;
            inputRef.current = next;
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
        if (isVoiceModeRef.current && !isLoadingRef.current) {
          if (inputRef.current.trim().length > 0) {
            handleSendRef.current?.();
          } else {
            // Restart if it just stopped without sending
            setTimeout(() => {
              if (isVoiceModeRef.current && !isLoadingRef.current) {
                try {
                  recognitionRef.current.start();
                } catch(e) {}
              }
            }, 500);
          }
        }
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      showModal('不支援語音輸入', '您的瀏覽器不支援語音輸入功能（建議使用 Chrome）。');
      return;
    }

    if (isVoiceMode) {
      setIsVoiceMode(false);
      isVoiceModeRef.current = false;
      if (isListening) recognitionRef.current.stop();
    } else {
      setIsVoiceMode(true);
      isVoiceModeRef.current = true;
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Microphone access error", e);
      }
    }
  };

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

  const handleCheckDuplicates = () => {
    const allItems = [...ingredients];
    const grouped = new Set<string>();
    const newPotentialDuplicates = [];
    
    for (let i = 0; i < allItems.length; i++) {
        if (grouped.has(allItems[i])) continue;
        const currentGroup = [allItems[i]];
        for (let j = i + 1; j < allItems.length; j++) {
            if (grouped.has(allItems[j])) continue;
            // simple fuzzy detection
            if (allItems[i].includes(allItems[j]) || allItems[j].includes(allItems[i])) {
               currentGroup.push(allItems[j]);
               grouped.add(allItems[j]);
            }
        }
        if (currentGroup.length > 1) {
            newPotentialDuplicates.push({ group: currentGroup[0], items: currentGroup });
            grouped.add(currentGroup[0]);
        }
    }
    
    if (newPotentialDuplicates.length > 0) {
      setPotentialDuplicates(newPotentialDuplicates);
      setCleanupSelection([]);
      setShowCleanupModal(true);
    } else {
      showModal('沒有重複食材', '目前您的食材庫內沒有發現需要整理的重複項目。');
    }
  };

  const performCleanup = () => {
    if (cleanupSelection.length === 0) {
      setShowCleanupModal(false);
      return;
    }
    const is = ingredients.filter(ing => !cleanupSelection.includes(ing));
    setIngredients(is);
    saveToFirebase({ ingredients: is });
    setShowCleanupModal(false);
    showModal('清理完成', `已成功清理 ${cleanupSelection.length} 個重複食材。`);
  };

  const removeIngredient = (i: string) => {
    const is = ingredients.filter(ing => ing !== i);
    setIngredients(is);
    saveToFirebase({ ingredients: is });
  };

  const categorizeIngredient = (item: string) => {
    const veggies = ['菜', '蔥', '蒜', '薑', '椒', '菇', '筍', '豆', '瓜', '蘿蔔', '薯', '茄'];
    const meats = ['豬', '牛', '雞', '羊', '肉', '排', '翅', '腿', '香腸', '火腿', '培根'];
    const seafood = ['魚', '蝦', '蟹', '貝', '蛤', '鮮', '魷', '花枝'];
    const diary = ['乳', '奶', '起司', '奶油', '優格', '蛋'];
    
    if (meats.some(v => item.includes(v))) return '肉類';
    if (seafood.some(v => item.includes(v))) return '海鮮';
    if (veggies.some(v => item.includes(v))) return '蔬菜/植物';
    if (diary.some(v => item.includes(v))) return '乳製品/蛋';
    return '其他';
  };

  const handleToggleIngredientShopping = async (ingredient: string) => {
    // Check if ingredient exists or partially matches active shopping items
    // Better strictly match name to toggle back explicitly
    const existing = activeShoppingItems.find(i => i.name === ingredient);
    if (existing) {
      // Mark it purchased to un-gray it
      try {
        await updateDoc(doc(db, 'shoppingItems', existing.id), {
          isPurchased: true,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `shoppingItems/${existing.id}`);
      }
    } else {
      // Add to shopping items to gray it out
      try {
        await addDoc(collection(db, 'shoppingItems'), {
          userId: user!.uid,
          name: ingredient,
          category: categorizeIngredient(ingredient),
          isPurchased: false,
          suggestedWeek: pregWeek,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'shoppingItems');
      }
    }
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

  const handleSendRef = useRef<() => void>(() => {});
  
  const handleSend = async () => {
    handleSendRef.current = handleSend;
    const currentInput = inputRef.current;
    if (!currentInput.trim() && images.length === 0) return;
    
    setIsLoading(true);
    isLoadingRef.current = true;
    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    let base64Images: { mimeType: string; data: string }[] = [];
    
    // add user message immediately
    const userParts: any[] = [];
    if (currentInput.trim()) userParts.push({ text: currentInput.trim() });
    
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
      inputRef.current = '';
      setImages([]);

      // Generate dynamic prompt
      // Generate dynamic prompt and attach inventory context directly to the user message for the AI's current awareness
      const inventoryContext = `
[系統庫存與狀態資訊]
- 老婆目前孕期：第 ${pregWeek} 週又 ${pregDay} 天
- 廚房工具：${tools.length > 0 ? tools.join('、') : '目前無紀錄'}
- 常備調味：${seasonings.length > 0 ? seasonings.join('、') : '目前無紀錄'}
- 現有食材：${ingredients.length > 0 ? ingredients.join('、') : '目前無紀錄'}
(請優先根據現有狀況與老婆目前的孕期階段提供建議，若食材不足請在回覆中建議採購)
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
      } else if (e?.message?.includes('API Key') || e?.message?.includes('API key not valid') || e?.message?.includes('401')) {
        errorMsg = '⚠️ API KEY 問題。請前往「廚備設定」重新檢查並儲存您的 Gemini API Key。';
      }
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: errorMsg }] }]);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      // Restart microphone if in continuous voice mode
      if (isVoiceModeRef.current && recognitionRef.current) {
        // slightly delay to ensure rendering happens
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch(e) {
            console.error("Resume mic error", e);
          }
        }, 300);
      }
    }
  };
  handleSendRef.current = handleSend;

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
    { id: 'wife', label: '老婆專區', icon: Heart },
    { id: 'milestones', label: '重要紀事', icon: ClipboardList },
    { id: 'postpartum', label: '產後護理', icon: Building2 },
    { id: 'chatroom', label: '家屬參與', icon: MessageSquare },
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

  const handleUpdateOauthClientId = async (clientId: string) => {
    setOauthClientId(clientId);
    if (user && clientId.trim()) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          oauthClientId: clientId,
          updatedAt: serverTimestamp()
        });
        initDriveAuth(clientId);
        showModal('✅ 設定已儲存', 'Google OAuth Client ID 已儲存並初始化。');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const renderContent = () => {
    if (activeTab === 'recipes') return <RecipesView tools={tools} seasonings={seasonings} ingredients={ingredients} pregWeek={pregWeek} />;
    if (activeTab === 'records') return <RecordsView pregWeek={pregWeek} pregDay={pregDay} conceptionDate={conceptionDate} onUpdateConceptionDate={handleUpdateConceptionDate} oauthClientId={oauthClientId} userProfile={userProfile} />;
    if (activeTab === 'shopping') return <ShoppingView pregWeek={pregWeek} />;
    if (activeTab === 'wife') return <WifeView pregWeek={pregWeek} />;
    if (activeTab === 'milestones') return <MilestonesView />;
    if (activeTab === 'postpartum') return <PostpartumView />;
    if (activeTab === 'chatroom') return <ChatView userProfile={userProfile} />;
    if (activeTab === 'settings') return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]" onPaste={handleSettingsPaste}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shrink-0">
                <Settings className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-amber-900">廚備與偏好設定</h2>
                <p className="text-amber-700/70 text-sm mt-1">
                  記錄家中現有的工具和食材。支援直接貼上(Ctrl+V)照片或上傳圖片。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input 
                type="file" 
                accept="image/*" 
                ref={settingsInputRef}
                className="hidden" 
                onChange={handleSettingsImageUpload} 
              />
              <button 
                onClick={() => settingsInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-[#FFF9F0] text-amber-700 rounded-xl hover:bg-amber-100 font-bold border border-amber-200 transition-colors shadow-sm disabled:opacity-50"
              >
                {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                {isImporting ? '解析中...' : '圖片匯入'}
              </button>
            </div>
          </div>
            
          <div className="space-y-6 bg-white p-6 rounded-3xl shadow-sm border border-amber-50">
            {/* User Profile Info */}
            <div className="pb-6 border-b border-amber-50">
              <h3 className="text-sm font-bold text-[#5C4D43] mb-3 flex items-center gap-2">個人身分設定</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-amber-900/60 mb-1.5 ml-1">我的暱稱</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={userProfile?.nickname || ''} 
                      onChange={e => setUserProfile((prev: any) => ({ ...prev, nickname: e.target.value }))}
                      onBlur={() => saveToFirebase({ nickname: userProfile?.nickname })}
                      className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                      placeholder="設定暱稱..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-900/60 mb-1.5 ml-1">頭貼連結 (URL)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={userProfile?.avatarUrl || ''} 
                      onChange={e => setUserProfile((prev: any) => ({ ...prev, avatarUrl: e.target.value }))}
                      onBlur={() => saveToFirebase({ avatarUrl: userProfile?.avatarUrl })}
                      className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                      placeholder="https://... (圖片連結)"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-900/60 mb-1.5 ml-1">留言角色身分</label>
                  <div className="flex bg-[#FFF9F0] p-1 rounded-xl border border-[#E8DCCB]">
                    {['mama', 'papa', 'guest'].map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          const newRole = r;
                          setUserProfile((prev: any) => ({ ...prev, role: newRole }));
                          saveToFirebase({ role: newRole });
                        }}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                          userProfile?.role === r 
                            ? "bg-amber-600 text-white shadow-sm" 
                            : "text-[#8B7355] hover:bg-white/50"
                        )}
                      >
                        {r === 'mama' ? '媽媽 🤱' : r === 'papa' ? '爸爸 👨‍🍼' : '訪客 👤'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

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
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#5C4D43] flex items-center gap-2">現有食材</h3>
                <button 
                  onClick={handleCheckDuplicates}
                  className="px-3 py-1 bg-[#FFF9F0] text-amber-700 text-xs font-bold rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  🧹 整理重複項目
                </button>
              </div>
              <div className="space-y-4 mb-4">
                {['蔬菜/植物', '肉類', '海鮮', '乳製品/蛋', '其他'].map(cat => {
                  const items = ingredients.filter(i => categorizeIngredient(i) === cat);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-2">
                      <div className="text-xs font-bold text-amber-900/60 pl-1">{cat}</div>
                      <div className="flex flex-wrap gap-2">
                        {items.map(i => {
                          const isDepleted = activeShoppingItems.some(item => item.name === i);
                          return (
                            <span 
                              key={i} 
                              onClick={() => handleToggleIngredientShopping(i)}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 font-medium text-sm rounded-xl border cursor-pointer transition-all active:scale-95",
                                isDepleted 
                                  ? "bg-slate-100 text-slate-400 border-slate-200 opacity-60" 
                                  : "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200"
                              )}
                              title={isDepleted ? "點擊標記為已購買" : "點擊標記為已用完(加入採購)"}
                            >
                              {i}
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeIngredient(i); }} 
                                className="text-current opacity-60 hover:opacity-100 hover:text-red-500 transition-colors ml-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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

            {/* Google Drive Settings */}
            <div className="mt-8 pt-6 border-t border-amber-100">
               <h3 className="text-sm font-bold text-[#5C4D43] mb-3 flex items-center gap-2">Google Drive 雲端儲存</h3>
               <p className="text-sm text-amber-800/70 mb-4">
                 由於資料庫大小限制，照片與影片將儲存於您的 Google Drive。請提供 Google Cloud Console 的 OAuth Client ID。
               </p>
               <div className="space-y-3">
                  <div className="flex gap-2 items-center">
                    <span className="text-sm font-bold text-amber-900/60 w-24 text-right">Client ID:</span>
                    <input 
                      type="text" 
                      value={oauthClientId} 
                      onChange={e => setOauthClientId(e.target.value)}
                      className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                      placeholder="輸入 OAuth Client ID..."
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={() => handleUpdateOauthClientId(oauthClientId)}
                      className="px-6 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold transition-colors">
                      儲存 Google 設定
                    </button>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mt-2">
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      💡 <strong>如何取得 Client ID？</strong><br/>
                      1. 前往 <a href="https://console.cloud.google.com/" target="_blank" className="text-amber-600 underline">Google Cloud Console</a><br/>
                      2. 建立專案並在「API 和服務」中開啟 Google Drive API<br/>
                      3. 在「憑證」中建立「OAuth 2.0 用戶端 ID」（類型選 Web Application）<br/>
                      4. 在「已授權的 JavaScript 來源」加入 <code>{window.location.origin}</code><br/>
                      5. 複製 Client ID 並貼到上方。
                    </p>
                  </div>
               </div>
            </div>

            {/* API Keys */}
            <div className="mt-8 pt-6 border-t border-amber-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#5C4D43] flex items-center gap-2">Gemini API Keys</h3>
                {getGeminiKeys().length > 0 ? (
                  <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">已設定 {getGeminiKeys().length} 組</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">未設定 (使用系統預設)</span>
                )}
              </div>
              <p className="text-sm text-amber-800/70 mb-3">
                您可以設定最多 3 組 Gemini API Key。當第 1 組用完額度（Quota Exceeded）時，系統會自動切換至第 2 組，依此類推。（金鑰僅存於瀏覽器）
              </p>
              
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <span className="text-sm font-bold text-amber-900/60 w-12 text-right">第 {index + 1} 組:</span>
                    <input 
                      type="password" 
                      value={geminiKeysInput[index] || ''} 
                      onChange={e => {
                        const newInputs = [...geminiKeysInput];
                        newInputs[index] = e.target.value;
                        setGeminiKeysInput(newInputs);
                      }}
                      className="flex-1 bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43]"
                      placeholder={`輸入第 ${index + 1} 組 Gemini API Key...`}
                    />
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <button 
                    onClick={() => {
                      const validKeys = geminiKeysInput.filter(k => k.trim());
                      if (validKeys.length === 0) {
                        setGeminiKeys([]);
                        showModal('API Key 已清除', '已清除所有自訂 API Key，系統將嘗試使用預設金鑰。');
                      } else {
                        setGeminiKeys(geminiKeysInput);
                        showModal('✅ API Keys 已儲存', `已成功儲存 ${validKeys.length} 組 API Key！顧問功能現在將套用自動備援機制。`);
                      }
                      
                      const keys = getGeminiKeys();
                      setGeminiKeysInput([
                        keys[0] || '',
                        keys[1] || '',
                        keys[2] || ''
                      ]);
                    }} 
                    className="px-6 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold transition-colors">
                    儲存金鑰設定
                  </button>
                </div>
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
            <button
               onClick={toggleListening}
               className={cn("shrink-0 p-3 rounded-2xl transition-colors border shadow-sm flex items-center justify-center cursor-pointer",
                 isVoiceMode ? "bg-red-50 text-red-600 border-red-200 animate-pulse hover:bg-red-100" : "bg-[#FFF9F0] text-amber-700 hover:bg-amber-100 border-amber-200"
               )}
               title={isVoiceMode ? "停止連續語音" : "開啟連續語音問答"}
            >
               {isVoiceMode ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
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
              onChange={e => {
                setInput(e.target.value);
                inputRef.current = e.target.value;
              }}
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

      {/* Cleanup Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#5C4D43] mb-4">發現以下可能重複的食材</h3>
              <p className="text-sm text-[#5C4D43]/80 mb-4">勾選要移除的重複項目：</p>
              
              <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                {potentialDuplicates.map((group, gIdx) => (
                  <div key={gIdx} className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                    <div className="text-sm font-bold text-amber-900 mb-2 border-b border-amber-200 pb-1">
                      群組：{group.group}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, iIdx) => (
                        <label key={iIdx} className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 bg-white border-amber-300"
                            checked={cleanupSelection.includes(item)}
                            onChange={(e) => {
                              if (e.target.checked) setCleanupSelection(prev => [...prev, item]);
                              else setCleanupSelection(prev => prev.filter(v => v !== item));
                            }}
                          />
                          <span className="text-sm text-amber-800">{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-amber-50/50 p-4 flex gap-3">
              <button
                onClick={() => setShowCleanupModal(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-[#5C4D43]/60 hover:bg-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={performCleanup}
                className="flex-1 py-3 px-4 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-all shadow-md shadow-red-200"
              >
                刪除 ({cleanupSelection.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#5C4D43] mb-4">圖片解析結果</h3>
              <p className="text-sm text-[#5C4D43]/80 mb-4">請確認要加入的項目（已自動排除可能重複的項目）：</p>
              
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                {['tools', 'seasonings', 'ingredients'].map((catKey: string) => {
                   const labelMap: Record<string, string> = { tools: '工具', seasonings: '調味料', ingredients: '食材' };
                   const items = importDrafts[catKey as keyof typeof importDrafts];
                   if (items.length === 0) return null;
                   return (
                     <div key={catKey} className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                       <div className="text-sm font-bold text-amber-900 mb-2 border-b border-amber-200 pb-1">
                         {labelMap[catKey]}
                       </div>
                       <div className="space-y-2">
                         {items.map((item, iIdx) => (
                           <label key={iIdx} className="flex items-center gap-3 cursor-pointer">
                             <input 
                               type="checkbox" 
                               className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 bg-white border-amber-300"
                               checked={item.checked}
                               onChange={(e) => {
                                 const checked = e.target.checked;
                                 setImportDrafts(prev => {
                                   const newList = [...prev[catKey as keyof typeof prev]];
                                   newList[iIdx].checked = checked;
                                   return { ...prev, [catKey]: newList };
                                 });
                               }}
                             />
                             <span className={cn("text-sm transition-colors", item.exists ? "text-amber-800/50 line-through" : "text-amber-800")}>
                               {item.name} {item.exists && '(疑似已存在)'}
                             </span>
                           </label>
                         ))}
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
            
            <div className="bg-amber-50/50 p-4 flex gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-[#5C4D43]/60 hover:bg-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmImport}
                className="flex-1 py-3 px-4 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-md shadow-amber-200"
              >
                匯入選擇項目
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
