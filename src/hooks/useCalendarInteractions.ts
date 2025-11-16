import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
// ★ 1. useStore をインポート
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
// ★ 2. _syncAssignments をインポート (★ _syncOptimisticAssignment のインポートを削除)
import { setAssignments, _syncAssignments } from '../store/assignmentSlice'; 
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
    // [DEBUG] ログを削除
    syncLockRef.current = 0; // 進行中の非同期同期をキャンセル

    // ★★★ アンドゥ/リドゥ操作の直後にDBをUI(present)の状態に強制同期する ★★★
    const assignmentsInUI = store.getState().assignment.present.assignments;
    console.log("[DEBUG] Forcing DB sync to current UI state due to Undo/Redo.");

    (async () => {
      try {
        await db.transaction('rw', db.assignments, async () => {
          await db.assignments.clear();
          const assignmentsToPut = assignmentsInUI.map(({ id, ...rest }) => rest);
          await db.assignments.bulkPut(assignmentsToPut);
        });
        
        // 同期後、DBからID付きで読み直し、UIのIDをDBと一致させる
        const allAssignmentsFromDB = await db.assignments.toArray();
        dispatch(_syncAssignments(allAssignmentsFromDB));
        
      } catch (e) {
        console.error("アンドゥ/リドゥ後のDB強制同期に失敗:", e);
        // エラー時は、DBから再度読み込んでUIをDBに合わせる
        const allAssignmentsFromDB = await db.assignments.toArray();
        dispatch(_syncAssignments(allAssignmentsFromDB));
      }
    })();
    // ★★★ 修正ここまで ★★★
  }, [dispatch, store]); // ★ store と dispatch を依存配列に追加


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

    // ★★★ [DEBUG] ログヘルパー関数を削除 ★★★

    // ★★★ [DEBUG] console.group を削除 ★★★

    const existing = currentAssignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;

    let newOptimisticAssignments: IAssignment[];
    // ★★★ 修正: dbOperation 変数の宣言を削除 ★★★
    const tempId = Date.now(); 
    
    // ★★★ 修正: トグルオン/オフで追加されるアサイン(またはnull)を保持する変数 ★★★
    let newAssignmentBase: Omit<IAssignment, 'id'> | null = null;


    if (existingIsTarget) {
      // (トグルオフ)
      newOptimisticAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      // ★★★ 修正: dbOperation の定義を削除 ★★★
      newAssignmentBase = null; // 削除する
      // ★★★ [DEBUG] ログを削除 ★★★
    } else {
      // (トグルオン)
      newAssignmentBase = { // ★ 変数に代入
        date: date, staffId: staff.staffId, patternId: targetPatternId,
        unitId: null, locked: true 
      };
      const otherAssignments = currentAssignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      
      newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }]; 

      // ★★★ 修正: dbOperation の定義を削除 ★★★
      // ★★★ [DEBUG] ログを削除 ★★★
    }
    // ★★★ [DEBUG] console.groupEnd を削除 ★★★
    
    // ★★★ v1.2 の syncLock ロジック ★★★
    const currentSyncId = Date.now();
    syncLockRef.current = currentSyncId;
    
    dispatch(setAssignments(newOptimisticAssignments)); // ★ UI即時更新 (履歴に積む)

    // ★★★ 修正: トランザクションロジックをポチポチ専用に修正 (v2.0) ★★★
    (async () => {
      let updatedAssignments: IAssignment[] = [];
      try {
        updatedAssignments = await db.transaction('rw', db.assignments, async () => {
          
          // 1. DBからこのセルの既存のアサインを取得して削除 (勤務"C"などを削除するため)
          const existingInDB = await db.assignments
            .where('[date+staffId]')
            .equals([date, staff.staffId])
            .toArray();
            
          if (existingInDB.length > 0) {
            await db.assignments.bulkDelete(existingInDB.map(a => a.id!));
          }

          // 2. 新しいアサイン（トグルオンの場合）を追加
          if (newAssignmentBase) { // newAssignmentBase が null (トグルオフ) でない場合
            await db.assignments.add(newAssignmentBase);
          }
          
          // 3. トランザクション後の最新のDB状態を返す
          return db.assignments.toArray();
        }); // ★★★ トランザクションここまで ★★★

        // トランザクション成功
        if (syncLockRef.current === currentSyncId) {
            dispatch(_syncAssignments(updatedAssignments));
        } else {
            console.warn(`[DEBUG] Stale _syncAssignments call detected (Pochi). SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
        }

      } catch (e) {
        // トランザクション失敗
        console.error("アサインの即時更新（DB反映）に失敗:", e);
        if (syncLockRef.current === currentSyncId) {
            console.warn("[DEBUG] DB Pochi failed. Reverting optimistic update.");
            db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
        } else {
            console.warn(`[DEBUG] DB Pochi failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
        }
      } finally {
        // マウスクリックのキーロック解除
        if (processingCellKeyRef.current === cellKey) {
          processingCellKeyRef.current = null;
        }
      }
    })(); // ★★★ 非同期関数の即時実行 ★★★

  }, [dispatch, store]); // ★★★ 修正: 依存配列から holiday/paidLeave PatternId を削除


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
    // ★★★ [DEBUG] ログヘルパー関数を削除 ★★★

    // ★★★ 修正: `assignments` の最新状態を Ref に保持 ★★★
    const latestAssignmentsRef = { 
      current: store.getState().assignment.present.assignments 
    };
    
    // ★★★ v1.3 の `lastActionType` 追跡を削除 ★★★

    // ★★★ 修正: Reduxストアを直接購読 ★★★
    const unsubscribe = store.subscribe(() => {
      const newAssignments = store.getState().assignment.present.assignments;
      
      // ★★★ [DEBUG] ログを削除 ★★★
      if (latestAssignmentsRef.current !== newAssignments) {
        // (デバッグログは削除)
      }

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

        // ★★★ [DEBUG] console.group を削除 ★★★

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
        // ★★★ [DEBUG] ログを削除 ★★★

        if (event.key === 'x') {
          // --- CUT (X) ---
          const assignmentsToRemove = currentAssignments.filter(a => 
            keysToCut.has(`${a.staffId}_${a.date}`)
          );
          const newOptimisticAssignments = currentAssignments.filter(a => 
            !keysToCut.has(`${a.staffId}_${a.date}`)
          );
          
          // ★★★ [DEBUG] ログを削除 ★★★
          
          // ★★★ v1.2 の syncLock ロジック ★★★
          const currentSyncId = Date.now();
          syncLockRef.current = currentSyncId;
          
          dispatch(setAssignments(newOptimisticAssignments)); // ★ 履歴に積む
          
          if (assignmentsToRemove.length > 0) {
            // ★★★ 修正: `db.transaction` を使用 ★★★
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

                // Transaction Succeeded
                if (syncLockRef.current === currentSyncId) {
                    dispatch(_syncAssignments(updatedAssignments));
                } else {
                    console.warn(`[DEBUG] Stale _syncAssignments call detected (Cut). SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
                }
              } catch (e) {
                // Transaction Failed
                console.error("カット(DB削除)に失敗:", e);
                if (syncLockRef.current === currentSyncId) {
                    console.warn("[DEBUG] DB Cut failed. Reverting optimistic update.");
                    db.assignments.toArray().then(dbAssignments => dispatch(_syncAssignments(dbAssignments)));
                } else {
                    console.warn(`[DEBUG] DB Cut failed, but state is already stale. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
                }
              }
            })(); // ★★★ 非同期関数の即時実行 ★★★
          }
        } else {
          // ★★★ [DEBUG] console.groupEnd を削除 ★★★
        }
      
      // ★★★ Ctrl+V (貼り付け) ★★★
      } else if (ctrlKey && event.key === 'v') {
        event.preventDefault();

        // ★★★ [DEBUG] バージョン確認ログを削除 ★★★
        
        const clipboard = clipboardRef.current; 
        if (!clipboard || !activeCell) return;
        
        // ★ 14. `latestAssignmentsRef` から最新の `assignments` を取得
        const currentAssignments = latestAssignmentsRef.current;

        // ★★★ [DEBUG] console.group を削除 ★★★

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
        
        // ★★★ [DEBUG] ログを削除 ★★★
        
        // ★★★ v1.2 の syncLock ロジック ★★★
        const currentSyncId = Date.now();
        syncLockRef.current = currentSyncId;
        
        dispatch(setAssignments(finalOptimisticState)); // ★ 履歴に積む

        // ★★★ 要望2の修正箇所 ★★★
        // 貼り付け後、貼り付けた範囲を新しい選択範囲として設定する
        if (keysToOverwrite.size > 0 && activeCell) {
          const endStaffIndex = activeCell.staffIndex + rowCount - 1;
          const endDateIndex = activeCell.dateIndex + colCount - 1;

          // 範囲がカレンダーの境界を超えないように調整
          const clampedEndStaffIndex = Math.min(endStaffIndex, sortedStaffList.length - 1);
          const clampedEndDateIndex = Math.min(endDateIndex, MONTH_DAYS.length - 1);

          if (clampedEndStaffIndex >= activeCell.staffIndex && clampedEndDateIndex >= activeCell.dateIndex) {
            const endStaff = sortedStaffList[clampedEndStaffIndex];
            const endDay = MONTH_DAYS[clampedEndDateIndex];

            const newEndCell: CellCoords = {
              staffId: endStaff.staffId,
              date: endDay.dateStr,
              staffIndex: clampedEndStaffIndex,
              dateIndex: clampedEndDateIndex,
            };
            
            // activeCell は開始点のまま
            setSelectionRange({ start: activeCell, end: newEndCell });
          } else {
            // 範囲が不正な場合は、アクティブセルのみにリセット
            setSelectionRange({ start: activeCell, end: activeCell });
          }
          // activeCell は変更しない (貼り付けの起点なので)
        }
        // ★★★ 修正ここまで ★★★

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
                    // ★★★ [DEBUG] ログを削除 ★★★
                    await db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!));
                }
                if (assignmentsToAdd.length > 0) {
                    // ★★★ [DEBUG] ログを削除 ★★★
                    await db.assignments.bulkAdd(assignmentsToAdd);
                }
                
                return db.assignments.toArray();
            });
            // ★★★ v1.8 トランザクションここまで ★★★
            
            // トランザクション (Async) が完了
            // ★★★ [DEBUG] ログを削除 ★★★
            
            if (syncLockRef.current === currentSyncId) {
              // ★★★ [DEBUG] ログを削除 ★★★
              dispatch(_syncAssignments(updatedAssignments)); // ★ トランザクションの結果で同期
            } else {
              console.warn(`[DEBUG] Stale _syncAssignments call detected. SKIPPING SYNC. (MyID: ${currentSyncId}, CurrentLock: ${syncLockRef.current})`);
            }
            
          } catch (e) {
            console.error("ペースト(DB操作)に失敗:", e);
            
            // ★★★ [DEBUG] ログを削除 ★★★
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