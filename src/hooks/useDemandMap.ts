import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IShiftPattern, IUnit, IAssignment } from '../db/dexie';
import { getPrevDateStr } from '../utils/dateUtils';

type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

export const calculateDemandMap = (
  unitList: IUnit[],
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffMap: Map<string, IStaff>, 
  monthDays: MonthDay[],
  caller: string = "Background" 
) => {
  const map = new Map<string, { required: number; actual: number }>(); 

  // --- 1. Pass 1: Demand (初期化) ---
  for (const day of monthDays) {
    for (const unit of unitList) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day.dateStr}_${unit.unitId}_${hour}`;
        const requiredStaff = (unit.demand && unit.demand[hour]) || 0; 
        map.set(key, { required: requiredStaff, actual: 0 });
      }
    }
  }
  
  // --- 2. Pass 2: Actual (本所属カウント) ---
  for (const assignment of assignments) {
    const pattern = patternMap.get(assignment.patternId);
    const staff = staffMap.get(assignment.staffId);
    if (!staff || staff.status === 'OnLeave') continue; 
    
    if (assignment.unitId && pattern && pattern.workType === 'Work') {
      // Flex対応
      const timeBase = (pattern.isFlex && assignment.overrideStartTime) ? assignment.overrideStartTime : pattern.startTime;
      const startH = parseInt(timeBase.split(':')[0]);
      
      let duration = pattern.durationHours;
      if (pattern.isFlex && assignment.overrideStartTime && assignment.overrideEndTime) {
         const s = parseInt(assignment.overrideStartTime.split(':')[0]) + (parseInt(assignment.overrideStartTime.split(':')[1]) || 0)/60;
         const e = parseInt(assignment.overrideEndTime.split(':')[0]) + (parseInt(assignment.overrideEndTime.split(':')[1]) || 0)/60;
         duration = e - s;
         if (duration < 0) duration += 24;
      }
      
      const endH_calc = startH + Math.ceil(duration);
      const endH_today = endH_calc > 24 ? 24 : endH_calc;
      const endH_nextDay = endH_calc > 24 ? endH_calc - 24 : 0;

      // 当日分
      for (let hour = startH; hour < endH_today; hour++) { 
        const key = `${assignment.date}_${assignment.unitId}_${hour}`;
        const entry = map.get(key);
        if (entry) entry.actual += 1;
      }

      // 翌日分 (日付またぎ)
      // ★★★ 修正: pattern.crossesMidnight フラグだけでなく、計算上の終了時間が24を超えていれば翌日扱いとする
      if (pattern.crossesMidnight || endH_calc > 24) {
        const nextDateObj = new Date(assignment.date.replace(/-/g, '/'));
        nextDateObj.setDate(nextDateObj.getDate() + 1);
        const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
        
        for (let hour = 0; hour < endH_nextDay; hour++) {
          const key = `${nextDateStr}_${assignment.unitId}_${hour}`;
          const entry = map.get(key);
          // ★ Debug: 翌日分のカウント状況を確認したい場合
          // if (caller === 'Modal' && nextDateStr === '2025-11-03' && hour < 9) console.log(`[Pass2] NextDay Hit: ${assignment.staffId} ${hour}:00`);
          if (entry) entry.actual += 1;
        }
      }
    }
  }

  // --- 3. Pass 3: Cross-Unit Coverage (連携・応援) ---
  for (const day of monthDays) {
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

        // 0.5人不足の特例ルール
        const missing = entry.required - entry.actual;
        if (missing > 0 && missing <= 0.5) {
          const supporters = assignments.filter(a => {
            // 1. 自分自身は除外
            if (a.unitId === unit.unitId) return false; 
            const staff = staffMap.get(a.staffId);
            if (!staff || staff.status === 'OnLeave') return false; 
            const p = patternMap.get(a.patternId);
            if (!p || p.workType !== 'Work') return false;
            const isShareable = p.crossUnitWorkType === '有' || p.crossUnitWorkType === 'サポート';
            if (!isShareable) return false;
            
            // 時間帯チェック (当日 or 前日)
            const timeBase = (p.isFlex && a.overrideStartTime) ? a.overrideStartTime : p.startTime;
            const startH = parseInt(timeBase.split(':')[0]);
            let duration = p.durationHours;
            if (p.isFlex && a.overrideStartTime && a.overrideEndTime) {
               const s = parseInt(a.overrideStartTime.split(':')[0]) + (parseInt(a.overrideStartTime.split(':')[1]) || 0)/60;
               const e = parseInt(a.overrideEndTime.split(':')[0]) + (parseInt(a.overrideEndTime.split(':')[1]) || 0)/60;
               duration = e - s;
               if (duration < 0) duration += 24;
            }
            const endH_calc = startH + Math.ceil(duration);
            const endH_today = endH_calc > 24 ? 24 : endH_calc;
            const endH_nextDay = endH_calc > 24 ? endH_calc - 24 : 0;

            // ★ 当日のシフト
            if (a.date === day.dateStr) {
              return (h >= startH && h < endH_today) || (h < endH_nextDay && p.crossesMidnight);
            }
            // ★ 前日からのシフト (ここが重要！)
            // 前日の日付で、かつ日付またぎシフトの場合、翌日(当日)の朝の時間帯に含まれるか
            if (a.date === prevDateStr && (p.crossesMidnight || endH_calc > 24)) {
              return h < endH_nextDay;
            }
            return false;
          });

          if (supporters.length > 0) {
            entry.actual += 0.5; 
          }
        }
        
        // 余剰計算
        if (entry.actual > entry.required) {
          const surplusInThisUnit = entry.actual - entry.required;
          if (surplusInThisUnit >= 0.5) {
             shareableSurplusPool += Math.min(surplusInThisUnit, 1);
          }
        }
      }

      // 余剰分配
      if (shareableSurplusPool > 0 && deficitUnits.length > 0) {
        deficitUnits.sort((a, b) => (b.entry.required - b.entry.actual) - (a.entry.required - a.entry.actual));
        for (const target of deficitUnits) {
          if (shareableSurplusPool <= 0) break; 
          const needed = target.entry.required - target.entry.actual;
          const fillAmount = Math.min(needed, 1.0); 
          if (shareableSurplusPool >= fillAmount) {
            target.entry.actual += fillAmount;
            shareableSurplusPool -= fillAmount;
          }
        }
      }
    }
  }
  return map;
};

export const useDemandMap = (
  monthDays: MonthDay[]
) => {
  const { staff: allStaff } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  const { assignments } = useSelector((state: RootState) => state.assignment.present);

  const staffMap = useMemo(() => new Map(allStaff.map((s: IStaff) => [s.staffId, s])), [allStaff]);
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);

  const demandMap = useMemo(() => {
    return calculateDemandMap(
      unitList,
      assignments,
      patternMap,
      staffMap,
      monthDays,
      "Background"
    );
  }, [assignments, unitList, patternMap, staffMap, monthDays]);

  return demandMap;
};