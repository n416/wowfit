import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
// ★ _setIsSyncing をインポート
import { setAssignments, _syncAssignments, _setIsSyncing } from '../store/assignmentSlice'; 
// ★ 修正: 未使用の getMonthDays を削除


// ★ 修正: MonthDay 型をここで定義
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
// ★★★ 修正: アプリ内クリップボードの型定義を削除 ★★★


// ★★★ 修正: 作業領域(WORK_AREA)関連の定数をすべて削除 ★★★
// const WORK_AREA_STAFF_INDEX_START = 900;
// ...


/**
 * @param sortedStaffList StaffCalendarView に表示されている順序のスタッフリスト
 * @param mainCalendarScrollerRef メインカレンダー(Virtuoso)のスクローラDOMへの参照
 */
export const useCalendarInteractions = (
  sortedStaffList: IStaff[], 
  // ★★★ 修正: workAreaRef を引数から削除 ★★★
  // workAreaRef: React.RefObject<HTMLDivElement | null>, 
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>,
  monthDays: MonthDay[]
) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>(); 
  
  // (state - 変更なし)
  const [_clickMode, _setClickMode] = useState<ClickMode>('normal');
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  
  const [selectionRange, setSelectionRange] = useState<{ start: CellCoords, end: CellCoords } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  
  // (ref - 変更なし)
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
  
  // ★★★ patternMap も useMemo で取得 (ペースト時に必要) ★★★
  const patternMap = useMemo(() => 
    new Map(shiftPatterns.map(p => [p.patternId, p])),
  [shiftPatterns]);

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
  // (getRangeIndices - 変更なし)
  const getRangeIndices = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    if (!range) return null;
    return {
      minStaff: Math.min(range.start.staffIndex, range.end.staffIndex),
      maxStaff: Math.max(range.start.staffIndex, range.end.staffIndex),
      minDate: Math.min(range.start.dateIndex, range.end.dateIndex),
      maxDate: Math.max(range.start.dateIndex, range.end.dateIndex),
    };
  }, []);
  
  // ★★★ 修正: 作業領域関連のフック (workAreaRowCount, virtualWorkAreaCols, virtualWorkAreaRowsWithCoords) をすべて削除 ★★★

  // ★★★ 修正: isWorkAreaCell を削除 ★★★
  
  // (setClickMode - 変更なし)
  const setClickMode = useCallback((newMode: ClickMode) => {
    _setClickMode(newMode);
    setActiveCell(null);
    setSelectionRange(null);
    setIsDragging(false);
  }, []); 


  // (ポチポチモード - ★★★ 修正: 作業領域の staffId チェックを削除 ★★★)
  const toggleHoliday = useCallback((date: string, staff: IStaff, targetPatternId: string) => {
    
    // (Plan D のローディングガード - 変更なし)
    const state = store.getState();
    const isCurrentlyLoading = state.assignment.present.adjustmentLoading ||
                               state.assignment.present.patchLoading ||
                               state.calendar.isMonthLoading;
    if (isCurrentlyLoading) {
      return;
    }

    // ★★★ 修正: 作業領域 (WA_STAFF_) のチェックを削除 ★★★
    // if (staff.staffId.startsWith(WORK_AREA_STAFF_ID_PREFIX)) { return; } 

    const cellKey = `${staff.staffId}_${date}`;
    if (processingCellKeyRef.current === cellKey) { return; }
    processingCellKeyRef.current = cellKey; 
    
    // (楽観的更新の準備 - 変更なし)
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
    
    // (Plan F: 順序入れ替え - 変更なし)
    dispatch(setAssignments(newOptimisticAssignments)); 
    dispatch(_setIsSyncing(true)); 
    
    // (非同期DB操作 - 変更なし)
    (async () => {
      try {
        // (DBロジック - 変更なし)
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
        
        // (DB操作成功時 - 変更なし)
        if (syncLockRef.current === currentSyncId) {
            dispatch(_setIsSyncing(false));
        }
        
      } catch (e) {
        // (DB操作失敗時 - 変更なし)
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


  // (セルクリック - ★★★ 修正: 作業領域の分岐を削除 ★★★)
  const handleCellClick = useCallback((
    e: React.MouseEvent, 
    date: string, 
    staffId: string, 
    staffIndex: number, 
    dateIndex: number
  ) => {

    // (ローディングガード - 変更なし)
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

    switch (_clickMode) { 
      case 'select':
        if (e.shiftKey && activeCell) {
          // ★★★ 修正: 作業領域の分岐を削除 ★★★
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

  // (マウスダウン - 変更なし)
  const handleCellMouseDown = useCallback((e: React.MouseEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    
    // (ローディングガード - 変更なし)
    const state = store.getState();
    const isCurrentlyLoading = state.assignment.present.isSyncing ||
                               state.assignment.present.adjustmentLoading ||
                               state.assignment.present.patchLoading ||
                               state.calendar.isMonthLoading;
    if (isCurrentlyLoading) {
      return;
    }
    
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
  }, [_clickMode, activeCell, store]);

  // (マウスムーブ (セル上) - ★★★ 修正: 作業領域の分岐を削除 ★★★)
  const handleCellMouseMove = useCallback((date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    if (_clickMode !== 'select' || !isDragging || !selectionRange || !activeCell) return; 
    
    // ★★★ 修正: 作業領域の分岐を削除 ★★★
    // const isDragStartedInWorkArea = isWorkAreaCell(activeCell.staffIndex, activeCell.dateIndex);
    // const isMouseCurrentlyInWorkArea = isWorkAreaCell(staffIndex, dateIndex);
    // if (isDragStartedInWorkArea !== isMouseCurrentlyInWorkArea) {
    //   return; 
    // }

    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    setSelectionRange({ ...selectionRange, end: cell });
  }, [_clickMode, isDragging, selectionRange, activeCell]);

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

    // (handleKeyDown - 変更なし)
    const handleKeyDown = async (event: KeyboardEvent) => {
      // (入力中ガード - 変更なし)
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // (ローディングガード - 変更なし)
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
      
      // (矢印キー移動 - ★★★ 修正: 作業領域の分岐を削除 ★★★)
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
        // ★★★ 修正: 作業領域の分岐を削除 ★★★
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

        // ★★★ 修正: 作業領域の分岐を削除 ★★★
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
      
      // (Shift + 矢印キー移動 - ★★★ 修正: 作業領域の分岐を削除 ★★★)
      if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        
        if (!activeCell || !selectionRange) return;
        let { staffIndex, dateIndex } = selectionRange.end;

        // ★★★ 修正: 作業領域の分岐を削除 ★★★
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

        // ★★★ 修正: 作業領域の分岐を削除 ★★★
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


      // (CUT / COPY - ★★★ 修正: 作業領域の分岐を削除 ★★★)
      if (ctrlKey && (event.key === 'c' || event.key === 'x')) {
        event.preventDefault();
        const currentAssignments = latestAssignmentsRef.current;
        
        // (TSV文字列の生成ロジック)
        const rangeIndices = getRangeIndices(selectionRange);
        if (!rangeIndices) return;
        const { minStaff, maxStaff, minDate, maxDate } = rangeIndices;

        const tsvRows: string[][] = [];
        const keysToCut = new Set<string>();
        // ★★★ 修正: 作業領域の分岐を削除 ★★★
        // const isCopyFromWorkArea = false; 

        for (let sIdx = minStaff; sIdx <= maxStaff; sIdx++) {
          const row: string[] = [];
          for (let dIdx = minDate; dIdx <= maxDate; dIdx++) {
            let key: string | null = null;
            // ★★★ 修正: 作業領域の分岐を削除 ★★★
            const staff = sortedStaffList[sIdx];
            const day = monthDays[dIdx]; 
            if (staff && day) {
              key = `${staff.staffId}_${day.dateStr}`;
            }
            
            if (!key) {
              row.push(""); // 範囲外なら空セル
              continue;
            }

            if (event.key === 'x') {
              keysToCut.add(key);
            }

            const cellAssignments = assignmentsMap.get(key) || []; 
            const firstAssignment = cellAssignments[0]; 
            if (firstAssignment) {
              row.push(firstAssignment.patternId); // ★ patternId のみ
            } else {
              row.push(""); // 空のセル
            }
          }
          tsvRows.push(row);
        }
        
        // (TSV書き込み - 変更なし)
        const tsvString = tsvRows.map(row => row.join('\t')).join('\n');
        try {
          await navigator.clipboard.writeText(tsvString);
        } catch (err) {
          console.error('OSクリップボードへの書き込みに失敗:', err);
          return;
        }

        // (CUT ('x') の場合のDB削除ロジック - 変更なし)
        if (event.key === 'x') {
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
      } 
      // (PASTE - ★★★ 修正: 作業領域の分岐を削除 ★★★)
      else if (ctrlKey && event.key === 'v') {
        event.preventDefault();

        if (!activeCell) return;
        
        // (OSクリップボード読み込み - 変更なし)
        let tsvString = "";
        try {
          tsvString = await navigator.clipboard.readText();
        } catch (err) {
          console.error('OSクリップボードの読み取りに失敗:', err);
          return;
        }
        
        if (!tsvString) return;

        const currentAssignments = latestAssignmentsRef.current;
        
        // (TSV解析 - 変更なし)
        const tsvRows = tsvString.split('\n').map(row => row.split('\t'));
        const rowCount = tsvRows.length;
        let colCount = 0;
        
        const newAssignmentsToPaste: Omit<IAssignment, 'id'>[] = [];
        const keysToOverwrite = new Set<string>(); 
        // ★★★ 修正: 作業領域の分岐を削除 ★★★
        // const isPasteToWorkArea = false; 

        for (let r = 0; r < tsvRows.length; r++) {
          const tsvCols = tsvRows[r];
          if (tsvCols.length > colCount) colCount = tsvCols.length; 

          for (let c = 0; c < tsvCols.length; c++) {
            const patternId = tsvCols[c].trim(); 
            
            let targetStaffId: string | null = null;
            let targetDate: string | null = null;
            let targetStaff: IStaff | undefined | null = null; 

            // ★★★ 修正: 作業領域の分岐を削除 ★★★
            const staffIndex = activeCell.staffIndex + r;
            const dateIndex = activeCell.dateIndex + c;
            if (staffIndex >= sortedStaffList.length || dateIndex >= monthDays.length) { 
              continue; 
            }
            targetStaff = sortedStaffList[staffIndex];
            const targetDay = monthDays[dateIndex]; 
            if (!targetStaff || !targetDay) continue;
            targetStaffId = targetStaff.staffId;
            targetDate = targetDay.dateStr;
            

            if (!targetStaffId || !targetDate) continue;
            const key = `${targetStaffId}_${targetDate}`;
            keysToOverwrite.add(key); 

            if (patternId) { 
              const pattern = patternMap.get(patternId);
              if (pattern) {
                newAssignmentsToPaste.push({
                  date: targetDate, 
                  staffId: targetStaffId, 
                  patternId: pattern.patternId,
                  unitId: (pattern.workType === 'Work' && targetStaff) ? targetStaff.unitId : null,
                  locked: true 
                });
              }
            }
          }
        }
        
        // (楽観的更新 - 変更なし)
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
        
        // (Plan F: 順序入れ替え - 変更なし)
        dispatch(setAssignments(finalOptimisticState)); 
        dispatch(_setIsSyncing(true));
        
        // (貼り付け後の選択範囲更新 - ★★★ 修正: 作業領域の分岐を削除 ★★★)
        if (keysToOverwrite.size > 0 && activeCell) {
          const endStaffIndex = activeCell.staffIndex + rowCount - 1;
          const endDateIndex = activeCell.dateIndex + colCount - 1;
          const maxStaffIndex = sortedStaffList.length - 1;
          const maxDateIndex = monthDays.length - 1; 

          const clampedEndStaffIndex = Math.min(endStaffIndex, maxStaffIndex);
          const clampedEndDateIndex = Math.min(endDateIndex, maxDateIndex);
          if (clampedEndStaffIndex >= activeCell.staffIndex && clampedEndDateIndex >= activeCell.dateIndex) {
            let endStaffId: string | null = null;
            let endDate: string | null = null;
            
            // ★★★ 修正: 作業領域の分岐を削除 ★★★
            const endStaff = sortedStaffList[clampedEndStaffIndex];
            const endDay = monthDays[clampedEndDateIndex]; 
            if (endStaff && endDay) {
              endStaffId = endStaff.staffId;
              endDate = endDay.dateStr;
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
      }
    };

    // (自動スクロール(MouseMove) - ★★★ 修正: 作業領域の分岐を削除 ★★★)
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isDragging || _clickMode !== 'select' || !activeCell) {
        stopAutoScroll();
        return;
      }
      // ★★★ 修正: 作業領域の分岐を削除 ★★★
      // const isDragInWorkArea = false;
      const container = mainCalendarScrollerRef.current; 

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
            // ★★★ 修正: 作業領域の分岐を削除 ★★★
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
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleWindowMouseMove); 
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleWindowMouseMove); 
      unsubscribe(); 
      stopAutoScroll(); 
    };
  }, [ // (依存配列)
    _clickMode, isDragging, selectionRange, activeCell, 
    sortedStaffList, 
    dispatch, store,
    getRangeIndices, setClickMode, 
    toggleHoliday, 
    holidayPatternId, paidLeavePatternId,
    assignmentsMap,
    patternMap, 
    // ★★★ 修正: 作業領域関連のフックを削除 ★★★
    // virtualWorkAreaRowsWithCoords, virtualWorkAreaCols, isWorkAreaCell,
    // workAreaColCount, workAreaRowCount,
    stopAutoScroll, 
    // ★★★ 修正: workAreaRef を削除 ★★★
    mainCalendarScrollerRef, 
    handleCellMouseUp,
    monthDays 
  ]);

  // (自動スクロール (SHIFT+矢印キー / 矢印キー単体) - 変更なし)
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
    invalidateSyncLock: () => {}, // ★ 外部用にダミー関数を渡す
  };
};