// src/hooks/useCalendarInteractions.ts
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie'; 
import { db } from '../db/dexie';
import { setAssignments, _syncAssignments, _setIsSyncing } from '../store/assignmentSlice';
import { MonthDay } from '../utils/dateUtils';

export type ClickMode = 'normal' | 'holiday' | 'paid_leave' | 'select';
export type CellCoords = {
  staffId: string;
  date: string;
  staffIndex: number;
  dateIndex: number;
};

export const useCalendarInteractions = (
  sortedStaffList: IStaff[],
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>,
  monthDays: MonthDay[]
) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();

  const [_clickMode, _setClickMode] = useState<ClickMode>('normal');
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);

  const [selectionRange, setSelectionRange] = useState<{ start: CellCoords, end: CellCoords } | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const processingCellKeyRef = useRef<string | null>(null);
  const syncLockRef = useRef<number>(0);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);

  const patternMap = useMemo(() =>
    new Map(shiftPatterns.map(p => [p.patternId, p])),
    [shiftPatterns]);

  const symbolMap = useMemo(() => {
    const map = new Map<string, IShiftPattern>();
    shiftPatterns.forEach(p => {
      if (p.symbol) {
        map.set(p.symbol, p);
      }
    });
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

  const holidayPatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休',
    [shiftPatterns]);
  const paidLeavePatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給',
    [shiftPatterns]);

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
    setActiveCell(null);
    setSelectionRange(null);
    setIsDragging(false);
  }, []);

  const toggleHoliday = useCallback((date: string, staff: IStaff, targetPatternId: string) => {
    const state = store.getState();
    const isCurrentlyLoading = state.assignment.present.adjustmentLoading ||
      state.assignment.present.patchLoading ||
      state.calendar.isMonthLoading;
    if (isCurrentlyLoading) {
      return;
    }

    const cellKey = `${staff.staffId}_${date}`;
    if (processingCellKeyRef.current === cellKey) { return; }
    processingCellKeyRef.current = cellKey;

    const currentAssignments = store.getState().assignment.present.assignments;
    const existing = currentAssignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;
    let newOptimisticAssignments: IAssignment[];
    const tempId = Date.now();
    let newAssignmentBase: Omit<IAssignment, 'id'> | null = null;
    if (existingIsTarget) {
      newOptimisticAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      newAssignmentBase = null;
    } else {
      newAssignmentBase = {
        date: date, staffId: staff.staffId, patternId: targetPatternId,
        unitId: null, locked: true
      };
      const otherAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }];
    }

    const currentSyncId = Date.now();
    syncLockRef.current = currentSyncId;

    dispatch(setAssignments(newOptimisticAssignments));
    dispatch(_setIsSyncing(true));

    (async () => {
      try {
        if (!monthDays || monthDays.length === 0) {
          throw new Error("カレンダーの月情報がありません。");
        }
        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;

        await db.transaction('rw', db.assignments, async () => {
          const assignmentsToRemove = await db.assignments
            .where('date')
            .between(firstDay, lastDay, true, true)
            .primaryKeys();
          if (assignmentsToRemove.length > 0) {
            await db.assignments.bulkDelete(assignmentsToRemove);
          }
          const assignmentsToSave = newOptimisticAssignments
            .filter(a => a.date >= firstDay && a.date <= lastDay)
            .map(({ id, ...rest }) => rest);
          if (assignmentsToSave.length > 0) {
            await db.assignments.bulkAdd(assignmentsToSave);
          }
        });

        if (syncLockRef.current === currentSyncId) {
          dispatch(_setIsSyncing(false));
        }

      } catch (e) {
        console.error("アサインの即時更新（DB反映）に失敗:", e);
        if (syncLockRef.current === currentSyncId) {
          db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
        } else {
          if (syncLockRef.current === 0) {
            dispatch(_setIsSyncing(false));
          }
        }
      } finally {
        if (processingCellKeyRef.current === cellKey) {
          processingCellKeyRef.current = null;
        }
      }
    })();

  }, [dispatch, store, monthDays, holidayPatternId, paidLeavePatternId]);

  const handleCellClick = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    date: string,
    staffId: string,
    staffIndex: number,
    dateIndex: number
  ) => {

    const state = store.getState();
    const isCurrentlyLoading = state.assignment.present.isSyncing ||
      state.assignment.present.adjustmentLoading ||
      state.assignment.present.patchLoading ||
      state.calendar.isMonthLoading;
    if (isCurrentlyLoading) {
      return;
    }

    const staff = sortedStaffList.find(s => s.staffId === staffId);
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };

    if (_clickMode !== 'holiday' && _clickMode !== 'paid_leave') {
      processingCellKeyRef.current = null;
    }

    const isShiftKey = 'shiftKey' in e ? e.shiftKey : false;

    switch (_clickMode) {
      case 'select':
        if (isShiftKey && activeCell) {
          setSelectionRange({ start: activeCell, end: cell });
        } else {
          setActiveCell(cell);
          setSelectionRange({ start: cell, end: cell });
        }
        setIsDragging(false);
        break;
      case 'holiday':
        if (staff) {
          toggleHoliday(date, staff, holidayPatternId);
        }
        break;
      case 'paid_leave':
        if (staff) {
          toggleHoliday(date, staff, paidLeavePatternId);
        }
        break;
      case 'normal':
        break;
    }
  }, [
    _clickMode, sortedStaffList,
    toggleHoliday,
    holidayPatternId, paidLeavePatternId,
    activeCell,
    store
  ]);

  const handleCellMouseDown = useCallback((
    e: React.MouseEvent | React.TouchEvent, 
    date: string, staffId: string, staffIndex: number, dateIndex: number
  ) => {
    const state = store.getState();
    const isCurrentlyLoading = state.assignment.present.isSyncing ||
      state.assignment.present.adjustmentLoading ||
      state.assignment.present.patchLoading ||
      state.calendar.isMonthLoading;
    if (isCurrentlyLoading) {
      return;
    }

    if (_clickMode !== 'select') return;
    
    if (e.type === 'mousedown') {
      e.preventDefault();
    }
    
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    const isShiftKey = 'shiftKey' in e ? e.shiftKey : false;

    if (isShiftKey && activeCell) {
      setSelectionRange({ start: activeCell, end: cell });
    } else {
      setActiveCell(cell);
      setSelectionRange({ start: cell, end: cell });
    }
    setIsDragging(true);
  }, [_clickMode, activeCell, store]);

  const handleCellMouseMove = useCallback((date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    if (_clickMode !== 'select' || !isDragging || !selectionRange || !activeCell) return;
    
    // ★★★ 修正: 同じセル内での移動なら更新しないガードを追加 ★★★
    if (
      selectionRange.end.staffIndex === staffIndex &&
      selectionRange.end.dateIndex === dateIndex
    ) {
      return;
    }

    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    setSelectionRange({ ...selectionRange, end: cell });
  }, [_clickMode, isDragging, selectionRange, activeCell]);

  const handleCellMouseUp = useCallback(() => {
    if (_clickMode !== 'select') return;
    setIsDragging(false);
    stopAutoScroll();
  }, [_clickMode, stopAutoScroll]);

  const handleAutoScroll = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || _clickMode !== 'select' || !activeCell) {
      stopAutoScroll();
      return;
    }
    const container = mainCalendarScrollerRef.current;

    if (!container) {
      stopAutoScroll();
      return;
    }
    const rect = container.getBoundingClientRect();
    const threshold = 40;
    const scrollSpeed = 20;
    const interval = 50;
    let scrollX = 0;
    let scrollY = 0;
    const buffer = threshold * 2;
    
    if (clientY < rect.top + threshold && clientY > rect.top - buffer) scrollY = -scrollSpeed;
    else if (clientY > rect.bottom - threshold && clientY < rect.bottom + buffer) scrollY = scrollSpeed;
    
    if (clientX < rect.left + threshold && clientX > rect.left - buffer) scrollX = -scrollSpeed;
    else if (clientX > rect.right - threshold && clientX < rect.right + buffer) scrollX = scrollSpeed;
    
    if (scrollX !== 0 || scrollY !== 0) {
      if (!autoScrollIntervalRef.current) {
        autoScrollIntervalRef.current = setInterval(() => {
          const currentContainer = mainCalendarScrollerRef.current;
          if (currentContainer) {
            currentContainer.scrollTop += scrollY;
            currentContainer.scrollLeft += scrollX;
          }
        }, interval);
      }
    }
    else {
      stopAutoScroll();
    }
  }, [isDragging, _clickMode, activeCell, mainCalendarScrollerRef, stopAutoScroll]);

  // --- C/X/V/矢印キー イベント ---
  const handleCopy = useCallback(async (isCut = false) => {
    if (!selectionRange) return;
    const currentAssignments = store.getState().assignment.present.assignments;
    const rangeIndices = getRangeIndices(selectionRange);
    if (!rangeIndices) return;
    const { minStaff, maxStaff, minDate, maxDate } = rangeIndices;

    const tsvRows: string[][] = [];
    const keysToCut = new Set<string>();

    for (let sIdx = minStaff; sIdx <= maxStaff; sIdx++) {
      const row: string[] = [];
      for (let dIdx = minDate; dIdx <= maxDate; dIdx++) {
        let key: string | null = null;
        const staff = sortedStaffList[sIdx];
        const day = monthDays[dIdx];
        if (staff && day) {
          key = `${staff.staffId}_${day.dateStr}`;
        }

        if (!key) {
          row.push("");
          continue;
        }

        if (isCut) {
          keysToCut.add(key);
        }

        const cellAssignments = assignmentsMap.get(key) || [];
        const firstAssignment = cellAssignments[0];
        if (firstAssignment) {
          row.push(firstAssignment.patternId);
        } else {
          row.push("");
        }
      }
      tsvRows.push(row);
    }

    const tsvString = tsvRows.map(row => row.join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(tsvString);
    } catch (err) {
      console.error('OSクリップボードへの書き込みに失敗:', err);
      return;
    }

    if (isCut) {
      const newOptimisticAssignments = currentAssignments.filter(a => !keysToCut.has(`${a.staffId}_${a.date}`));

      const currentSyncId = Date.now();
      syncLockRef.current = currentSyncId;

      dispatch(setAssignments(newOptimisticAssignments));
      dispatch(_setIsSyncing(true));

      (async () => {
        try {
          if (!monthDays || monthDays.length === 0) throw new Error("カレンダーの月情報がありません。");
          const firstDay = monthDays[0].dateStr;
          const lastDay = monthDays[monthDays.length - 1].dateStr;

          await db.transaction('rw', db.assignments, async () => {
            const assignmentsToRemoveDB = await db.assignments
              .where('date')
              .between(firstDay, lastDay, true, true)
              .primaryKeys();
            if (assignmentsToRemoveDB.length > 0) {
              await db.assignments.bulkDelete(assignmentsToRemoveDB);
            }
            const assignmentsToSave = newOptimisticAssignments
              .filter(a => a.date >= firstDay && a.date <= lastDay)
              .map(({ id, ...rest }) => rest);
            if (assignmentsToSave.length > 0) {
              await db.assignments.bulkAdd(assignmentsToSave);
            }
          });

          if (syncLockRef.current === currentSyncId) {
            dispatch(_setIsSyncing(false));
          } else {
            if (syncLockRef.current === 0) { dispatch(_setIsSyncing(false)); }
          }
        } catch (e) {
          console.error("カット(DB削除)に失敗:", e);
          if (syncLockRef.current === currentSyncId) {
            db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
          } else {
            if (syncLockRef.current === 0) { dispatch(_setIsSyncing(false)); }
          }
        }
      })();
    }
  }, [selectionRange, getRangeIndices, sortedStaffList, monthDays, assignmentsMap, store, dispatch]);

  const handlePaste = useCallback(async () => {
    if (!activeCell) return;

    let tsvString = "";
    try {
      tsvString = await navigator.clipboard.readText();
    } catch (err) {
      console.error('OSクリップボードの読み取りに失敗:', err);
      alert('クリップボードの読み取りに失敗しました。ブラウザの権限を確認してください。');
      return;
    }
    if (!tsvString) return;

    const tsvRows = tsvString
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter(row => row.trim() !== '')
      .map(row => row.split('\t'));
    const clipRowCount = tsvRows.length;
    const clipColCount = tsvRows[0]?.length || 0;
    if (clipRowCount === 0 || clipColCount === 0) return;

    let startStaffIdx: number, endStaffIdx: number;
    let startDateIdx: number, endDateIdx: number;

    const isRangeSelection = selectionRange &&
      (selectionRange.start.staffIndex !== selectionRange.end.staffIndex ||
        selectionRange.start.dateIndex !== selectionRange.end.dateIndex);

    if (isRangeSelection) {
      const rangeIndices = getRangeIndices(selectionRange);
      if (!rangeIndices) return;
      startStaffIdx = rangeIndices.minStaff;
      endStaffIdx = rangeIndices.maxStaff;
      startDateIdx = rangeIndices.minDate;
      endDateIdx = rangeIndices.maxDate;
    } else {
      startStaffIdx = activeCell.staffIndex;
      endStaffIdx = activeCell.staffIndex + clipRowCount - 1;
      startDateIdx = activeCell.dateIndex;
      endDateIdx = activeCell.dateIndex + clipColCount - 1;
    }

    const currentAssignments = store.getState().assignment.present.assignments;
    const newAssignmentsToPaste: Omit<IAssignment, 'id'>[] = [];
    const keysToOverwrite = new Set<string>();

    for (let sIdx = startStaffIdx; sIdx <= endStaffIdx; sIdx++) {
      if (sIdx >= sortedStaffList.length) continue;

      for (let dIdx = startDateIdx; dIdx <= endDateIdx; dIdx++) {
        if (dIdx >= monthDays.length) continue;

        const relativeRow = sIdx - startStaffIdx;
        const relativeCol = dIdx - startDateIdx;
        const sourceRow = relativeRow % clipRowCount;
        const sourceCol = relativeCol % clipColCount;

        const rawText = tsvRows[sourceRow][sourceCol]?.trim();

        const targetStaff = sortedStaffList[sIdx];
        const targetDay = monthDays[dIdx];

        if (!targetStaff || !targetDay) continue;

        const key = `${targetStaff.staffId}_${targetDay.dateStr}`;
        keysToOverwrite.add(key);

        if (rawText) {
          let matchedPattern = patternMap.get(rawText);
          if (!matchedPattern) {
            matchedPattern = symbolMap.get(rawText);
          }

          if (matchedPattern) {
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

    const assignmentsBeforePaste = currentAssignments.filter(a => {
      const key = `${a.staffId}_${a.date}`;
      return !keysToOverwrite.has(key);
    });
    const tempAssignments = newAssignmentsToPaste.map((a, i) => ({
      ...a,
      id: Date.now() + i
    }));
    const finalOptimisticState = [...assignmentsBeforePaste, ...tempAssignments];

    const currentSyncId = Date.now();
    syncLockRef.current = currentSyncId;

    dispatch(setAssignments(finalOptimisticState));
    dispatch(_setIsSyncing(true));

    if (!isRangeSelection && activeCell) {
      const maxSIdx = Math.min(endStaffIdx, sortedStaffList.length - 1);
      const maxDIdx = Math.min(endDateIdx, monthDays.length - 1);

      const endStaff = sortedStaffList[maxSIdx];
      const endDay = monthDays[maxDIdx];

      if (endStaff && endDay) {
        const newEndCell: CellCoords = {
          staffId: endStaff.staffId,
          date: endDay.dateStr,
          staffIndex: maxSIdx,
          dateIndex: maxDIdx
        };
        setSelectionRange({ start: activeCell, end: newEndCell });
      }
    }

    (async () => {
      try {
        if (!monthDays || monthDays.length === 0) throw new Error("カレンダーの月情報がありません。");
        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;

        await db.transaction('rw', db.assignments, async () => {
          const assignmentsToRemoveDB = await db.assignments
            .where('date')
            .between(firstDay, lastDay, true, true)
            .primaryKeys();
          if (assignmentsToRemoveDB.length > 0) {
            await db.assignments.bulkDelete(assignmentsToRemoveDB);
          }
          const assignmentsToSave = finalOptimisticState
            .filter(a => a.date >= firstDay && a.date <= lastDay)
            .map(({ id, ...rest }) => rest);
          if (assignmentsToSave.length > 0) {
            await db.assignments.bulkAdd(assignmentsToSave);
          }
        });

        if (syncLockRef.current === currentSyncId) {
          dispatch(_setIsSyncing(false));
        } else {
          if (syncLockRef.current === 0) { dispatch(_setIsSyncing(false)); }
        }
      } catch (e) {
        console.error("ペースト(DB操作)に失敗:", e);
        if (syncLockRef.current === currentSyncId) {
          db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
        } else {
          if (syncLockRef.current === 0) { dispatch(_setIsSyncing(false)); }
        }
      }
    })();
  }, [activeCell, selectionRange, getRangeIndices, sortedStaffList, monthDays, patternMap, symbolMap, store, dispatch]);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const state = store.getState();
      const isOverallLoading = state.assignment.present.isSyncing ||
        state.assignment.present.adjustmentLoading ||
        state.assignment.present.patchLoading ||
        state.calendar.isMonthLoading;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      if (isOverallLoading) {
        if (ctrlKey && (event.key === 'c' || event.key === 'x' || event.key === 'v')) {
          event.preventDefault();
          return;
        }
      }

      processingCellKeyRef.current = null;

      // 矢印キー移動
      if (!event.shiftKey && !ctrlKey && !event.metaKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();

        if (!activeCell) {
          const staff = sortedStaffList[0];
          const day = monthDays[0];
          if (staff && day) {
            const newCell: CellCoords = { staffId: staff.staffId, date: day.dateStr, staffIndex: 0, dateIndex: 0 };
            setActiveCell(newCell);
            setSelectionRange({ start: newCell, end: newCell });
          }
          return;
        }

        let { staffIndex, dateIndex } = activeCell;
        const minStaffIndex = 0;
        const maxStaffIndex = sortedStaffList.length - 1;
        const minDateIndex = 0;
        const maxDateIndex = monthDays.length - 1;

        switch (event.key) {
          case 'ArrowUp':
            staffIndex = Math.max(minStaffIndex, staffIndex - 1);
            break;
          case 'ArrowDown':
            staffIndex = Math.min(maxStaffIndex, staffIndex + 1);
            break;
          case 'ArrowLeft':
            dateIndex = Math.max(minDateIndex, dateIndex - 1);
            break;
          case 'ArrowRight':
            dateIndex = Math.min(maxDateIndex, dateIndex + 1);
            break;
        }

        let newActiveCell: CellCoords | null = null;
        const staff = sortedStaffList[staffIndex];
        const day = monthDays[dateIndex];
        if (staff && day) {
          newActiveCell = { staffId: staff.staffId, date: day.dateStr, staffIndex, dateIndex };
        }

        if (newActiveCell) {
          setActiveCell(newActiveCell);
          setSelectionRange({ start: newActiveCell, end: newActiveCell });
        }
        return;
      }

      // Shift + 矢印キー移動
      if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();

        if (!activeCell || !selectionRange) return;
        let { staffIndex, dateIndex } = selectionRange.end;

        const minStaffIndex = 0;
        const maxStaffIndex = sortedStaffList.length - 1;
        const minDateIndex = 0;
        const maxDateIndex = monthDays.length - 1;

        switch (event.key) {
          case 'ArrowUp':
            staffIndex = Math.max(minStaffIndex, staffIndex - 1);
            break;
          case 'ArrowDown':
            staffIndex = Math.min(maxStaffIndex, staffIndex + 1);
            break;
          case 'ArrowLeft':
            dateIndex = Math.max(minDateIndex, dateIndex - 1);
            break;
          case 'ArrowRight':
            dateIndex = Math.min(maxDateIndex, dateIndex + 1);
            break;
        }

        let newEndCell: CellCoords | null = null;
        const staff = sortedStaffList[staffIndex];
        const day = monthDays[dateIndex];
        if (staff && day) {
          newEndCell = { staffId: staff.staffId, date: day.dateStr, staffIndex, dateIndex };
        }

        if (newEndCell) {
          setSelectionRange({ start: activeCell, end: newEndCell });
        }
        return;
      }

      // コピー・カット・ペースト
      if (ctrlKey && (event.key === 'c' || event.key === 'x')) {
        event.preventDefault();
        handleCopy(event.key === 'x');
      }
      else if (ctrlKey && event.key === 'v') {
        event.preventDefault();
        handlePaste();
      }
    };

    const handleWindowMouseMove = (e: MouseEvent) => {
      handleAutoScroll(e.clientX, e.clientY);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleWindowMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      stopAutoScroll();
    };
  }, [
    _clickMode, activeCell, selectionRange,
    sortedStaffList, monthDays,
    store, 
    handleCopy, handlePaste,
    handleAutoScroll, 
    stopAutoScroll
  ]);

  useEffect(() => {
    const targetCell = (selectionRange && !isDragging) ? selectionRange.end : (activeCell && !isDragging ? activeCell : null);

    if (targetCell) {
      const cellId = `cell-${targetCell.staffId}-${targetCell.date}`;
      const element = document.getElementById(cellId);

      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  }, [selectionRange, activeCell, isDragging]);

  return {
    clickMode: _clickMode,
    setClickMode,
    activeCell,
    selectionRange,
    toggleHoliday,
    holidayPatternId,
    paidLeavePatternId,
    handleCellClick,
    handleCellMouseDown,
    handleCellMouseMove,
    handleCellMouseUp,
    handleAutoScroll,
    handleCopy,
    handlePaste,
    invalidateSyncLock: () => { },
  };
};