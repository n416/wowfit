export class GeminiApiClient {
  // プライベートフィールドをTypeScript形式に変更
  private geminiApiKey: string | null = null;
  private isKeyValid: boolean = false;
  private modelId: string | null = null;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor() {
    try {
      const storedKey = localStorage.getItem('geminiApiKey');
      if (storedKey) {
        this.geminiApiKey = storedKey;
        this.isKeyValid = true;
      } else {
        this.isKeyValid = false;
      }
      this.modelId = localStorage.getItem('geminiModelId');

    } catch (e) {
      console.error('Failed to access localStorage:', e);
      this.isKeyValid = false;
    }
  }

  get isAvailable(): boolean {
    return this.isKeyValid && !!this.modelId;
  }

  static async listAvailableModels(apiKey: string): Promise<any[]> {
    if (!apiKey) {
      throw new Error('APIキーがありません。');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || '不明なエラー';
      throw new Error(`モデルリストの取得に失敗しました (${response.status}): ${detail}`);
    }
    return data.models;
  }

  async generateContent(prompt: string): Promise<string> {
    if (!this.isAvailable || !this.modelId || !this.geminiApiKey) {
      throw new Error('Gemini APIキーまたはモデルIDが設定されていません。');
    }

    const cleanModelId = this.modelId.startsWith('models/') ? this.modelId.split('/')[1] : this.modelId;
    const apiUrl = `${this.baseUrl}/${cleanModelId}:generateContent?key=${this.geminiApiKey}`;

    const requestBody = {
      contents: [{ parts: [{ "text": prompt }] }],
      safetySettings: [
        { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
        { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
        { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
      ]
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data?.error?.message || '不明なエラー';
      throw new Error(`APIリクエストに失敗しました (${response.status}): ${detail}`);
    }

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error(`AIから有効な応答が得られませんでした。理由: 安全性設定によりブロックされました。`);
      }
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '不明';
      throw new Error(`AIから有効な応答が得られませんでした。理由: ${reason}`);
    }
    return data.candidates[0].content.parts[0].text;
  }
}