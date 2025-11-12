import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { IStaff, IShiftPattern, db, IAssignment, IUnit } from '../db/dexie'; // ★★★ v5: IAssignment, IUnit をインポート
import { GeminiApiClient } from '../api/geminiApiClient'; 

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


interface AssignmentState {
  assignments: IAssignment[]; // ★★★ v5: IAssignment[] ★★★
  // (※ requiredSlots は廃止)
  adviceLoading: boolean;
  adviceError: string | null;
  adviceResult: string | null;
}

const initialState: AssignmentState = {
  assignments: [],
  adviceLoading: false,
  adviceError: null,
  adviceResult: null,
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
    }
  },
  extraReducers: (builder) => {
    builder
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
        state.error = action.payload as string;
      });
  }
});

export const { setAssignments, clearAdvice } = assignmentSlice.actions;
export default assignmentSlice.reducer;