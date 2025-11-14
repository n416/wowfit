import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { IStaff, IShiftPattern, db, IAssignment, IUnit } from '../db/dexie'; 
import { GeminiApiClient } from '../api/geminiApiClient'; 
import { extractJson } from '../utils/jsonExtractor'; 

// (FetchAdviceArgs, fetchAssignmentAdvice は変更なし)
interface FetchAdviceArgs {
  targetDate: string;
  targetStaff: IStaff;
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[]; 
  burdenData: any; 
  allAssignments: IAssignment[];
}

export const fetchAssignmentAdvice = createAsyncThunk(
  'assignment/fetchAdvice',
  async (args: FetchAdviceArgs, { rejectWithValue }) => {
    const { targetDate, targetStaff, allPatterns, allUnits, burdenData, allAssignments } = args;

    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    
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


// AIによる「全体調整（草案作成）」Thunk
interface FetchAiAdjustmentArgs {
  instruction: string; 
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[]; 
  monthInfo: { year: number, month: number, days: any[] };
  staffHolidayRequirements: Map<string, number>; 
}

export const fetchAiAdjustment = createAsyncThunk(
  'assignment/fetchAiAdjustment',
  async (args: FetchAiAdjustmentArgs, { rejectWithValue }) => {
    console.log("★ AI草案作成: Thunk (fetchAiAdjustment) 開始");
    
    const { instruction, allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;

    const gemini = new GeminiApiClient();
    console.log("★ AI草案作成: API利用可能かチェック...", { isAvailable: gemini.isAvailable });
    if (!gemini.isAvailable) {
      console.error("★ AI草案作成: APIが利用不可 (設定ページを確認してください)");
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    
    const defaultHolidayCount = getDefaultRequiredHolidays(monthInfo.days);

    // ★★★ v5.14 修正: Rentalスタッフの特別扱いロジックを削除 ★★★
    const staffWithHolidayReq = allStaff.map(staff => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || defaultHolidayCount 
    }));
    
    // ★★★ v5.14 修正: Rentalスタッフに関する指示を削除 ★★★
    // ★★★ v5.23 修正: 「パートのみ禁止」ルールを追加 ★★★
    const prompt = `あなたは勤務表の自動調整AIです。以下の入力に基づき、月全体の勤務表アサイン（IAssignment[]）を最適化し、修正後のアサイン配列「全体」をJSON形式で出力してください。

# 1. 管理者からの指示
${instruction || '特記事項なし。デマンド（必要人数）を満たし、スタッフの負担（特に連勤・インターバル・公休数）が公平になるよう全体を最適化してください。'}

# 2. スタッフ一覧 (勤務可能パターンと制約、★必要公休数)
${JSON.stringify(staffWithHolidayReq, null, 2)}

# 3. 勤務パターン定義 (時間や種類)
${JSON.stringify(allPatterns, null, 2)}

# 4. ユニット別・24時間デマンド（あるべき必要人数）
${JSON.stringify(allUnits, null, 2)}

# 5. 現在のアサイン（下書き）
${JSON.stringify(allAssignments, null, 2)}

# 6. 対象月
${monthInfo.year}年 ${monthInfo.month}月 (${monthInfo.days.length}日間)
(参考: この月のデフォルト公休数は ${defaultHolidayCount} 日です)

# 指示 (最重要)
1. **ロックされたアサインの維持 (最重要)**: 「現在のアサイン」のうち、 \`"locked": true\` が設定されているアサインは、**絶対に変更してはなりません (MUST NOT change)**。修正後のJSONにも、これらのアサインをそのまま含めてください。
2. **必要公休数の厳守 (重要)**: 「スタッフ一覧」で各スタッフに定義された \`"requiredHolidays"\` の日数を、**厳密に（STRICTLY）守ってください**。この日数と「公休」（"workType": "StatutoryHoliday"）のアサイン回数が一致するようにしてください。
3. **0.5人デマンドのルール**: 
   - 「ユニット別デマンド」に \`0.5\` が設定されている場合、**2つのユニットを合計して \`1.0\`** とし、'crossUnitWorkType: \\'有\\'' または '\\'サポート\\'' が可能なスタッフ1名（1.0人）を割り当てることで**両方**を満たせます。
   - アサインする際は、片方のユニット（例：ユニットA）に \`"unitId": "U01"\` としてアサインすれば、AI側で両方（U01とU02）が満たされたと解釈します。
4. **★ パートスタッフのみのシフト禁止 (重要)**: 
   - 勤務が割り当てられている（「公休」「有給」以外）時間帯において、**パートスタッフ（"employmentType": "PartTime"）だけにならないようにしてください。**
   - どの時間帯・どのユニットにおいても、デマンドが1以上ある場合は、最低1名は常勤スタッフ（"employmentType": "FullTime"）が含まれるように配置してください。
5. **制約の遵守**: 「スタッフ一覧」で定義された "constraints"（最大連勤・最短インターバル）と "availablePatternIds"（勤務可能パターン）を遵守してください（ロックされたアサインは除く）。
6. **デマンドの充足**: 可能な限りデマンドを満たしてください。
7. **公休の配置**: 公休・有給は \`unitId: null\` としてください。
8. **管理者の指示**: 「管理者からの指示」を（上記1〜5の制約の次に）優先して考慮してください。
9. **出力形式**: 修正後のアサイン配列（IAssignment[]）「全体」を、以下のJSON形式でのみ出力してください。他のテキストは一切含めないでください。
\`\`\`json
[
  { "date": "2025-11-01", "staffId": "s001", "patternId": "N", "unitId": "U01", "locked": true },
  { "date": "2025-11-01", "staffId": "s003", "patternId": "A", "unitId": "U01" },
  { "date": "2025-11-01", "staffId": "s007", "patternId": "半1", "unitId": "U01" },
  { "date": "2025-11-01", "staffId": "s002", "patternId": "公休", "unitId": null },
  ...
  { "date": "2025-11-30", "staffId": "s010", "patternId": "有給", "unitId": null }
]
\`\`\`
`;

    try {
      console.log("★ AI草案作成: APIにプロンプトを送信します (これ以降、時間がかかります)");
      const resultText = await gemini.generateContent(prompt);
      console.log("★ AI草案作成: APIから応答受信。JSONを解析します。");

      const newAssignments: IAssignment[] = extractJson(resultText);
      
      if (!Array.isArray(newAssignments) || newAssignments.length === 0 || !newAssignments[0].date || !newAssignments[0].staffId) {
        throw new Error("AIが不正な形式のJSONを返しました。");
      }
      
      await db.assignments.clear();
      await db.assignments.bulkPut(newAssignments);
      
      const allAssignmentsFromDB = await db.assignments.toArray();
      return allAssignmentsFromDB;

    } catch (e: any) {
      console.error("★ AI草案作成: APIリクエストまたはJSON解析でエラー発生", e);
      return rejectWithValue(e.message);
    }
  }
);


// AIによる「現況分析」Thunk
interface FetchAiAnalysisArgs {
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[]; 
  monthInfo: { year: number, month: number, days: any[] };
  staffHolidayRequirements: Map<string, number>;
}

export const fetchAiAnalysis = createAsyncThunk(
  'assignment/fetchAiAnalysis',
  async (args: FetchAiAnalysisArgs, { rejectWithValue }) => {
    const { allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;

    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    
    // ★★★ v5.14 修正: Rentalスタッフの特別扱いロジックを削除 ★★★
    const staffWithHolidayReq = allStaff.map(staff => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || getDefaultRequiredHolidays(monthInfo.days)
    }));
    const defaultHolidayCount = getDefaultRequiredHolidays(monthInfo.days);

    const lockedAssignments = allAssignments.filter(a => a.locked);

    // ★★★ v5.14 修正: Rentalスタッフに関する指示を削除 ★★★
    const prompt = `あなたは勤務表システムのデータ診断医です。
以下の「マスタデータ（スタッフ設定、デマンド設定）」と「固定されたアサイン（管理者による確定事項）」を診断し、**論理的な矛盾**や**物理的な達成不可能性**を指摘してください。

# 1. スタッフ一覧 (制約と必要公休数)
${JSON.stringify(staffWithHolidayReq, null, 2)}

# 2. ユニット別・24時間デマンド（あるべき必要人数）
${JSON.stringify(allUnits, null, 2)}

# 3. 勤務パターン定義 (参考)
${JSON.stringify(allPatterns, null, 2)}

# 4. ロックされたアサイン（※これらは絶対に変更できない前提条件です）
${JSON.stringify(lockedAssignments, null, 2)}

# 5. 対象月
${monthInfo.year}年 ${monthInfo.month}月 (${monthInfo.days.length}日間)
(参考: この月のデフォルト公休数は ${defaultHolidayCount} 日です)

# 診断の観点 (優先度順)
1. **設定の矛盾 (最重要)**
   - スタッフの \`memo\` (例: "夜勤不可") と \`availablePatternIds\` (勤務可能パターン) に矛盾はありませんか？
   - \`locked: true\` (固定) されているアサインが、そのスタッフの制約（勤務可能パターンなど）に違反していませんか？

2. **供給能力の不足**
   - **「現在のアサインが埋まっていないこと」は無視してください**（それはこれからAIが作成するため）。
   - 代わりに、**「全員がフル稼働したとしても、物理的に満たすことが不可能なデマンド」**がないかを確認してください。
   - ロックされたアサインにより、特定の日の要員が不足確定になっていないか確認してください。

3. **公休契約の実現可能性**
   - 各スタッフの \`requiredHolidays\` (公休数) を確保しつつ、他のスタッフでデマンドを回す余裕がシステム全体としてあるかを概算してください。

# 出力形式
- 管理者への「データ修正のアドバイス」として、日本語の箇条書きで簡潔に出力してください。
- 特定の日時のアサイン指示（「〇日にAさんを入れるべき」等）は不要です。
- 問題がなさそうな場合は、「データ設定に明らかな矛盾は見当たりません。AI草案作成を実行可能です。」と回答してください。
`;

    try {
      console.log("★ AI現況分析: APIにプロンプトを送信します");
      const resultText = await gemini.generateContent(prompt);
      console.log("★ AI現況分析: APIから応答受信");
      return resultText; 

    } catch (e: any) {
      console.error("★ AI現況分析: APIリクエストでエラー発生", e);
      return rejectWithValue(e.message);
    }
  }
);


const getDefaultRequiredHolidays = (monthDays: any[]): number => {
  return monthDays.filter((d:any) => d.dayOfWeek === 0 || d.dayOfWeek === 6).length;
};


interface AssignmentState {
  assignments: IAssignment[];
  adviceLoading: boolean;
  adviceError: string | null;
  adviceResult: string | null;
  adjustmentLoading: boolean; 
  adjustmentError: string | null;
  analysisLoading: boolean;
  analysisError: string | null;
  analysisResult: string | null;
}

const initialState: AssignmentState = {
  assignments: [],
  adviceLoading: false,
  adviceError: null,
  adviceResult: null,
  adjustmentLoading: false,
  adjustmentError: null,
  analysisLoading: false,
  analysisError: null,
  analysisResult: null,
};

const assignmentSlice = createSlice({
  name: 'assignment',
  initialState,
  reducers: {
    setAssignments: (state, action: PayloadAction<IAssignment[]>) => {
      state.assignments = action.payload;
    },
    clearAdvice: (state) => {
      state.adviceLoading = false;
      state.adviceError = null;
      state.adviceResult = null;
    },
    clearAdjustmentError: (state) => {
      state.adjustmentLoading = false;
      state.adjustmentError = null;
    },
    clearAnalysis: (state) => {
      state.analysisLoading = false;
      state.analysisError = null;
      state.analysisResult = null;
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
        state.adviceError = action.payload as string;
      })

      .addCase(fetchAiAdjustment.pending, (state) => {
        state.adjustmentLoading = true;
        state.adjustmentError = null;
      })
      .addCase(fetchAiAdjustment.fulfilled, (state, action: PayloadAction<IAssignment[]>) => {
        state.assignments = action.payload;
        state.adjustmentLoading = false;
      })
      .addCase(fetchAiAdjustment.rejected, (state, action) => {
        state.adjustmentLoading = false;
        state.adjustmentError = action.payload as string;
      })
      
      .addCase(fetchAiAnalysis.pending, (state) => {
        state.analysisLoading = true;
        state.analysisError = null;
        state.analysisResult = null;
      })
      .addCase(fetchAiAnalysis.fulfilled, (state, action: PayloadAction<string>) => {
        state.analysisLoading = false;
        state.analysisResult = action.payload;
      })
      .addCase(fetchAiAnalysis.rejected, (state, action) => {
        state.analysisLoading = false;
        state.analysisError = action.payload as string;
      });
  }
});

export const { setAssignments, clearAdvice, clearAdjustmentError, clearAnalysis } = assignmentSlice.actions;
export default assignmentSlice.reducer;