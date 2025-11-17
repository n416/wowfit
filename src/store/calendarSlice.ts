import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CalendarState {
  currentYear: number;
  currentMonth: number; // (1-12)
}

// ★ とりあえず、現在のハードコードされている 2025年11月 を初期値とします
const initialState: CalendarState = {
  currentYear: 2025,
  currentMonth: 11,
};

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    // (例: { year: 2026, month: 1 }) を受け取って設定する
    setCurrentMonth: (state, action: PayloadAction<{ year: number; month: number }>) => {
      state.currentYear = action.payload.year;
      state.currentMonth = action.payload.month;
    },
    // 「次月へ」のアクション
    goToNextMonth: (state) => {
      if (state.currentMonth === 12) {
        state.currentMonth = 1;
        state.currentYear += 1;
      } else {
        state.currentMonth += 1;
      }
    },
    // 「前月へ」のアクション
    goToPrevMonth: (state) => {
      if (state.currentMonth === 1) {
        state.currentMonth = 12;
        state.currentYear -= 1;
      } else {
        state.currentMonth -= 1;
      }
    },
  },
});

export const { setCurrentMonth, goToNextMonth, goToPrevMonth } = calendarSlice.actions;
export default calendarSlice.reducer;