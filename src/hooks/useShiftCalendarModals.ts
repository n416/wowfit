import { useState, useCallback, useMemo } from 'react'; // ★ useMemo をインポート
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
import { setAssignments, clearAdvice } from '../store/assignmentSlice';

/**
 * ShiftCalendarPageで使われる3種類のモーダル
 * (手動アサイン、日次ガント、スタッフアサインクリア)
 * の状態とロジックを管理するフック
 */
export const useShiftCalendarModals = () => {
  const dispatch: AppDispatch = useDispatch();
  
  // ★★★ 修正: state.assignment.present から assignments を取得 ★★★
  // (useShiftCalendarModals.ts:19)
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  
  // ★★★ 変更点 1: `useSelector` で `new Map` を作らない ★★★
  const allStaff = useSelector((state: RootState) => state.staff.staff);
  const allStaffMap = useMemo(() => 
    new Map(allStaff.map((s: IStaff) => [s.staffId, s])),
    [allStaff]
  );

  // 1. 手動アサインモーダル (AssignPatternModal)
  const [editingTarget, setEditingTarget] = useState<{ date: string; staff: IStaff; } | null>(null);

  // 2. 日次ガントチャートモーダル (DailyUnitGanttModal)
  const [showingGanttTarget, setShowingGanttTarget] = useState<{ date: string; unitId: string | null; } | null>(null);
  
  // 3. スタッフアサインクリアモーダル (ClearStaffAssignmentsModal)
  const [clearingStaff, setClearingStaff] = useState<IStaff | null>(null);

  /**
   * [ハンドラ] スタッフビューで「通常モード」セルクリック
   */
  const openAssignModal = useCallback((date: string, staffId: string) => {
    const staff = allStaffMap.get(staffId);
    if (staff) {
      setEditingTarget({ date, staff });
      dispatch(clearAdvice()); // AI助言をクリア
    }
  }, [allStaffMap, dispatch]);

  /**
   * [ハンドラ] 勤務枠ビューでセルクリック (または スタッフビューの日付ヘッダー)
   */
  // ★★★ 修正: `if (unitId)` のガードを削除 ★★★
  const openGanttModal = useCallback((date: string, unitId: string | null) => {
    // if (unitId) {
    setShowingGanttTarget({ date, unitId });
    // }
  }, []);

  /**
   * [ハンドラ] スタッフビューで「スタッフ名」クリック
   */
  const openClearStaffModal = useCallback((staff: IStaff) => {
    setClearingStaff(staff);
  }, []);

  /**
   * [ハンドラ] モーダルを閉じる (汎用)
   */
  const closeAllModals = useCallback(() => {
    setEditingTarget(null);
    setShowingGanttTarget(null);
    setClearingStaff(null);
  }, []);

  /**
   * [実行ロジック] 特定スタッフのアサインを全クリアする
   */
  const handleClearStaffAssignments = useCallback(async (staffId: string) => {
    const staff = clearingStaff; // 確認メッセージ用
    if (!staff) return;

    // ★ `assignments` は .present から来た配列 (IAssignment[])
    const assignmentsToRemove = assignments.filter((a: IAssignment) => a.staffId === staffId);
    
    if (window.confirm(`${staff.name}さんのアサイン（${assignmentsToRemove.length}件）をすべてクリアしますか？`)) {
      try {
        await db.assignments.bulkDelete(assignmentsToRemove.map((a: IAssignment) => a.id!));
        const remainingAssignments = await db.assignments.toArray();
        dispatch(setAssignments(remainingAssignments));
        closeAllModals(); // モーダルを閉じる
      } catch (e) {
        console.error("アサインのクリアに失敗:", e);
        alert("アサインのクリアに失敗しました。");
      }
    }
  }, [assignments, dispatch, clearingStaff, closeAllModals]);

  return {
    // モーダル状態
    editingTarget,
    showingGanttTarget,
    clearingStaff,
    // モーダルを開くハンドラ
    openAssignModal,
    openGanttModal,
    openClearStaffModal,
    // モーダルを閉じる/実行するハンドラ
    closeModals: closeAllModals,
    handleClearStaffAssignments,
  };
};