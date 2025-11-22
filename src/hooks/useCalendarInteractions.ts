import { useState, useMemo, useCallback, useRef } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie';
import { db } from '../db/dexie';
import { setAssignments, _syncAssignments, _setIsSyncing } from '../store/assignmentSlice';

type MonthDay = { dateStr: string; weekday: string; dayOfWeek: number; };
export type ClickMode = 'normal' | 'holiday' | 'paid_leave' | 'select';
export type CellCoords = { staffId: string; date: string; staffIndex: number; dateIndex: number; };

export const useCalendarInteractions = (
  sortedStaffList: IStaff[],
  monthDays: MonthDay[]
) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();

  const [_clickMode, _setClickMode] = useState<ClickMode>('normal');
  const [selectionRange, setSelectionRange] = useState<{ start: CellCoords, end: CellCoords } | null>(null);
  const processingCellKeyRef = useRef<string | null>(null);
  const syncLockRef = useRef<number>(0);

  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);

  const patternMap = useMemo(() => new Map(shiftPatterns.map(p => [p.patternId, p])), [shiftPatterns]);
  const symbolMap = useMemo(() => {
    const map = new Map<string, IShiftPattern>();
    shiftPatterns.forEach(p => { if (p.symbol) map.set(p.symbol, p); });
    return map;
  }, [shiftPatterns]);
  
  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>();
    for (const assignment of assignments) {
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment);
    }
    return map;
  }, [assignments]);

  const holidayPatternId = useMemo(() => shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休', [shiftPatterns]);
  const paidLeavePatternId = useMemo(() => shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給', [shiftPatterns]);

  const getRangeIndices = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    if (!range) return null;
    return {
      minStaff: Math.min(range.start.staffIndex, range.end.staffIndex),
      maxStaff: Math.max(range.start.staffIndex, range.end.staffIndex),
      minDate: Math.min(range.start.dateIndex, range.end.dateIndex),
      maxDate: Math.max(range.start.dateIndex, range.end.dateIndex),
    };
  }, []);

  const setClickMode = useCallback((newMode: ClickMode) => {
    _setClickMode(newMode);
    setSelectionRange(null);
  }, []);

  const setSelectionFromView = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    setSelectionRange(range);
  }, []);

  const toggleHoliday = useCallback((date: string, staff: IStaff, targetPatternId: string) => {
    const state = store.getState();
    const isCurrentlyLoading = state.assignment.present.adjustmentLoading || state.assignment.present.patchLoading || state.calendar.isMonthLoading;
    if (isCurrentlyLoading) return;
    const cellKey = `${staff.staffId}_${date}`;
    if (processingCellKeyRef.current === cellKey) return;
    processingCellKeyRef.current = cellKey;
    const currentAssignments = store.getState().assignment.present.assignments;
    const existing = currentAssignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;
    let newOptimisticAssignments: IAssignment[];
    const tempId = Date.now();
    if (existingIsTarget) { newOptimisticAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId)); } 
    else {
      const newAssignment = { date, staffId: staff.staffId, patternId: targetPatternId, unitId: null, locked: true, id: tempId };
      const otherAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      newOptimisticAssignments = [...otherAssignments, newAssignment];
    }
    const currentSyncId = Date.now();
    syncLockRef.current = currentSyncId;
    dispatch(setAssignments(newOptimisticAssignments));
    dispatch(_setIsSyncing(true));
    (async () => {
      try {
        if (!monthDays || monthDays.length === 0) throw new Error("No month data");
        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;
        await db.transaction('rw', db.assignments, async () => {
          const assignmentsToRemove = await db.assignments.where('date').between(firstDay, lastDay, true, true).primaryKeys();
          if (assignmentsToRemove.length > 0) await db.assignments.bulkDelete(assignmentsToRemove);
          const assignmentsToSave = newOptimisticAssignments.filter(a => a.date >= firstDay && a.date <= lastDay).map(({ id, ...rest }) => rest);
          if (assignmentsToSave.length > 0) await db.assignments.bulkAdd(assignmentsToSave);
        });
        if (syncLockRef.current === currentSyncId) dispatch(_setIsSyncing(false));
      } catch (e) {
        console.error("DB Error", e);
        if (syncLockRef.current === currentSyncId) db.assignments.toArray().then(d => dispatch(_syncAssignments(d)));
        else if (syncLockRef.current === 0) dispatch(_setIsSyncing(false));
      } finally {
        if (processingCellKeyRef.current === cellKey) processingCellKeyRef.current = null;
      }
    })();
  }, [dispatch, store, monthDays, holidayPatternId, paidLeavePatternId]);

  const handleCellClick = useCallback((e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    const state = store.getState();
    if (state.assignment.present.isSyncing || state.assignment.present.adjustmentLoading || state.calendar.isMonthLoading) return;
    const staff = sortedStaffList.find(s => s.staffId === staffId);
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    if (_clickMode !== 'holiday' && _clickMode !== 'paid_leave') processingCellKeyRef.current = null;
    const isShiftKey = 'shiftKey' in e ? e.shiftKey : false;

    switch (_clickMode) {
      case 'select':
        if (isShiftKey && selectionRange) {
          setSelectionRange({ start: selectionRange.start, end: cell });
        } else {
          setSelectionRange({ start: cell, end: cell });
        }
        break;
      case 'holiday': if (staff) toggleHoliday(date, staff, holidayPatternId); break;
      case 'paid_leave': if (staff) toggleHoliday(date, staff, paidLeavePatternId); break;
      case 'normal': break;
    }
  }, [_clickMode, sortedStaffList, toggleHoliday, holidayPatternId, paidLeavePatternId, selectionRange, store]);

  // --- Copy / Paste Logic ---
  const handleCopy = useCallback(async (isCut = false) => {
    if (!selectionRange) return;
    const rangeIndices = getRangeIndices(selectionRange);
    if (!rangeIndices) return;
    const { minStaff, maxStaff, minDate, maxDate } = rangeIndices;
    const tsvRows: string[][] = [];
    const keysToCut = new Set<string>();

    for (let sIdx = minStaff; sIdx <= maxStaff; sIdx++) {
      const row: string[] = [];
      for (let dIdx = minDate; dIdx <= maxDate; dIdx++) {
        const staff = sortedStaffList[sIdx];
        const day = monthDays[dIdx];
        let val = "";
        if (staff && day) {
          const key = `${staff.staffId}_${day.dateStr}`;
          if (isCut) keysToCut.add(key);
          const cellAssignments = assignmentsMap.get(key) || [];
          if (cellAssignments.length > 0) val = cellAssignments[0].patternId;
        }
        row.push(val);
      }
      tsvRows.push(row);
    }
    const tsvString = tsvRows.map(row => row.join('\t')).join('\n');
    try { await navigator.clipboard.writeText(tsvString); } catch (err) { console.error('Clipboard write failed:', err); return; }

    if (isCut) {
      const currentAssignments = store.getState().assignment.present.assignments;
      const newOptimisticAssignments = currentAssignments.filter(a => !keysToCut.has(`${a.staffId}_${a.date}`));
      const currentSyncId = Date.now();
      syncLockRef.current = currentSyncId;
      dispatch(setAssignments(newOptimisticAssignments));
      dispatch(_setIsSyncing(true));
      (async () => {
        try {
          if (!monthDays || monthDays.length === 0) throw new Error("No month info");
          const firstDay = monthDays[0].dateStr;
          const lastDay = monthDays[monthDays.length - 1].dateStr;
          await db.transaction('rw', db.assignments, async () => {
            const toRemove = await db.assignments.where('date').between(firstDay, lastDay, true, true).primaryKeys();
            if (toRemove.length > 0) await db.assignments.bulkDelete(toRemove);
            const toAdd = newOptimisticAssignments.filter(a => a.date >= firstDay && a.date <= lastDay).map(({ id, ...rest }) => rest);
            if (toAdd.length > 0) await db.assignments.bulkAdd(toAdd);
          });
          if (syncLockRef.current === currentSyncId) dispatch(_setIsSyncing(false));
        } catch (e) { console.error("Cut failed:", e); if (syncLockRef.current === currentSyncId) db.assignments.toArray().then(d => dispatch(_syncAssignments(d))); else if (syncLockRef.current === 0) dispatch(_setIsSyncing(false)); }
      })();
    }
  }, [selectionRange, getRangeIndices, sortedStaffList, monthDays, assignmentsMap, store, dispatch]);

  const handlePaste = useCallback(async () => {
    if (!selectionRange) return; 
    let tsvString = "";
    try { tsvString = await navigator.clipboard.readText(); } catch (err) { console.error('Clipboard read failed:', err); return; }
    if (!tsvString) return;

    const tsvRows = tsvString.replace(/\r\n/g, '\n').split('\n').filter(row => row.trim() !== '').map(row => row.split('\t'));
    if (tsvRows.length === 0) return;

    const rangeIndices = getRangeIndices(selectionRange);
    if (!rangeIndices) return;
    let { minStaff: startStaffIdx, minDate: startDateIdx } = rangeIndices;
    const isRange = selectionRange.start.staffIndex !== selectionRange.end.staffIndex || selectionRange.start.dateIndex !== selectionRange.end.dateIndex;
    let endStaffIdx = isRange ? rangeIndices.maxStaff : startStaffIdx + tsvRows.length - 1;
    let endDateIdx = isRange ? rangeIndices.maxDate : startDateIdx + (tsvRows[0]?.length || 0) - 1;

    const currentAssignments = store.getState().assignment.present.assignments;
    const newAssignmentsToPaste: Omit<IAssignment, 'id'>[] = [];
    const keysToOverwrite = new Set<string>();

    for (let sIdx = startStaffIdx; sIdx <= endStaffIdx; sIdx++) {
      if (sIdx >= sortedStaffList.length) continue;
      for (let dIdx = startDateIdx; dIdx <= endDateIdx; dIdx++) {
        if (dIdx >= monthDays.length) continue;
        const rowIdx = (sIdx - startStaffIdx) % tsvRows.length;
        const colIdx = (dIdx - startDateIdx) % (tsvRows[0]?.length || 1);
        const rawText = tsvRows[rowIdx][colIdx]?.trim();
        
        const targetStaff = sortedStaffList[sIdx];
        const targetDay = monthDays[dIdx];
        if (!targetStaff || !targetDay) continue;

        if (rawText) {
          let matchedPattern = patternMap.get(rawText) || symbolMap.get(rawText);
          if (matchedPattern) {
            keysToOverwrite.add(`${targetStaff.staffId}_${targetDay.dateStr}`);
            newAssignmentsToPaste.push({
              date: targetDay.dateStr,
              staffId: targetStaff.staffId,
              patternId: matchedPattern.patternId,
              unitId: (matchedPattern.workType === 'Work') ? targetStaff.unitId : null,
              locked: true,
              overrideStartTime: matchedPattern.isFlex ? matchedPattern.startTime : undefined,
              overrideEndTime: matchedPattern.isFlex ? matchedPattern.endTime : undefined
            });
          }
        }
      }
    }

    if (newAssignmentsToPaste.length === 0 && keysToOverwrite.size === 0) return;
    const assignmentsBeforePaste = currentAssignments.filter(a => !keysToOverwrite.has(`${a.staffId}_${a.date}`));
    const finalOptimisticState = [...assignmentsBeforePaste, ...newAssignmentsToPaste.map((a, i) => ({ ...a, id: Date.now() + i }))];
    const currentSyncId = Date.now();
    syncLockRef.current = currentSyncId;
    dispatch(setAssignments(finalOptimisticState));
    dispatch(_setIsSyncing(true));

    if (!isRange) {
        const maxSIdx = Math.min(endStaffIdx, sortedStaffList.length - 1);
        const maxDIdx = Math.min(endDateIdx, monthDays.length - 1);
        const startS = sortedStaffList[startStaffIdx];
        const startD = monthDays[startDateIdx];
        const endS = sortedStaffList[maxSIdx];
        const endD = monthDays[maxDIdx];
        if (startS && startD && endS && endD) {
            setSelectionRange({
                start: { staffId: startS.staffId, date: startD.dateStr, staffIndex: startStaffIdx, dateIndex: startDateIdx },
                end: { staffId: endS.staffId, date: endD.dateStr, staffIndex: maxSIdx, dateIndex: maxDIdx }
            });
        }
    }

    (async () => {
      try {
        if (!monthDays || monthDays.length === 0) throw new Error("No month info");
        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;
        await db.transaction('rw', db.assignments, async () => {
          const toRemove = await db.assignments.where('date').between(firstDay, lastDay, true, true).primaryKeys();
          if (toRemove.length > 0) await db.assignments.bulkDelete(toRemove);
          const toAdd = finalOptimisticState.filter(a => a.date >= firstDay && a.date <= lastDay).map(({ id, ...rest }) => rest);
          if (toAdd.length > 0) await db.assignments.bulkAdd(toAdd);
        });
        if (syncLockRef.current === currentSyncId) dispatch(_setIsSyncing(false));
      } catch (e) {
        console.error("Paste failed:", e);
        if (syncLockRef.current === currentSyncId) db.assignments.toArray().then(d => dispatch(_syncAssignments(d)));
        else if (syncLockRef.current === 0) dispatch(_setIsSyncing(false));
      }
    })();
  }, [selectionRange, getRangeIndices, sortedStaffList, monthDays, patternMap, symbolMap, store, dispatch]);

  return {
    clickMode: _clickMode,
    setClickMode,
    selectionRange,
    setSelectionRange: setSelectionFromView,
    handleCellClick,
    handleCopy,
    handlePaste,
    invalidateSyncLock: () => { },
  };
};