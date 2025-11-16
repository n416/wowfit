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
import { MONTH_DAYS } from '../utils/dateUtils';
import { allocateWork } from '../lib/placement/workAllocator';
import { useDemandMap } from './useDemandMap'; // 穴埋めロジック用にDemandMapが必要
import { useStaffBurdenData } from './useStaffBurdenData'; // AI実行用に公休数が必要

/**
 * AIサポートパネルや自動化ボタンに関連する
 * 実行ロジック（Thunk呼び出しなど）を管理するフック
 */
export const useShiftCalendarLogic = () => {
  const dispatch: AppDispatch = useDispatch();
  
  // 1. AIへの指示テキスト
  const [aiInstruction, setAiInstruction] = useState("夜勤さんXの夜勤を月4回程度に減らせてください。");

  // 2. 実行に必要な各種データをストアから取得
  
  // ★★★ 修正: state.assignment.present から assignments を取得 ★★★
  // (useShiftCalendarLogic.ts:38)
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  
  // (allStaffFromStore は useStaffBurdenData が取得するため不要)
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  // 3. 他のフックから必要なデータを取得
  const { staffList: activeStaffList, staffHolidayRequirements } = useStaffBurdenData();
  const demandMap = useDemandMap();

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
    await allocateWork({
      assignments,
      staffList: staffForRentalFill, // アクティブなRentalスタッフ
      unitList,
      patternMap,
      shiftPatterns, 
      dispatch,
      demandMap 
    });
  }, [assignments, staffForRentalFill, unitList, patternMap, shiftPatterns, dispatch, demandMap]);

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
      monthInfo: { year: 2025, month: 11, days: MONTH_DAYS },
      staffHolidayRequirements: staffHolidayRequirements 
    }));
  }, [aiInstruction, dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements]);

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
      monthInfo: { year: 2025, month: 11, days: MONTH_DAYS },
      staffHolidayRequirements: staffHolidayRequirements 
    }));
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements]);


  /**
   * [実行] AI現況分析
   */
  const handleRunAiAnalysis = useCallback(() => {
    dispatch(fetchAiAnalysis({
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      monthInfo: { year: 2025, month: 11, days: MONTH_DAYS },
      staffHolidayRequirements: staffHolidayRequirements
    }));
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements]);

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
      monthInfo: { year: 2025, month: 11, days: MONTH_DAYS },
      staffHolidayRequirements: staffHolidayRequirements
    }));
  }, [dispatch, staffForAi, shiftPatterns, unitList, assignments, staffHolidayRequirements]);

  /**
   * [実行] アサインを全リセット
   */
  const handleResetClick = useCallback(async () => {
    if (window.confirm("「公休」も含め、すべてのアサイン結果をリセットしますか？")) {
      try {
        await db.assignments.clear();
        dispatch(setAssignments([]));
      } catch (e) {
        console.error("Reset failed:", e);
      }
    }
  }, [dispatch]);

  /**
   * [UI] エラーをクリア
   */
  const handleClearError = useCallback(() => {
    dispatch(clearAdjustmentError());
  }, [dispatch]);

  /**
   * [UI] 分析結果をクリア
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