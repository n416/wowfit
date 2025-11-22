import { useState, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
import { setAssignments, clearAdvice } from '../store/assignmentSlice';

export const useShiftCalendarModals = () => {
  const dispatch: AppDispatch = useDispatch();
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const allStaff = useSelector((state: RootState) => state.staff.staff);
  const allStaffMap = useMemo(() => 
    new Map(allStaff.map((s: IStaff) => [s.staffId, s])),
    [allStaff]
  );

  // 1. 手動アサインモーダル
  const [editingTarget, setEditingTarget] = useState<{ date: string; staff: IStaff; } | null>(null);

  // 2. 日次ガントチャートモーダル
  const [showingGanttTarget, setShowingGanttTarget] = useState<{ date: string; unitId: string | null; } | null>(null);
  
  // 3. スタッフアサインクリアモーダル
  const [clearingStaff, setClearingStaff] = useState<IStaff | null>(null);

  // ★ 4. ステータス設定モーダル (追加)
  const [statusTarget, setStatusTarget] = useState<IStaff | null>(null);

  const openAssignModal = useCallback((date: string, staffId: string) => {
    const staff = allStaffMap.get(staffId);
    if (staff) {
      setEditingTarget({ date, staff });
      dispatch(clearAdvice());
    }
  }, [allStaffMap, dispatch]);

  const openGanttModal = useCallback((date: string, unitId: string | null) => {
    setShowingGanttTarget({ date, unitId });
  }, []);

  const openClearStaffModal = useCallback((staff: IStaff) => {
    setClearingStaff(staff);
  }, []);

  // ★ 追加
  const openStatusModal = useCallback((staff: IStaff) => {
    setStatusTarget(staff);
  }, []);

  const closeAllModals = useCallback(() => {
    setEditingTarget(null);
    setShowingGanttTarget(null);
    setClearingStaff(null);
    setStatusTarget(null); // ★ 追加
  }, []);

  const handleClearStaffAssignments = useCallback(async (staffId: string) => {
    const staff = clearingStaff; 
    if (!staff) return;
    const assignmentsToRemove = assignments.filter((a: IAssignment) => a.staffId === staffId);
    
    if (window.confirm(`${staff.name}さんのアサイン（${assignmentsToRemove.length}件）をすべてクリアしますか？`)) {
      try {
        await db.assignments.bulkDelete(assignmentsToRemove.map((a: IAssignment) => a.id!));
        const remainingAssignments = await db.assignments.toArray();
        dispatch(setAssignments(remainingAssignments));
        closeAllModals(); 
      } catch (e) {
        console.error("アサインのクリアに失敗:", e);
        alert("アサインのクリアに失敗しました。");
      }
    }
  }, [assignments, dispatch, clearingStaff, closeAllModals]);

  return {
    editingTarget,
    showingGanttTarget,
    clearingStaff,
    statusTarget, // ★ 追加
    openAssignModal,
    openGanttModal,
    openClearStaffModal,
    openStatusModal, // ★ 追加
    closeModals: closeAllModals,
    handleClearStaffAssignments,
  };
};