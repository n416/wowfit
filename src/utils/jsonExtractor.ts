// 簡易的なJSON抽出関数
// (vite-dashboard-demo/src/components/KnowledgeSetupAssistant.jsx の extractJson をベース)
export const extractJson = (text: string): any => {
    // 1. ```json ... ``` ブロックを探す
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return JSON.parse(match[1]);
    }

    // 2. ブロックがない場合、最初の { から最後の } までを強引に切り出す
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        throw new Error("AIの応答に有効なJSONオブジェクトが含まれていません。");
    }

    const jsonString = text.substring(firstBrace, lastBrace + 1);
    return JSON.parse(jsonString);
};