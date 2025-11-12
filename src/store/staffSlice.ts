import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { db, IStaff, IStaffConstraints, IShiftPattern } from '../db/dexie'; // (IShiftPattern もインポート)
import { GeminiApiClient } from '../api/geminiApiClient'; // APIクライアント
import { extractJson } from '../utils/jsonExtractor'; // 作成した抽出関数

// v5: parseAndSaveConstraints の引数
interface ParseConstraintsArgs {
  staffId: string;
  memo: string;
  shiftPatterns: IShiftPattern[];
  currentMonthInfo: { month: string; dayOfWeekOn10th: string };
}

// v5: createAsyncThunk (制約解釈)
export const parseAndSaveConstraints = createAsyncThunk(
  'staff/parseConstraints',
  async (args: ParseConstraintsArgs, { rejectWithValue, getState }) => {
    const { staffId, memo, shiftPatterns } = args;
    
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
      return rejectWithValue('Gemini APIが設定されていません。');
    }

    // ★★★ v5修正: プロンプトを「勤務可能パターン」抽出用に変更 ★★★
    const prompt = `あなたは勤務スケジュールアシスタントです。以下の自然言語のメモを解釈し、指定されたJSON形式の恒久的制約データに変換してください。

# 勤務パターンリスト (解釈の参考に)
// (※「労働」タイプのみをAIの解釈対象とする)
${JSON.stringify(shiftPatterns.filter(p => p.workType === 'Work').map(p => ({ id: p.patternId, name: p.name, category: p.mainCategory })))}

# ユーザーのメモ
${memo}

# 出力JSONフォーマット (この形式以外は絶対に出力しない)
// (※スタッフが「勤務可能な」労働パターンを抽出する)
{
  "availablePatternIds": ["SA", "A", ...],
  "memoForManager": "AIが解釈できなかった、または回数指定などのメモ (例: 夜勤は月2回まで)"
}

# 指示
- メモが「夜勤は不可」の場合、パターンリストを参考に「夜勤」カテゴリ以外のパターンIDを "availablePatternIds" に含めてください。
- メモが「早出勤務(SA)と日勤(C)が可能」の場合、 "availablePatternIds": ["SA", "C"] と解釈してください。
- メモが「夜勤は月2回まで」のような回数指定や、「AさんとNG」のような対人関係の制約の場合、AIは解釈せず "memoForManager" にその内容をそのまま残してください。
- 「公休」や「有給」は全員が取得可能なため、"availablePatternIds" には含めないでください。
- JSONオブジェクトのみを出力してください。`;

    try {
      const resultText = await gemini.generateContent(prompt);
      const parsedData = extractJson(resultText);

      const existingStaff = await db.staffList.get(staffId);
      if (!existingStaff) {
        throw new Error('対象のスタッフがDBに見つかりません。');
      }

      // ★★★ v5.4 修正: DBを更新 ★★★
      // (※AIは勤務可能パターンとメモのみを返す)
      const updatedStaff: Partial<IStaff> = {
        // (※「公休」「有給」の自動追加ロジックを削除)
        availablePatternIds: [
          ...new Set([
            ...(parsedData.availablePatternIds || []),
            // '公休', '有給', '会議' // (※非労働パターンは削除。ShiftCalendarPage側で合算するため)
          ])
        ],
        memo: parsedData.memoForManager || memo, // AIが解釈できなかったメモ、または原文
      };

      await db.staffList.update(staffId, updatedStaff);
      
      return { 
        staffId, 
        availablePatternIds: updatedStaff.availablePatternIds,
        memo: updatedStaff.memo
      };

    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// ★★★ v5.4 修正: 新規スタッフ追加Thunk ★★★
export const addNewStaff = createAsyncThunk(
  'staff/addNewStaff',
  // (v5のスキーマに合わせて Omit を修正)
  async (newStaffData: Omit<IStaff, 'staffId' | 'constraints'>, { rejectWithValue }) => {
    try {
      const staffId = `s${Date.now()}`;
      const staffToAdd: IStaff = {
        ...newStaffData,
        staffId: staffId,
        
        // ★★★ v5.4 修正: 「公休」「有給」の自動追加ロジックを削除 ★★★
        // (フォームで選択されたパターン（通常は労働パターン）のみを保存)
        availablePatternIds: newStaffData.availablePatternIds || [],
        
        // (v5の簡略化された制約)
        constraints: {
          maxConsecutiveDays: 5,
          minIntervalHours: 12,
        }
      };
      await db.staffList.add(staffToAdd);
      return staffToAdd;

    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// スタッフ削除Thunk
export const deleteStaff = createAsyncThunk(
  'staff/deleteStaff',
  async (staffId: string, { rejectWithValue }) => {
    try {
      await db.staffList.delete(staffId);
      // (TODO: このスタッフのアサインも全削除する)
      return staffId;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// ★★★ v5修正: スタッフ更新Thunk ★★★
export const updateStaff = createAsyncThunk(
  'staff/updateStaff',
  async (staff: IStaff, { rejectWithValue }) => {
    try {
      await db.staffList.put(staff);
      return staff;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// --- スライス本体 ---
interface StaffState {
  staff: IStaff[]; 
  loading: boolean;
  error: string | null;
}

const initialState: StaffState = {
  staff: [],
  loading: false,
  error: null,
};

const staffSlice = createSlice({
  name: 'staff',
  initialState,
  reducers: {
    setStaffList: (state, action: PayloadAction<IStaff[]>) => {
      state.staff = action.payload;
    },
  },
  // 非同期アクションのステータスに応じてStateを更新
  extraReducers: (builder) => {
    builder
      // (parseConstraints)
      .addCase(parseAndSaveConstraints.pending, (state) => { state.loading = true; })
      .addCase(parseAndSaveConstraints.fulfilled, (state, action) => {
        const index = state.staff.findIndex((s) => s.staffId === action.payload.staffId);
        if (index !== -1) {
          state.staff[index].availablePatternIds = action.payload.availablePatternIds || [];
          state.staff[index].memo = action.payload.memo;
        }
        state.loading = false;
      })
      .addCase(parseAndSaveConstraints.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // (addNewStaff)
      .addCase(addNewStaff.pending, (state) => { state.loading = true; })
      .addCase(addNewStaff.fulfilled, (state, action) => {
        state.staff.push(action.payload);
        state.loading = false;
      })
      .addCase(addNewStaff.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // (deleteStaff)
      .addCase(deleteStaff.pending, (state) => { state.loading = true; })
      .addCase(deleteStaff.fulfilled, (state, action) => {
        state.staff = state.staff.filter(s => s.staffId !== action.payload);
        state.loading = false;
      })
      .addCase(deleteStaff.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // (updateStaff)
      .addCase(updateStaff.pending, (state) => { state.loading = true; })
      .addCase(updateStaff.fulfilled, (state, action) => {
        const index = state.staff.findIndex(s => s.staffId === action.payload.staffId);
        if (index !== -1) {
          state.staff[index] = action.payload;
        }
        state.loading = false;
      })
      .addCase(updateStaff.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  }
});

export const { setStaffList } = staffSlice.actions;
export default staffSlice.reducer;