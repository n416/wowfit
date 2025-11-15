import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Box, Paper, Tabs, Tab, 
  // ★★★ v5.44 修正: 未使用のMUIコンポーネントを大量に削除 ★★★
} from '@mui/material';
// import WarningAmberIcon from '@mui/icons-material/WarningAmber'; // 未使用
import { useSelector, useDispatch } from 'react-redux';
// ★★★ v5スキーマの型とDBをインポート ★★★
import { 
  db, 
  IStaff, IShiftPattern, IUnit, // ★★★ v5.44 修正: ITimeSlotRule, IStaffConstraints 等を削除
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
  fetchAiHolidayPatch 
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
import { MONTH_DAYS, getDefaultRequiredHolidays, getPrevDateStr } from '../utils/dateUtils';
// ★★★↓ v5.9 モックデータをインポート ↓★★★
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';
// ★★★ v5.72 修正: allocateHolidays のインポートを（再度）削除 ★★★
// import { allocateHolidays } from '../lib/placement/holidayAllocator';
// ★★★ v5.21 修正: allocateWork (応援スタッフ穴埋め) をインポート ★★★
import { allocateWork } from '../lib/placement/workAllocator';


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
          p: 3, 
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

// ★★★ v5.36 追加: モーダルに渡す unitGroups の型定義 ★★★
type UnitGroupData = {
  unit: IUnit;
  rows: { 
    staff: IStaff; 
    pattern: IShiftPattern; 
    isSupport: boolean; 
    startHour: number;
    duration: number; 
  }[];
};


// ★★★ メインコンポーネント (v5) ★★★
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  // ★ v5.7 追加: サイドバー開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // v5 ストアから全データを取得
  // ★★★ 全スタッフリストを取得 (休職者も含む) ★★★
  const { staff: allStaffFromStore } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  // ★ v5.9 修正: AI分析の state を取得
  const { 
    assignments, 
    // ★★★ v5.44 修正: adviceXXX を削除 (AssignPatternModalが直接useSelectorする)
    adjustmentLoading, adjustmentError,
    analysisLoading, analysisResult, analysisError,
    // ★★★ v5.76 修正: patchLoading, patchError を取得 ★★★
    patchLoading, patchError
  } = useSelector((state: RootState) => state.assignment);
  
  // ★★★ 勤務表で扱う「アクティブな」スタッフリストを作成 ★★★
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

  // ★ v5.7 追加: スタッフ毎の必要公休数 (Map<staffId,日数>)
  const [staffHolidayRequirements, setStaffHolidayRequirements] = useState<Map<string, number>>(new Map());

  // ★ v5.8 追加: AIサポートペイン用の State
  const [aiInstruction, setAiInstruction] = useState("夜勤さんXの夜勤を月4回程度に減らしてください。"); 

  
  // ★★★ staffMap は休職者も含めた全スタッフで作る (アサイン履歴などで名前を引けるように) ★★★
  const staffMap = React.useMemo(() => new Map(allStaffFromStore.map((s: IStaff) => [s.staffId, s])), [allStaffFromStore]);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // v5 負担データ (公休数もここに追加)
  // ★★★ staffList (アクティブなスタッフ) を元に計算する ★★★
  const staffBurdenData = React.useMemo(() => {
    const burdenMap = new Map<string, {
        staffId: string; name: string; employmentType: 'FullTime' | 'PartTime' | 'Rental'; 
        assignmentCount: number; nightShiftCount: number; totalHours: number; weekendCount: number;
        maxHours: number;
        holidayCount: number; 
        requiredHolidays: number; 
    }>();

    // ★★★ v5.44 修正: 引数なしで呼び出す ★★★
    const defaultReq = getDefaultRequiredHolidays(); 

    staffList.forEach((s: IStaff) => { // ★ staffList (アクティブ) を使用
      burdenMap.set(s.staffId, { 
        staffId: s.staffId, name: s.name, employmentType: s.employmentType,
        assignmentCount: 0, nightShiftCount: 0, totalHours: 0, weekendCount: 0,
        maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4,
        holidayCount: 0, 
        requiredHolidays: staffHolidayRequirements.get(s.staffId) || defaultReq, 
      });
    });

    for (const assignment of assignments) {
      if (assignment.staffId && assignment.patternId) {
        const staffData = burdenMap.get(assignment.staffId);
        const pattern = patternMap.get(assignment.patternId);
        if (staffData && pattern) { // ★ 休職中のスタッフは staffData が undefined になるので自動的に除外される
          if (pattern.workType === 'Work') { 
            staffData.assignmentCount++;
            staffData.totalHours += pattern.durationHours;
            if (pattern.isNightShift) staffData.nightShiftCount++;
            const dayOfWeek = new Date(assignment.date.replace(/-/g, '/')).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) staffData.weekendCount++;
          } else if (pattern.workType === 'StatutoryHoliday') { 
            staffData.holidayCount++;
          }
        }
      }
    }
    return burdenMap;
  }, [assignments, staffList, patternMap, staffHolidayRequirements]); // ★ 依存配列を staffList に変更


  // ★ v5.7 追加: localStorage から公休数を読み込む
  useEffect(() => {
    const storedReqs = localStorage.getItem('staffHolidayRequirements_2025_11'); 
    if (storedReqs) {
      setStaffHolidayRequirements(new Map(JSON.parse(storedReqs)));
    } else {
      // ★★★ v5.44 修正: 引数なしで呼び出す ★★★
      const defaultReq = getDefaultRequiredHolidays();
      const newMap = new Map<string, number>();
      allStaffFromStore.forEach(staff => { // ★ 全スタッフ (allStaffFromStore) に対して設定
        newMap.set(staff.staffId, defaultReq);
      });
      setStaffHolidayRequirements(newMap);
    }
  }, [allStaffFromStore]); // ★ 依存配列を allStaffFromStore に変更

  // ★ v5.7 追加: 公休数が変更されたら localStorage に保存
  useEffect(() => {
    if (staffHolidayRequirements.size > 0) {
      localStorage.setItem('staffHolidayRequirements_2025_11', JSON.stringify(Array.from(staffHolidayRequirements.entries())));
    }
  }, [staffHolidayRequirements]);


  // ★★★ v5.35 修正: INP対策のため、demandMap の計算をここに引き上げる ★★★
  const demandMap = useMemo(() => {
    const map = new Map<string, { required: number; actual: number }>(); 
    
    // --- 1. Pass 1: Demand (Mapの初期化) ---
    for (const day of MONTH_DAYS) {
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
      // ★★★ staffMap を使って休職中かチェック ★★★
      const staff = staffMap.get(assignment.staffId);
      if (staff && staff.status === 'OnLeave') continue; // 休職中のスタッフのアサインはカウントしない
      
      if (assignment.unitId && pattern && pattern.workType === 'Work') {
        
        const startTime = parseInt(pattern.startTime.split(':')[0]);
        const [endH, endM] = pattern.endTime.split(':').map(Number);
        const endTime = (endM > 0) ? endH + 1 : endH;

        if (!pattern.crossesMidnight) {
          // --- A. 当日のみのアサイン ---
          for (let hour = startTime; hour < endTime; hour++) { 
            const key = `${assignment.date}_${assignment.unitId}_${hour}`;
            const entry = map.get(key);
            if (entry) entry.actual += 1;
          }
        } else {
          // --- B. 日付またぎのアサイン ---
          // B-1. 1日目 (当日開始の夜)
          for (let hour = startTime; hour < 24; hour++) {
            const key = `${assignment.date}_${assignment.unitId}_${hour}`;
            const entry = map.get(key);
            if (entry) entry.actual += 1;
          }
          
          // B-2. 2日目 (翌日の朝)
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
    for (const day of MONTH_DAYS) {
      const prevDateStr = getPrevDateStr(day.dateStr);

      for (let h = 0; h < 24; h++) {
        let shareableSurplusPool = 0; // この時間の「シェア可能な余剰人員」
        const deficitUnits: { key: string, entry: { required: number, actual: number } }[] = []; // 助けが必要なユニット

        // (Pass 3-A: プールとターゲットをスキャン)
        for (const unit of unitList) {
          const key = `${day.dateStr}_${unit.unitId}_${h}`;
          const entry = map.get(key);
          if (!entry) continue;

          // A. 不足（actual < required）しているユニットを「ターゲット」としてリストアップ
          if (entry.actual < entry.required) {
            deficitUnits.push({ key, entry });
          }

          // B. 余剰（actual > required）がいるユニットをスキャン
          if (entry.actual > entry.required) {
            // このユニットの「シェア可能」なスタッフを探す
            const shareableStaffInThisUnit = assignments.filter(a => {
              // ★★★ staffMap を使って休職中かチェック ★★★
              const staff = staffMap.get(a.staffId);
              if (!staff || staff.status === 'OnLeave') return false; 
              
              if (a.unitId !== unit.unitId) return false;
              const p = patternMap.get(a.patternId);
              if (!p || p.workType !== 'Work') return false;
              const isShareable = p.crossUnitWorkType === '有' || p.crossUnitWorkType === 'サポート';
              if (!isShareable) return false;

              // このスタッフがこの時間(h)に働いているか
              const startH = parseInt(p.startTime.split(':')[0]);
              const [endH_raw, endM_raw] = p.endTime.split(':').map(Number);
              const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw;
              
              if (a.date === day.dateStr && !p.crossesMidnight) return (h >= startH && h < endH); // 当日日勤
              if (a.date === day.dateStr && p.crossesMidnight) return (h >= startH); // 当日夜勤(夜)
              if (a.date === prevDateStr && p.crossesMidnight) return (h < endH); // 前日夜勤(朝)
              return false;
            });
            
            // このユニットの余剰分
            const surplusInThisUnit = entry.actual - entry.required;
            // シェア可能なスタッフ数と、余剰分のうち、少ない方をプールに加算
            const contribution = Math.min(surplusInThisUnit, shareableStaffInThisUnit.length);
            shareableSurplusPool += contribution;
          }
        }

        // (Pass 3-B: プールからターゲットへ分配)
        if (shareableSurplusPool > 0 && deficitUnits.length > 0) {
          deficitUnits.sort((a, b) => (b.entry.required - b.entry.actual) - (a.entry.required - a.entry.actual));
          
          for (const target of deficitUnits) {
            if (shareableSurplusPool <= 0) break; // プールが空
            const needed = target.entry.required - target.entry.actual;
            const fillAmount = Math.min(needed, 1.0); 
            target.entry.actual += fillAmount;
            shareableSurplusPool -= fillAmount;
          }
        }
      }
    }

    return map;
  }, [assignments, unitList, patternMap, staffMap]); // ★ 依存配列を staffMap に変更 (staffList -> staffMap)


  // ★★★ v5.36 修正: INP対策のため、unitGroups の計算をここに引き上げる ★★★
  const unitGroups: UnitGroupData[] = useMemo(() => {
    if (!showingGanttTarget) return []; // モーダル非表示時は計算しない
    
    const { date } = showingGanttTarget;
    const groups: UnitGroupData[] = [];
    const prevDateStr = getPrevDateStr(date);

    unitList.forEach(currentUnit => {
      const rows: any[] = [];

      assignments.forEach(assignment => {
        if (assignment.date !== date && assignment.date !== prevDateStr) return;

        const pattern = patternMap.get(assignment.patternId);
        if (!pattern || pattern.workType !== 'Work') return;
        
        if (assignment.date === prevDateStr && !pattern.crossesMidnight) return;

        const staff = staffMap.get(assignment.staffId);
        if (!staff) return;
        if (staff.status === 'OnLeave') return; // ★★★ 休職中のスタッフはガントチャートに表示しない ★★★

        const startH = parseInt(pattern.startTime.split(':')[0]);
        const [endH_raw, endM] = pattern.endTime.split(':').map(Number);
        let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
        
        let displayStart = startH;
        let displayDuration = endH - startH;

        if (pattern.crossesMidnight) {
           if (assignment.date === date) {
             displayDuration = 24 - startH; // v5.28 (v5.34) のバグ修正
           } else {
             displayStart = 0;
             displayDuration = endH;
           }
        }

        const checkHour = assignment.date === date ? startH : 0;
        let isMatch = false;
        let isSupport = false;

        if (assignment.unitId === currentUnit.unitId) {
          isMatch = true;
          isSupport = false; 
          const isCrossUnit = pattern.crossUnitWorkType === '有' || pattern.crossUnitWorkType === 'サポート';
          const assignedUnitDemand = (currentUnit.demand || [])[checkHour];
          if (isCrossUnit && assignedUnitDemand === 0.5) {
             isSupport = true;
          }
        } else {
          const isCrossUnit = pattern.crossUnitWorkType === '有' || pattern.crossUnitWorkType === 'サポート';
          if (isCrossUnit) {
            const demandHere = (currentUnit.demand || [])[checkHour];
            if (demandHere === 0.5) {
              isMatch = true;
              isSupport = true;
            }
          }
        }

        if (isMatch) {
          rows.push({ 
            staff, pattern, isSupport, 
            startHour: displayStart, 
            duration: displayDuration
          });
        }
      });

      rows.sort((a, b) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.staff.name.localeCompare(b.staff.name);
      });

      groups.push({ unit: currentUnit, rows });
    });

    return groups;
  }, [showingGanttTarget, assignments, patternMap, staffMap, unitList]); // ★ 依存配列に target を指定


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
        
        dispatch(setAssignments(assignmentsDB)); 

      } catch (e) {
        console.error("DB init failed:", e);
      }
    };
    loadData();
  }, [dispatch]);

  // ★★★ v5.45 修正: TS2769を修正 (event引数を `_` に変更) ★★★
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
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
      demandMap // ★★★ この行を追加 ★★★
    });
  }, [assignments, staffList, unitList, patternMap, shiftPatterns, dispatch, demandMap]); // ★ 依存配列を staffList に変更


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
  const handleCellClick = (date: string, staffIdOrUnitId: string | null) => {
    if (tabValue === 0) { // スタッフビュー
      const staff = staffMap.get(staffIdOrUnitId || '');
      if (staff) {
        setEditingTarget({ date, staff });
        dispatch(clearAdvice());
      }
    } else { // 勤務枠ビュー
      if (staffIdOrUnitId) {
        setShowingGanttTarget({ date, unitId: staffIdOrUnitId });
      }
    }
  };
  
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

    const assignmentsToRemove = assignments.filter(a => a.staffId === staffId);
    
    if (window.confirm(`${staff.name}さんのアサイン（${assignmentsToRemove.length}件）をすべてクリアしますか？`)) {
      try {
        await db.assignments.bulkDelete(assignmentsToRemove.map(a => a.id!));
        const remainingAssignments = await db.assignments.toArray();
        dispatch(setAssignments(remainingAssignments));
        setClearingStaff(null); // モーダルを閉じる
      } catch (e) {
        console.error("アサインのクリアに失敗:", e);
        alert("アサインのクリアに失敗しました。");
      }
    }
  }, [assignments, dispatch, clearingStaff]); // 依存配列


  // ★★★ v5.9 修正: 公休調整ハンドラ (+/-) を追加 ★★★
  const handleHolidayIncrement = (staffId: string) => {
    setStaffHolidayRequirements(prevMap => {
      const newMap = new Map(prevMap);
      // ★★★ v5.44 修正: 引数なしで呼び出す ★★★
      const currentReq = newMap.get(staffId) || getDefaultRequiredHolidays();
      newMap.set(staffId, currentReq + 1);
      return newMap;
    });
  };

  const handleHolidayDecrement = (staffId: string) => {
    setStaffHolidayRequirements(prevMap => {
      const newMap = new Map(prevMap);
      // ★★★ v5.44 修正: 引数なしで呼び出す ★★★
      const currentReq = newMap.get(staffId) || getDefaultRequiredHolidays();
      newMap.set(staffId, Math.max(0, currentReq - 1)); 
      return newMap;
    });
  };
  // ★★★ v5.9 修正ここまで ★★★

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
    const staffForAi = staffList.filter(s => s.employmentType !== 'Rental');
    
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
    const staffForAi = staffList.filter(s => s.employmentType !== 'Rental');

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
    const staffForAi = staffList.filter(s => s.employmentType !== 'Rental');
    
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
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            {/* ★★★ v5.45 修正: TS2769を修正 ★★★ */}
            <Tabs value={tabValue} onChange={handleTabChange}>
              <Tab label="スタッフビュー" />
              <Tab label="勤務枠ビュー" />
            </Tabs>
          </Box>
          
          {/* ★★★ v5.70 修正: TabPanelがflex: 1で高さを継承するように ★★★ */}
          <TabPanel value={tabValue} index={0}>
            <StaffCalendarView 
              staffList={staffList} // ★★★ フィルタリングした staffList を渡す ★★★
              onCellClick={handleCellClick} 
              staffHolidayRequirements={staffHolidayRequirements}
              onHolidayIncrement={handleHolidayIncrement}
              onHolidayDecrement={handleHolidayDecrement}
              onStaffNameClick={handleStaffNameClick} // ★★★ v5.85 修正 ★★★
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <WorkSlotCalendarView 
              onCellClick={handleCellClick}
              // ★★★ v5.57 修正: 未使用の props を削除 ★★★
              // onHolidayPlacementClick={handleHolidayPlacementClick} 
              // onFillRentalClick={handleFillRental} 
              onResetClick={handleResetClick} 
              demandMap={demandMap} 
            />
          </TabPanel>
        </Paper>

        {/* サイドバーの呼び出し */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData}
          staffMap={staffMap}
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
        allStaff={staffList}
        allPatterns={shiftPatterns}
        allUnits={unitList}
        allAssignments={assignments}
        burdenData={Array.from(staffBurdenData.values())}
        onClose={handleCloseDialog}
      />
      
      {/* ガントチャートモーダルの呼び出し */}
      <DailyUnitGanttModal
        target={showingGanttTarget}
        onClose={() => setShowingGanttTarget(null)}
        // ★★★ v5.44 修正: 未使用のprops (allStaff等) を削除 ★★★
        demandMap={demandMap} // ★★★ v5.35 追加 ★★★
        unitGroups={unitGroups} // ★★★ v5.36 追加 ★★★
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