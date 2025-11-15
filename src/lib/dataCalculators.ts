import { IStaff, IShiftPattern, IUnit, IAssignment } from '../db/dexie';
import { MONTH_DAYS, getDefaultRequiredHolidays, getPrevDateStr } from '../utils/dateUtils';

// ★ staffBurdenData の計算ロジック
export const calculateStaffBurdenData = (
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


// ★ demandMap の計算ロジック
export const calculateDemandMap = (
  unitList: IUnit[],
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffMap: Map<string, IStaff> // (休職者チェック用)
) => {
  const map = new Map<string, { required: number; actual: number }>(); 
  
  // --- 1. Pass 1: Demand (Mapの初期化) ---
  for (const day of MONTH_DAYS) {
    for (const unit of unitList) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day.dateStr}_${unit.unitId}_${hour}`;
        const requiredStaff = (unit.demand && unit.demand[hour]) || 0; 
        map.set(key, { required: requiredStaff, actual: 0 });
      }
    }
  }
  
  // --- 2. Pass 2: Actual (アサイン先への直接配置) ---
  for (const assignment of assignments) {
    const pattern = patternMap.get(assignment.patternId);
    const staff = staffMap.get(assignment.staffId);
    if (staff && staff.status === 'OnLeave') continue; 
    
    if (assignment.unitId && pattern && pattern.workType === 'Work') {
      const startTime = parseInt(pattern.startTime.split(':')[0]);
      const [endH, endM] = pattern.endTime.split(':').map(Number);
      const endTime = (endM > 0) ? endH + 1 : endH;

      if (!pattern.crossesMidnight) {
        for (let hour = startTime; hour < endTime; hour++) { 
          const key = `${assignment.date}_${assignment.unitId}_${hour}`;
          const entry = map.get(key);
          if (entry) entry.actual += 1;
        }
      } else {
        for (let hour = startTime; hour < 24; hour++) {
          const key = `${assignment.date}_${assignment.unitId}_${hour}`;
          const entry = map.get(key);
          if (entry) entry.actual += 1;
        }
        const nextDateObj = new Date(assignment.date.replace(/-/g, '/'));
        nextDateObj.setDate(nextDateObj.getDate() + 1);
        const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
        for (let hour = 0; hour < endTime; hour++) {
          const key = `${nextDateStr}_${assignment.unitId}_${hour}`;
          const entry = map.get(key);
          if (entry) entry.actual += 1;
        }
      }
    }
  }

  // --- 3. Pass 3: Surplus (余剰の再配置) ---
  for (const day of MONTH_DAYS) {
    const prevDateStr = getPrevDateStr(day.dateStr);

    for (let h = 0; h < 24; h++) {
      let shareableSurplusPool = 0; 
      const deficitUnits: { key: string, entry: { required: number, actual: number } }[] = []; 

      for (const unit of unitList) {
        const key = `${day.dateStr}_${unit.unitId}_${h}`;
        const entry = map.get(key);
        if (!entry) continue;

        if (entry.actual < entry.required) {
          deficitUnits.push({ key, entry });
        }

        if (entry.actual > entry.required) {
          const shareableStaffInThisUnit = assignments.filter(a => {
            const staff = staffMap.get(a.staffId);
            if (!staff || staff.status === 'OnLeave') return false; 
            if (a.unitId !== unit.unitId) return false;
            const p = patternMap.get(a.patternId);
            if (!p || p.workType !== 'Work') return false;
            const isShareable = p.crossUnitWorkType === '有' || p.crossUnitWorkType === 'サポート';
            if (!isShareable) return false;
            const startH = parseInt(p.startTime.split(':')[0]);
            const [endH_raw, endM_raw] = p.endTime.split(':').map(Number);
            const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw;
            if (a.date === day.dateStr && !p.crossesMidnight) return (h >= startH && h < endH);
            if (a.date === day.dateStr && p.crossesMidnight) return (h >= startH);
            if (a.date === prevDateStr && p.crossesMidnight) return (h < endH);
            return false;
          });
          
          const surplusInThisUnit = entry.actual - entry.required;
          const contribution = Math.min(surplusInThisUnit, shareableStaffInThisUnit.length);
          shareableSurplusPool += contribution;
        }
      }

      if (shareableSurplusPool > 0 && deficitUnits.length > 0) {
        deficitUnits.sort((a, b) => (b.entry.required - b.entry.actual) - (a.entry.required - a.entry.actual));
        
        for (const target of deficitUnits) {
          if (shareableSurplusPool <= 0) break; 
          const needed = target.entry.required - target.entry.actual;
          const fillAmount = Math.min(needed, 1.0); 
          target.entry.actual += fillAmount;
          shareableSurplusPool -= fillAmount;
        }
      }
    }
  }
  return map;
};


// ★ unitGroups の型定義（ShiftCalendarPage から移動）
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

// ★ unitGroups の計算ロジック
export const calculateUnitGroups = (
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