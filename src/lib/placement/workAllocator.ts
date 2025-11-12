import { 
  IAssignment, IStaff, IUnit, IShiftPattern, db 
} from '../../db/dexie';
import { MONTH_DAYS } from '../../utils/dateUtils';
import type { AppDispatch } from '../../store';
import { setAssignments } from '../../store/assignmentSlice';

// (ShiftCalendarPage.tsx から移動したヘルパー関数)
const getEndTime = (dateStr: string, pattern: IShiftPattern) => {
  const dateTime = new Date(`${dateStr.replace(/-/g, '/')} ${pattern.endTime}`);
  if (pattern.crossesMidnight) {
    dateTime.setDate(dateTime.getDate() + 1);
  }
  return dateTime;
};
const getStartTime = (dateStr: string, pattern: IShiftPattern) => {
  return new Date(`${dateStr.replace(/-/g, '/')} ${pattern.startTime}`);
};

// ★ v5.9: 必要な引数をすべて受け取るように定義
interface WorkAllocatorArgs {
  assignments: IAssignment[];
  staffList: IStaff[];
  unitList: IUnit[];
  patternMap: Map<string, IShiftPattern>;
  shiftPatterns: IShiftPattern[]; // (find 用にパターン配列も必要)
  dispatch: AppDispatch;
}

