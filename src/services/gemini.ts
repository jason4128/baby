import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
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
