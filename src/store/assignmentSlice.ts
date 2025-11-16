import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
// ★ 1. redux-undo と ActionTypes をインポート
import undoable, { excludeAction } from 'redux-undo';
import { IStaff, IShiftPattern, db, IAssignment, IUnit } from '../db/dexie'; 
import { GeminiApiClient } from '../api/geminiApiClient'; 
import { extractJson } from '../utils/jsonExtractor'; 
import { getDefaultRequiredHolidays } from '../utils/dateUtils';


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
    // ... (プロンプト生成・API呼び出し) ...
    const { targetDate, targetStaff, allPatterns, allUnits, burdenData, allAssignments } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    const prompt = `あなたは勤務スケジュールアシスタントです。管理者が「${targetStaff.name}」の「${targetDate}」のアサインを手動で調整しようとしています。
以下の状況を分析し、管理者が**次に行うべきアクション（ネゴシ_エーション）**を具体的に助言してください。
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


// (fetchAiAdjustment は変更なし)
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
    // ... (プロンプト生成・API呼び出し) ...
    console.log("★ AI草案作成: Thunk (fetchAiAdjustment) 開始");
    const { instruction, allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    const defaultHolidayCount = getDefaultRequiredHolidays();
    const staffWithHolidayReq = allStaff.map(staff => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || defaultHolidayCount 
    }));
    let finalInstruction = instruction || '特記事項なし。デマンド（必要人数）を満し、スタッフの負担（特に連勤・インターバル・公休数）が公平になるよう全体を最適化してください。';
    if (instruction.includes("公休数強制補正")) {
      finalInstruction = "最優先事項: スタッフ一覧で定義された `requiredHolidays`（必要公休数）を厳密に守ってください。デマンド（必要人数）やその他の制約（連勤など）を満たすのが難しい場合でも、公休数の確保を最優先としてください。";
    }
    
    const prompt = `あなたは勤務表の自動調整AIです。以下の入力に基づき、月全体の勤務表アサイン（IAssignment[]）を最適化し、修正後のアサイン配列「全体」をJSON形式で**のみ**出力してください。
# 1. 管理者からの指示
${finalInstruction}
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

5. **★ 制約の遵守 (ルール変更)**:
   - 「スタッフ一覧」で定義された "constraints"（最大連勤・最短インターバル）を遵守してください。
   - "availablePatternIds" は、そのスタッフが勤務可能な**「労働（"workType": "Work"）」パターンのみ**をリストしたものです。
   - **「公休（"workType": "StatutoryHoliday"）」と「有給（"workType": "PaidLeave"）」は、"availablePatternIds" に記載がなくても、すべてのスタッフに割り当て可能です。**
   - ロックされたアサイン（"locked": true）は、これらの制約（連勤、インターバル、勤務可能パターン）に違反していても維持してください。

6. **デマンドの充足**: 可能な限りデマンドを満たしてください。
7. **公休の配置**: 公休・有給は \`unitId: null\` としてください。
8. **管理者の指示**: 「管理者からの指示」(#1)を（上記1〜5の制約の次に）優先して考慮してください。

# 9. 出力形式 (【厳守】)
- **修正後のアサイン配列（IAssignment[]）「全体」を、以下のJSON形式でのみ出力してください。**
- **\`\`\`json ... \`\`\` のマークダウンや、前後の挨拶・説明文（「はい、承知いたしました。」など）は絶対に（MUST NOT）含めないでください。**
- **応答は必ず \`[\` で始まり、 \`]\` で終わる必要があります。**
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


// (fetchAiHolidayPatch は変更なし)
interface FetchAiHolidayPatchArgs {
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[]; 
  monthInfo: { year: number, month: number, days: any[] };
  staffHolidayRequirements: Map<string, number>;
}
export const fetchAiHolidayPatch = createAsyncThunk(
  'assignment/fetchAiHolidayPatch',
  async (args: FetchAiHolidayPatchArgs, { rejectWithValue }) => {
    // ... (プロンプト生成・API呼び出し) ...
    console.log("★ AI公休補正: Thunk (fetchAiHolidayPatch) 開始");
    const { allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    const defaultHolidayCount = getDefaultRequiredHolidays();
    const staffWithHolidayReq = allStaff.map(staff => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || defaultHolidayCount 
    }));
    const holidayPatternId = allPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休';
    const prompt = `あなたは勤務表の「差分補正」AIです。