// ★ v5.9: 労働配置アルゴリズム (v5.9 夜勤分担ロジック修正)
export const allocateWork = async ({
  assignments,
  staffList,
  unitList,
  patternMap,
  shiftPatterns,
  dispatch
}: WorkAllocatorArgs) => {

  if (unitList.length === 0) {
    alert("先に「データ管理」でユニットとデマンドを設定してください。");
    return;
  }

  // 1. Demand (必要な労働枠) を計算
  const demandMap = new Map<string, number>(); 
  for (const day of MONTH_DAYS) {
    for (const unit of unitList) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day.dateStr}_${unit.unitId}_${hour}`;
        const requiredStaff = (unit.demand && unit.demand[hour]) || 0; 
        demandMap.set(key, requiredStaff);
      }
    }
  }

  // 2. 既存のアサイン（公休など）を取得
  let newAssignments = assignments.filter(a => {
    const p = patternMap.get(a.patternId);
    return p && p.workType !== 'Work'; // 労働以外(公休/有給)は保持
  });
  
  const staffAssignments = new Map<string, IAssignment[]>();
  staffList.forEach(s => staffAssignments.set(s.staffId, []));
  newAssignments.forEach(a => { // (公休・有給のみ)
    if(staffAssignments.has(a.staffId)) {
      staffAssignments.get(a.staffId)!.push(a);
    }
  });

  // 3. 優先度リスト (常勤 -> パート)
  const baseStaffPriorityList = [
    ...staffList.filter(s => s.employmentType === 'FullTime'), 
    ...staffList.filter(s => s.employmentType === 'PartTime'), 
  ];
  
  // ★ v5.9 追加: 月間の夜勤回数をカウントするMap
  const staffNightShiftCount = new Map<string, number>();
  staffList.forEach(s => staffNightShiftCount.set(s.staffId, 0));

  // 4. 全日付 x 全ユニット x 全時間帯 をループして Demand をチェック
  for (const day of MONTH_DAYS) {
    for (const unit of unitList) {
      for (let hour = 0; hour < 24; hour++) {
        
        const demandKey = `${day.dateStr}_${unit.unitId}_${hour}`;
        const required = demandMap.get(demandKey) || 0;
        if (required <= 0) continue; // この時間帯にDemandなし

        // (※カバレッジ計算: この時間帯にアサイン済みの人数)
        let actual = 0;
        for (const a of newAssignments) {
          const p = patternMap.get(a.patternId);
          if (a.unitId === unit.unitId && p && p.workType === 'Work') {
            
            const startH = Number(p.startTime.split(':')[0]);
            const [endH_raw, endM_raw] = p.endTime.split(':').map(Number);
            const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw;
            
            if (p.crossesMidnight) {
              if (a.date === day.dateStr && startH <= hour) { // 1日目
                actual++;
              }
              const prevDate = new Date(day.dateStr.replace(/-/g, '/'));
              prevDate.setDate(prevDate.getDate() - 1);
              const prevDateStr = prevDate.toISOString().split('T')[0];
              if (a.date === prevDateStr && hour < endH) { // 2日目
                actual++;
              }
            } else {
              if (a.date === day.dateStr && startH <= hour && hour < endH) {
                actual++;
              }
            }
          }
        }

        // 4b. Demand を Actual が満たしていない場合のみアサイン試行
        if (actual < required) {
          
          // ★ v5.9 修正: スタッフの検索順序を動的に決定
          
          // (この時間帯(hour)をカバーできる可能性があるパターンは夜勤か？)
          // (簡易的に、15時以降に開始するパターン or 4時以前に終了するパターンを夜勤とみなす)
          const isNightShiftPatternRequired = shiftPatterns.some(p => 
            p.workType === 'Work' &&
            ((Number(p.startTime.split(':')[0]) >= 15) || (p.crossesMidnight && Number(p.endTime.split(':')[0]) <= 4))
          );
          
          let staffToSearch = [...baseStaffPriorityList];

          if (isNightShiftPatternRequired) {
            // ★ 夜勤が要求される時間帯の場合、常勤かつ夜勤回数が少ない順に並べ替える
            staffToSearch.sort((a, b) => {
              // 1. 雇用形態 (常勤優先)
              if (a.employmentType === 'FullTime' && b.employmentType !== 'FullTime') return -1;
              if (a.employmentType !== 'FullTime' && b.employmentType === 'FullTime') return 1;
              
              // 2. 夜勤回数 (少ない順)
              const countA = staffNightShiftCount.get(a.staffId) || 0;
              const countB = staffNightShiftCount.get(b.staffId) || 0;
              return countA - countB;
            });
          }
          // ★ v5.9 修正ここまで

          
          // 4c. 候補者（並べ替えたリスト）をループ
          for (const staff of staffToSearch) { // ★ staffPriorityList -> staffToSearch
            
            // 4d. この時間帯(hour)をカバーできる、勤務可能なパターンを探す
            const possiblePattern = shiftPatterns.find(p => {
              if (p.workType !== 'Work' || !staff.availablePatternIds.includes(p.patternId)) return false;
              if (staff.unitId !== unit.unitId && p.crossUnitWorkType !== '有') return false;
              
              const startH = Number(p.startTime.split(':')[0]);
              const [endH_raw, endM_raw] = p.endTime.split(':').map(Number);
              const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw;

              if (p.crossesMidnight) {
                // (例: 16:00-09:30 のパターン)
                // 1日目(16時台〜23時台)のチェック
                if (startH <= hour) return true;
                // 2日目(0時台〜9時台)のチェック (※このアルゴリズムでは2日目の需要は考慮されない - 制限事項)
                // (※ただし、この時間ループ(hour)が 0〜9時台の場合、1日目の 16:00 <= hour は false になる)
                
                // (※この時間ループ(hour)が 0時台〜9時台 の場合)
                // (※前日の夜勤(16:00-09:30)がこの時間(hour)をカバーするか？ -> これは 'actual' 計算側で対応済み)
                
                // (※この時間ループ(hour)が 16時台〜23時台 の場合)
                // (※このパターン(16:00-09:30)はこの時間(hour)をカバーするか？)
                return (startH <= hour);
                
              } else {
                // (例: 09:00-18:00 のパターン)
                return (startH <= hour && hour < endH);
              }
            });
            if (!possiblePattern) continue; // このスタッフはNG

            // 4e. レベル1 (連勤/インターバル/休日) 絞り込み
            const myAssignments = staffAssignments.get(staff.staffId) || [];
            if (myAssignments.some(a => a.date === day.dateStr)) continue; // (同日アサイン済み)
            
            const sortedAssignments = [...myAssignments].sort((a,b) => a.date.localeCompare(b.date));
            const lastAssignment = sortedAssignments[sortedAssignments.length - 1];
            
            if (lastAssignment) {
              const lastPattern = lastAssignment.patternId ? patternMap.get(lastAssignment.patternId) : null;
              if (lastPattern && (lastPattern.workType === 'Work' || lastPattern.workType === 'Meeting')) { // (労働と会議のみインターバル考慮)
                const lastEndTime = getEndTime(lastAssignment.date, lastPattern);
                const currentStartTime = getStartTime(day.dateStr, possiblePattern);
                const hoursBetween = (currentStartTime.getTime() - lastEndTime.getTime()) / (1000 * 60 * 60);
                if (hoursBetween < staff.constraints.minIntervalHours) continue; 
              }
            }
            
            let consecutiveDays = 0;
            for (let i = 1; i <= staff.constraints.maxConsecutiveDays; i++) {
              const checkDate = new Date(day.dateStr.replace(/-/g, '/')); 
              checkDate.setDate(checkDate.getDate() - i);
              const checkDateStr = checkDate.toISOString().split('T')[0];
              if (myAssignments.some(a => a.date === checkDateStr && patternMap.get(a.patternId)?.workType === 'Work')) {
                consecutiveDays++;
              } else {
                break; 
              }
            }
            if (consecutiveDays >= staff.constraints.maxConsecutiveDays) continue; 

            // 4g. アサイン決定
            const newAssignment: Omit<IAssignment, 'id'> = {
              date: day.dateStr,
              staffId: staff.staffId,
              patternId: possiblePattern.patternId,
              unitId: unit.unitId,
            };
            const tempId = await db.assignments.add(newAssignment); 
            newAssignments.push({ ...newAssignment, id: tempId });
            staffAssignments.get(staff.staffId)!.push({ ...newAssignment, id: tempId });
            
            // ★ v5.9 追加: もし夜勤ならカウントアップ
            if (possiblePattern.isNightShift) {
              staffNightShiftCount.set(staff.staffId, (staffNightShiftCount.get(staff.staffId) || 0) + 1);
            }
            
            break; // このスタッフで埋まったので次の時間帯へ
          } // (スタッフ優先度ループ)
        } // (if actual < required)
      } // (hourループ)
    } // (unitループ)
  } // (dayループ)
  
  // 5. 最終結果をReduxに保存
  dispatch(setAssignments(newAssignments));
  alert("「ざっくり埋める」が完了しました。\n(v5.9: 夜勤分担ロジック適用版)");
};