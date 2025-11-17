import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie';
import { getDefaultRequiredHolidays } from '../utils/dateUtils';

// ★★★ 修正: このファイル内でも MonthDay 型を定義 ★★★
type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

// ★★★ 修正: monthDays の型を MonthDay[] に変更 ★★★
const calculateStaffBurdenData = (
  staffList: IStaff[], // (アクティブなスタッフリスト)
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffHolidayRequirements: Map<string, number>,
  monthDays: MonthDay[] // ★ 型を修正
) => {
  const burdenMap = new Map<string, {
      staffId: string; name: string; employmentType: 'FullTime' | 'PartTime' | 'Rental'; 
      assignmentCount: number; nightShiftCount: number; totalHours: number; weekendCount: number;
      maxHours: number;
      holidayCount: number; 
      requiredHolidays: number; 
  }>();

  const defaultReq = getDefaultRequiredHolidays(monthDays); 

  staffList.forEach((s: IStaff) => { 
    burdenMap.set(s.staffId, { 
      staffId: s.staffId, name: s.name, employmentType: s.employmentType,
      assignmentCount: 0, nightShiftCount: 0, totalHours: 0, weekendCount: 0,
      maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4,
      holidayCount: 0, 
      requiredHolidays: staffHolidayRequirements.get(s.staffId) || defaultReq, 
    });
  });

  // ★ 修正: これで d.dateStr (TS2339) が解決される
  const dateToDayOfWeekMap = new Map<string, number>(
    monthDays.map(d => [d.dateStr, d.dayOfWeek])
  );

  for (const assignment of assignments) {
    if (assignment.staffId && assignment.patternId) {
      const staffData = burdenMap.get(assignment.staffId);
      const pattern = patternMap.get(assignment.patternId);
      if (staffData && pattern) { 
        if (pattern.workType === 'Work') { 
          staffData.assignmentCount++;
          staffData.totalHours += pattern.durationHours;
          if (pattern.isNightShift) staffData.nightShiftCount++;
          
          const dayOfWeek = dateToDayOfWeekMap.get(assignment.date);
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            staffData.weekendCount++;
          }
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
 * ★ 修正: 引数の型を MonthDay[] に変更
 */
export const useStaffBurdenData = (
  currentYear: number, 
  currentMonth: number, 
  monthDays: MonthDay[]
) => {
  // 1. 必要なデータを Redux から取得
  const { staff: allStaff } = useSelector((state: RootState) => state.staff);
  
  const { assignments } = useSelector((state: RootState) => state.assignment.present);

  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);
  const patternMap = useMemo(() => 
    new Map(shiftPatterns.map(p => [p.patternId, p])),
    [shiftPatterns]
  );
  
  // 2. アクティブなスタッフリスト (変更なし)
  const staffList = useMemo(() => 
    allStaff.filter(s => s.status !== 'OnLeave'), 
    [allStaff]
  );

  // 3. 公休数の State 管理 (変更なし)
  const [staffHolidayRequirements, setStaffHolidayRequirements] = useState<Map<string, number>>(new Map());

  // (localStorage のキー動的変更 - 変更なし)
  useEffect(() => {
    const storageKey = `staffHolidayRequirements_${currentYear}_${currentMonth}`;
    const storedReqs = localStorage.getItem(storageKey); 
    
    if (storedReqs) {
      setStaffHolidayRequirements(new Map(JSON.parse(storedReqs)));
    } else {
      const defaultReq = getDefaultRequiredHolidays(monthDays);
      const newMap = new Map<string, number>();
      allStaff.forEach(staff => { 
        newMap.set(staff.staffId, defaultReq);
      });
      setStaffHolidayRequirements(newMap);
    }
  }, [allStaff, currentYear, currentMonth, monthDays]); 

  // (localStorage のキー動的変更 - 変更なし)
  useEffect(() => {
    if (staffHolidayRequirements.size > 0) {
      const storageKey = `staffHolidayRequirements_${currentYear}_${currentMonth}`;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(staffHolidayRequirements.entries())));
    }
  }, [staffHolidayRequirements, currentYear, currentMonth]);

  // 4. 負担データの計算 (変更なし)
  const staffBurdenData = useMemo(() => {
    return calculateStaffBurdenData(
      staffList,
      assignments, 
      patternMap,
      staffHolidayRequirements,
      monthDays 
    );
  }, [assignments, staffList, patternMap, staffHolidayRequirements, monthDays]);

  // 5. 公休数ハンドラ (変更なし)
  const handleHolidayIncrement = useCallback((staffId: string) => {
    setStaffHolidayRequirements(prevMap => {
      const newMap = new Map(prevMap);
      const currentReq = newMap.get(staffId) || getDefaultRequiredHolidays(monthDays);
      newMap.set(staffId, currentReq + 1);
      return newMap;
    });
  }, [monthDays]); 

  const handleHolidayDecrement = useCallback((staffId: string) => {
    setStaffHolidayRequirements(prevMap => {
      const newMap = new Map(prevMap);
      const currentReq = newMap.get(staffId) || getDefaultRequiredHolidays(monthDays);
      newMap.set(staffId, Math.max(0, currentReq - 1)); 
      return newMap;
    });
  }, [monthDays]); 

  // 6. 必要なデータとハンドラを返す
  return {
    staffList, 
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  };
};