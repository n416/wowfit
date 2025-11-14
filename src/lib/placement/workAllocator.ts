import { 
  IAssignment, IStaff, IUnit, IShiftPattern, db 
} from '../../db/dexie';
import { MONTH_DAYS } from '../../utils/dateUtils';
import type { AppDispatch } from '../../store';
import { setAssignments } from '../../store/assignmentSlice';

// ★ v5.44 修正: 未使用の getPatternDates を削除
/*
const getPatternDates = (dateStr: string, pattern: IShiftPattern) => {
  const start = new Date(`${dateStr.replace(/-/g, '/')} ${pattern.startTime}`);
  const end = new Date(`${dateStr.replace(/-/g, '/')} ${pattern.endTime}`);
  if (pattern.crossesMidnight) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
};
*/

// ★ v5.19 ヘルパー: あるパターンが、指定された時間帯(targetHour)に勤務しているか判定
const isWorkingAt = (pattern: IShiftPattern, targetHour: number): boolean => {
  const startH = parseInt(pattern.startTime.split(':')[0]);
  const [endH_raw, endM_raw] = pattern.endTime.split(':').map(Number);
  const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw; // 分がある場合は切り上げ

  if (!pattern.crossesMidnight) {
    // 日勤 (例: 9:00 - 17:00)
    return targetHour >= startH && targetHour < endH;
  } else {
    // 夜勤 (例: 17:00 - 07:00)
    // ※この関数は「特定の1時間(targetHour)」だけを見るため、
    // 17時以降 OR 7時より前 のどちらかなら True とする
    return targetHour >= startH || targetHour < endH;
  }
};

interface WorkAllocatorArgs {
  assignments: IAssignment[];
  staffList: IStaff[];
  unitList: IUnit[];
  patternMap: Map<string, IShiftPattern>;
  shiftPatterns: IShiftPattern[];
  dispatch: AppDispatch;
}

