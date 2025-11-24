import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import undoable, { ActionTypes } from 'redux-undo';
import { IStaff, IShiftPattern, db, IAssignment, IUnit } from '../db/dexie'; 
import { GeminiApiClient } from '../api/geminiApiClient'; 
import { extractJson } from '../utils/jsonExtractor'; 
import { getDefaultRequiredHolidays, getPrevDateStr } from '../utils/dateUtils';

// --- ヘルパー関数群 ---

const timeToMin = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// 日付文字列の加算・減算
const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr.replace(/-/g, '/'));
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

// 勤務時間の重複・インターバル・連勤チェック用
const getAssignmentTimeRange = (date: string, pattern: IShiftPattern, overrideStart?: string, overrideEnd?: string) => {
  const startStr = (pattern.isFlex && overrideStart) ? overrideStart : pattern.startTime;
  const endStr = (pattern.isFlex && overrideEnd) ? overrideEnd : pattern.endTime;
  
  // 分換算（基準日からの経過分）
  const startMin = timeToMin(startStr);
  const endMin = timeToMin(endStr);
  
  // 日付またぎ対応
  let duration = endMin - startMin;
  if (duration < 0) duration += 24 * 60;
  
  // date を基準とした絶対タイムスタンプ（簡易）
  const baseDate = new Date(date.replace(/-/g, '/')).getTime();
  const startAbs = baseDate + startMin * 60 * 1000;
  const endAbs = startAbs + duration * 60 * 1000;
  return { start: startAbs, end: endAbs };
};

// 現在の休日数を正確に計算する
const calculateCurrentHolidayCounts = (
  allStaff: IStaff[],
  allAssignments: IAssignment[],
  allPatterns: IShiftPattern[],
  monthDays: { dateStr: string; }[]
) => {
  const patternMap = new Map(allPatterns.map(p => [p.patternId, p]));
  const assignmentMap = new Map<string, IAssignment>();
  allAssignments.forEach(a => assignmentMap.set(`${a.staffId}_${a.date}`, a));
  const counts = new Map<string, number>();
  allStaff.forEach(staff => {
    let count = 0;
    for (const day of monthDays) {
      const dateStr = day.dateStr;
      const assignment = assignmentMap.get(`${staff.staffId}_${dateStr}`);
      const pattern = assignment ? patternMap.get(assignment.patternId) : undefined;

      // 1. 明示的な休日パターンのカウント
      if (pattern) {
        if (pattern.workType === 'StatutoryHoliday' || pattern.workType === 'PaidLeave' || pattern.workType === 'Holiday') {
          count += 1.0;
        }
      }

      // 2. 夜勤明け(半公休)のカウント
      const prevDateStr = getPrevDateStr(dateStr);
      const prevAssignment = assignmentMap.get(`${staff.staffId}_${prevDateStr}`);
      const prevPattern = prevAssignment ? patternMap.get(prevAssignment.patternId) : undefined;
      const isPrevNightShift = prevPattern?.isNightShift === true;
      const isTodayWork = pattern?.workType === 'Work';

      // 前日が夜勤 かつ 当日が労働でない場合、0.5日加算
      if (isPrevNightShift && !isTodayWork) {
        count += 0.5;
      }
    }
    counts.set(staff.staffId, count);
  });
  return counts;
};

// ★ 悪代官の知恵: JSONから 'name' キーを抹消するReplacer関数
const privacyReplacer = (key: string, value: any) => {
  if (key === 'name') return undefined; // 名前は消す
  return value;
};

