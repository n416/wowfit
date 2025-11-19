import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie';
import { getDefaultRequiredHolidays } from '../utils/dateUtils';

type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

const calculateStaffBurdenData = (
  staffList: IStaff[], 
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffHolidayRequirements: Map<string, number>,
  monthDays: MonthDay[]
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
          
          // ★★★ Flex計算ロジック ★★★
          let hours = pattern.durationHours;
          if (pattern.isFlex && assignment.overrideStartTime && assignment.overrideEndTime) {
             const [sh, sm] = assignment.overrideStartTime.split(':').map(Number);
             const [eh, em] = assignment.overrideEndTime.split(':').map(Number);
             const startVal = sh + (sm / 60);
             const endVal = eh + (em / 60);
             // 休憩時間を引くならここで pattern.breakDurationMinutes を考慮するが、
             // Flexの場合「実働」を指定している前提であればそのまま差分、
             // 「枠」を指定しているなら休憩を引く。
             // ここでは「枠内で実働X時間」という要件だが、overrideTimeは「確定した時間」とみなして単純差分とします。
             // もし休憩が必要なら (diff - break) とする
             const diff = endVal - startVal;
             hours = diff > 0 ? diff : 0;
          }

          staffData.totalHours += hours;

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

export const useStaffBurdenData = (
  currentYear: number, 
  currentMonth: number, 
  monthDays: MonthDay[]
) => {
  // (変更なし)
  const { staff: allStaff } = useSelector((state: RootState) => state.staff);
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns);
  
  const patternMap = useMemo(() => 
    new Map(shiftPatterns.map(p => [p.patternId, p])),
    [shiftPatterns]
  );
  const staffList = useMemo(() => 
    allStaff.filter(s => s.status !== 'OnLeave'), 
    [allStaff]
  );
  const [staffHolidayRequirements, setStaffHolidayRequirements] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const storageKey = `staffHolidayRequirements_${currentYear}_${currentMonth}`;
    const storedReqs = localStorage.getItem(storageKey); 
    if (storedReqs) {
      setStaffHolidayRequirements(new Map(JSON.parse(storedReqs)));
    } else {
      const defaultReq = getDefaultRequiredHolidays(monthDays);
      const newMap = new Map<string, number>();
      allStaff.forEach(staff => { newMap.set(staff.staffId, defaultReq); });
      setStaffHolidayRequirements(newMap);
    }
  }, [allStaff, currentYear, currentMonth, monthDays]); 

  useEffect(() => {
    if (staffHolidayRequirements.size > 0) {
      const storageKey = `staffHolidayRequirements_${currentYear}_${currentMonth}`;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(staffHolidayRequirements.entries())));
    }
  }, [staffHolidayRequirements, currentYear, currentMonth]);

  const staffBurdenData = useMemo(() => {
    return calculateStaffBurdenData(
      staffList,
      assignments, 
      patternMap,
      staffHolidayRequirements,
      monthDays 
    );
  }, [assignments, staffList, patternMap, staffHolidayRequirements, monthDays]);

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

  return {
    staffList, 
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  };
};