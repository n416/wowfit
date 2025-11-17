import { configureStore } from '@reduxjs/toolkit';
import staffReducer from './staffSlice';
import patternReducer from './patternSlice';
import assignmentReducer from './assignmentSlice'; 
import unitReducer from './unitSlice';
import calendarReducer from './calendarSlice'; // ★ 1. インポート

export const store = configureStore({
  reducer: {
    staff: staffReducer,
    pattern: patternReducer,
    assignment: assignmentReducer, 
    unit: unitReducer,
    calendar: calendarReducer, // ★ 2. 登録
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;