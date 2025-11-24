import { getGenerativeModel } from "firebase/ai";
import { aiLogic } from "../firebaseConfig";

export class GeminiApiClient {
  private modelId: string = "gemini-1.5-Pro";

  constructor() {
    const storedModel = localStorage.getItem('geminiModelId');
    if (storedModel) {
      let cleanId = storedModel.replace('models/', '');
      this.modelId = cleanId;
    }
  }

  get isAvailable(): boolean {
    return !!aiLogic;
  }

  static async listAvailableModels(): Promise<any[]> {
    return [
      { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash (高速・最新)' },
      { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro (高性能・最新)' },
    ];
  }

  // ★★★ ノンブロッキング入力フォーム生成 (DOM直接操作) ★★★
  private async waitForManualInput(): Promise<string> {
    return new Promise((resolve, reject) => {
      // オーバーレイ作成
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '99999',
        display: 'flex', justifyContent: 'center', alignItems: 'center'
      });

      // ダイアログ作成
      const dialog = document.createElement('div');
      Object.assign(dialog.style, {
        backgroundColor: 'white', padding: '20px', borderRadius: '8px',
        width: '500px', maxWidth: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', gap: '10px'
      });

      // タイトル
      const title = document.createElement('h3');
      title.textContent = '🛠️ APIなしモード (Developer Backdoor)';
      title.style.margin = '0 0 10px 0';
      title.style.color = '#ed6c02';

      // 説明
      const desc = document.createElement('p');
      desc.innerHTML = 'プロンプトはクリップボードにコピー済みです。<br>AIに貼り付けて実行し、結果のJSONをここに貼り付けてください。<br>(この画面中でもDevToolsは操作可能です)';
      desc.style.fontSize = '0.9rem';
      desc.style.color = '#666';

      // テキストエリア
      const textarea = document.createElement('textarea');
      textarea.placeholder = 'ここにJSONを貼り付け...';
      textarea.rows = 10;
      Object.assign(textarea.style, {
        width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc',
        fontFamily: 'monospace', fontSize: '0.8rem'
      });

      // ボタンコンテナ
      const btnContainer = document.createElement('div');
      Object.assign(btnContainer.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });

      // ペーストボタン
      const pasteBtn = document.createElement('button');
      pasteBtn.textContent = '📋 クリップボードからペースト';
      Object.assign(pasteBtn.style, {
        padding: '8px 16px', cursor: 'pointer', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px'
      });
      pasteBtn.onclick = async () => {
        try {
          const text = await navigator.clipboard.readText();
          textarea.value = text;
        } catch (e) {
          alert('クリップボードの読み取りに失敗しました。手動で貼り付けてください。');
        }
      };

      // 完了ボタン
      const submitBtn = document.createElement('button');
      submitBtn.textContent = '完了 (Resolve)';
      Object.assign(submitBtn.style, {
        padding: '8px 16px', cursor: 'pointer', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold'
      });

      // キャンセルボタン
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'キャンセル';
      Object.assign(cancelBtn.style, {
        padding: '8px 16px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid #ccc', borderRadius: '4px'
      });

      // イベントハンドラ
      const cleanup = () => document.body.removeChild(overlay);

      submitBtn.onclick = () => {
        const val = textarea.value.trim();
        if (!val) {
          alert('JSONを入力してください。');
          return;
        }
        cleanup();
        resolve(val);
      };

      cancelBtn.onclick = () => {
        cleanup();
        reject(new Error('手動入力がキャンセルされました。'));
      };

      // 組み立て
      btnContainer.appendChild(pasteBtn);
      btnContainer.appendChild(cancelBtn);
      btnContainer.appendChild(submitBtn);
      dialog.appendChild(title);
      dialog.appendChild(desc);
      dialog.appendChild(textarea);
      dialog.appendChild(btnContainer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // テキストエリアにフォーカス
      textarea.focus();
    });
  }

  async generateContent(promptText: string): Promise<string> {
    try {
      const isNoApiMode = localStorage.getItem('noApiMode') === 'true';
      
      if (isNoApiMode) {
        console.log("--- [No API Mode] Generated Prompt ---");
        console.log(promptText);
        console.log("--------------------------------------");

        // 1. プロンプトをクリップボードにコピー
        try {
          await navigator.clipboard.writeText(promptText);
          // 成功してもあえてアラートは出さず、UIで通知する
        } catch (err) {
          console.error("Clipboard write failed", err);
        }

        // 2. ノンブロッキングな独自UIで入力を待つ
        return await this.waitForManualInput();
      }

      // 通常モード
      const model = getGenerativeModel(aiLogic, { model: this.modelId });
      const result = await model.generateContent(promptText);
      const response = await result.response;
      const text = response.text();

      if (!text) throw new Error("AIからの応答が空でした。");
      return text;

    } catch (e: any) {
      console.error("AI Logic Error:", e);
      throw new Error(`AI生成エラー: ${e.message}`);
    }
  }
}