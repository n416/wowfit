import { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IStaff, IShiftPattern, IAssignment, db } from '../db/dexie';
import { setAssignments } from '../store/assignmentSlice';
import type { AppDispatch, RootState } from '../store';
import { calculateDemandMap } from './useDemandMap';
import { calculateUnitGroups, UnitGroupData } from './useUnitGroups'; 

const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const isWithinContract = (staff: IStaff, start: string, end: string): boolean => {
  if (staff.employmentType !== 'PartTime') return true;
  const ranges = (staff.workableTimeRanges && staff.workableTimeRanges.length > 0) ? staff.workableTimeRanges : [{ start: '08:00', end: '20:00' }];
  const sMin = timeToMin(start); const eMin = timeToMin(end);
  return ranges.some(range => { const rStart = timeToMin(range.start); const rEnd = timeToMin(range.end); return sMin >= rStart && eMin <= rEnd; });
};

export type MonthDay = { dateStr: string; weekday: string; dayOfWeek: number; };
export type GanttRowData = UnitGroupData['rows'][number];

export const useDailyGanttLogic = (
  target: { date: string; unitId: string | null } | null,
  onClose: () => void,
  allAssignments: IAssignment[],
  demandMap: Map<string, { required: number; actual: number }>,
  monthDays: MonthDay[]
) => {
  const dispatch: AppDispatch = useDispatch();
  const allStaff = useSelector((state: RootState) => state.staff.staff);
  const allPatterns = useSelector((state: RootState) => state.pattern.patterns);
  const unitList = useSelector((state: RootState) => state.unit.units);

  const allStaffMap = useMemo(() => new Map(allStaff.map(s => [s.staffId, s])), [allStaff]);
  const patternMap = useMemo(() => new Map(allPatterns.map(p => [p.patternId, p])), [allPatterns]);
  const allAssignmentsMap = useMemo(() => {
    const map = new Map<number, IAssignment>();
    allAssignments.forEach(a => { if (a.id) map.set(a.id, a); });
    return map;
  }, [allAssignments]);

  const workPatterns = useMemo(() => allPatterns.filter(p => p.workType === 'Work'), [allPatterns]);

  const [pendingChanges, setPendingChanges] = useState<Map<number, IAssignment>>(new Map());
  const [pendingAdditions, setPendingAdditions] = useState<Omit<IAssignment, 'id'>[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<number[]>([]);

  useEffect(() => {
    setPendingChanges(new Map());
    setPendingAdditions([]);
    setPendingDeletions([]);
  }, [target]);

  const mergedAssignments = useMemo(() => {
    const deletionSet = new Set(pendingDeletions);
    const base = allAssignments
      .filter(a => a.id && !deletionSet.has(a.id))
      .map(a => {
        if (a.id && pendingChanges.has(a.id)) {
          return pendingChanges.get(a.id)!;
        }
        return a;
      });
    const additions = pendingAdditions.map(a => a as IAssignment);
    return [...base, ...additions];
  }, [allAssignments, pendingChanges, pendingAdditions, pendingDeletions]);

  const recalculatedDemandMap = useMemo(() => {
    if (!target) return demandMap;
    // @ts-ignore
    return calculateDemandMap(unitList, mergedAssignments, patternMap, allStaffMap, monthDays, "Modal");
  }, [unitList, mergedAssignments, patternMap, allStaffMap, monthDays, target, demandMap]);

  const baseUnitGroups = useMemo(() => {
    return calculateUnitGroups(target, unitList, allAssignments, patternMap, allStaffMap);
  }, [target, unitList, allAssignments, patternMap, allStaffMap]);

  // ★★★ 修正: localUnitGroups 生成ロジック (日付またぎ表示補正の強化) ★★★
  const localUnitGroups = useMemo(() => {
    if (!target) return [];
    const deletionIdSet = new Set(pendingDeletions);
    
    const updatedGroups = baseUnitGroups.map(group => ({
      ...group,
      rows: group.rows
        .filter(row => {
           if (deletionIdSet.has(row.assignmentId)) return false;
           if (!pendingChanges.has(row.assignmentId)) {
              const currentAssignment = allAssignmentsMap.get(row.assignmentId);
              if (!currentAssignment) return false;
              const currentPattern = patternMap.get(currentAssignment.patternId);
              if (!currentPattern || currentPattern.workType !== 'Work') return false; 
           }
           return true;
        })
        .map(row => {
          const change = pendingChanges.get(row.assignmentId);
          const assignment = change || allAssignmentsMap.get(row.assignmentId);
          const pattern = assignment ? patternMap.get(assignment.patternId) : row.pattern;
          if (!pattern) return row;

          const overrideStart = assignment?.overrideStartTime;
          const timeBase = (pattern.isFlex && overrideStart) ? overrideStart : pattern.startTime;
          
          let displayDuration = pattern.durationHours;
          if (pattern.isFlex && overrideStart && assignment?.overrideEndTime) {
            const s = parseInt(overrideStart.split(':')[0]) + (parseInt(overrideStart.split(':')[1]) || 0)/60;
            const e = parseInt(assignment.overrideEndTime.split(':')[0]) + (parseInt(assignment.overrideEndTime.split(':')[1]) || 0)/60;
            displayDuration = (e < s ? e + 24 : e) - s;
          }

          const startH_raw = parseInt(timeBase.split(':')[0]);
          let displayStart = startH_raw;

          // ★★★ 修正: 日付比較による表示位置の決定 ★★★
          const isSameDay = (assignment?.date === target.date);

          if (!isSameDay) {
             // 前日からのシフト: 常に0時から開始
             displayStart = 0;
             
             // 長さの計算: 「終了時刻」まで
             // FlexかつOverrideがあればそれを使う、なければパターン定義
             if (pattern.isFlex && assignment?.overrideEndTime) {
                 const [eh, em] = assignment.overrideEndTime.split(':').map(Number);
                 displayDuration = eh + (em/60);
             } else {
                 // パターン定義の終了時刻をパースして使用
                 // ※日付またぎ前提なので、endTimeがそのまま翌日の終了時刻になる
                 const [eh, em] = pattern.endTime.split(':').map(Number);
                 displayDuration = eh + (em/60);
             }
             
             // 24時を超える場合はカット (念のため)
             if (displayDuration > 24) displayDuration = 24;

          } else {
             // 当日のシフト: はみ出し防止のみ
             if (pattern.crossesMidnight || startH_raw + displayDuration > 24) {
                const overflow = (startH_raw + displayDuration) - 24;
                if (overflow > 0) {
                  displayDuration -= overflow;
                }
             }
          }

          return {
            ...row,
            pattern: pattern,
            startHour: displayStart,
            duration: displayDuration,
            unitId: assignment?.unitId ?? row.unitId,
            isNew: change ? false : row.isNew,
            displayStartTime: overrideStart,
            displayEndTime: assignment?.overrideEndTime
          };
        })
    }));

    pendingAdditions.forEach((newAssignment, index) => {
      const tempId = 9000 + index;
      if (deletionIdSet.has(tempId)) return;
      const group = updatedGroups.find(g => g.unit.unitId === newAssignment.unitId);
      const staff = allStaffMap.get(newAssignment.staffId);
      const pattern = patternMap.get(newAssignment.patternId);

      if (group && staff && pattern) {
        const overrideStart = newAssignment.overrideStartTime;
        const timeBase = (pattern.isFlex && overrideStart) ? overrideStart : pattern.startTime;
        const startH = parseInt(timeBase.split(':')[0]);
        let displayStart = startH;
        
        let displayDuration = pattern.durationHours;
        if (pattern.isFlex && overrideStart && newAssignment.overrideEndTime) {
           const s = parseInt(overrideStart.split(':')[0]) + (parseInt(overrideStart.split(':')[1]) || 0)/60;
           const e = parseInt(newAssignment.overrideEndTime.split(':')[0]) + (parseInt(newAssignment.overrideEndTime.split(':')[1]) || 0)/60;
           displayDuration = (e < s ? e + 24 : e) - s;
        }
        
        if (displayStart + displayDuration > 24) {
          const overflow = (displayStart + displayDuration) - 24;
          if (overflow > 0) displayDuration -= overflow;
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
          displayStartTime: overrideStart,
          displayEndTime: newAssignment.overrideEndTime
        });
      }
    });
    return updatedGroups;
  }, [baseUnitGroups, pendingChanges, pendingAdditions, pendingDeletions, patternMap, target, allStaffMap, allAssignmentsMap]);

  const updateRow = useCallback((
    row: GanttRowData,
    newPattern: IShiftPattern,
    newTimeRange?: { start: string, end: string }
  ) => {
    if (!target) return;
    if (newTimeRange) {
      if (!isWithinContract(row.staff, newTimeRange.start, newTimeRange.end)) return;
    } else {
      if (!isWithinContract(row.staff, newPattern.startTime, newPattern.endTime)) {
        if (!window.confirm(`警告: 選択したパターン(${newPattern.startTime}-${newPattern.endTime})は、契約時間外の可能性があります。\n適用しますか？`)) return;
      }
    }

    const baseAssignment: Partial<IAssignment> = {
      patternId: newPattern.patternId,
      overrideStartTime: newTimeRange?.start,
      overrideEndTime: newTimeRange?.end,
      locked: true
    };

    if (row.isNew) {
      const index = row.assignmentId - 9000;
      setPendingAdditions(prev => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { ...next[index], ...baseAssignment };
        }
        return next;
      });
    } else {
      const original = allAssignmentsMap.get(row.assignmentId);
      if (!original) return;
      const newAssignment: IAssignment = {
        id: row.assignmentId,
        date: original.date,
        staffId: row.staff.staffId,
        unitId: row.staff.unitId,
        ...baseAssignment,
        patternId: newPattern.patternId,
      } as IAssignment;
      setPendingChanges(prev => new Map(prev).set(row.assignmentId, newAssignment));
    }
  }, [target, allAssignmentsMap]);

  const deleteRow = useCallback((row: GanttRowData) => {
    const { assignmentId, isNew } = row;
    if (isNew) {
      const index = assignmentId - 9000;
      setPendingAdditions(prev => prev.filter((_, i) => i !== index));
    } else {
      setPendingDeletions(prev => [...prev, assignmentId]);
    }
    setPendingChanges(prev => {
      if (prev.has(assignmentId)) {
        const newMap = new Map(prev);
        newMap.delete(assignmentId);
        return newMap;
      }
      return prev;
    });
  }, []);

  const addAssignment = useCallback((unitId: string, staffId: string, patternId: string) => {
    if (!target) return;
    const pattern = patternMap.get(patternId);
    const newAssignment: Omit<IAssignment, 'id'> = {
      date: target.date,
      staffId,
      patternId,
      unitId,
      locked: true,
      overrideStartTime: pattern?.isFlex ? pattern.startTime : undefined,
      overrideEndTime: pattern?.isFlex ? pattern.endTime : undefined,
    };
    setPendingAdditions(prev => [...prev, newAssignment]);
  }, [target, patternMap]);

  const saveChanges = async () => {
    if (pendingChanges.size === 0 && pendingAdditions.length === 0 && pendingDeletions.length === 0) {
      onClose();
      return;
    }
    try {
      if (pendingChanges.size > 0) await db.assignments.bulkPut(Array.from(pendingChanges.values()));
      if (pendingAdditions.length > 0) await db.assignments.bulkAdd(pendingAdditions);
      if (pendingDeletions.length > 0) await db.assignments.bulkDelete(pendingDeletions);

      if (monthDays.length > 0) {
        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;
        const assignmentsFromDBForMonth = await db.assignments
          .where('date')
          .between(firstDay, lastDay, true, true)
          .toArray();
        dispatch(setAssignments(assignmentsFromDBForMonth));
      }
      onClose();
    } catch (e) {
      console.error("Failed to save changes:", e);
      alert("保存に失敗しました。");
    }
  };

  return {
    localUnitGroups,
    localDemandMap: recalculatedDemandMap,
    workPatterns,
    hasPendingChanges: pendingChanges.size > 0 || pendingAdditions.length > 0 || pendingDeletions.length > 0,
    updateRow,
    deleteRow,
    addAssignment,
    saveChanges,
    getAvailableStaffForUnit: (u: string, a: string | null) => {
      if (!target || !a) return [];
      const assignedStaffIds = new Set<string>();
      allAssignments.forEach(as => { if (as.date === target.date) assignedStaffIds.add(as.staffId); });
      pendingAdditions.forEach(as => assignedStaffIds.add(as.staffId));
      return allStaff.filter(s => s.status === 'Active' && !assignedStaffIds.has(s.staffId) && (s.unitId === u || s.unitId === null));
    },
    getAvailablePatternsForStaff: (sid: string) => {
      const s = allStaffMap.get(sid);
      return s ? workPatterns.filter(p => s.availablePatternIds.includes(p.patternId)) : [];
    }
  };
};