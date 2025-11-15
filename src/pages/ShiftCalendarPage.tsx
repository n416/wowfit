import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Box, Paper, Tabs, Tab, 
  Button, // ★ Button をインポート
  ToggleButton, ToggleButtonGroup,
  IconButton // ★★★ IconButton をインポート ★★★
} from '@mui/material';
// import WarningAmberIcon from '@mui/icons-material/WarningAmber'; // 未使用
import { useSelector, useDispatch } from 'react-redux';
// ★★★ v5スキーマの型とDBをインポート ★★★
import { 
  db, 
  IStaff, IShiftPattern, IAssignment, // ★★★ IUnit を削除 (TS6133) ★★★
} from '../db/dexie'; 
// ★★★ v5スライスのActionをインポート ★★★
import { setStaffList, /* parseAndSaveConstraints */ } from '../store/staffSlice'; // parseAndSaveConstraints は未使用
import { setPatterns } from '../store/patternSlice';
// ★★★ v5: setTimeSlotRulesは廃止 ★★★
import { setUnits } from '../store/unitSlice';
// ★★★ v5.9 修正: AI関連の import を追加 ★★★
import { 
  setAssignments, clearAdvice, // ★★★ v5.44 修正: fetchAssignmentAdvice を削除
  fetchAiAdjustment, clearAdjustmentError, 
  fetchAiAnalysis, clearAnalysis,
  // ★★★ v5.76 修正: fetchAiHolidayPatch をインポート ★★★
  fetchAiHolidayPatch,
  undoAssignments, redoAssignments,
  _syncOptimisticAssignment // ★★★ _syncOptimisticAssignment をインポート ★★★
} from '../store/assignmentSlice'; 
import type { AppDispatch, RootState } from '../store';

// import Dexie from 'dexie'; // 未使用

// ★★★↓ コンポーネントのインポートを修正 ↓★★★
import StaffCalendarView from '../components/calendar/StaffCalendarView';
import WorkSlotCalendarView from '../components/calendar/WorkSlotCalendarView';
// ★★★ v5.9 修正: インポートを追加 ★★★
// import StaffStatusModal from '../components/calendar/StaffStatusModal'; // ★ v5.19 削除
import AssignPatternModal from '../components/calendar/AssignPatternModal'; 
import AiSupportPane from '../components/calendar/AiSupportPane'; 
import BurdenSidebar from '../components/calendar/BurdenSidebar'; 
import DailyUnitGanttModal from '../components/calendar/DailyUnitGanttModal';
// ★★★ v5.85 修正: 新しいモーダルをインポート ★★★
import ClearStaffAssignmentsModal from '../components/calendar/ClearStaffAssignmentsModal'; 
// ★★★ v5.35 修正: getPrevDateStr をインポート ★★★
import { MONTH_DAYS /* getPrevDateStr */ } from '../utils/dateUtils'; // ★ getPrevDateStr を削除 (TS6133)
// ★★★↓ v5.9 モックデータをインポート ↓★★★
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';
// ★★★ v5.72 修正: allocateHolidays のインポートを（再度）削除 ★★★
// import { allocateHolidays } from '../lib/placement/holidayAllocator';
// ★★★ v5.21 修正: allocateWork (応援スタッフ穴埋め) をインポート ★★★
import { allocateWork } from '../lib/placement/workAllocator';

// ★★★ リファクタリング: 計算ロジックをインポート ★★★
// ★★★ 「ごった煮」ファイルのインポートを削除 ★★★
// import { 
//   calculateStaffBurdenData, 
//   calculateDemandMap, 
//   calculateUnitGroups,
//   UnitGroupData 
// } from '../lib/dataCalculators';
// ★★★ カスタムフックをインポート ★★★
import { useStaffBurdenData } from '../hooks/useStaffBurdenData';
import { useDemandMap } from '../hooks/useDemandMap';
import { useUnitGroups } from '../hooks/useUnitGroups'; // ★ UnitGroupData をフックからインポート