// --- Thunks ---

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

    // ★★★ 偽名作戦 (Pseudonymization) ★★★
    // プロンプト内では「スタッフA」として振る舞わせる
    const PSEUDONYM = "スタッフA";
    
    // 対象スタッフの情報をコピーし、名前だけ偽名に書き換える
    const maskedTargetStaff = { ...targetStaff, name: PSEUDONYM };

    // burdenDataなどに含まれる他のスタッフの本名も privacyReplacer で根こそぎ消す
    const prompt = `あなたは勤務スケジュールアシスタントです。管理者が「${PSEUDONYM}」の「${targetDate}」のアサインを手動で調整しようとしています。
以下の状況を分析し、管理者が**次に行うべきアクション（ネゴシエーション）**を具体的に助言してください。

# 1. 調整対象のスタッフ
- 氏名: ${maskedTargetStaff.name} (ID: ${maskedTargetStaff.staffId})
- 所属: ${maskedTargetStaff.unitId || 'フリー'}
- 勤務可能パターン: ${maskedTargetStaff.availablePatternIds.join(', ')}
- メモ: ${maskedTargetStaff.memo || '特になし'}

# 2. ユニット別・24時間デマンド（あるべき必要人数）
${JSON.stringify(allUnits, privacyReplacer)}

# 3. スタッフ全員の現在の負担状況
// ※プライバシー保護のため、氏名は伏せられています。
${JSON.stringify(burdenData, privacyReplacer, 2)}

# 4. 勤務パターン定義 (参考)
${JSON.stringify(allPatterns.map(p => ({ id: p.patternId, name: p.name, startTime: p.startTime, endTime: p.endTime, crossUnit: p.crossUnitWorkType, workType: p.workType })))}

# 5. 月全体のアサイン状況 (参考)
${JSON.stringify(allAssignments.filter(s => s.staffId), null, 2)}

# 指示 (最重要)
1. **デマンド分析**: ${targetDate} のデマンド（必要人数）に対し、現状のアサイン（Supply）は充足していますか？ 不足している時間帯はどこですか？
2. **候補パターンの選定**: 「${PSEUDONYM}」の「勤務可能パターン」から、${targetDate} のデマンド不足を解消するために最適なパターン（「公休」や「有給」も含む）を提案してください。
3. **包括的な分析**: もし${targetDate}に労働パターンを割り当てると、連勤やインターバル、負担に問題が出ないか、月全体のアサイン状況を見て評価してください。
4. **ネゴシエーション支援**: もしスタッフのメモ（例：「NGあり」）と競合する場合、それを踏まえた「ネゴシエーション文例」も作成してください。
5. **形式**: 「デマンド分析: [不足状況]」「推奨: [パターンID]」「理由: [根拠]」「ネゴ文例: [依頼メッセージ]」の形式で、自然言語で回答してください。
   - **回答の中で対象スタッフを呼ぶときは「${PSEUDONYM}さん」と呼んでください。**
`;

    try {
      const resultText = await gemini.generateContent(prompt);
      
      // ★★★ 書き戻し (De-anonymization) ★★★
      // AIが書いた「スタッフA」を、本名「田中」に戻す
      const realNameAdvice = resultText.replaceAll(PSEUDONYM, targetStaff.name);
      
      return realNameAdvice;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

interface FetchAiAdjustmentArgs {
  instruction: string; 
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[]; 
  monthInfo: { year: number, month: number, days: any[] };
  staffHolidayRequirements: Map<string, number>; 
  includeCurrentAssignments: boolean; 
}

export const fetchAiAdjustment = createAsyncThunk(
  'assignment/fetchAiAdjustment',
  async (args: FetchAiAdjustmentArgs, { rejectWithValue }) => {
    console.log("★ AI草案作成: Thunk (fetchAiAdjustment) 開始");
    const { instruction, allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements, includeCurrentAssignments } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    
    const staffMap = new Map(allStaff.map(s => [s.staffId, s]));
    const patternMap = new Map(allPatterns.map(p => [p.patternId, p]));

    const defaultHolidayCount = getDefaultRequiredHolidays(monthInfo.days);
    const staffWithHolidayReq = allStaff.map(staff => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || defaultHolidayCount 
    }));

    let finalInstruction = instruction || '特記事項なし。デマンドを満し、スタッフの負担が公平になるよう全体を最適化してください。';
    if (instruction.includes("公休数強制補正")) {
      finalInstruction = "最優先事項: スタッフ一覧で定義された `requiredHolidays`（必要公休数）を厳密に守ってください。";
    }

    // AIに渡すアサイン情報のフィルタリング
    const assignmentsContext = includeCurrentAssignments 
      ? allAssignments 
      : allAssignments.filter(a => a.locked);
    
    const prompt = `あなたは勤務表の自動調整AIです。以下の入力に基づき、月全体の勤務表アサイン（IAssignment[]）を最適化し、修正後のアサイン配列「全体」をJSON形式で**のみ**出力してください。

# 1. 管理者からの指示
${finalInstruction}

# 2. スタッフ一覧 (制約・必要公休数・★契約時間帯)
// ※プライバシー保護のため、氏名は伏せられています。staffIdを参照してください。
// workableTimeRanges があるスタッフはパートタイムです。指定された時間帯の範囲内でのみ勤務可能です。
${JSON.stringify(staffWithHolidayReq, privacyReplacer, 2)} 

# 3. 勤務パターン定義 (時間・種類・★Flexフラグ)
// isFlex: true のパターンは「時間枠指定」です。アサイン時に具体的な開始・終了時間を決定する必要があります。
${JSON.stringify(allPatterns, null, 2)}

# 4. ユニット別・24時間デマンド
${JSON.stringify(allUnits, null, 2)}

# 5. 現在のアサイン（下書き）
// locked: true のものは固定されています。それ以外の空き枠や既存のアサインを最適化してください。
${JSON.stringify(assignmentsContext, null, 2)}

# 6. 対象月
${monthInfo.year}年 ${monthInfo.month}月 (${monthInfo.days.length}日間)

# 指示 (最重要)
1. **ロック維持**: \`"locked": true\` のアサインは変更しないでください。
2. **公休数厳守**: \`"requiredHolidays"\` の日数を守ってください。
   - **重要: 公休の記号は「*」です（パターンID: "公休"）。**
   - **重要: 夜勤（isNightShift=true）の翌日は「半公休（/）」扱いとなり、0.5日の休日としてカウントされます。**
   - 夜勤の翌日には、連続夜勤の場合を除き、シフトを割り当てないでください（空にしておけばシステムが半公休として扱います）。
3. **0.5人ルール**: デマンド0.5には 'crossUnitWorkType' が有/サポートのスタッフを割り当ててください。
4. **パート契約時間の遵守 (重要)**: 
   - \`employmentType: "PartTime"\` のスタッフには、必ず \`workableTimeRanges\` の範囲内に収まる時間を割り当ててください。
   - 範囲外の時間になるパターンは割り当てないでください。
5. **Flexパターンの扱い (重要)**:
   - \`isFlex: true\` のパターンを割り当てる場合は、必ず \`overrideStartTime\` と \`overrideEndTime\` プロパティを出力JSONに追加し、具体的な勤務時間を指定してください。

# 9. 出力形式 (【厳守】)
- JSON配列のみを出力してください。
\`\`\`json
[
  { "date": "2025-11-01", "staffId": "s001", "patternId": "N", "unitId": "U01", "locked": true },
  { "date": "2025-11-01", "staffId": "s003", "patternId": "P1", "unitId": "U01", "overrideStartTime": "10:00", "overrideEndTime": "14:00" }, 
  ...
]
\`\`\`
`;

    try {
      console.log("★ AI草案作成: API送信");
      const resultText = await gemini.generateContent(prompt);
      console.log("★ AI草案作成: 応答受信");
      const newAssignments: IAssignment[] = extractJson(resultText);
      
      if (!Array.isArray(newAssignments)) {
        throw new Error("AIが不正な形式のJSONを返しました。");
      }

      // --- ★★★ 決定論的バリデーター (The Lawkeeper) ★★★ ---
      const validAssignments: IAssignment[] = [];
      const removedMessages: string[] = [];

      // スタッフごとのアサインリストを作成（連勤チェック用）
      const staffAssignmentsMap = new Map<string, IAssignment[]>();
      newAssignments.sort((a, b) => a.date.localeCompare(b.date)); 
      
      for (const assignment of newAssignments) {
        if (!staffAssignmentsMap.has(assignment.staffId)) {
          staffAssignmentsMap.set(assignment.staffId, []);
        }
        staffAssignmentsMap.get(assignment.staffId)!.push(assignment);
      }

      for (const assignment of newAssignments) {
        const staff = staffMap.get(assignment.staffId);
        const pattern = patternMap.get(assignment.patternId);
        
        if (!staff || !pattern) {
          validAssignments.push(assignment); // マスタにないものはスルー
          continue;
        }

        // 休日系はバリデーションスキップ
        if (pattern.workType !== 'Work') {
          validAssignments.push(assignment);
          continue;
        }

        let isValid = true;
        let rejectReason = "";

        // 1. パートタイム契約時間チェック
        if (staff.employmentType === 'PartTime') {
          const startStr = assignment.overrideStartTime || pattern.startTime;
          const endStr = assignment.overrideEndTime || pattern.endTime;
          const ranges = (staff.workableTimeRanges && staff.workableTimeRanges.length > 0)
            ? staff.workableTimeRanges
            : [{ start: '08:00', end: '20:00' }];
          const sMin = timeToMin(startStr);
          const eMin = timeToMin(endStr);
          const isTimeValid = ranges.some(range => {
            const rStart = timeToMin(range.start);
            const rEnd = timeToMin(range.end);
            return sMin >= rStart && eMin <= rEnd;
          });
          if (!isTimeValid) {
            isValid = false;
            rejectReason = `契約時間外 (${startStr}-${endStr})`;
          }
        }

        // 2. 連勤チェック (Locked以外の新規アサインに対して実施)
        if (isValid && !assignment.locked) {
          const maxConsecutive = staff.constraints?.maxConsecutiveDays || 5;
          const myAssignments = staffAssignmentsMap.get(staff.staffId) || [];
          const myIndex = myAssignments.indexOf(assignment);
          
          // 過去方向にさかのぼって連勤数をカウント
          let consecutiveCount = 1; // 自分自身
          for (let i = myIndex - 1; i >= 0; i--) {
            const prev = myAssignments[i];
            const prevPattern = patternMap.get(prev.patternId);
            if (prevPattern?.workType !== 'Work') break; // 休日でストップ
            
            const expectedDate = addDays(assignment.date, -(consecutiveCount));
            if (prev.date === expectedDate) {
              consecutiveCount++;
            } else {
              break; 
            }
          }
          if (consecutiveCount > maxConsecutive) {
            isValid = false;
            rejectReason = `${consecutiveCount}連勤目 (上限${maxConsecutive})`;
          }
        }

        // 3. インターバルチェック
        if (isValid && !assignment.locked) {
          const minInterval = staff.constraints?.minIntervalHours || 12;
          const myAssignments = staffAssignmentsMap.get(staff.staffId) || [];
          const myIndex = myAssignments.indexOf(assignment);
          if (myIndex > 0) {
            const prev = myAssignments[myIndex - 1];
            const prevPattern = patternMap.get(prev.patternId);
            const prevDateDiff = (new Date(assignment.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60 * 24);
            if (prevDateDiff === 1 && prevPattern?.workType === 'Work') {
              const prevEnd = getAssignmentTimeRange(prev.date, prevPattern, prev.overrideStartTime, prev.overrideEndTime).end;
              const currentStart = getAssignmentTimeRange(assignment.date, pattern, assignment.overrideStartTime, assignment.overrideEndTime).start;
              const intervalHours = (currentStart - prevEnd) / (1000 * 60 * 60);
              if (intervalHours < minInterval) {
                isValid = false;
                rejectReason = `インターバル不足 (${Math.round(intervalHours * 10) / 10}h < ${minInterval}h)`;
              }
            }
          }
        }

        if (isValid) {
          validAssignments.push(assignment);
        } else {
          removedMessages.push(`・${assignment.date} ${staff.name}: ${rejectReason}`);
          const list = staffAssignmentsMap.get(staff.staffId);
          if (list) {
             const idx = list.indexOf(assignment);
             if (idx !== -1) list.splice(idx, 1);
          }
        }
      }

      if (removedMessages.length > 0) {
        const msg = `AI生成結果に対し、以下の${removedMessages.length}件のコンプライアンス違反を検知・自動削除しました。\n(これにより欠員が生じている可能性があります。)\n\n` + 
                    removedMessages.slice(0, 10).join('\n') + 
                    (removedMessages.length > 10 ? `\n...他 ${removedMessages.length - 10}件` : '');
        alert(msg);
      }

      // 保存処理
      const firstDay = monthInfo.days[0].dateStr;
      const lastDay = monthInfo.days[monthInfo.days.length - 1].dateStr;
      await db.transaction('rw', db.assignments, async () => {
          await db.assignments.where('date').between(firstDay, lastDay, true, true).delete();
          const assignmentsToSave = validAssignments.map(({ id, ...rest }) => rest);
          await db.assignments.bulkAdd(assignmentsToSave);
      });
      const allAssignmentsFromDB = await db.assignments.where('date').between(firstDay, lastDay, true, true).toArray();
      return allAssignmentsFromDB;
      
    } catch (e: any) {
      console.error("★ AI草案作成エラー", e);
      return rejectWithValue(e.message);
    }
  }
);

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
    console.log("★ AI公休補正: Thunk (fetchAiHolidayPatch) 開始");
    const { allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    const defaultHolidayCount = getDefaultRequiredHolidays(monthInfo.days);
    const currentHolidayCounts = calculateCurrentHolidayCounts(allStaff, allAssignments, allPatterns, monthInfo.days);
    
    const discrepancyList = allStaff.map(staff => {
      const req = staffHolidayRequirements.get(staff.staffId) || defaultHolidayCount;
      const cur = currentHolidayCounts.get(staff.staffId) || 0;
      const diff = cur - req; 
      if (diff === 0) return null;
      return {
        staffId: staff.staffId,
        // name は privacyReplacer で消えるのでここでは入れておいても良いが、明示的に削除も可
        current: cur,
        required: req,
        diff: diff,
        instruction: diff < 0 
          ? `不足しています。${Math.abs(diff)}日分の公休（または半公休）を追加してください。` 
          : `過剰です。${diff}日分の休日を労働に変更してください。`
      };
    }).filter(Boolean); 

    if (discrepancyList.length === 0) {
      alert("公休数の過不足はありません。補正の必要はありません。");
      return allAssignments;
    }

    const holidayPatternId = allPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休';
    
    const prompt = `あなたは勤務表の「差分補正」AIです。
以下の「公休過不足リスト」に基づき、**公休数に過不足があるスタッフのみ**アサインを修正してください。

# 1. 公休過不足リスト (★これに従って修正してください)
// ※氏名は伏せてあります。staffIdを使用してください。
${JSON.stringify(discrepancyList, privacyReplacer, 2)}

# 2. 勤務パターン定義
${JSON.stringify(allPatterns, null, 2)}
# 3. ユニット別・24時間デマンド（必要人数）
${JSON.stringify(allUnits, null, 2)}
# 4. 現在の勤務表
${JSON.stringify(allAssignments, null, 2)}
# 5. 対象月
${monthInfo.year}年 ${monthInfo.month}月 (${monthInfo.days.length}日間)

# 指示 (最重要)
1. **過不足の解消**: 
   - リストにある \`diff\` (差分) をゼロにすることが目標です。
   - \`instruction\` に従い、公休の追加または削除を行ってください。
   - **公休追加**: パターンID "${holidayPatternId}" ("*") を使用してください。
   - **公休削除**: 公休アサインを、そのスタッフが可能な労働パターンに変更してください。

2. **半公休の考慮**:
   - **夜勤の翌日は自動的に「半公休（0.5日休）」としてカウントされています。**
   - この「アサイン無し（空）」の状態を、労働で埋めると0.5日分の休日が減ります。
   - 逆に、夜勤の翌日を空のままにしておけば0.5日休を確保できます。

3. **影響の最小化**:
   - デマンド（#3）への影響が最も少ない日（人員充足日など）を選んで変更してください。
   - \`locked": true\` のアサインは絶対に変更しないでください。

# 出力形式 (【厳守】)
- **変更（置換）が必要なアサインのみ**を、IAssignment[] 形式のJSON配列で出力してください。
- 変更がない場合は空配列 \`[]\` を返してください。
\`\`\`json
[
  { "date": "2025-11-10", "staffId": "s003", "patternId": "${holidayPatternId}", "unitId": null },
  { "date": "2025-11-15", "staffId": "s004", "patternId": "A", "unitId": "U01" }
]
\`\`\`
`;

    try {
      console.log("★ AI公休補正: API送信");
      const resultText = await gemini.generateContent(prompt);
      console.log("★ AI公休補正: 応答受信");
      const patchAssignments: IAssignment[] = extractJson(resultText);
      if (!Array.isArray(patchAssignments)) {
        throw new Error("AIが不正な形式のJSON（配列）を返しませんでした。");
      }
      if (patchAssignments.length === 0) {
        alert("AIによる補正の結果、変更案はありませんでした。");
        return allAssignments; 
      }
      
      const patchKeys = new Set(patchAssignments.map(p => `${p.date}_${p.staffId}`));
      const assignmentsToDelete = allAssignments.filter(a => patchKeys.has(`${a.date}_${a.staffId}`));
      
      await db.assignments.bulkDelete(assignmentsToDelete.map(a => a.id!));
      const assignmentsToAdd = patchAssignments.map(({ id, ...rest }) => rest);
      await db.assignments.bulkAdd(assignmentsToAdd);
      
      const firstDay = monthInfo.days[0].dateStr;
      const lastDay = monthInfo.days[monthInfo.days.length - 1].dateStr;
      const allAssignmentsFromDB = await db.assignments.where('date').between(firstDay, lastDay, true, true).toArray();
      alert(`AIによる公休数の強制補正が完了しました。（${patchAssignments.length}件の変更）`);
      return allAssignmentsFromDB;
      
    } catch (e: any) {
      console.error("★ AI公休補正エラー", e);
      return rejectWithValue(e.message);
    }
  }
);

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
    console.log("★[LOCK-AI] fetchAiAnalysis: Thunkが呼び出されました。");
    const { allStaff, allPatterns, allUnits, allAssignments, monthInfo, staffHolidayRequirements } = args;
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }
    const staffWithHolidayReq = allStaff.map((staff: IStaff) => ({
      ...staff,
      requiredHolidays: staffHolidayRequirements.get(staff.staffId) || getDefaultRequiredHolidays(monthInfo.days)
    }));
    const defaultHolidayCount = getDefaultRequiredHolidays(monthInfo.days);
    const lockedAssignments = allAssignments.filter((a: IAssignment) => a.locked);
    
    const prompt = `あなたは勤務表システムのデータ診断医です。
以下の「マスタデータ（スタッフ設定、デマンド設定）」と「固定されたアサイン（管理者による確定事項）」を診断し、**論理的な矛盾**や**物理的な達成不可能性**を指摘してください。
# 1. スタッフ一覧 (制約と必要公休数)
// ※氏名は伏せてあります。staffIdを参照してください。
${JSON.stringify(staffWithHolidayReq, privacyReplacer, 2)}
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
   - **注意: 夜勤の翌日は「半公休（0.5日休日）」としてカウントされます。ただし連続夜勤の場合は勤務日です。**
# 出力形式
- 管理者への「データ修正のアドバイス」として、日本語の箇条書きで簡潔に出力してください。
- 特定の日時のアサイン指示（「〇日にAさんを入れるべき」等）は不要です。
- 問題がなさそうな場合は、「データ設定に明らかな矛盾は見当たりません。AI草案作成を実行可能です。」と回答してください。
`;
    try {
      const resultText = await gemini.generateContent(prompt);
      return resultText; 
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// --- Slice ---

interface AssignmentState {
  assignments: IAssignment[];
  isSyncing: boolean; 
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
  isSyncing: false, 
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

const assignmentSlice = createSlice({
  name: 'assignment',
  initialState,
  reducers: {
    setAssignments: (state, action: PayloadAction<IAssignment[]>) => {
      state.assignments = action.payload;
    },
    _syncAssignments: (state, action: PayloadAction<IAssignment[]>) => {
      state.assignments = action.payload;
      state.isSyncing = false; 
    },
    _setIsSyncing: (state, action: PayloadAction<boolean>) => {
      state.isSyncing = action.payload;
    },
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
      .addCase(fetchAssignmentAdvice.pending, (state) => { state.adviceLoading = true; state.adviceError = null; state.adviceResult = null; })
      .addCase(fetchAssignmentAdvice.fulfilled, (state, action) => { state.adviceLoading = false; state.adviceResult = action.payload; })
      .addCase(fetchAssignmentAdvice.rejected, (state, action) => { state.adviceLoading = false; state.adviceError = action.payload as string; })

      // (fetchAiAdjustment)
      .addCase(fetchAiAdjustment.pending, (state) => { state.adjustmentLoading = true; state.adjustmentError = null; })
      .addCase(fetchAiAdjustment.fulfilled, (state, action: PayloadAction<IAssignment[]>) => { state.assignments = action.payload; state.adjustmentLoading = false; })
      .addCase(fetchAiAdjustment.rejected, (state, action) => { state.adjustmentLoading = false; state.adjustmentError = action.payload as string; })
      
      // (fetchAiHolidayPatch)
      .addCase(fetchAiHolidayPatch.pending, (state) => { state.patchLoading = true; state.patchError = null; })
      .addCase(fetchAiHolidayPatch.fulfilled, (state, action: PayloadAction<IAssignment[]>) => { state.assignments = action.payload; state.patchLoading = false; })
      .addCase(fetchAiHolidayPatch.rejected, (state, action) => { state.patchLoading = false; state.patchError = action.payload as string; })
      
      // (fetchAiAnalysis)
      .addCase(fetchAiAnalysis.pending, (state) => { state.analysisLoading = true; state.analysisError = null; state.analysisResult = null; })
      .addCase(fetchAiAnalysis.fulfilled, (state, action: PayloadAction<string>) => { state.analysisLoading = false; state.analysisResult = action.payload; })
      .addCase(fetchAiAnalysis.rejected, (state, action) => { state.analysisLoading = false; state.analysisError = action.payload as string; });
  }
});

export const { setAssignments, _syncAssignments, _setIsSyncing, clearAdvice, clearAdjustmentError, clearAnalysis } = assignmentSlice.actions;

const undoableAssignmentReducer = undoable(assignmentSlice.reducer, {
  filter: (action) => {
    const excludedTypes = [
      _syncAssignments.type, _setIsSyncing.type,
      fetchAiAdjustment.pending.type, fetchAiHolidayPatch.pending.type, fetchAiAnalysis.pending.type, fetchAssignmentAdvice.pending.type
    ];
    if (action.type === ActionTypes.UNDO || action.type === ActionTypes.REDO) return false;
    if (excludedTypes.includes(action.type)) return false;
    if (!action.type.startsWith('assignment/')) return false;
    return true; 
  },
});

export default undoableAssignmentReducer;