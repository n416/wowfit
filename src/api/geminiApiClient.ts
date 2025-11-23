import { getGenerativeModel } from "firebase/ai";
import { aiLogic } from "../firebaseConfig";

export class GeminiApiClient {
  private modelId: string = "gemini-2.5-Pro";

  constructor() {
    const storedModel = localStorage.getItem('geminiModelId');
    if (storedModel) {
      // "models/..." のプレフィックス対策と、古い "1.5" 設定の自動修正
      let cleanId = storedModel.replace('models/', '');
      this.modelId = cleanId;
    }
  }

  get isAvailable(): boolean {
    return !!aiLogic;
  }

  static async listAvailableModels(): Promise<any[]> {
    // ★修正: リストも現行モデルに更新
    return [
      { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (高速・最新)' },
      { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro (高性能・最新)' },
    ];
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const model = getGenerativeModel(aiLogic, { model: this.modelId });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text) throw new Error("AIからの応答が空でした。");
      return text;

    } catch (e: any) {
      console.error("AI Logic Error:", e);
      // エラーメッセージを少し親切に
      throw new Error(`AI生成エラー: ${e.message}`);
    }
  }
}