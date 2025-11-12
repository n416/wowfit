import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { db, IShiftPattern } from '../db/dexie'; 

// ★★★ v5修正: 新規パターン追加Thunk ★★★
export const addNewPattern = createAsyncThunk(
  'pattern/addNewPattern',
  // (v5スキーマの IShiftPattern をそのまま受け取る)
  async (newPatternData: IShiftPattern, { rejectWithValue }) => {
    try {
      // (IDはUI側で "SA", "AA", "公休" などが入力される前提)
      await db.shiftPatterns.add(newPatternData);
      return newPatternData;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// パターン削除Thunk
export const deletePattern = createAsyncThunk(
  'pattern/deletePattern',
  async (patternId: string, { rejectWithValue }) => {
    try {
      await db.shiftPatterns.delete(patternId);
      // (TODO: 関連データ削除)
      return patternId;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// ★★★ v5修正: パターン更新Thunk ★★★
export const updatePattern = createAsyncThunk(
  'pattern/updatePattern',
  async (pattern: IShiftPattern, { rejectWithValue }) => {
    try {
      await db.shiftPatterns.put(pattern); // (putは上書き)
      return pattern;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

interface PatternState {
  patterns: IShiftPattern[];
  loading: boolean;
  error: string | null;
}

const initialState: PatternState = {
  patterns: [],
  loading: false,
  error: null,
};

const patternSlice = createSlice({
  name: 'pattern',
  initialState,
  reducers: {
    setPatterns: (state, action: PayloadAction<IShiftPattern[]>) => {
      state.patterns = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // (addNewPattern)
      .addCase(addNewPattern.pending, (state) => { state.loading = true; })
      .addCase(addNewPattern.fulfilled, (state, action) => {
        state.patterns.push(action.payload);
        state.loading = false;
      })
      .addCase(addNewPattern.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // (deletePattern)
      .addCase(deletePattern.pending, (state) => { state.loading = true; })
      .addCase(deletePattern.fulfilled, (state, action) => {
        state.patterns = state.patterns.filter(p => p.patternId !== action.payload);
        state.loading = false;
      })
      .addCase(deletePattern.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // (updatePattern)
      .addCase(updatePattern.pending, (state) => { state.loading = true; })
      .addCase(updatePattern.fulfilled, (state, action) => {
        const index = state.patterns.findIndex(p => p.patternId === action.payload.patternId);
        if (index !== -1) {
          state.patterns[index] = action.payload;
        }
        state.loading = false;
      })
      .addCase(updatePattern.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  }
});

export const { setPatterns } = patternSlice.actions;
export default patternSlice.reducer;