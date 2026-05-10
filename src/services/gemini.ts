import { GoogleGenAI } from "@google/genai";

export function getGeminiKey() {
  // Try to get from localStorage first, fallback to process.env
  try {
    // @ts-ignore
    return localStorage.getItem("GEMINI_API_KEY") || import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch (e) {
    return "";
  }
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
    throw new Error("請先在側邊欄設定您的 Gemini API Key！");
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
