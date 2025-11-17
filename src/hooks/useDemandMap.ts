import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { IStaff, IShiftPattern, IUnit, IAssignment } from '../db/dexie';
// ★ 修正: MONTH_DAYS のインポートを削除し、getPrevDateStr をインポート
import { getPrevDateStr } from '../utils/dateUtils';

// ★ 修正: 動的な monthDays の型を定義
type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

// ★ 修正: monthDays を引数で受け取る
const calculateDemandMap = (
  unitList: IUnit[],
  assignments: IAssignment[],
  patternMap: Map<string, IShiftPattern>,
  staffMap: Map<string, IStaff>, // (休職者チェック用)
  monthDays: MonthDay[] // ★ 追加
) => {
  const map = new Map<string, { required: number; actual: number }>(); 
  
  // --- 1. Pass 1: Demand (Mapの初期化) ---
  // ★ 修正: MONTH_DAYS -> monthDays
  for (const day of monthDays) {
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
        // ★ 修正: 日付計算ロジックを getPrevDateStr と同様のものに変更
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
  // ★ 修正: MONTH_DAYS -> monthDays
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

/**
 * デマンド充足状況 (demandMap) を計算するカスタムフック
 * ★ 修正: 引数を追加
 */
export const useDemandMap = (
  monthDays: MonthDay[]
) => {
  // 1. 必要なデータを Redux から取得
  const { staff: allStaff } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  const { assignments } = useSelector((state: RootState) => state.assignment.present);

  // 2. 計算に必要なマップを作成 (変更なし)
  const staffMap = useMemo(() => new Map(allStaff.map((s: IStaff) => [s.staffId, s])), [allStaff]);
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);

  // 3. デマンドマップを計算
  const demandMap = useMemo(() => {
    // ★ 修正: monthDays を渡す
    return calculateDemandMap(
      unitList,
      assignments,
      patternMap,
      staffMap,
      monthDays // ★ 追加
    );
  // ★ 修正: monthDays を依存配列に追加
  }, [assignments, unitList, patternMap, staffMap, monthDays]);

  return demandMap;
};