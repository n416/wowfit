import { 
  IAssignment, IStaff, IUnit, IShiftPattern, db 
} from '../../db/dexie';
import { MONTH_DAYS, getDefaultRequiredHolidays } from '../../utils/dateUtils';
import type { AppDispatch } from '../../store';
import { setAssignments } from '../../store/assignmentSlice';

// (ShiftCalendarPage.tsx から handleHolidayPlacementClick のロジックを移動)

// ★ v5.9: 必要な引数をすべて受け取るように定義
interface HolidayAllocatorArgs {
  assignments: IAssignment[];
  staffList: IStaff[];
  unitList: IUnit[];
  patternMap: Map<string, IShiftPattern>;
  staffMap: Map<string, IStaff>;
  staffHolidayRequirements: Map<string, number>;
  dispatch: AppDispatch;
}

// ★ v5.9 (v5.10 修正): 夜勤/日勤の枠を分離するロジック
export const allocateHolidays = async ({
  assignments,
  staffList,
  unitList,
  patternMap,
  staffMap,
  staffHolidayRequirements,
  dispatch
}: HolidayAllocatorArgs) => {
  
    alert("「公休」を自動配置します。\n(v5.10: 夜勤/日勤デマンド分離版)");

    // 1. 既存のアサインから「公休」以外（有給など）を保持
    let newAssignments = assignments.filter(a => {
      const p = patternMap.get(a.patternId);
      return p && p.workType !== 'StatutoryHoliday';
    });

    // 2. Step 1: スタッフとデマンドの分類
    
    // 2a. 常勤スタッフを「夜勤可能」と「日勤のみ」に分類
    const nightShiftPatterns = new Set(
      Array.from(patternMap.values())
        .filter(p => p.isNightShift && p.workType === 'Work')
        .map(p => p.patternId)
    );
    
    const fullTime_NightStaff: IStaff[] = [];
    const fullTime_DayStaff: IStaff[] = [];
    const partTimeStaffList: IStaff[] = []; // パートはデマンド計算から除外

    staffList.forEach(staff => {
      if (staff.employmentType === 'FullTime') {
        const canWorkNight = staff.availablePatternIds.some(pid => nightShiftPatterns.has(pid));
        if (canWorkNight) {
          fullTime_NightStaff.push(staff);
        } else {
          fullTime_DayStaff.push(staff);
        }
      } else {
        partTimeStaffList.push(staff);
      }
    });

    // 2b. 「夜勤/日勤の公休取得可能枠」を計算
    const nightHolidayCapacityMap = new Map<string, number>();
    const dayHolidayCapacityMap = new Map<string, number>();

    for (const day of MONTH_DAYS) {
      let peakNightDemand = 0;
      let peakDayDemand = 0;

      for (let hour = 0; hour < 24; hour++) {
        let hourlyDemand = 0;
        for (const unit of unitList) {
          hourlyDemand += (unit.demand && unit.demand[hour]) || 0;
        }
        
        // ★ 時間帯 (0-6時, 16-23時) を夜勤デマンドとみなす (簡易版)
        if (hour < 7 || hour >= 16) {
          if (hourlyDemand > peakNightDemand) peakNightDemand = hourlyDemand;
        } else {
          if (hourlyDemand > peakDayDemand) peakDayDemand = hourlyDemand;
        }
      }
      
      // ★ その日に既に休む予定の「常勤（夜勤）」スタッフをカウント
      const alreadyOff_Night = newAssignments.filter(a => {
        const staff = staffMap.get(a.staffId);
        return a.date === day.dateStr &&
               staff && fullTime_NightStaff.some(s => s.staffId === staff.staffId) &&
               patternMap.get(a.patternId)?.workType !== 'Work';
      }).length;
      
      // ★ その日に既に休む予定の「常勤（日勤）」スタッフをカウント
      const alreadyOff_Day = newAssignments.filter(a => {
        const staff = staffMap.get(a.staffId);
        return a.date === day.dateStr &&
               staff && fullTime_DayStaff.some(s => s.staffId === staff.staffId) &&
               patternMap.get(a.patternId)?.workType !== 'Work';
      }).length;

      // ★ 枠を個別に計算
      const nightCapacity = fullTime_NightStaff.length - peakNightDemand - alreadyOff_Night;
      const dayCapacity = fullTime_DayStaff.length - peakDayDemand - alreadyOff_Day;
      
      nightHolidayCapacityMap.set(day.dateStr, Math.max(0, nightCapacity));
      dayHolidayCapacityMap.set(day.dateStr, Math.max(0, dayCapacity));
    }

    const defaultReq = getDefaultRequiredHolidays();

    // --------------------------------------------------
    // 3. Step 2: 常勤スタッフの公休を配置 (夜勤 -> 日勤 の順)
    // --------------------------------------------------
    // (★ 夜勤可能スタッフから先に配置)
    for (const staff of fullTime_NightStaff) {
      // (配置ロジックは v5.8 と同じだが、使用する枠マップが nightHolidayCapacityMap に変わる)
      const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || defaultReq;
      const staffAssignments = new Set<string>();
      newAssignments.forEach(a => { if(a.staffId === staff.staffId) staffAssignments.add(a.date); });
      let placedHolidays = newAssignments.filter(a => a.staffId === staff.staffId && patternMap.get(a.patternId)?.workType === 'StatutoryHoliday').length;

      // 3a. 連休優先
      const weekendPairs: string[][] = [];
      for (let i = 1; i < MONTH_DAYS.length; i++) {
          const day1 = MONTH_DAYS[i-1];
          const day2 = MONTH_DAYS[i];
          if ((day1.dayOfWeek === 6 && day2.dayOfWeek === 0) || (day1.dayOfWeek === 0 && day2.dayOfWeek === 1)) {
               weekendPairs.push([day1.dateStr, day2.dateStr]);
          }
      }
      for (const [day1str, day2str] of weekendPairs) {
          if (placedHolidays >= requiredHolidays - 1) break;
          // ★★★ 夜勤枠(nightHolidayCapacityMap)をチェック ★★★
          const canPlace = (nightHolidayCapacityMap.get(day1str) || 0) > 0 && 
                           (nightHolidayCapacityMap.get(day2str) || 0) > 0 &&
                           !staffAssignments.has(day1str) && !staffAssignments.has(day2str);
          if (canPlace) {
              newAssignments.push({ date: day1str, staffId: staff.staffId, patternId: '公休', unitId: null });
              newAssignments.push({ date: day2str, staffId: staff.staffId, patternId: '公休', unitId: null });
              staffAssignments.add(day1str); staffAssignments.add(day2str);
              nightHolidayCapacityMap.set(day1str, nightHolidayCapacityMap.get(day1str)! - 1); // ★ 夜勤枠を消費
              nightHolidayCapacityMap.set(day2str, nightHolidayCapacityMap.get(day2str)! - 1); // ★ 夜勤枠を消費
              placedHolidays += 2;
          }
      }
      // 3b. 均等配置
      if (placedHolidays < requiredHolidays) {
        const remainingHolidays = requiredHolidays - placedHolidays;
        const interval = Math.floor(MONTH_DAYS.length / (remainingHolidays + 1)); 
        let dayIndex = 0;
        for (let i = 0; i < remainingHolidays; i++) {
          let placedThisHoliday = false;
          dayIndex = Math.min(dayIndex + (interval > 0 ? interval : 1), MONTH_DAYS.length - 1); 
          const searchOrder = [
             ...MONTH_DAYS.slice(dayIndex).filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6), ...MONTH_DAYS.slice(dayIndex).filter(d => d.dayOfWeek !== 0 && d.dayOfWeek !== 6),
             ...MONTH_DAYS.slice(0, dayIndex).filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6), ...MONTH_DAYS.slice(0, dayIndex).filter(d => d.dayOfWeek !== 0 && d.dayOfWeek !== 6),
          ];
          for (const day of searchOrder) {
             // ★★★ 夜勤枠(nightHolidayCapacityMap)をチェック ★★★
             const canPlace = (nightHolidayCapacityMap.get(day.dateStr) || 0) > 0 && !staffAssignments.has(day.dateStr);
             if (canPlace) {
                newAssignments.push({ date: day.dateStr, staffId: staff.staffId, patternId: '公休', unitId: null });
                staffAssignments.add(day.dateStr);
                nightHolidayCapacityMap.set(day.dateStr, nightHolidayCapacityMap.get(day.dateStr)! - 1); // ★ 夜勤枠を消費
                placedHolidays++;
                placedThisHoliday = true;
                dayIndex = MONTH_DAYS.findIndex(d => d.dateStr === day.dateStr); 
                break; 
             }
          }
          if (!placedThisHoliday) {
            console.warn(`(常勤/夜勤) ${staff.name} の公休を ${requiredHolidays} 日配置できませんでした（${placedHolidays} 日で終了）。夜勤公休枠が不足しています。`);
            break; 
          }
        }
      }
    } // end for-FullTime(Night)Staff

    // (★ 次に日勤のみスタッフを配置)
    for (const staff of fullTime_DayStaff) {
      // (配置ロジックは v5.8 と同じだが、使用する枠マップが dayHolidayCapacityMap に変わる)
      const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || defaultReq;
      const staffAssignments = new Set<string>();
      newAssignments.forEach(a => { if(a.staffId === staff.staffId) staffAssignments.add(a.date); });
      let placedHolidays = newAssignments.filter(a => a.staffId === staff.staffId && patternMap.get(a.patternId)?.workType === 'StatutoryHoliday').length;

      // 3a. 連休優先
      const weekendPairs: string[][] = [];
      for (let i = 1; i < MONTH_DAYS.length; i++) {
          const day1 = MONTH_DAYS[i-1];
          const day2 = MONTH_DAYS[i];
          if ((day1.dayOfWeek === 6 && day2.dayOfWeek === 0) || (day1.dayOfWeek === 0 && day2.dayOfWeek === 1)) {
               weekendPairs.push([day1.dateStr, day2.dateStr]);
          }
      }
      for (const [day1str, day2str] of weekendPairs) {
          if (placedHolidays >= requiredHolidays - 1) break;
          // ★★★ 日勤枠(dayHolidayCapacityMap)をチェック ★★★
          const canPlace = (dayHolidayCapacityMap.get(day1str) || 0) > 0 && 
                           (dayHolidayCapacityMap.get(day2str) || 0) > 0 &&
                           !staffAssignments.has(day1str) && !staffAssignments.has(day2str);
          if (canPlace) {
              newAssignments.push({ date: day1str, staffId: staff.staffId, patternId: '公休', unitId: null });
              newAssignments.push({ date: day2str, staffId: staff.staffId, patternId: '公休', unitId: null });
              staffAssignments.add(day1str); staffAssignments.add(day2str);
              dayHolidayCapacityMap.set(day1str, dayHolidayCapacityMap.get(day1str)! - 1); // ★ 日勤枠を消費
              dayHolidayCapacityMap.set(day2str, dayHolidayCapacityMap.get(day2str)! - 1); // ★ 日勤枠を消費
              placedHolidays += 2;
          }
      }
      // 3b. 均等配置
      if (placedHolidays < requiredHolidays) {
        const remainingHolidays = requiredHolidays - placedHolidays;
        const interval = Math.floor(MONTH_DAYS.length / (remainingHolidays + 1)); 
        let dayIndex = 0;
        for (let i = 0; i < remainingHolidays; i++) {
          let placedThisHoliday = false;
          dayIndex = Math.min(dayIndex + (interval > 0 ? interval : 1), MONTH_DAYS.length - 1); 
          const searchOrder = [
             ...MONTH_DAYS.slice(dayIndex).filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6), ...MONTH_DAYS.slice(dayIndex).filter(d => d.dayOfWeek !== 0 && d.dayOfWeek !== 6),
             ...MONTH_DAYS.slice(0, dayIndex).filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6), ...MONTH_DAYS.slice(0, dayIndex).filter(d => d.dayOfWeek !== 0 && d.dayOfWeek !== 6),
          ];
          for (const day of searchOrder) {
             // ★★★ 日勤枠(dayHolidayCapacityMap)をチェック ★★★
             const canPlace = (dayHolidayCapacityMap.get(day.dateStr) || 0) > 0 && !staffAssignments.has(day.dateStr);
             if (canPlace) {
                newAssignments.push({ date: day.dateStr, staffId: staff.staffId, patternId: '公休', unitId: null });
                staffAssignments.add(day.dateStr);
                dayHolidayCapacityMap.set(day.dateStr, dayHolidayCapacityMap.get(day.dateStr)! - 1); // ★ 日勤枠を消費
                placedHolidays++;
                placedThisHoliday = true;
                dayIndex = MONTH_DAYS.findIndex(d => d.dateStr === day.dateStr); 
                break; 
             }
          }
          if (!placedThisHoliday) {
            console.warn(`(常勤/日勤) ${staff.name} の公休を ${requiredHolidays} 日配置できませんでした（${placedHolidays} 日で終了）。日勤公休枠が不足しています。`);
            break; 
          }
        }
      }
    } // end for-FullTime(Day)Staff

    // --------------------------------------------------
    // 4. Step 3: パートスタッフの公休を配置 (ロジック変更なし)
    // --------------------------------------------------
    for (const staff of partTimeStaffList) {
      const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || defaultReq;
      
      const staffAssignments = new Set<string>();
      newAssignments.forEach(a => {
        if(a.staffId === staff.staffId) staffAssignments.add(a.date);
      });
      let placedHolidays = newAssignments.filter(a => 
        a.staffId === staff.staffId && patternMap.get(a.patternId)?.workType === 'StatutoryHoliday'
      ).length;

      // 4a. 均等配置ロジック (パートは連休優先なし)
      if (placedHolidays < requiredHolidays) {
        const remainingHolidays = requiredHolidays - placedHolidays;
        const interval = Math.floor(MONTH_DAYS.length / (remainingHolidays + 1)); 
        let dayIndex = 0; 

        for (let i = 0; i < remainingHolidays; i++) {
          let placedThisHoliday = false;
          dayIndex = Math.min(dayIndex + (interval > 0 ? interval : 1), MONTH_DAYS.length - 1); 

          // ★ パートはデマンド（枠）を気にしないが、土日は避け、平日を優先する
          const searchOrder = [
             ...MONTH_DAYS.slice(dayIndex).filter(d => d.dayOfWeek !== 0 && d.dayOfWeek !== 6), // これからの平日
             ...MONTH_DAYS.slice(0, dayIndex).filter(d => d.dayOfWeek !== 0 && d.dayOfWeek !== 6), // 前半の平日
             ...MONTH_DAYS.slice(dayIndex).filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6), // これからの週末
             ...MONTH_DAYS.slice(0, dayIndex).filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6), // 前半の週末
          ];

          for (const day of searchOrder) {
             // ★★★ ロジック修正: 「常勤枠(holidayCapacityMap)」をチェックしない ★★★
             const canPlace = !staffAssignments.has(day.dateStr);
             if (canPlace) {
                newAssignments.push({ date: day.dateStr, staffId: staff.staffId, patternId: '公休', unitId: null });
                staffAssignments.add(day.dateStr);
                // (枠は消費しない)
                placedHolidays++;
                placedThisHoliday = true;
                dayIndex = MONTH_DAYS.findIndex(d => d.dateStr === day.dateStr); 
                break; 
             }
          }
          
          if (!placedThisHoliday) {
            console.warn(`(パート) ${staff.name} の公休を ${requiredHolidays} 日配置できませんでした（${placedHolidays} 日で終了）。(全日アサイン済み？)`);
            break; 
          }
        }
      }
    } // end for-PartTimeStaff
    

    // 5. 最終結果をDBとReduxに保存
    try {
      await db.assignments.clear(); // (一旦全削除)
      // (IDを付与しなおす)
      const assignmentsToPut = newAssignments.map(a => ({
        date: a.date,
        staffId: a.staffId,
        patternId: a.patternId,
        unitId: a.unitId
      }));
      await db.assignments.bulkPut(assignmentsToPut);
      const allAssignments = await db.assignments.toArray(); // (IDが付与された結果を取得)
      dispatch(setAssignments(allAssignments));
      alert("公休の配置が完了しました。");
    } catch (e) { {
      console.error("公休の配置に失敗:", e);
    }
  }
};