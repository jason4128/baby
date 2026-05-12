import { GoogleGenAI } from "@google/genai";

export function getGeminiKeys(): string[] {
  // Try to get from localStorage first, fallback to process.env
  try {
    const keysStr = localStorage.getItem("GEMINI_API_KEYS");
    if (keysStr) {
      const parsed = JSON.parse(keysStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  const envs = [];
  try {
    if ((import.meta as any).env.VITE_GEMINI_API_KEY) envs.push((import.meta as any).env.VITE_GEMINI_API_KEY);
    if ((import.meta as any).env.VITE_GEMINI_API_KEY_2) envs.push((import.meta as any).env.VITE_GEMINI_API_KEY_2);
    if ((import.meta as any).env.VITE_GEMINI_API_KEY_3) envs.push((import.meta as any).env.VITE_GEMINI_API_KEY_3);
  } catch (e) {}
  
  if (envs.length > 0) return envs;

  const procs = [];
  try {
    // @ts-ignore
    if (process.env.GEMINI_API_KEY) procs.push(process.env.GEMINI_API_KEY);
    // @ts-ignore
    if (process.env.GEMINI_API_KEY_2) procs.push(process.env.GEMINI_API_KEY_2);
    // @ts-ignore
    if (process.env.GEMINI_API_KEY_3) procs.push(process.env.GEMINI_API_KEY_3);
  } catch(e) {}
  
  if (procs.length > 0) return procs;
  
  return [];
}

export function setGeminiKeys(keys: string[]) {
  try {
    const validKeys = keys.filter(k => k && k.trim() !== '');
    if (validKeys.length > 0) {
      localStorage.setItem("GEMINI_API_KEYS", JSON.stringify(validKeys));
    } else {
      localStorage.removeItem("GEMINI_API_KEYS");
    }
  } catch (e) {
    console.error("Local storage error", e);
  }
}

// Deprecated: use getGeminiKeys
export function getGeminiKey() {
  const keys = getGeminiKeys();
  return keys.length > 0 ? keys[0] : "";
}

// Deprecated: use setGeminiKeys
export function setGeminiKey(key: string) {
  setGeminiKeys([key]);
}

/**
 * Iterates over available API keys and tries to execute the given function.
 * If a quota/rate-limit error occurs, it tries the next key.
 */
export async function withKeyFallback<T>(operation: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const apiKeys = getGeminiKeys();
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error("請在『廚備設定』中設定您的 Gemini API Key！");
  }

  let lastError: any = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    const ai = new GoogleGenAI({ apiKey: key });
    try {
      return await operation(ai);
    } catch (e: any) {
      lastError = e;
      // If it's a quota or rate limit error, continue to next key. Otherwise throw immediately.
      const msg = e?.message?.toLowerCase() || '';
      if (msg.includes('quota') || msg.includes('429') || msg.includes('rate limit')) {
        console.warn(`Key ${i + 1} hit quota, trying next key...`);
        continue;
      }
      throw e;
    }
  }

  // If all keys failed with quota errors
  throw new Error("⚠️ 所有的 API Key 額度皆已用盡（Quota Exceeded）。請稍候再試或在「廚備設定」中更新您的 API Key。");
}

export async function chatWithConsultant(
  context: string,
  history: { role: "user" | "model"; parts: { text: string; inlineData?: any }[] }[],
  newMessage: string,
  base64Images: { mimeType: string; data: string }[] = []
) {
  try {
    const contents: any[] = history.map(h => ({
      role: h.role,
      parts: h.parts
    }));
    
    const currentMessageParts: any[] = [
      ...base64Images.map((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.data }
      })),
      { text: newMessage }
    ];
    
    contents.push({
      role: "user",
      parts: currentMessageParts
    });

    const response = await withKeyFallback(async (ai) => {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: context,
          temperature: 0.7,
          responseMimeType: "application/json",
        }
      });
      return resp;
    });

    const text = response.text;

    try {
      if (text) {
        return JSON.parse(text);
      }
    } catch (e) {
      console.error("JSON parse error:", e);
      return { consultantReply: text || "", recipes: [], shoppingItems: [] };
    }
    return { consultantReply: "No response text", recipes: [], shoppingItems: [] };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

export async function analyzeSettingsImage(base64Image: { mimeType: string; data: string }) {
  try {
    const prompt = `請分析圖片內容（可能是發票、明細或實體物品），辨識出有哪些：廚房工具、調味料、或食材料。
請務必回傳嚴格的 JSON 格式如下：
{
  "tools": ["工具1", "工具2"],
  "seasonings": ["調味料1", "調味料2"],
  "ingredients": ["食材1", "食材2"]
}
務必只回傳包含在 JSON 格式內的資料，不要加任何其他文字標記，不要使用 markdown。另外請特別注意，請將食材區分成「單一物品」（如黃椒和青椒應為獨立字串），並將商品名稱轉化為適合日常稱呼的名稱（例如只取食材名，過濾掉廠牌、重量或發票代碼等冗餘字眼）。若沒有該分類的物品請回傳空陣列 []。`;

    const response = await withKeyFallback(async (ai) => {
      const resp = await ai.models.generateContent({
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
      return resp;
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
    return { tools: [], seasonings: [], ingredients: [] };
  } catch (error) {
    console.error("Analyze image error", error);
    throw error;
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
}
