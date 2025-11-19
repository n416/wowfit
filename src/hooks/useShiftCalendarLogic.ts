import { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { 
  setAssignments,
  fetchAiAdjustment, 
  clearAdjustmentError, 
  fetchAiAnalysis, 
  clearAnalysis,
  fetchAiHolidayPatch
} from '../store/assignmentSlice';
import { db, IStaff } from '../db/dexie'; 
import { allocateWork } from '../lib/placement/workAllocator';

type MonthDay = { dateStr: string; weekday: string; dayOfWeek: number; };

export const useShiftCalendarLogic = (
  currentYear: number,
  currentMonth: number,
  monthDays: MonthDay[],
  activeStaffList: IStaff[],
  staffHolidayRequirements: Map<string, number>,
  demandMap: Map<string, { required: number; actual: number }>
) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();
  const [aiInstruction, setAiInstruction] = useState("夜勤さんXの夜勤を月4回程度に減らせてください。");
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);

  const staffForAi = useMemo(() => activeStaffList.filter(s => s.employmentType !== 'Rental'), [activeStaffList]);
  const staffForRentalFill = useMemo(() => activeStaffList.filter(s => s.employmentType === 'Rental'), [activeStaffList]);
  const patternMap = useMemo(() => new Map(shiftPatterns.map(p => [p.patternId, p])), [shiftPatterns]);

  const handleFillRental = useCallback(async () => {
    await allocateWork({
      assignments, staffList: staffForRentalFill, unitList, patternMap, shiftPatterns, dispatch, demandMap, monthDays
    });
  }, [assignments, staffForRentalFill, unitList, patternMap, shiftPatterns, dispatch, demandMap, monthDays]);

  const handleRunAiAdjustment = useCallback(() => {
    if (!window.confirm("AIによる全体調整を実行しますか？")) return;
    dispatch(fetchAiAdjustment({
      instruction: aiInstruction, allStaff: staffForAi, allPatterns: shiftPatterns, allUnits: unitList, allAssignments: assignments, 
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays }, staffHolidayRequirements
    }));
  }, [aiInstruction, dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  const handleRunAiDefault = useCallback(() => {
    if (!window.confirm("AIによる全体調整(デフォルト)を実行しますか？")) return;
    dispatch(fetchAiAdjustment({
      instruction: "特記事項なし。", allStaff: staffForAi, allPatterns: shiftPatterns, allUnits: unitList, allAssignments: assignments, 
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays }, staffHolidayRequirements
    }));
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  const handleRunAiAnalysis = useCallback(() => {
    dispatch(fetchAiAnalysis({
      allStaff: staffForAi, allPatterns: shiftPatterns, allUnits: unitList, allAssignments: assignments, 
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays }, staffHolidayRequirements
    }));
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  const handleRunAiHolidayPatch = useCallback(() => {
    if (!window.confirm("AIによる公休数補正を実行しますか？")) return;
    dispatch(fetchAiHolidayPatch({
      allStaff: staffForAi, allPatterns: shiftPatterns, allUnits: unitList, allAssignments: assignments, 
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays }, staffHolidayRequirements
    }));
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  const handleResetClick = useCallback(async () => {
    if (window.confirm("アサインをリセットしますか？")) {
      if (!monthDays || monthDays.length === 0) return;
      const firstDay = monthDays[0].dateStr;
      const lastDay = monthDays[monthDays.length - 1].dateStr;
      try {
        const assignmentsToRemove = await db.assignments.where('date').between(firstDay, lastDay, true, true).primaryKeys(); 
        if (assignmentsToRemove.length > 0) await db.assignments.bulkDelete(assignmentsToRemove);
        const currentState = store.getState().assignment.present;
        const assignmentsToKeep = currentState.assignments.filter(a => a.date < firstDay || a.date > lastDay);
        dispatch(setAssignments(assignmentsToKeep));
      } catch (e) { console.error(e); }
    }
  }, [dispatch, currentYear, currentMonth, monthDays, store]);

  return {
    aiInstruction, setAiInstruction, handleFillRental, handleRunAiAdjustment, handleRunAiDefault,
    handleRunAiAnalysis, handleRunAiHolidayPatch, handleResetClick,
    handleClearError: useCallback(() => dispatch(clearAdjustmentError()), [dispatch]),
    handleClearAnalysis: useCallback(() => dispatch(clearAnalysis()), [dispatch])
  };
};