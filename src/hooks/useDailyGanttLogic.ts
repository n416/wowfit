import { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IStaff, IShiftPattern, IUnit, IAssignment, db } from '../db/dexie';
import { setAssignments } from '../store/assignmentSlice';
import type { AppDispatch, RootState } from '../store';

// --- 型定義の共有 ---
export type MonthDay = { dateStr: string; weekday: string; dayOfWeek: number; };
export type UnitGroupData = { unit: IUnit; rows: GanttRowData[]; };
export type GanttRowData = { 
  staff: IStaff; 
  pattern: IShiftPattern; 
  isSupport: boolean; 
  startHour: number;
  duration: number; 
  assignmentId: number;
  unitId: string | null; 
  isNew?: boolean; 
};

export const useDailyGanttLogic = (
  target: { date: string; unitId: string | null } | null,
  onClose: () => void,
  allAssignments: IAssignment[],
  demandMap: Map<string, { required: number; actual: number }>,
  unitGroups: UnitGroupData[],
  monthDays: MonthDay[]
) => {
  const dispatch: AppDispatch = useDispatch();
  
  const allStaff = useSelector((state: RootState) => state.staff.staff);
  const allPatterns = useSelector((state: RootState) => state.pattern.patterns);

  // Maps & Lists
  const allStaffMap = useMemo(() => new Map(allStaff.map(s => [s.staffId, s])), [allStaff]);
  const patternMap = useMemo(() => new Map(allPatterns.map(p => [p.patternId, p])), [allPatterns]);
  const allAssignmentsMap = useMemo(() => {
    const map = new Map<number, IAssignment>();
    allAssignments.forEach(a => { if (a.id) map.set(a.id, a); });
    return map;
  }, [allAssignments]);
  
  const workPatterns = useMemo(() => allPatterns.filter(p => p.workType === 'Work'), [allPatterns]);

  // --- State ---
  const [pendingChanges, setPendingChanges] = useState<Map<number, IAssignment>>(new Map());
  const [pendingAdditions, setPendingAdditions] = useState<Omit<IAssignment, 'id'>[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<number[]>([]); 

  // Reset state
  useEffect(() => {
    setPendingChanges(new Map());
    setPendingAdditions([]); 
    setPendingDeletions([]);
  }, [target]);

  // --- Computed Data (Local Preview) ---

  // 1. localUnitGroups (変更・追加・削除を反映した表示用データ)
  const localUnitGroups = useMemo(() => {
    if (!target) return [];
    const deletionIdSet = new Set(pendingDeletions);
    
    // (A) 既存データの変更・削除反映
    const updatedGroups = unitGroups.map(group => ({
      ...group,
      rows: group.rows
        .filter(row => !deletionIdSet.has(row.assignmentId)) 
        .map(row => {
          const change = pendingChanges.get(row.assignmentId);
          if (change) {
            const newPattern = patternMap.get(change.patternId);
            if (!newPattern) return row; 

            const startH = parseInt(newPattern.startTime.split(':')[0]);
            const [endH_raw, endM] = newPattern.endTime.split(':').map(Number);
            let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
            let displayStart = startH;
            let displayDuration = endH - startH;

            if (newPattern.crossesMidnight) {
               if (change.date === target.date) {
                 displayDuration = 24 - startH;
               } else {
                 displayStart = 0; 
                 displayDuration = endH;
               }
            }
            return {
              ...row,
              pattern: newPattern,
              startHour: displayStart,
              duration: displayDuration,
              unitId: change.unitId, 
              isNew: false, 
            };
          }
          return { ...row, isNew: false };
        })
    }));

    // (B) 新規追加データの反映
    pendingAdditions.forEach((newAssignment, index) => {
      const tempId = 9000 + index;
      if (deletionIdSet.has(tempId)) return;

      const group = updatedGroups.find(g => g.unit.unitId === newAssignment.unitId);
      const staff = allStaffMap.get(newAssignment.staffId);
      const pattern = patternMap.get(newAssignment.patternId);
      
      if (group && staff && pattern) {
        const startH = parseInt(pattern.startTime.split(':')[0]);
        const [endH_raw, endM] = pattern.endTime.split(':').map(Number);
        let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
        let displayStart = startH;
        let displayDuration = endH - startH;
        if (pattern.crossesMidnight) {
            displayDuration = 24 - startH;
        }

        group.rows.push({
          staff: staff,
          pattern: pattern,
          isSupport: false, 
          startHour: displayStart,
          duration: displayDuration,
          assignmentId: tempId,
          unitId: newAssignment.unitId,
          isNew: true,
        });
      }
    });
    
    return updatedGroups;
  }, [unitGroups, pendingChanges, pendingAdditions, pendingDeletions, patternMap, target, allStaffMap]);

  // 2. localDemandMap (デマンド計算)
  const localDemandMap = useMemo(() => {
    if (!target) return demandMap; 
    
    const deletionIdSet = new Set(pendingDeletions);
    const newDemandMap = new Map<string, { required: number; actual: number }>();
    demandMap.forEach((value, key) => {
      newDemandMap.set(key, { ...value });
    });

    const modifyDemand = (assignment: IAssignment | Omit<IAssignment, 'id'>, isAddition: boolean) => {
       const pattern = patternMap.get(assignment.patternId);
       if (!pattern || pattern.workType !== 'Work' || !assignment.unitId) return;

       const startH = parseInt(pattern.startTime.split(':')[0]);
       const [endH_raw, endM] = pattern.endTime.split(':').map(Number);
       const endH = (endM > 0) ? endH_raw + 1 : endH_raw;
       
       const apply = (date: string, s: number, e: number) => {
          for (let h = s; h < e; h++) {
            const key = `${date}_${assignment.unitId}_${h}`;
            const entry = newDemandMap.get(key);
            if (entry) {
              entry.actual = isAddition ? entry.actual + 1 : Math.max(0, entry.actual - 1);
            }
          }
       };

       if (!pattern.crossesMidnight) {
         apply(assignment.date, startH, endH);
       } else {
         apply(assignment.date, startH, 24);
         const nextDateObj = new Date(assignment.date.replace(/-/g, '/'));
         nextDateObj.setDate(nextDateObj.getDate() + 1);
         const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
         apply(nextDateStr, 0, endH);
       }
    };

    // 削除分 (マイナス)
    pendingDeletions.forEach(deletedId => {
      const original = allAssignmentsMap.get(deletedId);
      if (original) modifyDemand(original, false);
    });

    // 変更分 (マイナス & プラス)
    pendingChanges.forEach((newAssignment) => {
      if (deletionIdSet.has(newAssignment.id!)) return;
      const original = allAssignmentsMap.get(newAssignment.id!);
      if (original) modifyDemand(original, false);
      modifyDemand(newAssignment, true);
    });

    // 追加分 (プラス)
    pendingAdditions.forEach((newAssignment, index) => {
      if (deletionIdSet.has(9000 + index)) return;
      modifyDemand(newAssignment, true);
    });
    
    return newDemandMap;
  }, [demandMap, pendingChanges, pendingAdditions, pendingDeletions, allAssignmentsMap, patternMap, target]);


  // --- Action Methods ---

  // 行の更新 (新規・既存を内部で判定)
  const updateRow = useCallback((row: GanttRowData, newPattern: IShiftPattern) => {
    if (!target) return;

    if (row.isNew) {
      // 新規追加分の修正
      const index = row.assignmentId - 9000;
      setPendingAdditions(prev => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { ...next[index], patternId: newPattern.patternId };
        }
        return next;
      });
    } else {
      // 既存分の修正
      const original = allAssignmentsMap.get(row.assignmentId);
      if (!original) return;

      const newAssignment: IAssignment = {
        id: row.assignmentId, 
        date: original.date, 
        staffId: row.staff.staffId,
        patternId: newPattern.patternId,
        unitId: row.staff.unitId, 
        locked: true 
      };
      setPendingChanges(prev => new Map(prev).set(row.assignmentId, newAssignment));
    }
  }, [target, allAssignmentsMap]);

  // 行の削除 (新規・既存を内部で判定)
  const deleteRow = useCallback((row: GanttRowData) => {
    const { assignmentId, isNew } = row;
    if (isNew) {
      const index = assignmentId - 9000;
      setPendingAdditions(prev => prev.filter((_, i) => i !== index));
      // ゴミ掃除
      setPendingChanges(prev => {
        if (prev.has(assignmentId)) {
          const newMap = new Map(prev);
          newMap.delete(assignmentId);
          return newMap;
        }
        return prev;
      });
    } else {
      setPendingDeletions(prev => [...prev, assignmentId]);
      // ゴミ掃除
      setPendingChanges(prev => {
        if (prev.has(assignmentId)) {
          const newMap = new Map(prev);
          newMap.delete(assignmentId);
          return newMap;
        }
        return prev;
      });
    }
  }, []);

  // 新規追加
  const addAssignment = useCallback((unitId: string, staffId: string, patternId: string) => {
    if (!target) return;
    const newAssignment: Omit<IAssignment, 'id'> = {
      date: target.date,
      staffId,
      patternId,
      unitId,
      locked: true, 
    };
    setPendingAdditions(prev => [...prev, newAssignment]);
  }, [target]);

  // 確定と保存
  const saveChanges = async () => {
    if (pendingChanges.size === 0 && pendingAdditions.length === 0 && pendingDeletions.length === 0) {
      onClose(); 
      return;
    }
    if (!monthDays || monthDays.length === 0) {
      onClose();
      return;
    }

    try {
      if (pendingChanges.size > 0) {
        await db.assignments.bulkPut(Array.from(pendingChanges.values()));
      }
      if (pendingAdditions.length > 0) {
        await db.assignments.bulkAdd(pendingAdditions);
      }
      if (pendingDeletions.length > 0) {
        await db.assignments.bulkDelete(pendingDeletions);
      }
      
      const firstDay = monthDays[0].dateStr;
      const lastDay = monthDays[monthDays.length - 1].dateStr;
      const assignmentsFromDBForMonth = await db.assignments
        .where('date')
        .between(firstDay, lastDay, true, true)
        .toArray();
      
      dispatch(setAssignments(assignmentsFromDBForMonth));
      onClose(); 
    } catch (e) {
      console.error("Failed to save changes:", e);
      alert("保存に失敗しました。");
    }
  };

  // フォーム用ヘルパー
  const getAvailableStaffForUnit = useCallback((unitId: string, addingToUnitId: string | null) => {
    if (!target || !addingToUnitId) return [];
    
    const assignedStaffIds = new Set<string>();
    allAssignments.forEach(a => {
      if (a.date === target.date) {
        const p = patternMap.get(a.patternId);
        if (p && p.workType === 'Work') assignedStaffIds.add(a.staffId);
      }
    });
    pendingAdditions.forEach(a => assignedStaffIds.add(a.staffId));

    return allStaff
      .filter(s => {
        const isAvailable = s.status === 'Active' && !assignedStaffIds.has(s.staffId);
        if (!isAvailable) return false;
        return (s.unitId === unitId) || (s.unitId === null);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStaff, allAssignments, pendingAdditions, target, patternMap]);

  const getAvailablePatternsForStaff = useCallback((staffId: string) => {
    if (!staffId) return [];
    const staff = allStaffMap.get(staffId);
    if (!staff) return [];
    return workPatterns.filter(p => staff.availablePatternIds.includes(p.patternId));
  }, [allStaffMap, workPatterns]);

  // --- Return ---
  return {
    localUnitGroups,
    localDemandMap,
    workPatterns,
    // State accessors (UI制御用)
    hasPendingChanges: pendingChanges.size > 0 || pendingAdditions.length > 0 || pendingDeletions.length > 0,
    // Actions
    updateRow,
    deleteRow,
    addAssignment,
    saveChanges,
    getAvailableStaffForUnit,
    getAvailablePatternsForStaff
  };
};