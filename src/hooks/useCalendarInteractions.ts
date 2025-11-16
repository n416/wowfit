import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
// ★ 1. useStore をインポート
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
// ★ 2. _syncAssignments をインポート (★ _syncOptimisticAssignment のインポートを削除)
import { setAssignments, _syncAssignments } from '../store/assignmentSlice'; 
import { MONTH_DAYS } from '../utils/dateUtils'; 
// ★ v1.3 の UndoActionTypes インポートを削除

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
  // ★ 3. Redux ストアへの参照を取得
  const store = useStore<RootState>(); 
  
  const [_clickMode, _setClickMode] = useState<ClickMode>('normal');
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  
  // ★★★ v1.3 の Typo `null(null)` を `null` に修正 ★★★
  const [selectionRange, setSelectionRange] = useState<{ start: CellCoords, end: CellCoords } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  
  const clipboardRef = useRef<ClipboardData | null>(null);
  const processingCellKeyRef = useRef<string | null>(null);

  // ★★★ v1.2 の syncLockRef を定義 ★★★
  const syncLockRef = useRef<number>(0);

  // --- データ取得 ---
  // ★ 4. `assignments` は `useMemo` でのみ使用
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);
  
  // ★ 5. `assignmentsMap` は `assignments` に依存（これは Stale Closure の原因ではない）
  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>();
    for (const assignment of assignments) {
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment);
    }
    return map;
  }, [assignments]);
  
  // --- パターンID計算 ---
  const holidayPatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休',
  [shiftPatterns]);
  const paidLeavePatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給',
  [shiftPatterns]);

  
  // --- 内部ヘルパー関数 (矩形範囲の計算) ---
  const getRangeIndices = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    if (!range) return null;
    return {
      minStaff: Math.min(range.start.staffIndex, range.end.staffIndex),
      maxStaff: Math.max(range.start.staffIndex, range.end.staffIndex),
      minDate: Math.min(range.start.dateIndex, range.end.dateIndex),
      maxDate: Math.max(range.start.dateIndex, range.end.dateIndex),
    };
  }, []);
  
  // ★ 外部公開用の setClickMode (選択状態をリセットする)
  const setClickMode = useCallback((newMode: ClickMode) => {
    _setClickMode(newMode);
    setActiveCell(null);
    setSelectionRange(null);
    setIsDragging(false);
  }, []); 

  // ★★★ v1.4 のロック無効化関数 ★★★
  const invalidateSyncLock = useCallback(() => {
    console.log("[DEBUG] invalidateSyncLock() called. Pending async syncs will be cancelled.");
    syncLockRef.current = 0;
  }, []);


  // --- ポチポチモード (バグ修正) ---
  // ★ 6. `useStore` を使い、`assignments` への依存を削除
  const toggleHoliday = useCallback((date: string, staff: IStaff, targetPatternId: string) => {
    
    const cellKey = `${staff.staffId}_${date}`;

    if (processingCellKeyRef.current === cellKey) {
      console.warn("Rapid click detected on the same cell, operation skipped.");
      return; 
    }
    processingCellKeyRef.current = cellKey; 

    // ★ 7. `store.getState()` から最新の `assignments` を取得
    const currentAssignments = store.getState().assignment.present.assignments;

    // ★★★ ログヘルパー関数 (Pochi用) ★★★
    const formatAssignmentsForLog = (assignmentsToLog: IAssignment[]): string => {
      const filtered = assignmentsToLog.filter(a => 
        a.date === '2025-11-01' || 
        a.date === '2025-11-02' || 
        a.date === '2025-11-03'
      );
      if (filtered.length === 0) return "[11/1-3に該当なし]";
      return filtered.map(a => `${a.patternId}@${a.date}@${a.staffId}`).join(', ');
    };
    // ★★★ ログヘルパーここまで ★★★

    console.group(`[DEBUG] toggleHoliday (Pochi) [${new Date().toISOString()}]`);
    console.log(`CellKey: ${cellKey}, Pattern: ${targetPatternId}`);
    // ★ ログ修正 (新フォーマット)
    console.log("ベースとなった assignments (11/1-3):", formatAssignmentsForLog(currentAssignments));

    const existing = currentAssignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;

    let newOptimisticAssignments: IAssignment[];
    let dbOperation: () => Promise<any>;
    const tempId = Date.now(); 

    if (existingIsTarget) {
      // (トグルオフ)
      newOptimisticAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      dbOperation = async () => {
        if (existing.length > 0) {
          await db.assignments.bulkDelete(existing.map(a => a.id!));
        }
      };
      console.log("楽観的更新: 削除 (OFF)");
    } else {
      // (トグルオン)
      const newAssignmentBase: Omit<IAssignment, 'id'> = {
        date: date, staffId: staff.staffId, patternId: targetPatternId,
        unitId: null, locked: true 
      };
      const otherAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      
      // ★★★ 変更点 1: _syncOptimisticAssignment を使わないため、楽観的更新にtempIdが不要になった ★★★
      //    (ただし、Redux-Undoが差分を検知できるよう、新しい配列参照を作る必要はある)
      //    (※注: 厳密には tempId があっても動作するが、不要なロジックは削除する)
      // newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }];
      newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }]; // ※1

      dbOperation = async () => {
        if (existing.length > 0) {
          await db.assignments.bulkDelete(existing.map((a: IAssignment) => a.id!));
        }
        // ★★★ 変更点 2: _syncOptimisticAssignment を削除 ★★★
        // const newId = await db.assignments.add(newAssignmentBase);
        // dispatch(_syncOptimisticAssignment({
        //   tempId: tempId, newAssignment: { ...newAssignmentBase, id: newId }
        // }));
        await db.assignments.add(newAssignmentBase);
      };
      console.log("楽観的更新: 追加 (ON)");
    }
    console.groupEnd(); // ★ ロググループ終了
    
    // ★★★ v1.2 の syncLock ロジック ★★★
    const currentSyncId = Date.now();
    syncLockRef.current = currentSyncId;
    
    dispatch(setAssignments(newOptimisticAssignments)); // ★ UI即時更新 (履歴に積む)

    dbOperation()
      // ★★★ 変更点 3: 成功時（then）も _syncAssignments を呼ぶように変更 ★★★
      .then(async () => {
        // DB書き込み成功
        const allAssignmentsFromDB = await db.assignments.toArray();
        console.log(`[DEBUG] Async Pochi Callback Fired. MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current}`);
        
        if (syncLockRef.current === currentSyncId) {
            console.log(`[DEBUG] Sync Check PASSED (Pochi). MyID: ${currentSyncId}. Dispatching _syncAssignments.`);
            dispatch(_syncAssignments(allAssignmentsFromDB));
        } else {
            console.warn(`[DEBUG] Stale _syncAssignments call detected (Pochi). SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
        }
      })
      .catch(e => {
        console.error("アサインの即時更新（DB反映）に失敗:", e);
        // ★★★ v1.2 の Stale Check ★★★
        if (syncLockRef.current === currentSyncId) {
            console.warn("[DEBUG] DB Pochi failed. Reverting optimistic update.");
            db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
        } else {
            console.warn(`[DEBUG] DB Pochi failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
        }
      })
      .finally(() => {
        if (processingCellKeyRef.current === cellKey) {
          processingCellKeyRef.current = null;
        }
      });

  }, [dispatch, store]); // ★ 9. 依存配列から `assignments` を削除
  
  // (※1) 変更点1について: 
  // Redux-Undoは `setAssignments` に渡される配列の *内容* を比較するため、
  // `tempId` の有無に関わらず `existingIsTarget` が `true` (削除) か `false` (追加) かで
  // 履歴（past/future）が正しく分岐します。
  // `_syncOptimisticAssignment` は、履歴に積まずに `present` の `tempId` を `newId` に
  // 置き換えるためのものでしたが、`_syncAssignments` に統一することでこの複雑な処理が不要になりました。


  // --- セルクリック / マウスドラッグイベント ---

  const handleCellClick = useCallback((date: string, staffId: string, staffIndex: number, dateIndex: number) => {
    const staff = sortedStaffList[staffIndex];
    if (!staff) return;
    const cell: CellCoords = { date, staffId, staffIndex, dateIndex };

    if (_clickMode !== 'holiday' && _clickMode !== 'paid_leave') {
      processingCellKeyRef.current = null; 
    }

    switch (_clickMode) { 
      case 'select':
        setActiveCell(cell); setSelectionRange({ start: cell, end: cell }); setIsDragging(false); break;
      case 'holiday':
        toggleHoliday(date, staff, holidayPatternId); break; // ★ 最新の `toggleHoliday` を呼ぶ
      case 'paid_leave':
        toggleHoliday(date, staff, paidLeavePatternId); break; // ★ 最新の `toggleHoliday` を呼ぶ
      case 'normal':
        break;
    }
  }, [
      _clickMode, sortedStaffList, 
      toggleHoliday, 
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
    // ★★★ ログヘルパー関数 (C/X/V用) ★★★
    const formatAssignmentsForLog = (assignmentsToLog: IAssignment[] | Omit<IAssignment, 'id'>[]): string => {
      const filtered = assignmentsToLog.filter(a => 
        a.date === '2025-11-01' || 
        a.date === '2025-11-02' || 
        a.date === '2025-11-03'
      );
      if (filtered.length === 0) return "[11/1-3に該当なし]";
      return filtered.map(a => `${a.patternId}@${a.date}@${a.staffId}`).join(', ');
    };
    const formatClipboardForLog = (clipboardToLog: ClipboardData | null): string => {
      if (!clipboardToLog) return "CLIPBOARD IS NULL";
      // クリップボードの中身（パターンID or null）をカンマ区切りで返す
      return clipboardToLog.assignments.map(a => a ? a.patternId : 'null').join(', ');
    };
    // ★★★ ログヘルパーここまで ★★★

    // ★★★ 修正: `assignments` の最新状態を Ref に保持 ★★★
    const latestAssignmentsRef = { 
      current: store.getState().assignment.present.assignments 
    };
    
    // ★★★ v1.3 の `lastActionType` 追跡を削除 ★★★

    // ★★★ 修正: Reduxストアを直接購読 ★★★
    const unsubscribe = store.subscribe(() => {
      const newAssignments = store.getState().assignment.present.assignments;
      
      // ★★★ ログ追加 (仮説Cの検証) ★★★
      if (latestAssignmentsRef.current !== newAssignments) {
        console.log(`[DEBUG] store.subscribe: assignments が変更されました。`);
        console.log(`  -> 旧 (11/1-3): ${formatAssignmentsForLog(latestAssignmentsRef.current)}`);
        console.log(`  -> 新 (11/1-3): ${formatAssignmentsForLog(newAssignments)}`);
        
        // ★★★ v1.3 の `lastActionType` チェックを削除 ★★★
      }
      // ★★★ ログ追加ここまで ★★★

      // アンドゥ/リドゥで状態が変わったら、Refの中身を即座に更新
      latestAssignmentsRef.current = newAssignments;
    });

    // ★★★ v1.3 の `dispatch` ラップを削除 ★★★

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      processingCellKeyRef.current = null;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      
      // ★ 10. `store.getState()` の代わりに `latestAssignmentsRef.current` を使用
      
      // ★★★ Ctrl+C (コピー) / Ctrl+X (カット) ★★★
      if (ctrlKey && (event.key === 'c' || event.key === 'x')) {
        event.preventDefault();
        
        // ★ 11. `latestAssignmentsRef` から最新の `assignments` を取得
        const currentAssignments = latestAssignmentsRef.current;
        
        // ★★★ v1.5 の修正: `assignmentsMap` (フックスコープ) を使用 ★★★
        // (二重宣言を削除)

        const rangeIndices = getRangeIndices(selectionRange);
        if (!rangeIndices) return;

        // ★★★ ログ修正 (新フォーマット) ★★★
        console.group(`[DEBUG] Ctrl+${event.key} (Copy/Cut) [${new Date().toISOString()}]`);
        console.log("ベースとなった assignments (11/1-3):", formatAssignmentsForLog(currentAssignments));
        // ★★★ ログ修正ここまで ★★★

        const { minStaff, maxStaff, minDate, maxDate } = rangeIndices;
        
        const assignmentsInSelection: (Omit<IAssignment, 'id' | 'staffId' | 'date'> | null)[] = [];
        const keysToCut = new Set<string>();

        for (let sIdx = minStaff; sIdx <= maxStaff; sIdx++) {
          for (let dIdx = minDate; dIdx <= maxDate; dIdx++) {
            const staff = sortedStaffList[sIdx];
            const day = MONTH_DAYS[dIdx];
            if (!staff || !day) continue;
            
            const key = `${staff.staffId}_${day.dateStr}`;
            if (event.key === 'x') {
              keysToCut.add(key);
            }

            // ★★★ v1.5 の修正: `assignmentsMap` (フックスコープ) を使用 ★★★
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
        };
        // ★ ログ修正 (新フォーマット)
        console.log("クリップボードに保存:", formatClipboardForLog(clipboardRef.current));

        if (event.key === 'x') {
          // --- CUT (X) ---
          const assignmentsToRemove = currentAssignments.filter(a => 
            keysToCut.has(`${a.staffId}_${a.date}`)
          );
          const newOptimisticAssignments = currentAssignments.filter(a => 
            !keysToCut.has(`${a.staffId}_${a.date}`)
          );
          
          console.log("楽観的更新: カット (setAssignments)");
          console.groupEnd(); // ★ ロググループ終了
          
          // ★★★ v1.2 の syncLock ロジック ★★★
          const currentSyncId = Date.now();
          syncLockRef.current = currentSyncId;
          
          dispatch(setAssignments(newOptimisticAssignments)); // ★ 履歴に積む
          
          if (assignmentsToRemove.length > 0) {
            db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!))
              // ★★★ 変更点 4: 成功時（then）も _syncAssignments を呼ぶように変更 ★★★
              .then(async () => {
                const allAssignmentsFromDB = await db.assignments.toArray();
                console.log(`[DEBUG] Async Cut Callback Fired. MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current}`);
                if (syncLockRef.current === currentSyncId) {
                    console.log(`[DEBUG] Sync Check PASSED (Cut). MyID: ${currentSyncId}. Dispatching _syncAssignments.`);
                    dispatch(_syncAssignments(allAssignmentsFromDB));
                } else {
                    console.warn(`[DEBUG] Stale _syncAssignments call detected (Cut). SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
                }
              })
              .catch(e => {
                console.error("カット(DB削除)に失敗:", e);
                // ★★★ v1.2 の Stale Check ★★★
                if (syncLockRef.current === currentSyncId) {
                    console.warn("[DEBUG] DB Cut failed. Reverting optimistic update.");
                    db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
                } else {
                    console.warn(`[DEBUG] DB Cut failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
                }
              });
          }
        } else {
          console.groupEnd(); // ★ ロググループ終了 (コピーの場合)
        }
      
      // ★★★ Ctrl+V (貼り付け) ★★★
      } else if (ctrlKey && event.key === 'v') {
        event.preventDefault();

        // ★★★ バージョン確認ログ (v1.8) ★★★
        console.log("[DEBUG] Paste Action Triggered (v1.8_FINAL_with_TX)");
        // ★★★ ここまで ★★★
        
        const clipboard = clipboardRef.current; 
        if (!clipboard || !activeCell) return;
        
        // ★ 14. `latestAssignmentsRef` から最新の `assignments` を取得
        const currentAssignments = latestAssignmentsRef.current;

        // ★★★ ログ修正 (新フォーマット) ★★★
        console.group(`[DEBUG] Ctrl+V (Paste) [${new Date().toISOString()}]`);
        console.log("ベースとなった assignments (11/1-3):", formatAssignmentsForLog(currentAssignments));
        console.log("クリップボードから読み出し:", formatClipboardForLog(clipboard));
        // ★★★ ログ修正ここまで ★★★

        const { assignments: clipboardAssignments, rowCount, colCount } = clipboard;
        
        const newAssignmentsToPaste: Omit<IAssignment, 'id'>[] = [];
        const keysToOverwrite = new Set<string>(); 

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
        const assignmentsBeforePaste = currentAssignments.filter(a => { 
          const key = `${a.staffId}_${a.date}`;
          return !keysToOverwrite.has(key); 
        });
        
        const tempAssignments = newAssignmentsToPaste.map((a, i) => ({
          ...a,
          id: Date.now() + i 
        }));

        const finalOptimisticState = [...assignmentsBeforePaste, ...tempAssignments];
        
        // ★★★ ログ修正 (新フォーマット + keysToOverwrite の中身) ★★★
        console.log("上書き対象 (削除) キー:", JSON.stringify(Array.from(keysToOverwrite)));
        console.log("除外後の assignments (BeforePaste) (11/1-3):", formatAssignmentsForLog(assignmentsBeforePaste));
        console.log("追加する assignments (tempAssignments) (11/1-3):", formatAssignmentsForLog(tempAssignments));
        console.log("setAssignments に渡す最終的な楽観的状態 (11/1-3):", formatAssignmentsForLog(finalOptimisticState));
        console.groupEnd(); // ★ ロググループ終了
        // ★★★ ログ修正ここまで ★★★
        
        // ★★★ v1.2 の syncLock ロジック ★★★
        const currentSyncId = Date.now();
        syncLockRef.current = currentSyncId;
        
        dispatch(setAssignments(finalOptimisticState)); // ★ 履歴に積む

        // --- DB操作 (非同期) ---
        (async () => {
          let updatedAssignments: IAssignment[] = [];
          
          try {
            // ★★★ v1.8 修正: DB操作をトランザクションで囲む ★★★
            updatedAssignments = await db.transaction('rw', db.assignments, async () => {
                // このトランザクションが開始された時点でのDB状態
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
                }).map(({ id, ...rest }) => rest); // tempIdを除外

                if (assignmentsToRemove.length > 0) {
                    console.log(`[DEBUG] Async DB TX: Removing ${assignmentsToRemove.length} stale assignments`);
                    await db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!));
                }
                if (assignmentsToAdd.length > 0) {
                    console.log(`[DEBUG] Async DB TX: Adding ${assignmentsToAdd.length} new assignments`);
                    await db.assignments.bulkAdd(assignmentsToAdd);
                }
                
                return db.assignments.toArray();
            });
            // ★★★ v1.8 トランザクションここまで ★★★
            
            // トランザクション (Async) が完了
            console.log(`[DEBUG] Async Callback Fired. MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current}`);
            
            if (syncLockRef.current === currentSyncId) {
              console.log(`[DEBUG] Sync Check PASSED. MyID: ${currentSyncId}. Dispatching _syncAssignments.`);
              dispatch(_syncAssignments(updatedAssignments)); // ★ トランザクションの結果で同期
            } else {
              console.warn(`[DEBUG] Stale _syncAssignments call detected. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
            }
            
          } catch (e) {
            console.error("ペースト(DB操作)に失敗:", e);
            
            console.log(`[DEBUG] Async Callback Failed. MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current}`);
            if (syncLockRef.current === currentSyncId) {
                console.warn("[DEBUG] DB Paste failed. Reverting optimistic update.");
                // エラーが起きたので、DBの*現在の*（汚染されているかもしれない）状態を読み直す
                db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
            } else {
                console.warn(`[DEBUG] DB Paste failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
            }
          }
        })();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribe(); // ★★★ 修正: コンポーネント破棄時に購読を解除 ★★★
      // ★★★ v1.3 の `dispatch` ラップ解除を削除 ★★★
    };
  }, [ // ★★★ 依存配列 ★★★
    _clickMode, isDragging, selectionRange, activeCell, 
    sortedStaffList, 
    dispatch, store,
    getRangeIndices, setClickMode, 
    toggleHoliday, 
    holidayPatternId, 
    paidLeavePatternId,
    invalidateSyncLock,
    assignmentsMap, 
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
    // ★★★ v1.4 のロック無効化関数 ★★★
    invalidateSyncLock,
  };
};