以下の「現在の勤務表」と「スタッフの必要公休数」を比較し、**公休数に過不足があるスタッフ**のみを修正してください。
# 1. スタッフ一覧 (★必要公休数)
${JSON.stringify(staffWithHolidayReq.filter(s => s.employmentType !== 'Rental'), null, 2)}
# 2. 勤務パターン定義
${JSON.stringify(allPatterns, null, 2)}
# 3. ユニット別・24時間デマンド（必要人数）
${JSON.stringify(allUnits, null, 2)}
# 4. 現在の勤務表 (※可能な限り維持してください)
${JSON.stringify(allAssignments, null, 2)}
# 5. 対象月
${monthInfo.year}年 ${monthInfo.month}月 (${monthInfo.days.length}日間)
# 指示 (最重要)
1. **最小限の変更 (最重要)**: 「現在の勤務表」(#4)は、**\`locked": true\`でなくても、可能な限り（99%）維持**してください。
2. **公休数の過不足を計算**: スタッフごとに「必要公休数」(#1)と、「現在の勤務表」(#4)内の "workType": "StatutoryHoliday" の数を比較してください。
3. **公休が不足している場合**:
   - そのスタッフの「勤務（"workType": "Work"）」アサインのうち、デマンド（#3）への影響が最も少ない日（例：デマンドが0、または既に人員が充足している日）を探してください。
   - その日の勤務アサインを、公休アサイン（例: \`{ "date": "...", "staffId": "...", "patternId": "${holidayPatternId}", "unitId": null }\`）に**置き換えて**ください。
4. **公休が過剰な場合**:
   - そのスタッフの「公休」アサインのうち、デマンド（#3）が**不足**している日（＝本当は出勤してほしい日）を探してください。
   - その日の公休アサインを、そのスタッフが勤務可能な労働パターン（例: "A" や "N"）に**置き換えて**ください。
5. **ロックされたアサインは変更不可**: \`"locked": true\` のアサインは絶対に変更しないでください。
# 出力形式 (【厳守】)
- **変更（置換）が必要なアサインのみ**を、IAssignment[] 形式のJSON配列で出力してください。
- **変更が不要なアサインは、絶対に出力に含めないでください。**
- **応答は必ず \`[\` で始まり、 \`]\` で終わる必要があります。**
- もし変更が不要な場合（全員の公休数が一致している場合）は、空の配列 \`[]\` を返してください。
\`\`\`json
[
  { "date": "2025-11-10", "staffId": "s003", "patternId": "${holidayPatternId}", "unitId": null },
  { "date": "2025-11-15", "staffId": "s004", "patternId": "A", "unitId": "U01" }
]
\`\`\`
`;
    try {
      console.log("★ AI公休補正: APIにプロンプトを送信します");
      const resultText = await gemini.generateContent(prompt);
      console.log("★ AI公休補正: APIから応答受信。JSONを解析します。");
      const patchAssignments: IAssignment[] = extractJson(resultText);
      if (!Array.isArray(patchAssignments)) {
        throw new Error("AIが不正な形式のJSON（配列）を返しませんでした。");
      }
      if (patchAssignments.length === 0) {
        alert("AIによる公休数の診断が完了しました。\n（全員の公休数が既に一致しているため、変更はありませんでした）");
        return allAssignments; // 変更がないため、現在のアサインをそのまま返す
      }
      // ★ 差分（パッチ）を適用 ★
      const patchKeys = new Set(patchAssignments.map(p => `${p.date}_${p.staffId}`));
      // ★★★ 修正: `p.staffId` を `a.staffId` に変更 ★★★
      const assignmentsToDelete = allAssignments.filter(a => patchKeys.has(`${a.date}_${a.staffId}`));
      await db.assignments.bulkDelete(assignmentsToDelete.map(a => a.id!));
      const assignmentsToAdd = patchAssignments.map(({ id, ...rest }) => rest);
      await db.assignments.bulkAdd(assignmentsToAdd);
      const allAssignmentsFromDB = await db.assignments.toArray();
      alert(`AIによる公休数の強制補正が完了しました。（${patchAssignments.length}件の変更）`);
      return allAssignmentsFromDB;
    } catch (e: any) {
      console.error("★ AI公休補正: APIリクエストまたはJSON解析でエラー発生", e);
      return rejectWithValue(e.message);
    }
  }
);


