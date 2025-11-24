export const extractJson = (text: string): any => {
    // 1. ```json ... ``` ブロックを探す
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return JSON.parse(match[1]);
    }

    // 2. ブロックがない場合、配列 [...] または オブジェクト {...} を探す
    const firstOpenBrace = text.indexOf('{');
    const firstOpenBracket = text.indexOf('[');
    
    let start = -1;
    let end = -1;

    // 配列とオブジェクト、どちらが先に出現するかで判定
    if (firstOpenBracket !== -1 && (firstOpenBrace === -1 || firstOpenBracket < firstOpenBrace)) {
        // 配列として認識 ([ で始まり ] で終わる)
        start = firstOpenBracket;
        end = text.lastIndexOf(']');
    } else if (firstOpenBrace !== -1) {
        // オブジェクトとして認識 ({ で始まり } で終わる)
        start = firstOpenBrace;
        end = text.lastIndexOf('}');
    }

    if (start === -1 || end === -1 || end < start) {
        throw new Error("AIの応答に有効なJSONが含まれていません。");
    }

    const jsonString = text.substring(start, end + 1);
    return JSON.parse(jsonString);
};