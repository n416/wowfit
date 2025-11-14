import { 
  IAssignment, IStaff, IUnit, IShiftPattern, db 
} from '../../db/dexie';
// ★★★ v5.85 修正: 未使用の getPrevDateStr を削除 ★★★
import { MONTH_DAYS } from '../../utils/dateUtils'; 
import type { AppDispatch } from '../../store';
import { setAssignments } from '../../store/assignmentSlice';

// ★★★ v5.82 修正: 未使用の isWorkingAt を削除 ★★★
/*
const isWorkingAt = (pattern: IShiftPattern, targetHour: number): boolean => {
  ...
};
*/


interface WorkAllocatorArgs {
  assignments: IAssignment[];
  staffList: IStaff[];
  unitList: IUnit[];
  patternMap: Map<string, IShiftPattern>;
  shiftPatterns: IShiftPattern[];
  dispatch: AppDispatch;
  // ★★★ v5.79 修正: demandMap を引数に追加 ★★★
  demandMap: Map<string, { required: number; actual: number }>;
}

export const allocateWork = async ({
  assignments,
  staffList,
  unitList,
  patternMap,
  shiftPatterns,
  dispatch,
  demandMap
}: WorkAllocatorArgs) => {

  if (unitList.length === 0) {
    alert("先に「データ管理」でユニットとデマンドを設定してください。");
    return;
  }

  // -------------------------------------------------------
  // 1. 下準備
  // -------------------------------------------------------
  
  let currentAssignments: (Omit<IAssignment, 'id'> & { id?: number })[] = [...assignments];
  const rentalStaff = staffList.filter(s => s.employmentType === 'Rental');

  // ★★★ v5.81 修正: レンタルスタッフの現在の総労働時間を計算 ★★★
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

  // ★★★ v5.83 修正: 日またぎギャップ検出のため、1日ずつではなく全日分を先に処理 ★★★
  
  // [Step A] 全日・全ユニットの不足マップ（36時間）を作成
  // (キー: "YYYY-MM-DD_unitId", 値: number[36])
  const shortageMap = new Map<string, number[]>();
  
  for (const day of MONTH_DAYS) {
    // 翌日の日付を取得
    const nextDateObj = new Date(day.dateStr.replace(/-/g, '/'));
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;

    for (const unit of unitList) {
      // 0時〜23時 (当日) + 24時〜35時 (翌日0時〜11時)
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
  for (const day of MONTH_DAYS) {
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

        // ★ルール1: 2時間未満の不足は無視
        if (gapDuration < 2) continue;
        
        // ★ v5.83 追加ルール: ギャップの開始が翌日(24時以降)なら、当日の処理対象外
        if (gap.start >= 24) continue;

        // ★★★ v5.84 修正: 0.5人不足(gap.amount < 1)の場合もループが回るように Math.ceil を使用 ★★★
        for(let i=0; i < Math.ceil(gap.amount); i++) {
          
          // ★ルール2: 負荷分散（総時間が少ない順）
          const options: { staff: IStaff, pattern: IShiftPattern, currentHours: number }[] = [];

          // ★★★ v5.84 修正: 0.5人デマンドかどうかのフラグ ★★★
          const isHalfDemandGap = gap.amount < 1.0;

          for (const staff of rentalStaff) {
            // このスタッフがこの日（または翌日）にまだ働いていないか
            if (currentAssignments.some(a => a.date === day.dateStr && a.staffId === staff.staffId)) continue;
            
            const suitablePatterns = shiftPatterns.filter(p => {
              if (p.workType !== 'Work') return false;
              if (!staff.availablePatternIds.includes(p.patternId)) return false;

              // ★★★ v5.84 修正: 0.5人デマンド(isHalfDemandGap)の場合、シェア不可('-')パターンは除外 ★★★
              if (isHalfDemandGap && p.crossUnitWorkType === '-') return false;
              
              // ★★★ v5.83 修正: 夜勤の時間比較ロジック ★★★
              const startH = parseInt(p.startTime.split(':')[0]);
              const [endH_raw, endM] = p.endTime.split(':').map(Number);
              let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
              
              if (p.crossesMidnight) {
                endH = endH + 24; 
              }
              
              return startH <= gap.start && endH >= gap.end;
            });
            // ★★★ v5.84 修正ここまで ★★★

            if (suitablePatterns.length > 0) {
              // 2. ルール3: 最短時間優先 (スタッフごと)
              suitablePatterns.sort((a, b) => a.durationHours - b.durationHours);
              options.push({
                staff: staff,
                pattern: suitablePatterns[0],
                currentHours: rentalStaffHours.get(staff.staffId) || 0
              });
            }
          }

          // 3. 候補(options)を「現在の総時間(currentHours)」が少ない順でソート
          if (options.length === 0) continue; 

          options.sort((a, b) => a.currentHours - b.currentHours);
          const bestOption = options[0]; 

          // 4. アサイン実行
          currentAssignments.push({
            date: day.dateStr, // ★ 開始日でアサイン
            staffId: bestOption.staff.staffId,
            patternId: bestOption.pattern.patternId,
            unitId: unit.unitId
          });
          
          // 5. 負荷（総時間）を更新
          rentalStaffHours.set(
            bestOption.staff.staffId,
            bestOption.currentHours + bestOption.pattern.durationHours
          );

          // ★★★ v5.83 修正: ギャップが埋まったことを shortageMap に反映 ★★★
          const affectedDayStr = day.dateStr;
          const affectedUnitId = unit.unitId;
          
          const startH = parseInt(bestOption.pattern.startTime.split(':')[0]);
          const [endH_raw, endM] = bestOption.pattern.endTime.split(':').map(Number);
          let endH = (endM > 0) ? endH_raw + 1 : endH_raw;

          if (bestOption.pattern.crossesMidnight) {
            // 当日の不足を減らす (startH 〜 23時)
            const todayShortages = shortageMap.get(`${affectedDayStr}_${affectedUnitId}`);
            if (todayShortages) {
              for (let h = startH; h < 24; h++) {
                if (todayShortages[h] > 0) todayShortages[h] -= 1; // ★ 0.5の場合も1引く
              }
            }
            // 翌日の不足を減らす (0時 〜 endH)
            const nextDateObj = new Date(affectedDayStr.replace(/-/g, '/'));
            nextDateObj.setDate(nextDateObj.getDate() + 1);
            const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
            
            const nextDayShortages = shortageMap.get(`${nextDateStr}_${affectedUnitId}`);
            if (nextDayShortages) {
              for (let h = 0; h < endH; h++) {
                // (nextDayShortagesは当日の24時始まりのIndex。 h は 0〜endH)
                if (nextDayShortages[h] > 0) nextDayShortages[h] -= 1; 
              }
            }
          } else {
            // 日勤
            const todayShortages = shortageMap.get(`${affectedDayStr}_${affectedUnitId}`);
            if (todayShortages) {
              for (let h = startH; h < endH; h++) {
                if (todayShortages[h] > 0) todayShortages[h] -= 1; // ★ 0.5の場合も1引く
              }
            }
          }
          // ★★★ v5.83 修正ここまで ★★★

          break; 
        }
      }
    }
  }

  // -------------------------------------------------------
  // 4. 保存
  // -------------------------------------------------------
  try {
    await db.assignments.clear();
    const assignmentsToSave = currentAssignments.map(({ id, ...rest }) => rest); 
    await db.assignments.bulkAdd(assignmentsToSave);
    
    const savedAssignments = await db.assignments.toArray();
    dispatch(setAssignments(savedAssignments));
    alert("「応援スタッフで埋める」が完了しました。");
    
  } catch (e) {
    console.error("保存エラー:", e);
    alert("保存に失敗しました");
  }
};