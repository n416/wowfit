import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
import { setAssignments, _syncAssignments } from '../store/assignmentSlice'; 
// ★ 修正: MONTH_DAYS のインポートを削除
// import { MONTH_DAYS } from '../utils/dateUtils'; 

// ★ 修正: 動的な monthDays の型を定義
type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

// --- 型定義 (変更なし) ---
export type ClickMode = 'normal' | 'holiday' | 'paid_leave' | 'select';
export type CellCoords = {
  staffId: string;
  date: string;
  staffIndex: number;
  dateIndex: number;
};
type ClipboardData = {
  assignments: (Omit<IAssignment, 'id' | 'staffId' | 'date'> | null)[];
  rowCount: number;    
  colCount: number;    
  sourceType: 'MAIN' | 'WORK_AREA'; 
};

// (作業領域の定義 - 変更なし)
const WORK_AREA_STAFF_INDEX_START = 900;
const WORK_AREA_DATE_INDEX_START = 900;
const WORK_AREA_STAFF_ID_PREFIX = "WA_STAFF_";
const WORK_AREA_DATE_PREFIX = "WA_DATE_";


/**
 * @param sortedStaffList StaffCalendarView に表示されている順序のスタッフリスト
 * @param workAreaRef 作業領域のスクロールコンテナDOMへの参照
 * @param mainCalendarScrollerRef メインカレンダー(Virtuoso)のスクローラDOMへの参照
 * ★ 修正: 引数を追加
 */
