import { useState, useEffect, useMemo, useCallback } from 'react'; // ★ useCallback を追加
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie';
import { getDefaultRequiredHolidays } from '../utils/dateUtils';

// ★ staffBurdenData の計算ロジック (dataCalculators.ts から移動)
const calculateStaffBurdenData = (
  staffList: IStaff[], // (アクティブなスタッフリスト)
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffHolidayRequirements: Map<string, number>
) => {
  const burdenMap = new Map<string, {
      staffId: string; name: string; employmentType: 'FullTime' | 'PartTime' | 'Rental'; 
      assignmentCount: number; nightShiftCount: number; totalHours: number; weekendCount: number;
      maxHours: number;
      holidayCount: number; 
      requiredHolidays: number; 
  }>();

  const defaultReq = getDefaultRequiredHolidays(); 

  staffList.forEach((s: IStaff) => { 
    burdenMap.set(s.staffId, { 
      staffId: s.staffId, name: s.name, employmentType: s.employmentType,
      assignmentCount: 0, nightShiftCount: 0, totalHours: 0, weekendCount: 0,
      maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4,
      holidayCount: 0, 
      requiredHolidays: staffHolidayRequirements.get(s.staffId) || defaultReq, 
    });
  });

  for (const assignment of assignments) {
    if (assignment.staffId && assignment.patternId) {
      const staffData = burdenMap.get(assignment.staffId);
      const pattern = patternMap.get(assignment.patternId);
      if (staffData && pattern) { 
        if (pattern.workType === 'Work') { 
          staffData.assignmentCount++;
          staffData.totalHours += pattern.durationHours;
          if (pattern.isNightShift) staffData.nightShiftCount++;
          const dayOfWeek = new Date(assignment.date.replace(/-/g, '/')).getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) staffData.weekendCount++;
        } else if (pattern.workType === 'StatutoryHoliday') { 
          staffData.holidayCount++;
        }
      }
    }
  }
  return burdenMap;
};

/**
 * 負担状況と公休数管理のロジックを集約したカスタムフック
 */
export const useStaffBurdenData = () => {
  // 1. 必要なデータを Redux から取得
  const { staff: allStaff } = useSelector((state: RootState) => state.staff);
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const patternMap = useSelector((state: RootState) => 
    new Map(state.pattern.patterns.map(p => [p.patternId, p]))
  );
  
  // 2. アクティブなスタッフリスト
  const staffList = useMemo(() => 
    allStaff.filter(s => s.status !== 'OnLeave'), 
    [allStaff]
  );

  // 3. 公休数の State 管理 (ShiftCalendarPage から移動)
  const [staffHolidayRequirements, setStaffHolidayRequirements] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const storedReqs = localStorage.getItem('staffHolidayRequirements_2025_11'); 
    if (storedReqs) {
      setStaffHolidayRequirements(new Map(JSON.parse(storedReqs)));
    } else {
      const defaultReq = getDefaultRequiredHolidays();
      const newMap = new Map<string, number>();
      allStaff.forEach(staff => { 
        newMap.set(staff.staffId, defaultReq);
      });
      setStaffHolidayRequirements(newMap);
    }
  }, [allStaff]); 

  useEffect(() => {
    if (staffHolidayRequirements.size > 0) {
      localStorage.setItem('staffHolidayRequirements_2025_11', JSON.stringify(Array.from(staffHolidayRequirements.entries())));
    }
  }, [staffHolidayRequirements]);

  // 4. 負担データの計算 (ShiftCalendarPage から移動)
  const staffBurdenData = useMemo(() => {
    return calculateStaffBurdenData(
      staffList,
      assignments,
      patternMap,
      staffHolidayRequirements
    );
  }, [assignments, staffList, patternMap, staffHolidayRequirements]);

  // 5. 公休数ハンドラ (ShiftCalendarPage から移動)
  const handleHolidayIncrement = useCallback((staffId: string) => {
    setStaffHolidayRequirements(prevMap => {
      const newMap = new Map(prevMap);
      const currentReq = newMap.get(staffId) || getDefaultRequiredHolidays();
      newMap.set(staffId, currentReq + 1);
      return newMap;
    });
  }, []);

  const handleHolidayDecrement = useCallback((staffId: string) => {
    setStaffHolidayRequirements(prevMap => {
      const newMap = new Map(prevMap);
      const currentReq = newMap.get(staffId) || getDefaultRequiredHolidays();
      newMap.set(staffId, Math.max(0, currentReq - 1)); 
      return newMap;
    });
  }, []);

  // 6. 必要なデータとハンドラを返す
  return {
    staffList, // (アクティブなスタッフリスト。AI実行などで必要なため)
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  };
};