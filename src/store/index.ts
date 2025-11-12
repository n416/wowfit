import { configureStore } from '@reduxjs/toolkit';
import staffReducer from './staffSlice';
import patternReducer from './patternSlice';
import assignmentReducer from './assignmentSlice';
// ★★★ (v5) timeSlotRuleSlice を削除 ★★★
// import timeSlotRuleReducer from './timeSlotRuleSlice'; 
import unitReducer from './unitSlice';

export const store = configureStore({
  reducer: {
    staff: staffReducer,
    pattern: patternReducer,
    assignment: assignmentReducer,
    // ★★★ (v5) timeSlotRuleReducer を削除 ★★★
    unit: unitReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;