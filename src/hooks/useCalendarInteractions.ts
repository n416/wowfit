import { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { IStaff, IAssignment } from '../db/dexie';
import { db } from '../db/dexie';
import { setAssignments, _syncOptimisticAssignment } from '../store/assignmentSlice';

export type ClickMode = 'normal' | 'holiday' | 'paid_leave';

/**
 * カレンダーのクリックモードと、
 * それに関連する「公休/有給」の楽観的UI更新ロジックを管理するフック
 */
export const useCalendarInteractions = () => {
  const dispatch: AppDispatch = useDispatch();
  const [clickMode, setClickMode] = useState<ClickMode>('normal');

  // 楽観的UI更新に必要なデータをストアから取得
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);

  // 公休・有給のパターンIDを事前に計算
  const holidayPatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休',
  [shiftPatterns]);
  
  const paidLeavePatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給',
  [shiftPatterns]);

  /**
   * 「公休」または「有給」をトグルする（楽観的UI更新）
   * @param date 対象日
   * @param staff 対象スタッフ
   * @param targetPatternId '公休' または '有給' のパターンID
   */
  const toggleHoliday = useCallback(async (date: string, staff: IStaff, targetPatternId: string) => {
    
    // 1. メモリ上の Redux State (assignments) から既存のアサインを検索
    const existing = assignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;

    let newOptimisticAssignments: IAssignment[];
    let dbOperation: () => Promise<any>;
    const tempId = Date.now(); // 仮ID

    if (existingIsTarget) {
      // --- トグルオフ (削除) ---
      newOptimisticAssignments = assignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      dbOperation = async () => {
        if (existing[0]?.id) {
          await db.assignments.delete(existing[0].id);
        }
      };

    } else {
      // --- トグルオン (追加または変更) ---
      const newAssignmentBase: Omit<IAssignment, 'id'> = {
        date: date,
        staffId: staff.staffId,
        patternId: targetPatternId,
        unitId: null,
        locked: true // ポチポチモードでのアサインはロックする
      };

      const otherAssignments = assignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }];

      dbOperation = async () => {
        if (existing.length > 0) {
          await db.assignments.bulkDelete(existing.map((a: IAssignment) => a.id!));
        }
        const newId = await db.assignments.add(newAssignmentBase);
        
        // DB操作完了後、ストアの仮IDを本物のIDに差し替える
        dispatch(_syncOptimisticAssignment({
          tempId: tempId,
          newAssignment: { ...newAssignmentBase, id: newId }
        }));
      };
    }

    // 4. UIを即時更新 (UNDO履歴に積む)
    dispatch(setAssignments(newOptimisticAssignments));

    // 5. バックグラウンドでDB操作を実行
    try {
      await dbOperation();
    } catch (e) {
      console.error("アサインの即時更新（DB反映）に失敗:", e);
      // エラーハンドリング: DBとReduxを再同期
      db.assignments.toArray().then(dbAssignments => dispatch(setAssignments(dbAssignments)));
      alert("エラー: アサインの保存に失敗しました。ページをリロードしてください。");
    }
  }, [assignments, dispatch]); // 依存配列

  return {
    clickMode,
    setClickMode,
    toggleHoliday,
    holidayPatternId,
    paidLeavePatternId,
  };
};