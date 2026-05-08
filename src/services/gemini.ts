import { GoogleGenAI } from "@google/genai";

export function getGeminiKey() {
  // Try to get from localStorage first, fallback to process.env
  try {
    return localStorage.getItem("GEMINI_API_KEY") || process.env.GEMINI_API_KEY;
  } catch (e) {
    return process.env.GEMINI_API_KEY;
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
    const contents = [
      ...history,
      {
        role: "user",
        parts: [
          ...base64Images.map((img) => ({
             inlineData: { mimeType: img.mimeType, data: img.data }
          })),
          { text: newMessage }
        ]
      }
    ];

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents as any,
      config: {
        systemInstruction: context,
        temperature: 0.7,
        responseMimeType: "application/json",
      }
    });

    try {
      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (e) {
      console.error("JSON parse error:", e);
      return { consultantReply: response.text || "", recipes: [], shoppingItems: [] };
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
