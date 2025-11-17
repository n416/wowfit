import { 
  IAssignment, IStaff, IUnit, IShiftPattern, db 
} from '../../db/dexie';
// ★ 修正: MONTH_DAYS のインポートを削除
// import { MONTH_DAYS } from '../../utils/dateUtils'; 
import type { AppDispatch } from '../../store';
import { setAssignments } from '../../store/assignmentSlice';

// ★ 修正: 動的な monthDays の型を定義
type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

interface WorkAllocatorArgs {
  assignments: IAssignment[];
  staffList: IStaff[];
  unitList: IUnit[];
  patternMap: Map<string, IShiftPattern>;
  shiftPatterns: IShiftPattern[];
  dispatch: AppDispatch;
  demandMap: Map<string, { required: number; actual: number }>;
  monthDays: MonthDay[]; // ★ 追加
}

export const allocateWork = async ({
  assignments,
  staffList,
  unitList,
  patternMap,
  shiftPatterns,
  dispatch,
  demandMap,
  monthDays // ★ 追加
}: WorkAllocatorArgs) => {

  if (unitList.length === 0) {
    alert("先に「データ管理」でユニットとデマンドを設定してください。");
    return;
  }

  // -------------------------------------------------------
  // 1. 下準備 (変更なし)
  // -------------------------------------------------------
  
  let currentAssignments: (Omit<IAssignment, 'id'> & { id?: number })[] = [...assignments];
  const rentalStaff = staffList.filter(s => s.employmentType === 'Rental');

  const rentalStaffHours = new Map<string, number>();
  rentalStaff.forEach(s => rentalStaffHours.set(s.staffId, 0));
  
  currentAssignments.forEach(a => {
    const hours = rentalStaffHours.get(a.staffId);
    if (hours !== undefined) {
      const p = patternMap.get(a.patternId);
      if (p && p.workType === 'Work') {
        rentalStaffHours.set(a.staffId, hours + p.durationHours);
      }
    }
  });
  
  // -------------------------------------------------------
  // 2. (v5.21 削除) フェーズ1
  // -------------------------------------------------------
  
  // -------------------------------------------------------
  // 3. フェーズ2: レンタルスタッフによる穴埋め
  // -------------------------------------------------------

  // [Step A] 全日・全ユニットの不足マップ（36時間）を作成
  const shortageMap = new Map<string, number[]>();
  
  // ★ 修正: MONTH_DAYS -> monthDays
  for (const day of monthDays) {
    // 翌日の日付を取得
    const nextDateObj = new Date(day.dateStr.replace(/-/g, '/'));
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;

    for (const unit of unitList) {
      const shortages = new Array(36).fill(0); 
      
      // 当日 0時〜23時 (Index 0-23)
      for (let h = 0; h < 24; h++) {
        const key = `${day.dateStr}_${unit.unitId}_${h}`;
        const demandData = demandMap.get(key); 
        if (demandData && demandData.actual < demandData.required) {
          shortages[h] = demandData.required - demandData.actual;
        }
      }
      
      // 翌日 0時〜11時 (Index 24-35)
      for (let h = 0; h < 12; h++) {
        const key = `${nextDateStr}_${unit.unitId}_${h}`;
        const demandData = demandMap.get(key); 
        if (demandData && demandData.actual < demandData.required) {
          shortages[h + 24] = demandData.required - demandData.actual;
        }
      }
      shortageMap.set(`${day.dateStr}_${unit.unitId}`, shortages);
    }
  }


  // [Step B & C] 日ごとにギャップを検出し、アサインする
  // ★ 修正: MONTH_DAYS -> monthDays
  for (const day of monthDays) {
    for (const unit of unitList) {
      
      const shortages = shortageMap.get(`${day.dateStr}_${unit.unitId}`) || [];

      // [Step B] 不足が連続する区間（ギャップ）を検出 (最大36時間まで)
      const gaps: { start: number, end: number, amount: number }[] = [];
      let currentGap: { start: number, end: number, amount: number } | null = null;
      
      for (let h = 0; h < 36; h++) { // ★ 36時間スキャン
        const shortageAmount = shortages[h];
        if (shortageAmount > 0) {
          if (!currentGap) {
            currentGap = { start: h, end: h + 1, amount: shortageAmount };
          } else {
            currentGap.end = h + 1;
            currentGap.amount = Math.max(currentGap.amount, shortageAmount); 
          }
        } else {
          if (currentGap) {
            gaps.push(currentGap);
            currentGap = null;
          }
        }
      }
      if (currentGap) gaps.push(currentGap);

      // [Step C] 各ギャップに対してレンタルスタッフを割り当て
      for (const gap of gaps) {
        const gapDuration = gap.end - gap.start;

        if (gapDuration < 2) continue;
        if (gap.start >= 24) continue;

        for(let i=0; i < Math.ceil(gap.amount); i++) {
          
          const options: { staff: IStaff, pattern: IShiftPattern, currentHours: number }[] = [];
          const isHalfDemandGap = gap.amount < 1.0;

          for (const staff of rentalStaff) {
            if (currentAssignments.some(a => a.date === day.dateStr && a.staffId === staff.staffId)) continue;
            
            const suitablePatterns = shiftPatterns.filter(p => {
              if (p.workType !== 'Work') return false;
              if (!staff.availablePatternIds.includes(p.patternId)) return false;
              if (isHalfDemandGap && p.crossUnitWorkType === '-') return false;
              
              const startH = parseInt(p.startTime.split(':')[0]);
              const [endH_raw, endM] = p.endTime.split(':').map(Number);
              let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
              
              if (p.crossesMidnight) {
                endH = endH + 24; 
              }
              
              return startH <= gap.start && endH >= gap.end;
            });

            if (suitablePatterns.length > 0) {
              suitablePatterns.sort((a, b) => a.durationHours - b.durationHours);
              options.push({
                staff: staff,
                pattern: suitablePatterns[0],
                currentHours: rentalStaffHours.get(staff.staffId) || 0
              });
            }
          }

          if (options.length === 0) continue; 

          options.sort((a, b) => a.currentHours - b.currentHours);
          const bestOption = options[0]; 

          currentAssignments.push({
            date: day.dateStr, // ★ 開始日でアサイン
            staffId: bestOption.staff.staffId,
            patternId: bestOption.pattern.patternId,
            unitId: unit.unitId
          });
          
          rentalStaffHours.set(
            bestOption.staff.staffId,
            bestOption.currentHours + bestOption.pattern.durationHours
          );

          // ★ ギャップが埋まったことを shortageMap に反映 (ロジック変更なし)
          const affectedDayStr = day.dateStr;
          const affectedUnitId = unit.unitId;
          const startH = parseInt(bestOption.pattern.startTime.split(':')[0]);
          const [endH_raw, endM] = bestOption.pattern.endTime.split(':').map(Number);
          let endH = (endM > 0) ? endH_raw + 1 : endH_raw;

          if (bestOption.pattern.crossesMidnight) {
            const todayShortages = shortageMap.get(`${affectedDayStr}_${affectedUnitId}`);
            if (todayShortages) {
              for (let h = startH; h < 24; h++) {
                if (todayShortages[h] > 0) todayShortages[h] -= 1; 
              }
            }
            const nextDateObj = new Date(affectedDayStr.replace(/-/g, '/'));
            nextDateObj.setDate(nextDateObj.getDate() + 1);
            const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
            const nextDayShortages = shortageMap.get(`${nextDateStr}_${affectedUnitId}`);
            if (nextDayShortages) {
              for (let h = 0; h < endH; h++) {
                if (nextDayShortages[h] > 0) nextDayShortages[h] -= 1; 
              }
            }
          } else {
            const todayShortages = shortageMap.get(`${affectedDayStr}_${affectedUnitId}`);
            if (todayShortages) {
              for (let h = startH; h < endH; h++) {
                if (todayShortages[h] > 0) todayShortages[h] -= 1; 
              }
            }
          }

          break; 
        }
      }
    }
  }

  // -------------------------------------------------------
  // 4. 保存 (変更なし)
  // -------------------------------------------------------
  try {
    // ★ 修正: DB操作を当月分のみにする (リセットと合わせる)
    
    // 1. 当月分のアサインをDBから削除
    const firstDay = monthDays[0].dateStr;
    const lastDay = monthDays[monthDays.length - 1].dateStr;
    const assignmentsToRemove = await db.assignments
      .where('date')
      .between(firstDay, lastDay, true, true)
      .primaryKeys();
      
    if (assignmentsToRemove.length > 0) {
      await db.assignments.bulkDelete(assignmentsToRemove);
    }
    
    // 2. メモリ上の (currentAssignments) 全アサインを追加
    // (※注: この currentAssignments には前月からの夜勤なども含まれるべきだが、
    //    現状のロジックでは当月分しか保持していない。
    //    本来は「当月変更分」だけを bulkPut/bulkDelete すべきだが、
    //    簡便さのため、一旦当月分をクリアして当月計算分をすべてAddする)
    
    // ★ 修正: currentAssignments のうち、当月分のアサインのみをDBに保存する
    const assignmentsToSave = currentAssignments
      .filter(a => a.date >= firstDay && a.date <= lastDay)
      .map(({ id, ...rest }) => rest); 
      
    await db.assignments.bulkAdd(assignmentsToSave);
    
    // 3. DBから当月分を読み直してReduxにセット
    const savedAssignments = await db.assignments
      .where('date')
      .between(firstDay, lastDay, true, true)
      .toArray();
      
    dispatch(setAssignments(savedAssignments));
    alert("「応援スタッフで埋める」が完了しました。");
    
  } catch (e) {
    console.error("保存エラー:", e);
    alert("保存に失敗しました");
  }
};