// (FetchAiAnalysisArgs, fetchAiAnalysis は変更なし)
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
    // ... (プロンプト生成・API呼び出し) ...
    const { allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    const staffWithHolidayReq = allStaff.map((staff: IStaff) => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || getDefaultRequiredHolidays()
    }));
    const defaultHolidayCount = getDefaultRequiredHolidays();
    const lockedAssignments = allAssignments.filter((a: IAssignment) => a.locked);
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
   - \`locked": true\` (固定) されているアサインが、そのスタッフの制約（勤務可能パターンなど）に違反していませんか？
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


// ★ 2. State の定義を `redux-undo` に合わせて簡素化
interface AssignmentState {
  assignments: IAssignment[]; // (現在)
  
  adviceLoading: boolean;
  adviceError: string | null;
  adviceResult: string | null;
  adjustmentLoading: boolean; 
  adjustmentError: string | null;
  analysisLoading: boolean;
  analysisError: string | null;
  analysisResult: string | null;
  patchLoading: boolean;
  patchError: string | null;
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
  patchLoading: false,
  patchError: null,
};

// ★★★ 変更点 1: SyncOptimisticPayload の型定義を削除 ★★★
// interface SyncOptimisticPayload {
//   tempId: number;
//   newAssignment: IAssignment;
// }

// ★ 3. スライス本体を作成 (まだ undoable でラップしない)
const assignmentSlice = createSlice({
  name: 'assignment',
  initialState,
  reducers: {
    setAssignments: (state, action: PayloadAction<IAssignment[]>) => {
      // ★ 履歴管理は redux-undo に任せる (これが履歴に積まれる)
      state.assignments = action.payload;
    },
    
    // ★★★ 修正: `_syncAssignments` を追加 ★★★
    // (履歴に影響を与えない、DB同期専用のアクション)
    _syncAssignments: (state, action: PayloadAction<IAssignment[]>) => {
      // ★ state.past も state.future も触らない
      state.assignments = action.payload;
    },
    
    // ★★★ 変更点 2: _syncOptimisticAssignment を削除 ★★★
    // _syncOptimisticAssignment: (state, action: PayloadAction<SyncOptimisticPayload>) => {
    //   const { tempId, newAssignment } = action.payload;
    //   const index = state.assignments.findIndex(a => a.id === tempId);
    //   if (index !== -1) {
    //     state.assignments[index] = newAssignment;
    //   }
    // },
    
    // (undo/redo は削除済み)

    clearAdvice: (state) => {
      state.adviceLoading = false;
      state.adviceError = null;
      state.adviceResult = null;
    },
    clearAdjustmentError: (state) => {
      state.adjustmentLoading = false;
      state.adjustmentError = null;
      state.patchLoading = false;
      state.patchError = null;
    },
    clearAnalysis: (state) => {
      state.analysisLoading = false;
      state.analysisError = null;
      state.analysisResult = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // (fetchAssignmentAdvice)
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

      // (fetchAiAdjustment)
      .addCase(fetchAiAdjustment.pending, (state) => {
        state.adjustmentLoading = true;
        state.adjustmentError = null;
      })
      .addCase(fetchAiAdjustment.fulfilled, (state, action: PayloadAction<IAssignment[]>) => {
        // ★ `setAssignments` と同じロジック (履歴に積まれる)
        state.assignments = action.payload;
        state.adjustmentLoading = false;
      })
      .addCase(fetchAiAdjustment.rejected, (state, action) => {
        state.adjustmentLoading = false;
        state.adjustmentError = action.payload as string;
      })
      
      // (fetchAiHolidayPatch)
      .addCase(fetchAiHolidayPatch.pending, (state) => {
        state.patchLoading = true;
        state.patchError = null;
      })
      .addCase(fetchAiHolidayPatch.fulfilled, (state, action: PayloadAction<IAssignment[]>) => {
        // ★ `setAssignments` と同じロジック (履歴に積まれる)
        state.assignments = action.payload; // (DBから読み直した最新のアサイン)
        state.patchLoading = false;
      })
      .addCase(fetchAiHolidayPatch.rejected, (state, action) => {
        state.patchLoading = false;
        state.patchError = action.payload as string;
      })
      
      // (fetchAiAnalysis)
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

export const { 
  setAssignments, 
  _syncAssignments, // ★★★ 修正: `_syncAssignments` をエクスポート
  // ★★★ 変更点 3: _syncOptimisticAssignment をエクスポートから削除 ★★★
  // _syncOptimisticAssignment, 
  clearAdvice, 
  clearAdjustmentError, 
  clearAnalysis 
} = assignmentSlice.actions;

// ★ 4. `redux-undo` で Reducer をラップ
const undoableAssignmentReducer = undoable(assignmentSlice.reducer, {
  // ★ 履歴に含めないアクション（楽観的更新、DB同期）を指定
  filter: excludeAction([
    // ★★★ 変更点 4: _syncOptimisticAssignment を除外フィルタから削除 ★★★
    // _syncOptimisticAssignment.type,
    _syncAssignments.type // ★★★ 修正: `_syncAssignments` も除外
  ]),
});

export default undoableAssignmentReducer; // ★ ラップした Reducer をエクスポート