// ★★★ アイコンをインポート ★★★
import EditIcon from '@mui/icons-material/Edit';
import HolidayIcon from '@mui/icons-material/BeachAccess';
import PaidLeaveIcon from '@mui/icons-material/FlightTakeoff';
import UndoIcon from '@mui/icons-material/Undo'; // ★★★ UNDO アイコン ★★★
import RedoIcon from '@mui/icons-material/Redo'; // ★★★ REDO アイコン ★★★


// (折りたたみ用アイコンのインポートは削除済み)


// ★★★ v5.70 修正: TabPanelが親の高さ(flex: 1)を継承できるように修正 ★★★
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div 
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
      // ★★★ v5.70 修正: flex: 1 を追加して高さを拡張 ★★★
      style={{ flex: 1, minHeight: 0 }}
    >
      {/* valueがindexと一致する場合のみ、中身を描画（マウント）する */}
      {value === index && (
        // ★★★ v5.70 修正: p: 3 を height: 100% と flex-column に変更 ★★★
        <Box sx={{ 
          // p: 3, // ★★★ TabPanel 自身は padding を持たないように変更 ★★★
          height: '100%', 
          boxSizing: 'border-box', 
          display: 'flex', 
          flexDirection: 'column' 
        }}>
          {children}
        </Box>
      )}
    </div>
  );
}
// ★★★ v5.70 修正ここまで ★★★


// (モックデータ、ローカル定義の Modal/Function はすべて削除済み)

// ★★★ UnitGroupData の型定義を削除 (TS6196) ★★★

// ★★★ クリックモードの型定義 ★★★
type ClickMode = 'normal' | 'holiday' | 'paid_leave';


