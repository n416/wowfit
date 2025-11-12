import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { db, IUnit } from '../db/dexie';

// (※ CRUD操作のための Thunk を定義)

export const addNewUnit = createAsyncThunk(
  'unit/addNewUnit',
  async (newUnitData: Omit<IUnit, 'unitId'>, { rejectWithValue }) => {
    try {
      const unitId = `U${Date.now()}`;
      const unitToAdd: IUnit = { ...newUnitData, unitId };
      await db.units.add(unitToAdd);
      return unitToAdd;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

// ★★★ ユニット更新Thunk ★★★
export const updateUnit = createAsyncThunk(
  'unit/updateUnit',
  async (unit: IUnit, { rejectWithValue }) => {
    try {
      await db.units.put(unit);
      return unit;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

export const deleteUnit = createAsyncThunk(
  'unit/deleteUnit',
  async (unitId: string, { rejectWithValue }) => {
    try {
      await db.units.delete(unitId);
      // (TODO: このユニットに所属するスタッフの unitId を null にする処理など)
      return unitId;
    } catch (e: any) {
      return rejectWithValue(e.message);
    }
  }
);

interface UnitState {
  units: IUnit[];
  loading: boolean;
  error: string | null;
}

const initialState: UnitState = {
  units: [],
  loading: false,
  error: null,
};

const unitSlice = createSlice({
  name: 'unit',
  initialState,
  reducers: {
    setUnits: (state, action: PayloadAction<IUnit[]>) => {
      state.units = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addNewUnit.pending, (state) => { state.loading = true; })
      .addCase(addNewUnit.fulfilled, (state, action) => {
        state.loading = false;
        state.units.push(action.payload);
      })
      .addCase(addNewUnit.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // ★★★ updateUnit ハンドラ ★★★
      .addCase(updateUnit.pending, (state) => { state.loading = true; })
      .addCase(updateUnit.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.units.findIndex(u => u.unitId === action.payload.unitId);
        if (index !== -1) state.units[index] = action.payload;
      })
      .addCase(updateUnit.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(deleteUnit.pending, (state) => { state.loading = true; })
      .addCase(deleteUnit.fulfilled, (state, action) => {
        state.loading = false;
        state.units = state.units.filter(u => u.unitId !== action.payload);
      })
      .addCase(deleteUnit.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  }
});

export const { setUnits } = unitSlice.actions;
export default unitSlice.reducer;