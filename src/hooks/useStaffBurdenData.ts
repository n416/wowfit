import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IAssignment, IShiftPattern } from '../db/dexie';
import { getDefaultRequiredHolidays, getPrevDateStr, MonthDay } from '../utils/dateUtils';

const calculateStaffBurdenData = (
  staffList: IStaff[], 
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffHolidayRequirements: Map<string, number>,
  monthDays: MonthDay[]
) => {
  const burdenMap = new Map<string, {
      staffId: string; name: string; employmentType: 'FullTime' | 'PartTime' | 'Rental'; 
      assignmentCount: number; 
      nightShiftCount: number; 
      earlyShiftCount: number; 
      lateShiftCount: number;  
      totalHours: number; weekendCount: number;
      maxHours: number;
      holidayCount: number; 
      requiredHolidays: number; 
      holidayDetails: Map<string, number>;
  }>();

  const defaultReq = getDefaultRequiredHolidays(monthDays); 

  staffList.forEach((s: IStaff) => { 
    burdenMap.set(s.staffId, { 
      staffId: s.staffId, name: s.name, employmentType: s.employmentType,
      assignmentCount: 0, 
      nightShiftCount: 0, 
      earlyShiftCount: 0, 
      lateShiftCount: 0,  
      totalHours: 0, weekendCount: 0,
      maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4,
      holidayCount: 0, 
      // マップに設定があればそれを、なければデフォルトを使用
      requiredHolidays: staffHolidayRequirements.has(s.staffId) ? staffHolidayRequirements.get(s.staffId)! : defaultReq, 
      holidayDetails: new Map(),
    });
  });

  const assignmentLookup = new Map<string, IAssignment>();
  for (const a of assignments) {
    assignmentLookup.set(`${a.staffId}_${a.date}`, a);
  }

  for (const staff of staffList) {
    const staffData = burdenMap.get(staff.staffId)!;

    for (const day of monthDays) {
      const dateStr = day.dateStr;
      const assignment = assignmentLookup.get(`${staff.staffId}_${dateStr}`);
      const pattern = assignment ? patternMap.get(assignment.patternId) : null;

      const prevDateStr = getPrevDateStr(dateStr);
      const prevAssignment = assignmentLookup.get(`${staff.staffId}_${prevDateStr}`);
      const prevPattern = prevAssignment ? patternMap.get(prevAssignment.patternId) : null;

      const isPrevNightShift = prevPattern?.isNightShift === true;
      const isTodayWork = pattern?.workType === 'Work';

      if (isPrevNightShift && !isTodayWork) {
        staffData.holidayCount += 0.5;
      }

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
          if (pattern.mainCategory.includes('早出')) staffData.earlyShiftCount++;
          if (pattern.mainCategory.includes('遅出')) staffData.lateShiftCount++;
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
      setStaffHolidayRequirements(new Map());
    }
  }, [currentYear, currentMonth]); 

  useEffect(() => {
    const storageKey = `staffHolidayRequirements_${currentYear}_${currentMonth}`;
    // マップが空でも保存する（「全員デフォルト」の状態を保存するため）
    localStorage.setItem(storageKey, JSON.stringify(Array.from(staffHolidayRequirements.entries())));
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

  // ★ 修正: 増減メソッドを廃止し、更新メソッドを追加
  const updateHolidayRequirement = useCallback((staffId: string, days: number | null) => {
    setStaffHolidayRequirements(prev => {
      const next = new Map(prev);
      if (days === null) {
        next.delete(staffId); // nullなら削除してデフォルトに戻す
      } else {
        next.set(staffId, days);
      }
      return next;
    });
  }, []);

  return {
    staffList, 
    staffBurdenData,
    staffHolidayRequirements,
    updateHolidayRequirement // ★ 公開
  };
};