import React, { useState, useEffect } from 'react';
import { ShoppingItem } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { ShoppingBag, CheckCircle2, Circle, ArrowRight, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ShoppingView({ pregWeek }: { pregWeek: number }) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    const isAdmin = auth.currentUser.email === 'jason2134@gmail.com' || auth.currentUser.email === 'user@gmail.com';
    const q = isAdmin 
      ? query(collection(db, 'shoppingItems'))
      : query(collection(db, 'shoppingItems'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingItem));
      // Sort by status, then suggested week
      fetchedItems.sort((a, b) => {
        if (a.isPurchased && !b.isPurchased) return 1;
        if (!a.isPurchased && b.isPurchased) return -1;
        return (a.suggestedWeek || 0) - (b.suggestedWeek || 0);
      });
      setItems(fetchedItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'shoppingItems');
    });

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const detectTargetField = (name: string, category: string): string => {
    const lowerName = name.toLowerCase();
    const lowerCat = category.toLowerCase();

    // 1. Check explicit mentions in the category string
    if (lowerCat.includes('工具') || lowerCat.includes('器具')) return 'tools';
    if (lowerCat.includes('調味') || lowerCat.includes('醬')) return 'seasonings';
    if (lowerCat.includes('食材') || lowerCat.includes('鮮食') || lowerCat.includes('飲品')) return 'ingredients';

    // 2. Check keywords in the name for specific categories
    // Seasonings
    const seasoningKeywords = ['醬', '油', '鹽', '糖', '醋', '粉', '精', '味', '胡椒', '咖哩', '味噌', '露', '草'];
    if (seasoningKeywords.some(k => lowerName.includes(k))) return 'seasonings';

    // Tools
    const toolKeywords = ['鍋', '鏟', '機', '秤', '盒', '切', '磨', '盤', '夾', '刷', '刀', '板', '勺', '碗'];
    if (toolKeywords.some(k => lowerName.includes(k))) return 'tools';

    // Ingredients
    const ingredientKeywords = ['肉', '魚', '蛋', '奶', '菜', '果', '雞', '豬', '牛', '海鮮', '麵', '米', '飲'];
    if (ingredientKeywords.some(k => lowerName.includes(k))) return 'ingredients';

    // Fallback if we still don't know but it says "食材"
    if (lowerCat.includes('食材')) return 'ingredients';
    
    return '';
  };

  const togglePurchased = async (item: ShoppingItem) => {
    try {
      const newStatus = !item.isPurchased;
      await updateDoc(doc(db, 'shoppingItems', item.id), {
        isPurchased: newStatus,
        updatedAt: serverTimestamp()
      });

      if (newStatus && auth.currentUser) {
        const targetField = detectTargetField(item.name, item.category || '');

        if (targetField) {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            [targetField]: arrayUnion(item.name),
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `shoppingItems/${item.id}`);
    }
  };

  const deleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'shoppingItems', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `shoppingItems/${id}`);
    }
  };

  const addItem = async () => {
    if (!newItemName.trim() || !auth.currentUser) return;
    const name = newItemName.trim();
    
    // Auto-detect category for better UI
    let detectedCategory = '一般';
    const targetField = detectTargetField(name, '');
    if (targetField === 'ingredients') detectedCategory = '食材';
    else if (targetField === 'tools') detectedCategory = '工具';
    else if (targetField === 'seasonings') detectedCategory = '調味料';

    try {
      await addDoc(collection(db, 'shoppingItems'), {
        userId: auth.currentUser.uid,
        name,
        category: detectedCategory,
        isPurchased: false,
        suggestedWeek: pregWeek,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewItemName('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'shoppingItems');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fdfbf7]">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shrink-0">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-amber-900">採購規劃清單</h2>
            <p className="text-amber-700/70 text-sm mt-1">
              隨時記錄老婆與寶寶需要的用品，AI 也會依照週數建議需要準備的東西！
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="新增採買項目..."
            className="flex-1 rounded-2xl border-none ring-1 ring-inset ring-amber-200 bg-white px-4 py-3 text-amber-900 focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
          <button 
            onClick={addItem}
            className="px-6 py-3 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 transition flex items-center gap-2 shadow-sm"
          >
            新增 <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          {items.map(item => (
            <div 
              key={item.id} 
              onClick={() => togglePurchased(item)}
              className={cn(
                "group flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-300",
                item.isPurchased 
                  ? "bg-slate-50 border-slate-200 opacity-60" 
                  : "bg-white border-amber-100 shadow-sm hover:shadow-md hover:border-amber-300"
              )}
            >
              <div className="flex items-center gap-4">
                {item.isPurchased ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-6 h-6 text-amber-300 shrink-0 group-hover:text-amber-500" />
                )}
                <div>
                  <h3 className={cn("font-bold text-lg", item.isPurchased ? "text-slate-500 line-through" : "text-amber-900")}>
                    {item.name}
                  </h3>
                  <div className="flex gap-2 mt-1">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-md font-medium",
                      item.isPurchased ? "bg-slate-200 text-slate-500" : "bg-amber-100 text-amber-700"
                    )}>
                      {item.category}
                    </span>
                    {item.suggestedWeek !== undefined && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-md font-medium",
                        item.isPurchased ? "bg-blue-50 text-slate-500" : "bg-blue-50 text-blue-700"
                      )}>
                        建議週數：W{item.suggestedWeek}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={(e) => deleteItem(item.id!, e)}
                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 transition-all hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-12 text-amber-700/50">
              目前還沒有採買計畫，您可以直接新增，或讓 AI 分析並加入清單！
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