// ★★★ v5.21 修正: 「ざっくり埋める(フェーズ1)」を削除し、「応援スタッフ穴埋め(フェーズ2)」専用に変更 ★★★
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

  // -------------------------------------------------------
  // 1. 下準備
  // -------------------------------------------------------
  
  // ★★★ v5.21 修正: 既存のアサインをすべて保持する ★★★
  // (公休配置や手動配置の結果を引き継ぐ)
  let currentAssignments: (Omit<IAssignment, 'id'> & { id?: number })[] = [...assignments];

  // スタッフをグループ分け (レンタルスタッフのみ使用)
  // const regularStaff = staffList.filter(s => s.employmentType !== 'Rental'); // (v5.21 削除)
  const rentalStaff = staffList.filter(s => s.employmentType === 'Rental');

  // (v5.21 削除: フェーズ1の夜勤カウント)
  // const staffNightShiftCount = new Map<string, number>();
  // regularStaff.forEach(s => staffNightShiftCount.set(s.staffId, 0));

  // -------------------------------------------------------
  // 2. (v5.21 削除) フェーズ1: 常勤・パートスタッフの割り当て
  // -------------------------------------------------------
  
  /* (v5.21 フェーズ1のロジックをすべて削除)
  for (const day of MONTH_DAYS) {
    for (const unit of unitList) {
      for (let hour = 0; hour < 24; hour++) {
        ... (中略) ...
      }
    }
  }
  */

  // -------------------------------------------------------
  // 3. フェーズ2: レンタルスタッフによる穴埋め
  // -------------------------------------------------------
  // ★ ここで「2時間以上の空き」かつ「最短勤務」の判定を行う

  for (const day of MONTH_DAYS) {
    for (const unit of unitList) {
      
      // [Step A] この日・このユニットの「不足時間帯」をマップ化
      const shortages = new Array(24).fill(0);
      
      for (let h = 0; h < 24; h++) {
        const req = (unit.demand && unit.demand[h]) || 0;
        let act = 0;
        currentAssignments.forEach(a => {
          // (※前日からの日またぎの考慮も必要だが、ここでは「当日開始」のアサインのみで計算する)
          // (※「ざっくり埋める」の限界として、1日単位で処理する)
          if (a.date === day.dateStr && a.unitId === unit.unitId) {
            const p = patternMap.get(a.patternId);
            if (p && p.workType === 'Work' && isWorkingAt(p, h)) act++;
          }
        });
        if (act < req) shortages[h] = req - act; // 不足数
      }

      // [Step B] 不足が連続する区間（ギャップ）を検出
      const gaps: { start: number, end: number, amount: number }[] = [];
      let currentGap: { start: number, end: number, amount: number } | null = null;
      
      for (let h = 0; h < 24; h++) {
        const shortageAmount = shortages[h];
        if (shortageAmount > 0) {
          if (!currentGap) {
            currentGap = { start: h, end: h + 1, amount: shortageAmount };
          } else {
            currentGap.end = h + 1;
            // (不足人数がギャップ内で変わる場合も考慮 - 最小値/最大値など)
            // 簡易的に「最大の不足人数」を記録
            currentGap.amount = Math.max(currentGap.amount, shortageAmount); 
          }
        } else {
          if (currentGap) {
            gaps.push(currentGap);
            currentGap = null;
          }
        }
      }
      if (currentGap) gaps.push(currentGap); // 23時までのギャップを追加

      // [Step C] 各ギャップに対してレンタルスタッフを割り当て
      for (const gap of gaps) {
        const gapDuration = gap.end - gap.start;

        // ★ルール1: 2時間未満の不足は無視（残業対応）
        if (gapDuration < 2) continue;

        // (このギャップを埋める試行回数 = 不足人数分)
        for(let i=0; i < gap.amount; i++) {
          
          // ★ルール3: 最短時間優先
          // レンタルスタッフが持つ全パターンのうち、
          // 1. このギャップをカバーでき (start <= gap.start, end >= gap.end)
          // 2. 最も実働時間(durationHours)が短い
          // ものを選ぶ
          
          let bestOption: { staff: IStaff, pattern: IShiftPattern } | null = null;

          for (const staff of rentalStaff) {
            // このスタッフがこの日まだ働いていないか (レンタルは連勤OKだが、同日重複アサインは不可)
            if (currentAssignments.some(a => a.date === day.dateStr && a.staffId === staff.staffId)) continue;
            
            const suitablePatterns = shiftPatterns.filter(p => {
              if (p.workType !== 'Work') return false;
              if (!staff.availablePatternIds.includes(p.patternId)) return false;

              const startH = parseInt(p.startTime.split(':')[0]);
              const [endH_raw, endM] = p.endTime.split(':').map(Number);
              let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
              // ※日またぎの0.5人デマンドなどはレンタルスタッフでは考慮しない (ロジック簡易化)
              if (p.crossesMidnight) return false; 
              
              return startH <= gap.start && endH >= gap.end;
            });

            if (suitablePatterns.length > 0) {
              suitablePatterns.sort((a, b) => a.durationHours - b.durationHours);
              const bestPattern = suitablePatterns[0];

              // 現在の最適解 (bestOption) よりも短いか？
              if (!bestOption || bestPattern.durationHours < bestOption.pattern.durationHours) {
                bestOption = { staff: staff, pattern: bestPattern };
              }
            }
          }

          // 最適なレンタルスタッフ＆パターンが見つかったか？
          if (bestOption) {
            // アサイン実行
            currentAssignments.push({
              date: day.dateStr,
              staffId: bestOption.staff.staffId,
              patternId: bestOption.pattern.patternId,
              unitId: unit.unitId
            });
            
            // このギャップは1人埋まったので、次のギャップへ（簡易化のため）
            // ※本当は不足人数(amount)が減るだけだが、ループが複雑になる
            // ※ここでは「1ギャップに1レンタルスタッフ」とし、残りはAIに任せる
            break; 
          }
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
    // ★★★ v5.21 修正: アラートメッセージの変更 ★★★
    alert("「応援スタッフで埋める」が完了しました。");
    
  } catch (e) {
    console.error("保存エラー:", e);
    alert("保存に失敗しました");
  }
};