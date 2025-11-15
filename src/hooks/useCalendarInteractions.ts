import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
import { setAssignments, _syncOptimisticAssignment } from '../store/assignmentSlice';
import { MONTH_DAYS } from '../utils/dateUtils'; 

// --- 型定義 ---

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
};

/**
 * カレンダーのクリックモードと、
 * それに関連する「ポチポチモード」および「選択モード（C/X/V）」の
 * インタラクションロジックを管理するフック
 *
 * @param sortedStaffList StaffCalendarView に表示されている順序のスタッフリスト
 */
export const useCalendarInteractions = (
  sortedStaffList: IStaff[], 
) => {
  const dispatch: AppDispatch = useDispatch();
  
  const [_clickMode, _setClickMode] = useState<ClickMode>('normal');
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: CellCoords, end: CellCoords } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // ★ 1. 「現在操作中のセルのキー」を Ref で管理
  // (例: "s001_2025-11-10")
  const processingCellKeyRef = useRef<string | null>(null);

  // --- データ取得 ---
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);
  
  // (useMemo: assignmentsMap)
  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>();
    for (const assignment of assignments) {
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment);
    }
    return map;
  }, [assignments]);
  
  // (useMemo: holidayPatternId, paidLeavePatternId)
  const holidayPatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休',
  [shiftPatterns]);
  const paidLeavePatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給',
  [shiftPatterns]);

  
  // (useCallback: getRangeIndices)
  const getRangeIndices = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    if (!range) return null;
    return {
      minStaff: Math.min(range.start.staffIndex, range.end.staffIndex),
      maxStaff: Math.max(range.start.staffIndex, range.end.staffIndex),
      minDate: Math.min(range.start.dateIndex, range.end.dateIndex),
      maxDate: Math.max(range.start.dateIndex, range.end.dateIndex),
    };
  }, []);
  
  // (useCallback: setClickMode)
  const setClickMode = useCallback((newMode: ClickMode) => {
    _setClickMode(newMode);
    setActiveCell(null);
    setSelectionRange(null);
    setIsDragging(false);
  }, []); 


  // --- ポチポチモード (バグ修正) ---
  const toggleHoliday = useCallback((date: string, staff: IStaff, targetPatternId: string) => {
    
    const cellKey = `${staff.staffId}_${date}`;

    // ★ 2. 現在操作中のセルキーをチェック
    if (processingCellKeyRef.current === cellKey) {
      // (同じセルがまだ処理中（DB書き込み中）の場合は、連打とみなして無視)
      console.warn("Rapid click detected on the same cell, operation skipped.");
      return; 
    }
    // ★ 3. ロックを実行
    processingCellKeyRef.current = cellKey; 

    const existing = assignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;

    let newOptimisticAssignments: IAssignment[];
    let dbOperation: () => Promise<any>;
    const tempId = Date.now(); 

    if (existingIsTarget) {
      // (トグルオフ - 該当セルのアサインをすべて削除)
      newOptimisticAssignments = assignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      dbOperation = async () => {
        if (existing.length > 0) {
          await db.assignments.bulkDelete(existing.map(a => a.id!)); 
        }
      };
    } else {
      // (トグルオン - 該当セルのアサインをすべて削除してから 1件追加)
      const newAssignmentBase: Omit<IAssignment, 'id'> = {
        date: date, staffId: staff.staffId, patternId: targetPatternId,
        unitId: null, locked: true 
      };
      const otherAssignments = assignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }];

      dbOperation = async () => {
        // DB操作: 既存のアサインを（あれば）全件削除
        if (existing.length > 0) {
          await db.assignments.bulkDelete(existing.map((a: IAssignment) => a.id!));
        }
        // 新しいアサインを1件追加
        const newId = await db.assignments.add(newAssignmentBase);
        dispatch(_syncOptimisticAssignment({
          tempId: tempId, newAssignment: { ...newAssignmentBase, id: newId }
        }));
      };
    }
    dispatch(setAssignments(newOptimisticAssignments)); // ★ UI即時更新

    // ★ 4. DB操作の完了時 (または失敗時) にロックを解除
    dbOperation()
      .catch(e => {
        console.error("アサインの即時更新（DB反映）に失敗:", e);
        // エラー時はDBの状態で強制同期
        db.assignments.toArray().then(dbAssignments => dispatch(setAssignments(dbAssignments)));
      })
      .finally(() => {
        // ★ 5. 完了したら、このセルのロックを解除
        // (もし現時点でのロックキーが自分でなければ、
        // 別のセルの操作が始まっているので、解除しない)
        if (processingCellKeyRef.current === cellKey) {
          processingCellKeyRef.current = null;
        }
      });

  }, [assignments, dispatch]); // ★ 依存配列は [assignments, dispatch]


  // --- セルクリック / マウスドラッグイベント ---

  const handleCellClick = useCallback((date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    const staff = sortedStaffList[staffIndex];
    if (!staff) return;
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };

    // ★ 6. (重要) 選択モードや通常モードのクリックは、
    // ポチポチモードのDB操作を待たずにロックを解除する
    if (_clickMode !== 'holiday' && _clickMode !== 'paid_leave') {
      processingCellKeyRef.current = null; 
    }

    switch (_clickMode) { 
      case 'select':
        setActiveCell(cell); setSelectionRange({ start: cell, end: cell }); setIsDragging(false); break;
      case 'holiday':
        toggleHoliday(date, staff, holidayPatternId); break;
      case 'paid_leave':
        toggleHoliday(date, staff, paidLeavePatternId); break;
      case 'normal':
        break;
    }
  }, [
      _clickMode, sortedStaffList, 
      toggleHoliday, // ★ 依存配列に toggleHoliday を追加
      holidayPatternId, paidLeavePatternId
  ]); 

  const handleCellMouseDown = useCallback((e: React.MouseEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    if (_clickMode !== 'select') return; 
    e.preventDefault(); 
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    setActiveCell(cell); setSelectionRange({ start: cell, end: cell }); setIsDragging(true);
  }, [_clickMode]); 

  const handleCellMouseMove = useCallback((date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    if (_clickMode !== 'select' || !isDragging || !selectionRange) return; 
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };
    setSelectionRange({ ...selectionRange, end: cell });
  }, [_clickMode, isDragging, selectionRange]); 

  const handleCellMouseUp = useCallback(() => {
    if (_clickMode !== 'select') return; 
    setIsDragging(false);
  }, [_clickMode]); 


  // --- C/X/V キーボードイベント ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // ★ 7. (重要) キーボードイベントが発生した場合もロックを解除
      // (キー操作はポチポチモードのDB操作より優先される)
      processingCellKeyRef.current = null;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      // ★★★ Ctrl+C (コピー) / Ctrl+X (カット) ★★★
      if (ctrlKey && (event.key === 'c' || event.key === 'x')) {
        event.preventDefault();
        const rangeIndices = getRangeIndices(selectionRange);
        if (!rangeIndices) return;

        const { minStaff, maxStaff, minDate, maxDate } = rangeIndices;
        
        const assignmentsInSelection: (Omit<IAssignment, 'id' | 'staffId' | 'date'> | null)[] = [];
        const keysToCut = new Set<string>(); // 削除対象キー (staffId_date)

        for (let sIdx = minStaff; sIdx <= maxStaff; sIdx++) {
          for (let dIdx = minDate; dIdx <= maxDate; dIdx++) {
            const staff = sortedStaffList[sIdx];
            const day = MONTH_DAYS[dIdx];
            if (!staff || !day) continue;
            
            const key = `${staff.staffId}_${day.dateStr}`;
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
        
        setClipboard({
          assignments: assignmentsInSelection,
          rowCount: maxStaff - minStaff + 1,
          colCount: maxDate - minDate + 1,
        });

        if (event.key === 'x') {
          // --- CUT (X) の場合、楽観的削除を実行 ---
          const assignmentsToRemove = assignments.filter(a => 
            keysToCut.has(`${a.staffId}_${a.date}`)
          );
          const newOptimisticAssignments = assignments.filter(a => 
            !keysToCut.has(`${a.staffId}_${a.date}`)
          );
          
          dispatch(setAssignments(newOptimisticAssignments)); // UI即時更新
          
          // DB操作 (非同期)
          if (assignmentsToRemove.length > 0) {
            db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!))
              .catch(e => {
                console.error("カット(DB削除)に失敗:", e);
                db.assignments.toArray().then(dbAssignments => dispatch(setAssignments(dbAssignments)));
              });
          }
        }
      
      // ★★★ Ctrl+V (貼り付け) ★★★
      } else if (ctrlKey && event.key === 'v') {
        event.preventDefault();
        if (!clipboard || !activeCell) return;

        const { assignments: clipboardAssignments, rowCount, colCount } = clipboard;
        
        const newAssignmentsToPaste: Omit<IAssignment, 'id'>[] = [];
        const keysToOverwrite = new Set<string>(); // 上書き対象キー (staffId_date)

        for (let r = 0; r < rowCount; r++) {
          for (let c = 0; c < colCount; c++) {
            const staffIndex = activeCell.staffIndex + r;
            const dateIndex = activeCell.dateIndex + c;

            if (staffIndex >= sortedStaffList.length || dateIndex >= MONTH_DAYS.length) {
              continue; 
            }
            
            const targetStaff = sortedStaffList[staffIndex];
            const targetDay = MONTH_DAYS[dateIndex];
            const clipboardItem = clipboardAssignments[r * colCount + c];

            if (!targetStaff || !targetDay) continue;

            const key = `${targetStaff.staffId}_${targetDay.dateStr}`;
            keysToOverwrite.add(key); 

            if (clipboardItem) { 
              newAssignmentsToPaste.push({
                date: targetDay.dateStr,
                staffId: targetStaff.staffId,
                patternId: clipboardItem.patternId,
                unitId: clipboardItem.unitId,
                locked: clipboardItem.locked
              });
            }
          }
        }
        
        // --- 楽観的更新 (上書き) ---
        const assignmentsBeforePaste = assignments.filter(a => {
          const key = `${a.staffId}_${a.date}`;
          return !keysToOverwrite.has(key); 
        });
        
        const tempAssignments = newAssignmentsToPaste.map((a, i) => ({
          ...a,
          id: Date.now() + i 
        }));

        dispatch(setAssignments([...assignmentsBeforePaste, ...tempAssignments]));

        // --- DB操作 (非同期) ---
        (async () => {
          try {
            // 1. 貼り付け先の既存アサインをDBから削除
            const keysToRemove = Array.from(keysToOverwrite).map(k => {
              const parts = k.split('_'); // parts[0] = staffId, parts[1] = date
              return [parts[1], parts[0]]; // [date, staffId] の順序
            });
            
            if (keysToRemove.length > 0) {
              const assignmentsToRemove = await db.assignments.where('[date+staffId]')
                .anyOf(keysToRemove) 
                .toArray();
              
              if (assignmentsToRemove.length > 0) {
                await db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!));
              }
            }

            // 2. クリップボードの内容をDBに追加
            if (newAssignmentsToPaste.length > 0) {
              await db.assignments.bulkAdd(newAssignmentsToPaste);
            }
            
            // 3. DBとReduxを同期
            const allAssignmentsFromDB = await db.assignments.toArray();
            dispatch(setAssignments(allAssignmentsFromDB));

          } catch (e) {
            console.error("ペースト(DB操作)に失敗:", e);
            db.assignments.toArray().then(dbAssignments => dispatch(setAssignments(dbAssignments)));
          }
        })();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    _clickMode, isDragging, selectionRange, activeCell, clipboard, 
    assignments, assignmentsMap, sortedStaffList, 
    dispatch, getRangeIndices, setClickMode, 
    toggleHoliday, 
    holidayPatternId, 
    paidLeavePatternId,
  ]);


  return {
    clickMode: _clickMode, 
    setClickMode,      
    activeCell,
    selectionRange,
    // ポチポチモード用
    toggleHoliday,
    holidayPatternId,
    paidLeavePatternId,
    // セルクリック/ドラッグ用
    handleCellClick,
    handleCellMouseDown,
    handleCellMouseMove,
    handleCellMouseUp,
  };
};