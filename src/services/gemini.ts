import { GoogleGenAI } from "@google/genai";

export function getGeminiKey() {
  // Try to get from localStorage first, fallback to process.env
  try {
    const local = localStorage.getItem("GEMINI_API_KEY");
    if (local) return local;
  } catch (e) {}

  try {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      return import.meta.env.VITE_GEMINI_API_KEY;
    }
  } catch (e) {}
  
  try {
    // @ts-ignore
    if (process.env.GEMINI_API_KEY) {
      // @ts-ignore
      return process.env.GEMINI_API_KEY;
    }
  } catch(e) {}
  
  return "";
}

export function setGeminiKey(key: string) {
  try {
    if (key) {
      localStorage.setItem("GEMINI_API_KEY", key);
    } else {
      localStorage.removeItem("GEMINI_API_KEY");
    }
  } catch (e) {
    console.error("Local storage error", e);
  }
}

function getGeminiClient() {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error("請在『廚備設定』中設定您的 Gemini API Key！");
  }
  return new GoogleGenAI({ apiKey });
}

export async function chatWithConsultant(
  context: string,
  history: { role: "user" | "model"; parts: { text: string; inlineData?: any }[] }[],
  newMessage: string,
  base64Images: { mimeType: string; data: string }[] = []
) {
  try {
    const ai = getGeminiClient();
    
    // Transform history to match new SDK structure if needed
    // But startChat isn't straightforward with custom parts in the new SDK sometimes.
    // Actually we can just build the parts array.
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: context,
        temperature: 0.7,
        responseMimeType: "application/json",
      }
    });

    // If there's history, we might need to recreate the chat history manually or just pass it as single request
    // Since we maintain history ourselves, we can just use generateContent instead of startChat, 
    // or just pass the whole contents array.
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

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        systemInstruction: context,
        temperature: 0.7,
        responseMimeType: "application/json",
      }
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
    const ai = getGeminiClient();
    
    const prompt = `請分析圖片內容（可能是發票、明細或實體物品），辨識出有哪些：廚房工具、調味料、或食材料。
請務必回傳嚴格的 JSON 格式如下：
{
  "tools": ["工具1", "工具2"],
  "seasonings": ["調味料1", "調味料2"],
  "ingredients": ["食材1", "食材2"]
}
務必只回傳包含在 JSON 格式內的資料，不要加任何其他文字標記，不要使用 markdown。另外請特別注意，請將食材區分成「單一物品」（如黃椒和青椒應為獨立字串），並將商品名稱轉化為適合日常稱呼的名稱（例如只取食材名，過濾掉廠牌、重量或發票代碼等冗餘字眼）。若沒有該分類的物品請回傳空陣列 []。`;

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
