import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie';
import { getDefaultRequiredHolidays, getPrevDateStr } from '../utils/dateUtils';

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
      holidayDetails: Map<string, number>;
  }>();

  const defaultReq = getDefaultRequiredHolidays(monthDays); 

  // 1. スタッフごとの初期化
  staffList.forEach((s: IStaff) => { 
    burdenMap.set(s.staffId, { 
      staffId: s.staffId, name: s.name, employmentType: s.employmentType,
      assignmentCount: 0, nightShiftCount: 0, totalHours: 0, weekendCount: 0,
      maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4,
      holidayCount: 0, 
      requiredHolidays: staffHolidayRequirements.get(s.staffId) || defaultReq, 
      holidayDetails: new Map(),
    });
  });

  // 2. アサインをスタッフ・日付で高速検索できるようにマップ化
  const assignmentLookup = new Map<string, IAssignment>();
  for (const a of assignments) {
    assignmentLookup.set(`${a.staffId}_${a.date}`, a);
  }

  // 3. 日付順に走査して集計
  for (const staff of staffList) {
    const staffData = burdenMap.get(staff.staffId)!;

    for (const day of monthDays) {
      const dateStr = day.dateStr;
      const assignment = assignmentLookup.get(`${staff.staffId}_${dateStr}`);
      const pattern = assignment ? patternMap.get(assignment.patternId) : null;

      // --- 前日チェック (夜勤明け判定) ---
      const prevDateStr = getPrevDateStr(dateStr);
      const prevAssignment = assignmentLookup.get(`${staff.staffId}_${prevDateStr}`);
      const prevPattern = prevAssignment ? patternMap.get(prevAssignment.patternId) : null;

      const isPrevNightShift = prevPattern?.isNightShift === true;
      const isTodayWork = pattern?.workType === 'Work';

      // 前日が夜勤かつ、当日が勤務でない場合、半公休(0.5)を加算
      if (isPrevNightShift && !isTodayWork) {
        staffData.holidayCount += 0.5;
        // ★ 修正: 半公休('/')は公休の一部として扱うため、内訳チップ(holidayDetails)には追加しない
        // const key = '/';
        // const current = staffData.holidayDetails.get(key) || 0;
        // staffData.holidayDetails.set(key, current + 0.5);
      }

      // --- 当日のアサイン集計 ---
      if (pattern) {
        if (pattern.workType === 'Work') { 
          staffData.assignmentCount++;
          
          let hours = pattern.durationHours;
          if (pattern.isFlex && assignment?.overrideStartTime && assignment?.overrideEndTime) {
             const [sh, sm] = assignment.overrideStartTime.split(':').map(Number);
             const [eh, em] = assignment.overrideEndTime.split(':').map(Number);
             const startVal = sh + (sm / 60);
             const endVal = eh + (em / 60);
             const diff = endVal - startVal;
             hours = diff > 0 ? diff : 0;
          }
          staffData.totalHours += hours;

          if (pattern.isNightShift) staffData.nightShiftCount++;
          
          if (day.dayOfWeek === 0 || day.dayOfWeek === 6) {
            staffData.weekendCount++;
          }
        } 
        else if (pattern.workType === 'StatutoryHoliday') { 
          staffData.holidayCount++;
        }
        else if (pattern.workType === 'PaidLeave') {
          staffData.holidayCount++; 
          const key = pattern.symbol || '有';
          const current = staffData.holidayDetails.get(key) || 0;
          staffData.holidayDetails.set(key, current + 1);
        }
        else if (pattern.workType === 'Holiday') {
          staffData.holidayCount++; 
          // その他の休日(育休等)は内訳にも表示
          const key = pattern.symbol || pattern.name;
          const current = staffData.holidayDetails.get(key) || 0;
          staffData.holidayDetails.set(key, current + 1);
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