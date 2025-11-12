import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { IStaff, IShiftPattern, db, IAssignment, IUnit } from '../db/dexie'; // ★★★ v5: IAssignment, IUnit をインポート
import { GeminiApiClient } from '../api/geminiApiClient'; 
import { extractJson } from '../utils/jsonExtractor'; // ★ v5.8 JSON抽出関数をインポート

// ★★★ v5修正: AI助言Thunk (v5スキーマ) ★★★
// (「このスタッフの、この日のアサインをどうすべきか？」をAIに問う)
interface FetchAdviceArgs {
  targetDate: string;
  targetStaff: IStaff;
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[]; // ★★★ v5: ユニットのデマンド情報を渡す
  burdenData: any; 
  allAssignments: IAssignment[];
}

export const fetchAssignmentAdvice = createAsyncThunk(
  'assignment/fetchAdvice',
  async (args: FetchAdviceArgs, { rejectWithValue }) => {
    const { targetDate, targetStaff, allStaff, allPatterns, allUnits, burdenData, allAssignments } = args;

    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    
    // ★★★ 修正: v5 スキーマ (デマンド) に基づいたプロンプト ★★★
    const prompt = `あなたは勤務スケジュールアシスタントです。管理者が「${targetStaff.name}」の「${targetDate}」のアサインを手動で調整しようとしています。
以下の状況を分析し、管理者が**次に行うべきアクション（ネゴシエーション）**を具体的に助言してください。

# 1. 調整対象のスタッフ
- 氏名: ${targetStaff.name} (ID: ${targetStaff.staffId})
- 所属: ${targetStaff.unitId || 'フリー'}
- 勤務可能パターン: ${targetStaff.availablePatternIds.join(', ')}
- メモ: ${targetStaff.memo || '特になし'}

# 2. ユニット別・24時間デマンド（あるべき必要人数）
${JSON.stringify(allUnits)}

# 3. スタッフ全員の現在の負担状況
${JSON.stringify(burdenData, null, 2)}

# 4. 勤務パターン定義 (参考)
${JSON.stringify(allPatterns.map(p => ({ id: p.patternId, name: p.name, startTime: p.startTime, endTime: p.endTime, crossUnit: p.crossUnitWorkType, workType: p.workType })))}

# 5. 月全体のアサイン状況 (参考)
${JSON.stringify(allAssignments.filter(s => s.staffId), null, 2)}

# 指示 (最重要)
1. **デマンド分析**: ${targetDate} のデマンド（必要人数）に対し、現状のアサイン（Supply）は充足していますか？ 不足している時間帯はどこですか？
2. **候補パターンの選定**: 「${targetStaff.name}」の「勤務可能パターン」から、${targetDate} のデマンド不足を解消するために最適なパターン（「公休」や「有給」も含む）を提案してください。
3. **包括的な分析**: もし${targetDate}に労働パターンを割り当てると、連勤やインターバル、負担に問題が出ないか、月全体のアサイン状況を見て評価してください。
4. **ネゴシエーション支援**: もしスタッフのメモ（例：「AさんとNG」）と競合する場合、それを踏まえた「ネゴシエーション文例」も作成してください。
5. **形式**: 「デマンド分析: [不足状況]」「推奨: [パターンID (例: C, N, 公休)]」「理由: [なぜそのパターンか]」「ネゴ文例: [依頼メッセージ]」の形式で、自然言語で回答してください。`;

    try {
      const resultText = await gemini.generateContent(prompt);
      return resultText;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);


// ★★★ v5.8 追加: AIによる「全体調整」Thunk ★★★
interface FetchAiAdjustmentArgs {
  instruction: string; // (例: "夜勤さんXの夜勤を減らして")
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[]; // (現在の下書きアサイン)
  monthInfo: { year: number, month: number, days: any[] };
}

export const fetchAiAdjustment = createAsyncThunk(
  'assignment/fetchAiAdjustment',
  async (args: FetchAiAdjustmentArgs, { rejectWithValue }) => {
    const { instruction, allStaff, allPatterns, allUnits, allAssignments, monthInfo } = args;

    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }

    const prompt = `あなたは勤務表の自動調整AIです。以下の入力に基づき、月全体の勤務表アサイン（IAssignment[]）を最適化し、修正後のアサイン配列「全体」をJSON形式で出力してください。

# 1. 管理者からの指示
${instruction || '特記事項なし。デマンド（必要人数）を満たし、スタッフの負担（特に連勤・インターバル・公休数）が公平になるよう全体を最適化してください。'}

# 2. スタッフ一覧 (勤務可能パターンと制約)
${JSON.stringify(allStaff, null, 2)}

# 3. 勤務パターン定義 (時間や種類)
${JSON.stringify(allPatterns, null, 2)}

# 4. ユニット別・24時間デマンド（あるべき必要人数）
${JSON.stringify(allUnits, null, 2)}

# 5. 現在のアサイン（下書き）
${JSON.stringify(allAssignments, null, 2)}

# 6. 対象月
${monthInfo.year}年 ${monthInfo.month}月 (${monthInfo.days.length}日間)

# 指示 (最重要)
1. **制約の遵守**: 必ず「スタッフ一覧」で定義された "constraints"（最大連勤・最短インターバル）と "availablePatternIds"（勤務可能パターン）を遵守してください。
2. **デマンドの充足**: 「ユニット別デマンド」を可能な限り満たすように、「労働」タイプのパターン（"workType": "Work"）を配置してください。
3. **公休の配置**: 「公休」（"workType": "StatutoryHoliday"）や「有給」（"workType": "PaidLeave"）は、"unitId": null としてアサインしてください。
4. **管理者の指示**: 「管理者からの指示」を最優先で考慮してください（例：「夜勤さんXの夜勤を減らす」）。
5. **出力形式**: 修正後のアサイン配列（IAssignment[]）「全体」を、以下のJSON形式でのみ出力してください。他のテキストは一切含めないでください。
\`\`\`json
[
  { "date": "2025-11-01", "staffId": "s001", "patternId": "N", "unitId": "U01" },
  { "date": "2025-11-01", "staffId": "s003", "patternId": "A", "unitId": "U01" },
  { "date": "2025-11-01", "staffId": "s007", "patternId": "半1", "unitId": "U01" },
  { "date": "2025-11-01", "staffId": "s002", "patternId": "公休", "unitId": null },
  ...
  { "date": "2025-11-30", "staffId": "s010", "patternId": "有給", "unitId": null }
]
\`\`\`
`;

    try {
      const resultText = await gemini.generateContent(prompt);
      const newAssignments: IAssignment[] = extractJson(resultText);
      
      // (※返ってきたJSONがIAssignmentの配列であるか簡易チェック)
      if (!Array.isArray(newAssignments) || newAssignments.length === 0 || !newAssignments[0].date || !newAssignments[0].staffId) {
        throw new Error("AIが不正な形式のJSONを返しました。");
      }
      
      // DBを全上書き
      await db.assignments.clear();
      await db.assignments.bulkPut(newAssignments);
      
      // (DBからID付きで再取得)
      const allAssignmentsFromDB = await db.assignments.toArray();
      return allAssignmentsFromDB;

    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);
// ★★★ v5.8 追加ここまで ★★★


interface AssignmentState {
  assignments: IAssignment[]; // ★★★ v5: IAssignment[] ★★★
  // (※ requiredSlots は廃止)
  adviceLoading: boolean;
  adviceError: string | null;
  adviceResult: string | null;
  // ★ v5.8 追加: 全体調整用のState
  adjustmentLoading: boolean; 
  adjustmentError: string | null;
}

const initialState: AssignmentState = {
  assignments: [],
  adviceLoading: false,
  adviceError: null,
  adviceResult: null,
  // ★ v5.8 追加
  adjustmentLoading: false,
  adjustmentError: null,
};

const assignmentSlice = createSlice({
  name: 'assignment',
  initialState,
  reducers: {
    // ★★★ v4: アサイン結果をセットする (「ざっくり埋める」や「手動更新」で使用) ★★★
    setAssignments: (state, action: PayloadAction<IAssignment[]>) => {
      state.assignments = action.payload;
    },
    // (※ setRequiredSlots は廃止)
    clearAdvice: (state) => {
      state.adviceLoading = false;
      state.adviceError = null;
      state.adviceResult = null;
    },
    // ★ v5.8 追加
    clearAdjustmentError: (state) => {
      state.adjustmentLoading = false;
      state.adjustmentError = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // (AI助言)
      .addCase(fetchAssignmentAdvice.pending, (state) => {
        state.adviceLoading = true;
        state.adviceError = null;
        state.adviceResult = null;
      })
      .addCase(fetchAssignmentAdvice.fulfilled, (state, action) => {
        state.adviceLoading = false;
        state.adviceResult = action.payload;
      })
      .addCase(fetchAssignmentAdvice.rejected, (state, action) => {
        state.adviceLoading = false;
        state.adviceError = action.payload as string; // ★ v5.8 修正: adviceError に
      })

      // ★ v5.8 追加: (AI全体調整)
      .addCase(fetchAiAdjustment.pending, (state) => {
        state.adjustmentLoading = true;
        state.adjustmentError = null;
      })
      .addCase(fetchAiAdjustment.fulfilled, (state, action: PayloadAction<IAssignment[]>) => {
        state.assignments = action.payload; // ★ AIの結果でアサイン全体を上書き
        state.adjustmentLoading = false;
      })
      .addCase(fetchAiAdjustment.rejected, (state, action) => {
        state.adjustmentLoading = false;
        state.adjustmentError = action.payload as string;
      });
  }
});

export const { setAssignments, clearAdvice, clearAdjustmentError } = assignmentSlice.actions; // ★ v5.8 clearAdjustmentError をエクスポート
export default assignmentSlice.reducer;