export const useCalendarInteractions = (
  sortedStaffList: IStaff[], 
  workAreaRef: React.RefObject<HTMLDivElement | null>, 
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>,
  monthDays: MonthDay[] // ★ 追加
) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>(); 
  
  // (state - 変更なし)
  const [_clickMode, _setClickMode] = useState<ClickMode>('normal');
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: CellCoords, end: CellCoords } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // (ref - 変更なし)
  const clipboardRef = useRef<ClipboardData | null>(null);
  const processingCellKeyRef = useRef<string | null>(null);
  const syncLockRef = useRef<number>(0);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // (自動スクロール停止 - 変更なし)
  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  // (データ取得 - 変更なし)
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);
  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>();
    for (const assignment of assignments) {
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment);
    }
    return map;
  }, [assignments]);
  
  // (パターンID計算 - 変更なし)
  const holidayPatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休',
  [shiftPatterns]);
  const paidLeavePatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給',
  [shiftPatterns]);

  
  // --- 内部ヘルパー (作業領域定義) ---
  const getRangeIndices = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    if (!range) return null;
    return {
      minStaff: Math.min(range.start.staffIndex, range.end.staffIndex),
      maxStaff: Math.max(range.start.staffIndex, range.end.staffIndex),
      minDate: Math.min(range.start.dateIndex, range.end.dateIndex),
      maxDate: Math.max(range.start.dateIndex, range.end.dateIndex),
    };
  }, []);

  // ★ 修正: monthDays に依存
  const workAreaRowCount = useMemo(() => {
    const calculatedRows = Math.ceil(sortedStaffList.length * 1.5);
    return Math.max(10, calculatedRows);
  }, [sortedStaffList.length]);

  // ★ 修正: monthDays に依存
  const workAreaColCount = useMemo(() => monthDays.length, [monthDays]);

  // ★ 修正: monthDays に依存
  const virtualWorkAreaCols = useMemo(() => {
    return monthDays.map((dayInfo, index) => {
      return {
        date: `${WORK_AREA_DATE_PREFIX}${index}`,
        dateIndex: WORK_AREA_DATE_INDEX_START + index,
        originalDateKey: dayInfo.dateStr, 
      };
    });
  }, [monthDays]); 

  // ★ 修正: virtualWorkAreaCols に依存
  const virtualWorkAreaRowsWithCoords = useMemo(() => {
    return Array.from({ length: workAreaRowCount }, (_, index) => {
      const staffIndex = WORK_AREA_STAFF_INDEX_START + index;
      return {
        staffId: `${WORK_AREA_STAFF_ID_PREFIX}${index}`, 
        staffIndex: staffIndex, 
        getCellCoords: (dateIndex: number) => {
          const dateCol = virtualWorkAreaCols[dateIndex - WORK_AREA_DATE_INDEX_START];
          if (!dateCol) return null;
          return { staffId: `${WORK_AREA_STAFF_ID_PREFIX}${index}`, date: dateCol.date, staffIndex, dateIndex };
        }
      };
    });
  }, [workAreaRowCount, virtualWorkAreaCols]);

  const isWorkAreaCell = useCallback((staffIndex: number, dateIndex: number) => {
    return staffIndex >= WORK_AREA_STAFF_INDEX_START && dateIndex >= WORK_AREA_DATE_INDEX_START;
  }, []);
  
  // (setClickMode - 変更なし)
  const setClickMode = useCallback((newMode: ClickMode) => {
    _setClickMode(newMode);
    setActiveCell(null);
    setSelectionRange(null);
    setIsDragging(false);
  }, []); 

  // (invalidateSyncLock - 変更なし)
  const invalidateSyncLock = useCallback(() => { 
    syncLockRef.current = 0; 
    const assignmentsInUI = store.getState().assignment.present.assignments;
    console.log("[DEBUG] Forcing DB sync to current UI state due to Undo/Redo.");
    (async () => {
      try {
        await db.transaction('rw', db.assignments, async () => {
          await db.assignments.clear();
          const assignmentsToPut = assignmentsInUI.map(({ id, ...rest }) => rest);
          await db.assignments.bulkPut(assignmentsToPut);
        });
        const allAssignmentsFromDB = await db.assignments.toArray();
        dispatch(_syncAssignments(allAssignmentsFromDB));
      } catch (e) {
        console.error("アンドゥ/リドゥ後のDB強制同期に失敗:", e);
        const allAssignmentsFromDB = await db.assignments.toArray();
        dispatch(_syncAssignments(allAssignmentsFromDB));
      }
    })();
  }, [dispatch, store]); 


  // (ポチポチモード - 変更なし)
  const toggleHoliday = useCallback((date: string, staff: IStaff, targetPatternId: string) => {
    if (staff.staffId.startsWith(WORK_AREA_STAFF_ID_PREFIX)) { return; }
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
    (async () => {
      let updatedAssignments: IAssignment[] = [];
      try {
        updatedAssignments = await db.transaction('rw', db.assignments, async () => {
          const existingInDB = await db.assignments.where('[date+staffId]').equals([date, staff.staffId]).toArray();
          if (existingInDB.length > 0) {
            await db.assignments.bulkDelete(existingInDB.map(a => a.id!));
          }
          if (newAssignmentBase) { 
            await db.assignments.add(newAssignmentBase);
          }
          return db.assignments.toArray();
        }); 
        if (syncLockRef.current === currentSyncId) {
            dispatch(_syncAssignments(updatedAssignments));
        } else {
            console.warn(`[DEBUG] Stale _syncAssignments call detected (Pochi). SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
        }
      } catch (e) {
        console.error("アサインの即時更新（DB反映）に失敗:", e);
        if (syncLockRef.current === currentSyncId) {
            console.warn("[DEBUG] DB Pochi failed. Reverting optimistic update.");
            db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
        } else {
            console.warn(`[DEBUG] DB Pochi failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
        }
      } finally {
        if (processingCellKeyRef.current === cellKey) {
          processingCellKeyRef.current = null;
        }
      }
    })(); 

  }, [dispatch, store]); 


  // (セルクリック - 変更なし)
  const handleCellClick = useCallback((
    e: React.MouseEvent, 
    date: string, 
    staffId: string, 
    staffIndex: number, 
    dateIndex: number
  ) => {
    
    const staff = sortedStaffList.find(s => s.staffId === staffId); 
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };

    if (_clickMode !== 'holiday' && _clickMode !== 'paid_leave') {
      processingCellKeyRef.current = null; 
    }

    switch (_clickMode) { 
      case 'select':
        if (e.shiftKey && activeCell) {
          const isDragStartedInWorkArea = isWorkAreaCell(activeCell.staffIndex, activeCell.dateIndex);
          const isMouseCurrentlyInWorkArea = isWorkAreaCell(staffIndex, dateIndex);
          
          if (isDragStartedInWorkArea === isMouseCurrentlyInWorkArea) {
            setSelectionRange({ start: activeCell, end: cell });
          }
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
      isWorkAreaCell 
  ]); 

  // (マウスダウン - 変更なし)
  const handleCellMouseDown = useCallback((e: React.MouseEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    if (_clickMode !== 'select') return; 
    e.preventDefault(); 
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    if (e.shiftKey && activeCell) {
      setSelectionRange({ start: activeCell, end: cell });
    } else {
      setActiveCell(cell); 
      setSelectionRange({ start: cell, end: cell }); 
    }
    setIsDragging(true);
  }, [_clickMode, activeCell]); 

  // (マウスムーブ (セル上) - 変更なし)
  const handleCellMouseMove = useCallback((date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    if (_clickMode !== 'select' || !isDragging || !selectionRange || !activeCell) return; 
    const isDragStartedInWorkArea = isWorkAreaCell(activeCell.staffIndex, activeCell.dateIndex);
    const isMouseCurrentlyInWorkArea = isWorkAreaCell(staffIndex, dateIndex);
    if (isDragStartedInWorkArea !== isMouseCurrentlyInWorkArea) {
      return; 
    }
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    setSelectionRange({ ...selectionRange, end: cell });
  }, [_clickMode, isDragging, selectionRange, activeCell, isWorkAreaCell]);

  // (マウスアップ - 変更なし)
  const handleCellMouseUp = useCallback(() => {
    if (_clickMode !== 'select') return; 
    setIsDragging(false);
    stopAutoScroll(); 
  }, [_clickMode, stopAutoScroll]); 


  // --- C/X/V/矢印キー イベント ---
  useEffect(() => {
    // (latestAssignmentsRef, unsubscribe - 変更なし)
    const latestAssignmentsRef = { 
      current: store.getState().assignment.present.assignments 
    };
    const unsubscribe = store.subscribe(() => {
      const newAssignments = store.getState().assignment.present.assignments;
      if (latestAssignmentsRef.current !== newAssignments) {
        latestAssignmentsRef.current = newAssignments;
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      processingCellKeyRef.current = null;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      
      // ★ 修正: monthDays を参照
      if (!event.shiftKey && !ctrlKey && !event.metaKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();

        if (!activeCell) {
          const staff = sortedStaffList[0];
          // ★ 修正: MONTH_DAYS -> monthDays
          const day = monthDays[0]; 
          if (staff && day) {
            const newCell: CellCoords = { staffId: staff.staffId, date: day.dateStr, staffIndex: 0, dateIndex: 0 };
            setActiveCell(newCell);
            setSelectionRange({ start: newCell, end: newCell });
          }
          return;
        }

        let { staffIndex, dateIndex } = activeCell;

        const isCurrentCellInWorkArea = isWorkAreaCell(staffIndex, dateIndex);
        
        const minStaffIndex = isCurrentCellInWorkArea ? WORK_AREA_STAFF_INDEX_START : 0;
        const maxStaffIndex = isCurrentCellInWorkArea ? (WORK_AREA_STAFF_INDEX_START + workAreaRowCount - 1) : (sortedStaffList.length - 1);
        const minDateIndex = isCurrentCellInWorkArea ? WORK_AREA_DATE_INDEX_START : 0;
        // ★ 修正: MONTH_DAYS -> monthDays
        const maxDateIndex = isCurrentCellInWorkArea ? (WORK_AREA_DATE_INDEX_START + workAreaColCount - 1) : (monthDays.length - 1); 

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
        if (isCurrentCellInWorkArea) {
          newActiveCell = virtualWorkAreaRowsWithCoords[staffIndex - WORK_AREA_STAFF_INDEX_START]?.getCellCoords(dateIndex) || null;
        } else {
          const staff = sortedStaffList[staffIndex];
          // ★ 修正: MONTH_DAYS -> monthDays
          const day = monthDays[dateIndex]; 
          if (staff && day) {
            newActiveCell = { staffId: staff.staffId, date: day.dateStr, staffIndex, dateIndex };
          }
        }
        
        if (newActiveCell) {
          setActiveCell(newActiveCell);
          setSelectionRange({ start: newActiveCell, end: newActiveCell });
        }
        return; 
      }
      
      // ★ 修正: monthDays を参照
      if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        
        if (!activeCell || !selectionRange) return;
        let { staffIndex, dateIndex } = selectionRange.end;

        const isCurrentCellInWorkArea = isWorkAreaCell(staffIndex, dateIndex);
        
        const minStaffIndex = isCurrentCellInWorkArea ? WORK_AREA_STAFF_INDEX_START : 0;
        const maxStaffIndex = isCurrentCellInWorkArea ? (WORK_AREA_STAFF_INDEX_START + workAreaRowCount - 1) : (sortedStaffList.length - 1);
        const minDateIndex = isCurrentCellInWorkArea ? WORK_AREA_DATE_INDEX_START : 0;
        // ★ 修正: MONTH_DAYS -> monthDays
        const maxDateIndex = isCurrentCellInWorkArea ? (WORK_AREA_DATE_INDEX_START + workAreaColCount - 1) : (monthDays.length - 1); 

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
        if (isCurrentCellInWorkArea) {
          newEndCell = virtualWorkAreaRowsWithCoords[staffIndex - WORK_AREA_STAFF_INDEX_START]?.getCellCoords(dateIndex) || null;
        } else {
          const staff = sortedStaffList[staffIndex];
          // ★ 修正: MONTH_DAYS -> monthDays
          const day = monthDays[dateIndex]; 
          if (staff && day) {
            newEndCell = { staffId: staff.staffId, date: day.dateStr, staffIndex, dateIndex };
          }
        }
        
        if (newEndCell) {
          setSelectionRange({ start: activeCell, end: newEndCell });
        }
        return; 
      }


      // ★ 修正: monthDays を参照
      if (ctrlKey && (event.key === 'c' || event.key === 'x')) {
        event.preventDefault();
        const currentAssignments = latestAssignmentsRef.current;
        const rangeIndices = getRangeIndices(selectionRange);
        if (!rangeIndices) return;
        const { minStaff, maxStaff, minDate, maxDate } = rangeIndices;
        const assignmentsInSelection: (Omit<IAssignment, 'id' | 'staffId' | 'date'> | null)[] = [];
        const keysToCut = new Set<string>();
        const isCopyFromWorkArea = isWorkAreaCell(minStaff, minDate);
        for (let sIdx = minStaff; sIdx <= maxStaff; sIdx++) {
          for (let dIdx = minDate; dIdx <= maxDate; dIdx++) {
            let key: string | null = null;
            if (isCopyFromWorkArea) {
              const staffRow = virtualWorkAreaRowsWithCoords[sIdx - WORK_AREA_STAFF_INDEX_START]; 
              const dateCol = virtualWorkAreaCols[dIdx - WORK_AREA_DATE_INDEX_START];
              if (staffRow && dateCol) {
                key = `${staffRow.staffId}_${dateCol.date}`;
              }
            } else {
              const staff = sortedStaffList[sIdx];
              // ★ 修正: MONTH_DAYS -> monthDays
              const day = monthDays[dIdx]; 
              if (staff && day) {
                key = `${staff.staffId}_${day.dateStr}`;
              }
            }
            if (!key) continue;
            if (event.key === 'x') {
              keysToCut.add(key);
            }
            const cellAssignments = assignmentsMap.get(key) || []; 
            const firstAssignment = cellAssignments[0]; 
            if (firstAssignment) {
              assignmentsInSelection.push({ 
                patternId: firstAssignment.patternId, 
                unitId: firstAssignment.unitId, 
                locked: firstAssignment.locked 
              });
            } else {
              assignmentsInSelection.push(null); // 空のセル
            }
          }
        }
        clipboardRef.current = {
          assignments: assignmentsInSelection,
          rowCount: maxStaff - minStaff + 1,
          colCount: maxDate - minDate + 1,
          sourceType: isCopyFromWorkArea ? 'WORK_AREA' : 'MAIN',
        };
        if (event.key === 'x') {
          // (CUT DBロジック - 変更なし)
          const assignmentsToRemove = currentAssignments.filter(a => keysToCut.has(`${a.staffId}_${a.date}`));
          const newOptimisticAssignments = currentAssignments.filter(a => !keysToCut.has(`${a.staffId}_${a.date}`));
          const currentSyncId = Date.now();
          syncLockRef.current = currentSyncId;
          dispatch(setAssignments(newOptimisticAssignments)); 
          if (assignmentsToRemove.length > 0) {
            (async () => {
              let updatedAssignments: IAssignment[] = [];
              try {
                updatedAssignments = await db.transaction('rw', db.assignments, async () => {
                  const allAssignmentsInDB = await db.assignments.toArray();
                  const finalOptimisticState = newOptimisticAssignments;
                  const assignmentsToRemoveDB = allAssignmentsInDB.filter(dbAssignment => {
                    const existsInOptimistic = finalOptimisticState.some(optimistic => 
                      (dbAssignment.id && optimistic.id === dbAssignment.id) ||
                      (optimistic.staffId === dbAssignment.staffId && optimistic.date === dbAssignment.date)
                    );
                    return !existsInOptimistic;
                  });
                  const assignmentsToAddDB = finalOptimisticState.filter(optimistic => {
                      const existsInDB = allAssignmentsInDB.some(dbAssignment => 
                          (dbAssignment.id && optimistic.id === dbAssignment.id) ||
                          (optimistic.staffId === dbAssignment.staffId && optimistic.date === dbAssignment.date)
                      );
                      return !existsInDB;
                  }).map(({ id, ...rest }) => rest);
                  if (assignmentsToRemoveDB.length > 0) {
                      await db.assignments.bulkDelete(assignmentsToRemoveDB.map(a => a.id!));
                  }
                  if (assignmentsToAddDB.length > 0) {
                      await db.assignments.bulkAdd(assignmentsToAddDB);
                  }
                  return db.assignments.toArray();
                });
                if (syncLockRef.current === currentSyncId) {
                    dispatch(_syncAssignments(updatedAssignments));
                } else {
                    console.warn(`[DEBUG] Stale _syncAssignments call detected (Cut). SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
                }
              } catch (e) {
                console.error("カット(DB削除)に失敗:", e);
                if (syncLockRef.current === currentSyncId) {
                    console.warn("[DEBUG] DB Cut failed. Reverting optimistic update.");
                    db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
                } else {
                    console.warn(`[DEBUG] DB Cut failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
                }
              }
            })(); 
          }
        }
      } 
      // ★ 修正: monthDays を参照
      else if (ctrlKey && event.key === 'v') {
        event.preventDefault();
        const clipboard = clipboardRef.current; 
        if (!clipboard || !activeCell) return;
        const currentAssignments = latestAssignmentsRef.current;
        const { assignments: clipboardAssignments, rowCount, colCount } = clipboard;
        const newAssignmentsToPaste: Omit<IAssignment, 'id'>[] = [];
        const keysToOverwrite = new Set<string>(); 
        const isPasteToWorkArea = isWorkAreaCell(activeCell.staffIndex, activeCell.dateIndex);
        for (let r = 0; r < rowCount; r++) {
          for (let c = 0; c < colCount; c++) {
            const clipboardItem = clipboardAssignments[r * colCount + c];
            let targetStaffId: string | null = null;
            let targetDate: string | null = null;
            let key: string | null = null;
            if (isPasteToWorkArea) {
              const staffIndex = activeCell.staffIndex + r;
              const dateIndex = activeCell.dateIndex + c;
              const staffRow = virtualWorkAreaRowsWithCoords[staffIndex - WORK_AREA_STAFF_INDEX_START]; 
              const dateCol = virtualWorkAreaCols[dateIndex - WORK_AREA_DATE_INDEX_START];
              if (!staffRow || !dateCol) continue; 
              targetStaffId = staffRow.staffId;
              if (clipboard.sourceType === 'MAIN') {
                targetDate = dateCol.date; 
              } else {
                targetDate = dateCol.date; 
              }
            } else {
              const staffIndex = activeCell.staffIndex + r;
              const dateIndex = activeCell.dateIndex + c;
              // ★ 修正: MONTH_DAYS -> monthDays
              if (staffIndex >= sortedStaffList.length || dateIndex >= monthDays.length) { 
                continue; 
              }
              const targetStaff = sortedStaffList[staffIndex];
              // ★ 修正: MONTH_DAYS -> monthDays
              const targetDay = monthDays[dateIndex]; 
              if (!targetStaff || !targetDay) continue;
              targetStaffId = targetStaff.staffId;
              if (clipboard.sourceType === 'MAIN') {
                targetDate = targetDay.dateStr; 
              } else {
                targetDate = targetDay.dateStr;
              }
            }
            if (!targetStaffId || !targetDate) continue;
            key = `${targetStaffId}_${targetDate}`;
            keysToOverwrite.add(key); 
            if (clipboardItem) { 
              newAssignmentsToPaste.push({
                date: targetDate, 
                staffId: targetStaffId, 
                patternId: clipboardItem.patternId,
                unitId: clipboardItem.unitId,
                locked: clipboardItem.locked
              });
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
        if (keysToOverwrite.size > 0 && activeCell) {
          const endStaffIndex = activeCell.staffIndex + rowCount - 1;
          const endDateIndex = activeCell.dateIndex + colCount - 1;
          const maxStaffIndex = isPasteToWorkArea 
            ? (WORK_AREA_STAFF_INDEX_START + workAreaRowCount - 1) 
            : (sortedStaffList.length - 1);
          // ★ 修正: MONTH_DAYS -> monthDays
          const maxDateIndex = isPasteToWorkArea
            ? (WORK_AREA_DATE_INDEX_START + workAreaColCount - 1)
            : (monthDays.length - 1); 
          const clampedEndStaffIndex = Math.min(endStaffIndex, maxStaffIndex);
          const clampedEndDateIndex = Math.min(endDateIndex, maxDateIndex);
          if (clampedEndStaffIndex >= activeCell.staffIndex && clampedEndDateIndex >= activeCell.dateIndex) {
            let endStaffId: string | null = null;
            let endDate: string | null = null;
            if (isPasteToWorkArea) {
              const staffRow = virtualWorkAreaRowsWithCoords[clampedEndStaffIndex - WORK_AREA_STAFF_INDEX_START]; 
              const dateCol = virtualWorkAreaCols[clampedEndDateIndex - WORK_AREA_DATE_INDEX_START];
              if (staffRow && dateCol) {
                endStaffId = staffRow.staffId;
                endDate = dateCol.date;
              }
            } else {
              const endStaff = sortedStaffList[clampedEndStaffIndex];
              // ★ 修正: MONTH_DAYS -> monthDays
              const endDay = monthDays[clampedEndDateIndex]; 
              if (endStaff && endDay) {
                endStaffId = endStaff.staffId;
                endDate = endDay.dateStr;
              }
            }
            if (endStaffId && endDate) {
              const newEndCell: CellCoords = {
                staffId: endStaffId,
                date: endDate,
                staffIndex: clampedEndStaffIndex,
                dateIndex: clampedEndDateIndex,
              };
              setSelectionRange({ start: activeCell, end: newEndCell });
            } else {
              setSelectionRange({ start: activeCell, end: activeCell });
            }
          } else {
            setSelectionRange({ start: activeCell, end: activeCell });
          }
        }
        // (PASTE DBロジック - 変更なし)
        (async () => {
          let updatedAssignments: IAssignment[] = [];
          try {
            updatedAssignments = await db.transaction('rw', db.assignments, async () => {
                const allAssignmentsInDB = await db.assignments.toArray();
                const assignmentsToRemove = allAssignmentsInDB.filter(dbAssignment => {
                  const existsInOptimistic = finalOptimisticState.some(optimistic => 
                    (dbAssignment.id && optimistic.id === dbAssignment.id) ||
                    (optimistic.staffId === dbAssignment.staffId && optimistic.date === dbAssignment.date)
                  );
                  return !existsInOptimistic;
                });
                const assignmentsToAdd = finalOptimisticState.filter(optimistic => {
                    const existsInDB = allAssignmentsInDB.some(dbAssignment => 
                        (dbAssignment.id && optimistic.id === dbAssignment.id) ||
                        (optimistic.staffId === dbAssignment.staffId && optimistic.date === dbAssignment.date)
                    );
                    return !existsInDB;
                }).map(({ id, ...rest }) => rest); 
                if (assignmentsToRemove.length > 0) {
                    await db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!));
                }
                if (assignmentsToAdd.length > 0) {
                    await db.assignments.bulkAdd(assignmentsToAdd);
                }
                return db.assignments.toArray();
            });
            if (syncLockRef.current === currentSyncId) {
              dispatch(_syncAssignments(updatedAssignments)); 
            } else {
              console.warn(`[DEBUG] Stale _syncAssignments call detected. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
            }
          } catch (e) {
            console.error("ペースト(DB操作)に失敗:", e);
            if (syncLockRef.current === currentSyncId) {
                console.warn("[DEBUG] DB Paste failed. Reverting optimistic update.");
                db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
            } else {
                console.warn(`[DEBUG] DB Paste failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
            }
          }
        })();
      }
    };

    // (自動スクロール(MouseMove) - 変更なし)
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isDragging || _clickMode !== 'select' || !activeCell) {
        stopAutoScroll();
        return;
      }
      const isDragInWorkArea = isWorkAreaCell(activeCell.staffIndex, activeCell.dateIndex);
      const container = isDragInWorkArea 
        ? workAreaRef.current 
        : mainCalendarScrollerRef.current; 
      if (!container) {
        stopAutoScroll();
        return;
      }
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;
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
            const currentContainer = isDragInWorkArea 
              ? workAreaRef.current 
              : mainCalendarScrollerRef.current;
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
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleWindowMouseMove); 
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleWindowMouseMove); 
      unsubscribe(); 
      stopAutoScroll(); 
    };
  }, [ // ★★★ 依存配列の修正 ★★★
    _clickMode, isDragging, selectionRange, activeCell, 
    sortedStaffList, 
    dispatch, store,
    getRangeIndices, setClickMode, 
    toggleHoliday, 
    holidayPatternId, 
    paidLeavePatternId,
    invalidateSyncLock,
    assignmentsMap,
    virtualWorkAreaRowsWithCoords, virtualWorkAreaCols, isWorkAreaCell,
    workAreaColCount, workAreaRowCount,
    stopAutoScroll, 
    workAreaRef, 
    mainCalendarScrollerRef, 
    handleCellMouseUp,
    monthDays // ★ 修正: monthDays を追加
  ]);

  // ★★★ 自動スクロール (SHIFT+矢印キー / 矢印キー単体) ★★★
  useEffect(() => {
    // 変更されたのが selectionRange.end であっても、
    // キーボード操作の場合は activeCell も追従させる
    const targetCell = (selectionRange && !isDragging) ? selectionRange.end : (activeCell && !isDragging ? activeCell : null);

    if (targetCell) {
      // 終点のセルIDを特定
      const cellId = `cell-${targetCell.staffId}-${targetCell.date}`;
      const element = document.getElementById(cellId);

      // 対応するDOM要素が見つかれば、そこまでスクロールする
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth', 
          block: 'nearest',  
          inline: 'nearest' 
        });
      }
    }
    // ★ 修正: activeCell にも依存
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
    invalidateSyncLock,
  };
};