// ★★★ メインコンポーネント (v5) ★★★
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  // ★ v5.7 追加: サイドバー開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // ★★★ クリックモードの State ★★★
  const [clickMode, setClickMode] = useState<ClickMode>('normal');

  // v5 ストアから全データを取得
  // ★★★ 全スタッフリストを取得 (休職者も含む) ★★★
  const { staff: allStaffFromStore } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  // ★★★ assignments と 履歴スタック(past/future) の両方を取得 ★★★
  const { 
    assignments, 
    past, 
    future,
    adjustmentLoading, adjustmentError,
    analysisLoading, analysisResult, analysisError,
    patchLoading, patchError
  } = useSelector((state: RootState) => state.assignment);
  
  // ★★★ 勤務表で扱う「アクティブな」スタッフリストを作成 ★★★
  // (注: useStaffBurdenData フックもこれと同じ計算をしているが、
  //  AIへの引き渡し用に Page 側にも持っておく)
  const staffList = useMemo(() => 
    allStaffFromStore.filter(s => s.status !== 'OnLeave'), 
    [allStaffFromStore]
  );


  // v5版: 手動調整ダイアログ用の State
  const [editingTarget, setEditingTarget] = useState<{ date: string; staff: IStaff; } | null>(null);
  
  // ★ v5.18.2 追加: ガントチャートモーダル用 State
  const [showingGanttTarget, setShowingGanttTarget] = useState<{ date: string; unitId: string; } | null>(null);
  
  // ★★★ v5.85 修正: スタッフアサインクリア用モーダルの State ★★★
  const [clearingStaff, setClearingStaff] = useState<IStaff | null>(null);

  // ★★★ staffHolidayRequirements の管理をカスタムフックに移動 ★★★
  const {
    staffList: activeStaffList, // (staffList と同じものだが、フックから取得)
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  } = useStaffBurdenData();

  // ★ v5.8 追加: AIサポートペイン用の State
  const [aiInstruction, setAiInstruction] = useState("夜勤さんXの夜勤を月4回程度に減らせてください。"); 

  
  // ★★★ staffMap は休職者も含めた全スタッフで作る (アサイン履歴などで名前を引けるように) ★★★
  const staffMap = React.useMemo(() => new Map(allStaffFromStore.map((s: IStaff) => [s.staffId, s])), [allStaffFromStore]);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // ★★★ 公休・有給のパターンIDをあらかじめ取得 ★★★
  const holidayPatternId = useMemo(() => 
    shiftPatterns.find(p => p.workType === 'StatutoryHoliday')?.patternId || '公休',
  [shiftPatterns]);
  const paidLeavePatternId = useMemo(() =>
    shiftPatterns.find(p => p.workType === 'PaidLeave')?.patternId || '有給',
  [shiftPatterns]);


  // ★★★ staffBurdenData の useMemo を削除 (useStaffBurdenDataフックから取得) ★★★


  // ★★★ staffHolidayRequirements の State と useEffect を削除 (useStaffBurdenDataフックに移動) ★★★


  // ★★★ demandMap の計算をカスタムフックに委譲 ★★★
  const demandMap = useDemandMap();


  // ★★★ unitGroups の計算をカスタムフックに委譲 ★★★
  const unitGroups = useUnitGroups(showingGanttTarget);


  // ★★★ v5.3版: DB初期化ロジック (DataManagementPageと同一ロジック) ★★★
  useEffect(() => {
    const loadData = async () => {
      try {
        const [units, patterns, staff, assignmentsDB] = await Promise.all([
          db.units.toArray(),
          db.shiftPatterns.toArray(),
          db.staffList.toArray(),
          db.assignments.toArray() 
        ]);
        
        if (patterns.length === 0) {
          await db.shiftPatterns.bulkPut(MOCK_PATTERNS_V5); 
          dispatch(setPatterns(MOCK_PATTERNS_V5));
        } else {
          dispatch(setPatterns(patterns));
        }
        
        if (units.length === 0) {
          await db.units.bulkPut(MOCK_UNITS_V5); 
          dispatch(setUnits(MOCK_UNITS_V5));
        } else {
          dispatch(setUnits(units));
        }
        
        if (staff.length === 0) {
           await db.staffList.bulkPut(MOCK_STAFF_V4); 
           dispatch(setStaffList(MOCK_STAFF_V4));
        } else {
           dispatch(setStaffList(staff));
        }
        
        // ★★★ DB読み込み時は履歴をクリア（UNDO/REDOの対象外） ★★★
        dispatch(setAssignments(assignmentsDB));
        // (注: setAssignmentsが履歴を積むので、ここで過去の履歴が1件積まれるが、初回ロード時は許容する)

      } catch (e) {
        console.error("DB init failed:", e);
      }
    };
    loadData();
  }, [dispatch]);
  
  // ★★★ UNDO/REDO キーボードショートカット ★★★
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // (テキスト入力中は何もしない)
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      
      if (ctrlKey && event.key === 'z') {
        event.preventDefault();
        dispatch(undoAssignments());
      } else if (ctrlKey && event.key === 'y') {
        event.preventDefault();
        dispatch(redoAssignments());
      } else if (isMac && ctrlKey && event.shiftKey && event.key === 'z') {
        // Mac の REDO (Cmd+Shift+Z)
        event.preventDefault();
        dispatch(redoAssignments());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch]); // ★ dispatch のみ依存


  // ★★★ v5.45 修正: TS2769を修正 (event引数を `_` に変更) ★★★
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    // ★ タブを切り替えたら「通常モード」に戻す
    setClickMode('normal');
  };

  // ★★★ v5.72 修正: handleHolidayPlacementClick を（再度）削除 ★★★
  /*
  const handleHolidayPlacementClick = useCallback(async () => {
    // ...
  }, [assignments, staffList, unitList, patternMap, staffHolidayRequirements, dispatch, staffMap]);
  */


  // ★★★ v5.79 修正: handleFillRental が demandMap を渡すように修正 ★★★
  const handleFillRental = useCallback(async () => {
    console.log("★ (2/2) [ShiftCalendarPage] '応援スタッフ穴埋め' ボタンクリック (handleFillRental 実行)");
    
    // ★★★ staffList (アクティブ) から Rental のみ抽出 ★★★
    const activeRentalStaff = staffList.filter(s => s.employmentType === 'Rental');

    // ★★★ v5.79 修正: allocateWork に demandMap を渡す ★★★
    await allocateWork({
      assignments,
      staffList: activeRentalStaff, // ★ アクティブなRentalスタッフを渡す
      unitList,
      patternMap,
      shiftPatterns, 
      dispatch,
      demandMap // ★★★ v5.101 の変更を元に戻す ★★★
    });
  }, [assignments, staffList, unitList, patternMap, shiftPatterns, dispatch, demandMap]); // ★ 依存配列に demandMap を戻す


  // v4版: アサインリセット
  const handleResetClick = async () => {
    if (window.confirm("「公休」も含め、すべてのアサイン結果をリセットしますか？")) {
      try {
        await db.assignments.clear();
        dispatch(setAssignments([]));
      } catch (e) {
        console.error("Reset failed:", e);
      }
    }
  };


  // 5. ステップ3 (手動調整) のハンドラ
  // ★★★ モードに応じて動作を振り分けるハンドラ ★★★
  const handleCellClick = (date: string, staffIdOrUnitId: string | null) => {
    // 勤務枠ビュー (tabValue === 1) の場合は、モードに関わらずモーダルを開く
    if (tabValue === 1) {
      if (staffIdOrUnitId) {
        setShowingGanttTarget({ date, unitId: staffIdOrUnitId });
      }
      return;
    }

    // --- スタッフビュー (tabValue === 0) の場合のロジック ---
    const staff = staffMap.get(staffIdOrUnitId || '');
    if (!staff) return;

    // ★ モードに応じて動作を振り分け
    switch (clickMode) {
      case 'normal':
        setEditingTarget({ date, staff });
        dispatch(clearAdvice());
        break;
      
      case 'holiday':
        // ★「公休」をトグルする即時実行ロジック
        toggleHoliday(date, staff, holidayPatternId);
        break;
        
      case 'paid_leave':
        // ★「有給」をトグルする即時実行ロジック
        toggleHoliday(date, staff, paidLeavePatternId);
        break;
    }
  };
  
  // ★★★ 楽観的UI更新（Optimistic UI Update）ロジック ★★★
  // ★★★ TS2345, TS7006 エラーを修正 ★★★
  const toggleHoliday = useCallback(async (date: string, staff: IStaff, targetPatternId: string) => {
    
    // 1. メモリ上の Redux State (assignments) から既存のアサインを検索
    // (useSelector の assignments を直接参照)
    const existing = assignments.filter((a: IAssignment) => a.date === date && a.staffId === staff.staffId);
    const existingIsTarget = existing.length === 1 && existing[0].patternId === targetPatternId;

    let newOptimisticAssignments: IAssignment[];
    let dbOperation: () => Promise<any>;
    const tempId = Date.now(); // 仮ID

    if (existingIsTarget) {
      // --- トグルオフ (削除) ---
      
      // 2. 楽観的UI用の配列を作成（メモリ上でフィルタリング）
      newOptimisticAssignments = assignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      
      // 3. バックグラウンドで行うDB操作を定義
      dbOperation = async () => {
        if (existing[0]?.id) {
          await db.assignments.delete(existing[0].id);
        }
      };

    } else {
      // --- トグルオン (追加または変更) ---
      
      const newAssignmentBase: Omit<IAssignment, 'id'> = {
        date: date,
        staffId: staff.staffId,
        patternId: targetPatternId,
        unitId: null,
        locked: true 
      };

      // 2. 楽観的UI用の配列を作成（メモリ上でフィルタリング + 追加）
      const otherAssignments = assignments.filter((a: IAssignment) => !(a.date === date && a.staffId === staff.staffId));
      newOptimisticAssignments = [...otherAssignments, { ...newAssignmentBase, id: tempId }];

      // 3. バックグラウンドで行うDB操作を定義
      dbOperation = async () => {
        // (もし既存のアサインがあれば先に削除)
        if (existing.length > 0) {
          await db.assignments.bulkDelete(existing.map((a: IAssignment) => a.id!));
        }
        // DBに追加し、新しいIDを取得
        const newId = await db.assignments.add(newAssignmentBase);
        
        // ★ DB操作完了後、ストアの仮IDを本物のIDに差し替える
        // (※注: このdispatchは「バックグラウンド」で実行される)
        // (★★ _syncOptimisticAssignment アクションを呼ぶ ★★)
        dispatch(_syncOptimisticAssignment({
          tempId: tempId,
          newAssignment: { ...newAssignmentBase, id: newId }
        }));
      };
    }

    // 4. ★★★ UIを即時更新 (UNDO履歴に積む) ★★★
    dispatch(setAssignments(newOptimisticAssignments));

    // 5. バックグラウンドでDB操作を実行
    try {
      await dbOperation(); 
      
    } catch (e) {
      console.error("アサインの即時更新（DB反映）に失敗:", e);
      // (エラーハンドリング: 失敗したらReduxの状態をDBと同期し直す)
      db.assignments.toArray().then(dbAssignments => dispatch(setAssignments(dbAssignments)));
      alert("エラー: アサインの保存に失敗しました。ページをリロードしてください。");
    }
  }, [assignments, dispatch, holidayPatternId, paidLeavePatternId]); // ★ 依存配列に assignments を戻す


  // ★★★ v5.85 修正: スタッフ名クリックのハンドラを追加 ★★★
  const handleStaffNameClick = (staff: IStaff) => {
    setClearingStaff(staff);
  };

  const handleCloseDialog = () => {
    setEditingTarget(null);
  };

  // ★★★ v5.85 修正: スタッフのアサインを全クリアするロジック ★★★
  const handleClearStaffAssignments = useCallback(async (staffId: string) => {
    const staff = clearingStaff; // (確認メッセージ用)
    if (!staff) return;

    const assignmentsToRemove = assignments.filter((a: IAssignment) => a.staffId === staffId);
    
    if (window.confirm(`${staff.name}さんのアサイン（${assignmentsToRemove.length}件）をすべてクリアしますか？`)) {
      try {
        await db.assignments.bulkDelete(assignmentsToRemove.map((a: IAssignment) => a.id!));
        const remainingAssignments = await db.assignments.toArray();
        dispatch(setAssignments(remainingAssignments));
        setClearingStaff(null); // モーダルを閉じる
      } catch (e) {
        console.error("アサインのクリアに失敗:", e);
        alert("アサインのクリアに失敗しました。");
      }
    }
  }, [assignments, dispatch, clearingStaff]); // 依存配列


  // ★★★ v5.9 修正: 公休調整ハンドラ (+/-) を削除 (useStaffBurdenData フックに移動) ★★★
  

  // ★★★ v5.73 修正: AI調整の実行ハンドラを引数(instruction)で分離 ★★★
  const handleRunAiAdjustment = (instruction: string) => {
    console.log(`★ AI調整実行: ${instruction}`);
    
    // (確認ダイアログを変更)
    const confirmMessage = instruction.includes("公休数") 
      ? "AIによる「公休数」の強制補正を実行しますか？\n（現在の勤務表下書きがAIによって上書きされます）"
      : "AIによる全体調整を実行しますか？\n（現在の勤務表下書きがAIによって上書きされます）";

    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    // ★★★ v5.22 修正: RentalスタッフをAIに渡すリストから除外 ★★★
    // ★★★ staffList (アクティブ) から Rental を除外 ★★★
    const staffForAi = activeStaffList.filter(s => s.employmentType !== 'Rental'); // ★ staffList -> activeStaffList
    
    dispatch(fetchAiAdjustment({
      instruction: instruction, // ★ 引数をそのまま渡す
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      monthInfo: {
        year: 2025, 
        month: 11, 
        days: MONTH_DAYS
      },
      staffHolidayRequirements: staffHolidayRequirements 
    }));
  };
  
  // ★★★ v5.9 追加: AI現況分析の実行ハンドラ ★★★
  const handleRunAiAnalysis = () => {
    console.log("★ AI現況分析: ボタンクリック (handleRunAiAnalysis 実行)");
    
    // ★★★ v5.22 修正: RentalスタッフをAIに渡すリストから除外 ★★★
    // ★★★ staffList (アクティブ) から Rental を除外 ★★★
    const staffForAi = activeStaffList.filter(s => s.employmentType !== 'Rental'); // ★ staffList -> activeStaffList

    dispatch(fetchAiAnalysis({
      allStaff: staffForAi, // ★ 修正
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      monthInfo: {
        year: 2025, 
        month: 11, 
        days: MONTH_DAYS
      },
      staffHolidayRequirements: staffHolidayRequirements
    }));
  };

  // ★★★ v5.76 修正: 「公休数強制補正」ボタンのハンドラを新設 ★★★
  const handleRunAiHolidayPatch = () => {
    console.log("★ AI公休補正: ボタンクリック (handleRunAiHolidayPatch 実行)");
    
    if (!window.confirm("AIによる「公休数」の強制補正（差分適用）を実行しますか？\n（現在の勤務表の公休数を、デマンドを考慮しつつ最小限の変更で調整します）")) {
      return;
    }
    
    // ★★★ staffList (アクティブ) から Rental を除外 ★★★
    const staffForAi = activeStaffList.filter(s => s.employmentType !== 'Rental'); // ★ staffList -> activeStaffList
    
    dispatch(fetchAiHolidayPatch({
      allStaff: staffForAi,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, 
      monthInfo: {
        year: 2025, 
        month: 11, 
        days: MONTH_DAYS
      },
      staffHolidayRequirements: staffHolidayRequirements 
    }));
  };
  

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      p: '24px', 
      gap: 2 
    }}>
      
      {/* ★ 上部エリア (カレンダー + サイドバー) */}
      <Box sx={{
        display: 'flex',
        flexGrow: 1, 
        gap: 2,
        minHeight: 0 
      }}>
        {/* メインエリア (スクロール可能) */}
        {/* ★★★ v5.70 修正: overflow: 'auto' を削除し、minHeight: 0 を追加 ★★★ */}
        <Paper sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          // overflow: 'auto', // 削除
          minWidth: 0, 
          minHeight: 0, // 追加
        }}>
          {/* ★★★ タブヘッダーとリセットボタンを横並びにする ★★★ */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderBottom: 1, 
            borderColor: 'divider',
            pl: 2 // Tabs のデフォルトpaddingに合わせる
          }}>
            <Box sx={{ flexGrow: 1 }}>
              {/* ★★★ v5.45 修正: TS2769を修正 ★★★ */}
              <Tabs value={tabValue} onChange={handleTabChange}>
                <Tab label="スタッフビュー" />
                <Tab label="勤務枠ビュー" />
              </Tabs>
            </Box>
            
            {/* ★★★ UNDO/REDOボタンとリセットボタン ★★★ */}
            <Box sx={{ flexShrink: 0, pr: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton 
                title="元に戻す (Ctrl+Z)"
                onClick={() => dispatch(undoAssignments())} 
                disabled={past.length === 0} // ★ UNDO履歴がなければ無効
              >
                <UndoIcon />
              </IconButton>
              <IconButton 
                title="やり直す (Ctrl+Y)"
                onClick={() => dispatch(redoAssignments())} 
                disabled={future.length === 0} // ★ REDO履歴がなければ無効
              >
                <RedoIcon />
              </IconButton>
              
              <Button 
                variant="outlined" 
                color="error" 
                onClick={handleResetClick}
                size="small" // ★ サイズを小さくしてタブと高さを合わせる
                sx={{ ml: 1 }} // ★ 左側にマージン
              >
                アサインをリセット
              </Button>
            </Box>
          </Box>
          {/* ★★★ 修正ここまで ★★★ */}
          
          {/* ★★★ v5.70 修正: TabPanelがflex: 1で高さを継承するように ★★★ */}
          <TabPanel value={tabValue} index={0}>
            {/* ★★★ スタッフビューの TabPanel 内部 ★★★ */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: '0 24px 16px 24px' }}>
              <h6 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 500 }}>
                スタッフビュー（カレンダー）
              </h6>
              
              {/* ★★★ クリックモード切替タブ ★★★ */}
              <ToggleButtonGroup
                value={clickMode}
                exclusive
                onChange={(_, newMode) => { if(newMode) setClickMode(newMode); }}
                size="small"
              >
                <ToggleButton value="normal" title="通常モード（詳細編集）">
                  <EditIcon />
                </ToggleButton>
                <ToggleButton value="holiday" title="公休ポチポチモード">
                  <HolidayIcon />
                </ToggleButton>
                <ToggleButton value="paid_leave" title="有給ポチポチモード">
                  <PaidLeaveIcon />
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            
            <StaffCalendarView 
              staffList={activeStaffList} // ★★★ staffList -> activeStaffList に変更 ★★★
              onCellClick={handleCellClick} // ★★★ モード振り分け機能付きハンドラを渡す ★★★
              staffHolidayRequirements={staffHolidayRequirements}
              onHolidayIncrement={handleHolidayIncrement}
              onHolidayDecrement={handleHolidayDecrement}
              onStaffNameClick={handleStaffNameClick} 
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            {/* ★★★ 勤務枠ビューは padding (p: 3) が必要 ★★★ */}
            <Box sx={{ p: 3, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
              <WorkSlotCalendarView 
                onCellClick={handleCellClick}
                // ★★★ onResetClick を削除 ★★★
                // onResetClick={handleResetClick} 
                demandMap={demandMap} // ★★★ v5.101 の変更を元に戻す ★★★
              />
            </Box>
          </TabPanel>
        </Paper>

        {/* サイドバーの呼び出し */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData} // ★★★ v5.101 の変更を元に戻す ★★★
        />

      </Box> {/* ★ 上部エリアここまで */}


      {/* ★★★ v5.21 修正: AiSupportPane の onFillRental に handleFillRental を渡す ★★★ */}
      <AiSupportPane
        instruction={aiInstruction}
        onInstructionChange={setAiInstruction}
        // ★★★ v5.76 修正: isLoading を patchLoading も考慮するように変更 ★★★
        isLoading={adjustmentLoading || patchLoading}
        error={adjustmentError || patchError} // (エラーも両方表示)
        onClearError={() => dispatch(clearAdjustmentError())} // (両方クリアされる)
        
        // ★★★ v5.73 修正: カスタム指示(aiInstruction)を渡す ★★★
        onExecute={() => handleRunAiAdjustment(aiInstruction)}
        
        isAnalysisLoading={analysisLoading}
        analysisResult={analysisResult}
        analysisError={analysisError}
        onClearAnalysis={() => dispatch(clearAnalysis())}
        onExecuteAnalysis={handleRunAiAnalysis}
        
        onFillRental={handleFillRental} 
        // ★★★ v5.76 修正: 新しい差分補正(Patch)ハンドラを接続 ★★★
        onForceAdjustHolidays={handleRunAiHolidayPatch}
      />
      {/* ★★★ v5.21 修正ここまで ★★★ */}


      {/* 手動アサインモーダルの呼び出し */}
      <AssignPatternModal
        target={editingTarget}
        allStaff={activeStaffList} // ★ staffList -> activeStaffList
        allPatterns={shiftPatterns}
        allUnits={unitList}
        allAssignments={assignments}
        burdenData={Array.from(staffBurdenData.values())} // ★★★ v5.101 の変更を元に戻す ★★★
        onClose={handleCloseDialog}
      />
      
      {/* ガントチャートモーダルの呼び出し */}
      <DailyUnitGanttModal
        target={showingGanttTarget}
        onClose={() => setShowingGanttTarget(null)}
        allAssignments={assignments} // ★★★ allAssignments を渡す ★★★
        demandMap={demandMap} // ★★★ v5.101 の変更を元に戻す ★★★
        unitGroups={unitGroups} // ★★★ v5.101 の変更を元に戻す ★★★
      />

      {/* ★★★ v5.85 修正: 新しいモーダルをレンダリング ★★★ */}
      <ClearStaffAssignmentsModal
        staff={clearingStaff}
        onClose={() => setClearingStaff(null)}
        onClear={handleClearStaffAssignments}
      />

    </Box>
  );
}

export default ShiftCalendarPage;