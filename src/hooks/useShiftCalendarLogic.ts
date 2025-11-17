import { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { 
  setAssignments,
  fetchAiAdjustment, 
  clearAdjustmentError, 
  fetchAiAnalysis, 
  clearAnalysis,
  fetchAiHolidayPatch
} from '../store/assignmentSlice';
import { db } from '../db/dexie';
// ★ 修正: MONTH_DAYS のインポートを削除
// import { MONTH_DAYS } from '../utils/dateUtils';
import { allocateWork } from '../lib/placement/workAllocator';
import { useDemandMap } from './useDemandMap'; // 穴埋めロジック用にDemandMapが必要
import { useStaffBurdenData } from './useStaffBurdenData'; // AI実行用に公休数が必要

// ★ 修正: 動的な monthDays の型を定義
type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

/**
 * AIサポートパネルや自動化ボタンに関連する
 * 実行ロジック（Thunk呼び出しなど）を管理するフック
 * ★ 修正: 引数を追加
 */
export const useShiftCalendarLogic = (
  currentYear: number,
  currentMonth: number,
  monthDays: MonthDay[]
) => {
  const dispatch: AppDispatch = useDispatch();
  
  // 1. AIへの指示テキスト (変更なし)
  const [aiInstruction, setAiInstruction] = useState("夜勤さんXの夜勤を月4回程度に減らせてください。");

  // 2. 実行に必要な各種データをストアから取得
  
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  // 3. 他のフックから必要なデータを取得
  // ★ 修正: 引数を渡す
  const { staffList: activeStaffList, staffHolidayRequirements } = useStaffBurdenData(currentYear, currentMonth, monthDays);
  const demandMap = useDemandMap(monthDays);

  // AIに渡す用のスタッフリスト (アクティブかつRental以外)
  const staffForAi = useMemo(() => 
    activeStaffList.filter(s => s.employmentType !== 'Rental'),
  [activeStaffList]);
  
  // 応援スタッフ穴埋めに渡す用のスタッフリスト (アクティブなRentalのみ)
  const staffForRentalFill = useMemo(() =>
    activeStaffList.filter(s => s.employmentType === 'Rental'),
  [activeStaffList]);
  
  const patternMap = useMemo(() => 
    new Map(shiftPatterns.map(p => [p.patternId, p])), 
  [shiftPatterns]);

  
  /**
   * [実行] 応援スタッフで穴埋め (ロジック)
   */
  const handleFillRental = useCallback(async () => {
    // ★ 修正: monthDays を渡す
    await allocateWork({
      assignments,
      staffList: staffForRentalFill, // アクティブなRentalスタッフ
      unitList,
      patternMap,
      shiftPatterns, 
      dispatch,
      demandMap,
      monthDays // ★ 追加
    });
  // ★ 修正: 依存配列に monthDays を追加
  }, [assignments, staffForRentalFill, unitList, patternMap, shiftPatterns, dispatch, demandMap, monthDays]);

  /**
   * [実行] AIで草案を作成 (カスタム指示)
   */
  const handleRunAiAdjustment = useCallback(() => {
    const instruction = aiInstruction; // 現在のテキスト入力
    if (!window.confirm("AIによる全体調整（カスタム指示）を実行しますか？\n（現在の勤務表下書きがAIによって上書きされます）")) {
      return;
    }
    
    dispatch(fetchAiAdjustment({
      instruction: instruction,
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      // ★ 修正: monthInfo を動的に
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays },
      staffHolidayRequirements: staffHolidayRequirements 
    }));
  // ★ 修正: 依存配列に月情報を追加
  }, [aiInstruction, dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  /**
   * [実行] AIで草案を作成 (デフォルト指示)
   */
  const handleRunAiDefault = useCallback(() => {
    if (!window.confirm("AIによる全体調整（デフォルト）を実行しますか？\n（現在の勤務表下書きがAIによって上書きされます）")) {
      return;
    }
    
    dispatch(fetchAiAdjustment({
      instruction: "特記事項なし。デマンド（必要人数）を満たし、スタッフの負担（特に連勤・インターバル・公休数）が公平になるよう全体を最適化してください。",
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      // ★ 修正: monthInfo を動的に
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays },
      staffHolidayRequirements: staffHolidayRequirements 
    }));
  // ★ 修正: 依存配列に月情報を追加
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);


  /**
   * [実行] AI現況分析
   */
  const handleRunAiAnalysis = useCallback(() => {
    dispatch(fetchAiAnalysis({
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      // ★ 修正: monthInfo を動的に
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays },
      staffHolidayRequirements: staffHolidayRequirements
    }));
  // ★ 修正: 依存配列に月情報を追加
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  /**
   * [実行] AI公休数強制補正 (差分パッチ)
   */
  const handleRunAiHolidayPatch = useCallback(() => {
    if (!window.confirm("AIによる「公休数」の強制補正（差分適用）を実行しますか？\n（現在の勤務表の公休数を、デマンドを考慮しつつ最小限の変更で調整します）")) {
      return;
    }
    
    dispatch(fetchAiHolidayPatch({
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      // ★ 修正: monthInfo を動的に
      monthInfo: { year: currentYear, month: currentMonth, days: monthDays },
      staffHolidayRequirements: staffHolidayRequirements
    }));
  // ★ 修正: 依存配列に月情報を追加
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements, currentYear, currentMonth, monthDays]);

  /**
   * [実行] アサインを全リセット
   */
  const handleResetClick = useCallback(async () => {
    // ★ 修正: 当月分のみをリセットするように変更
    if (window.confirm(`${currentYear}年${currentMonth}月の「公休」も含め、すべてのアサイン結果をリセットしますか？`)) {
      if (!monthDays || monthDays.length === 0) return;

      const firstDay = monthDays[0].dateStr;
      const lastDay = monthDays[monthDays.length - 1].dateStr;
      
      try {
        // ★ 当月分のアサインのIDを取得
        const assignmentsToRemove = await db.assignments
          .where('date')
          .between(firstDay, lastDay, true, true)
          .primaryKeys(); // IDのみ取得

        if (assignmentsToRemove.length > 0) {
          await db.assignments.bulkDelete(assignmentsToRemove);
        }
        
        // ★ UI (Redux) からも削除 (空配列をセット)
        dispatch(setAssignments([]));

      } catch (e) {
        console.error("Reset failed:", e);
      }
    }
  // ★ 修正: 依存配列に月情報を追加
  }, [dispatch, currentYear, currentMonth, monthDays]);

  /**
   * [UI] エラーをクリア (変更なし)
   */
  const handleClearError = useCallback(() => {
    dispatch(clearAdjustmentError());
  }, [dispatch]);

  /**
   * [UI] 分析結果をクリア (変更なし)
   */
  const handleClearAnalysis = useCallback(() => {
    dispatch(clearAnalysis());
  }, [dispatch]);


  return {
    aiInstruction,
    setAiInstruction,
    handleFillRental,
    handleRunAiAdjustment, // カスタム指示
    handleRunAiDefault,    // デフォルト指示 (AiSupportPane用)
    handleRunAiAnalysis,
    handleRunAiHolidayPatch,
    handleResetClick,
    handleClearError,
    handleClearAnalysis
  };
};