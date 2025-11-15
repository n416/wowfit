import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IShiftPattern, IUnit, IAssignment } from '../db/dexie';
import { getPrevDateStr } from '../utils/dateUtils';

// ★ unitGroups の型定義 (dataCalculators.ts から移動)
export type UnitGroupData = {
  unit: IUnit;
  rows: { 
    staff: IStaff; 
    pattern: IShiftPattern; 
    isSupport: boolean; 
    startHour: number;
    duration: number; 
    assignmentId: number; 
    unitId: string | null; 
  }[];
};

// ★ unitGroups の計算ロジック (dataCalculators.ts から移動)
const calculateUnitGroups = (
  showingGanttTarget: { date: string; unitId: string; } | null,
  unitList: IUnit[],
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffMap: Map<string, IStaff>
): UnitGroupData[] => {
  if (!showingGanttTarget) return []; 
    
  const { date } = showingGanttTarget;
  const groups: UnitGroupData[] = [];
  const prevDateStr = getPrevDateStr(date);

  unitList.forEach(currentUnit => {
    const rows: any[] = [];

    assignments.forEach(assignment => {
      if (!assignment.id) return; 
      if (assignment.date !== date && assignment.date !== prevDateStr) return;
      const pattern = patternMap.get(assignment.patternId);
      if (!pattern || pattern.workType !== 'Work') return;
      if (assignment.date === prevDateStr && !pattern.crossesMidnight) return;
      const staff = staffMap.get(assignment.staffId);
      if (!staff) return;
      if (staff.status === 'OnLeave') return; 

      const startH = parseInt(pattern.startTime.split(':')[0]);
      const [endH_raw, endM] = pattern.endTime.split(':').map(Number);
      let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
      let displayStart = startH;
      let displayDuration = endH - startH;

      if (pattern.crossesMidnight) {
          if (assignment.date === date) {
            displayDuration = 24 - startH; 
          } else {
            displayStart = 0;
            displayDuration = endH;
          }
      }

      const checkHour = assignment.date === date ? startH : 0;
      let isMatch = false;
      let isSupport = false;

      if (assignment.unitId === currentUnit.unitId) {
        isMatch = true;
        isSupport = false; 
        const isCrossUnit = pattern.crossUnitWorkType === '有' || pattern.crossUnitWorkType === 'サポート';
        const assignedUnitDemand = (currentUnit.demand || [])[checkHour];
        if (isCrossUnit && assignedUnitDemand === 0.5) {
            isSupport = true;
        }
      } else {
        const isCrossUnit = pattern.crossUnitWorkType === '有' || pattern.crossUnitWorkType === 'サポート';
        if (isCrossUnit) {
          const demandHere = (currentUnit.demand || [])[checkHour];
          if (demandHere === 0.5) {
            isMatch = true;
            isSupport = true;
          }
        }
      }

      if (isMatch) {
        rows.push({ 
          staff, pattern, isSupport, 
          startHour: displayStart, 
          duration: displayDuration,
          assignmentId: assignment.id, 
          unitId: assignment.unitId,   
        });
      }
    });

    rows.sort((a, b) => {
      if (a.startHour !== b.startHour) return a.startHour - b.startHour;
      return a.staff.name.localeCompare(b.staff.name);
    });

    groups.push({ unit: currentUnit, rows });
  });

  return groups;
};


/**
 * ガントチャートモーダル用のグループデータを計算するカスタムフック
 * @param showingGanttTarget モーダルが表示対象としている日付とユニットID
 */
export const useUnitGroups = (
  showingGanttTarget: { date: string; unitId: string; } | null
) => {
  // 1. 必要なデータを Redux から取得
  const { staff: allStaff } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  const { assignments } = useSelector((state: RootState) => state.assignment);

  // 2. 計算に必要なマップを作成
  const staffMap = useMemo(() => new Map(allStaff.map((s: IStaff) => [s.staffId, s])), [allStaff]);
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);

  // 3. ユニットグループを計算
  const unitGroups: UnitGroupData[] = useMemo(() => {
    return calculateUnitGroups(
      showingGanttTarget,
      unitList,
      assignments,
      patternMap,
      staffMap
    );
  }, [showingGanttTarget, assignments, patternMap, staffMap, unitList]);

  return unitGroups;
};