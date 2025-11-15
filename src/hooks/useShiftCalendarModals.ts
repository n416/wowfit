import { useState, useCallback } from 'react';
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
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const allStaffMap = useSelector((state: RootState) => 
    new Map(state.staff.staff.map((s: IStaff) => [s.staffId, s]))
  );

  // 1. 手動アサインモーダル (AssignPatternModal)
  const [editingTarget, setEditingTarget] = useState<{ date: string; staff: IStaff; } | null>(null);

  // 2. 日次ガントチャートモーダル (DailyUnitGanttModal)
  const [showingGanttTarget, setShowingGanttTarget] = useState<{ date: string; unitId: string; } | null>(null);
  
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
   * [ハンドラ] 勤務枠ビューでセルクリック
   */
  const openGanttModal = useCallback((date: string, unitId: string | null) => {
    if (unitId) {
      setShowingGanttTarget({ date, unitId });
    }
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