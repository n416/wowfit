import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Box, Paper, Typography, Tabs, Tab, TextField, Button, 
  CircularProgress, Alert, List, ListItem, ListItemText, Avatar, Chip,
  Tooltip, ListSubheader,
  Dialog, DialogTitle, DialogContent, DialogActions, ListItemButton,
  Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Collapse,
  IconButton,
  AlertTitle 
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useSelector, useDispatch } from 'react-redux';
// ★★★ v5スキーマの型とDBをインポート ★★★
import { 
  db, 
  IStaff, IShiftPattern, IUnit, ITimeSlotRule, IAssignment, 
  IStaffConstraints, WorkType, CrossUnitWorkType 
} from '../db/dexie'; 
// ★★★ v5スライスのActionをインポート ★★★
import { setStaffList, parseAndSaveConstraints } from '../store/staffSlice';
import { setPatterns } from '../store/patternSlice';
// ★★★ v5: setTimeSlotRulesは廃止 ★★★
import { setUnits } from '../store/unitSlice';
// ★★★ v5.8 修正: fetchAiAdjustment, clearAdjustmentError をインポート ★★★
import { setAssignments, clearAdvice, fetchAssignmentAdvice, fetchAiAdjustment, clearAdjustmentError } from '../store/assignmentSlice'; 
import type { AppDispatch, RootState } from '../store';
import Dexie from 'dexie'; // (v5.3: Dexieエラー型判定用)

// ★★★↓ コンポーネントのインポートを修正 ↓★★★
import StaffCalendarView from '../components/calendar/StaffCalendarView';
import WorkSlotCalendarView from '../components/calendar/WorkSlotCalendarView';
// ★★★ v5.9 修正: インポートを追加 ★★★
import StaffStatusModal from '../components/calendar/StaffStatusModal'; 
import AssignPatternModal from '../components/calendar/AssignPatternModal'; // ★ v5.9 追加
import AiSupportPane from '../components/calendar/AiSupportPane'; // ★ v5.9 追加
import BurdenSidebar from '../components/calendar/BurdenSidebar'; // ★ v5.9 追加
// ★★★ v5.9 修正: 共通ユーティリティのインポートを修正 ★★★
import { MONTH_DAYS, getDefaultRequiredHolidays } from '../utils/dateUtils';
// ★★★↓ v5.9 モックデータをインポート ↓★★★
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';
// ★★★↓ v5.9 ロジックをインポート ↓★★★
import { allocateHolidays } from '../lib/placement/holidayAllocator';
import { allocateWork } from '../lib/placement/workAllocator';


// (折りたたみ用アイコンのインポートは削除済み)


// TabPanel (変更なし)
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div 
      hidden={value !== index} // 非表示の制御はここだけ
      {...other}
    >
      {/* ★ v5.9 修正: overflow: 'auto' を削除 (親のPaperがスクロールするため) */}
      <Box sx={{ p: 3 }}>{children}</Box>
    </div>
  );
}

// (モックデータ、ローカル定義の Modal/Function はすべて削除済み)


// ★★★ メインコンポーネント (v5) ★★★
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  // ★ v5.7 追加: サイドバー開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // v5 ストアから全データを取得
  const { staff: staffList } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  // ★ v5.8 修正: AI調整の state を取得
  const { assignments, adviceLoading, adviceError, adviceResult, adjustmentLoading, adjustmentError } = useSelector((state: RootState) => state.assignment);

  // v5版: 手動調整ダイアログ用の State
  const [editingTarget, setEditingTarget] = useState<{ date: string; staff: IStaff; } | null>(null);

  // ★ v5.7 追加: 公休数調整モーダル用の State
  const [editingStaffStatus, setEditingStaffStatus] = useState<IStaff | null>(null);
  
  // ★ v5.7 追加: スタッフ毎の必要公休数 (Map<staffId,日数>)
  const [staffHolidayRequirements, setStaffHolidayRequirements] = useState<Map<string, number>>(new Map());

  // ★ v5.8 追加: AIサポートペイン用の State
  const [aiInstruction, setAiInstruction] = useState("夜勤さんXの夜勤を月4回程度に減らしてください。"); 

  
  const staffMap = React.useMemo(() => new Map(staffList.map((s: IStaff) => [s.staffId, s])), [staffList]);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // v5 負担データ (公休数もここに追加)
  const staffBurdenData = React.useMemo(() => {
    const burdenMap = new Map<string, {
        staffId: string; name: string; employmentType: 'FullTime' | 'PartTime';
        assignmentCount: number; nightShiftCount: number; totalHours: number; weekendCount: number;
        maxHours: number;
        holidayCount: number; // ★ v5.7 追加
        requiredHolidays: number; // ★ v5.7 追加
    }>();

    const defaultReq = getDefaultRequiredHolidays();

    staffList.forEach((s: IStaff) => {
      burdenMap.set(s.staffId, { 
        staffId: s.staffId, name: s.name, employmentType: s.employmentType,
        assignmentCount: 0, nightShiftCount: 0, totalHours: 0, weekendCount: 0,
        maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4,
        holidayCount: 0, // ★ v5.7 追加
        requiredHolidays: staffHolidayRequirements.get(s.staffId) || defaultReq, // ★ v5.7 追加
      });
    });

    for (const assignment of assignments) {
      if (assignment.staffId && assignment.patternId) {
        const staffData = burdenMap.get(assignment.staffId);
        const pattern = patternMap.get(assignment.patternId);
        if (staffData && pattern) {
          if (pattern.workType === 'Work') { // 労働のみ
            staffData.assignmentCount++;
            staffData.totalHours += pattern.durationHours;
            if (pattern.isNightShift) staffData.nightShiftCount++;
            const dayOfWeek = new Date(assignment.date.replace(/-/g, '/')).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) staffData.weekendCount++;
          } else if (pattern.workType === 'StatutoryHoliday') { // ★ v5.7 公休カウント
            staffData.holidayCount++;
          }
        }
      }
    }
    return burdenMap;
    // ★ v5.7 依存配列に staffHolidayRequirements を追加
  }, [assignments, staffList, patternMap, staffHolidayRequirements]);


  // ★ v5.7 追加: localStorage から公休数を読み込む
  useEffect(() => {
    const storedReqs = localStorage.getItem('staffHolidayRequirements_2025_11'); // (※年月固定)
    if (storedReqs) {
      setStaffHolidayRequirements(new Map(JSON.parse(storedReqs)));
    } else {
      // 初期化
      const defaultReq = getDefaultRequiredHolidays();
      const newMap = new Map<string, number>();
      staffList.forEach(staff => {
        newMap.set(staff.staffId, defaultReq);
      });
      setStaffHolidayRequirements(newMap);
    }
  }, [staffList]); // staffList がロードされた後に実行

  // ★ v5.7 追加: 公休数が変更されたら localStorage に保存
  useEffect(() => {
    if (staffHolidayRequirements.size > 0) {
      localStorage.setItem('staffHolidayRequirements_2025_11', JSON.stringify(Array.from(staffHolidayRequirements.entries())));
    }
  }, [staffHolidayRequirements]);


  // ★★★ v5.3版: DB初期化ロジック (DataManagementPageと同一ロジック) ★★★
  useEffect(() => {
    const loadData = async () => {
      try {
        const [units, patterns, staff, assignmentsDB] = await Promise.all([
          db.units.toArray(),
          db.shiftPatterns.toArray(),
          db.staffList.toArray(),
          db.assignments.toArray() // アサイン結果も読み込む
        ]);
        
        // (※ v5では timeSlotRules はロードしない)
        // dispatch(setTimeSlotRules([]));

        if (patterns.length === 0) {
          console.log("v5: (ShiftCalendar) 勤務パターンが空のため、初期データを書き込みます。");
          await db.shiftPatterns.bulkPut(MOCK_PATTERNS_V5); 
          dispatch(setPatterns(MOCK_PATTERNS_V5));
        } else {
          dispatch(setPatterns(patterns));
        }
        
        if (units.length === 0) {
          console.log("v5: (ShiftCalendar) ユニットが空のため、初期データを書き込みます。");
          await db.units.bulkPut(MOCK_UNITS_V5); 
          dispatch(setUnits(MOCK_UNITS_V5));
        } else {
          dispatch(setUnits(units));
        }
        
        if (staff.length === 0) {
           console.log("v5: (ShiftCalendar) スタッフが空のため、初期データ (MOCK_STAFF_V4) を書き込みます。");
           await db.staffList.bulkPut(MOCK_STAFF_V4); 
           dispatch(setStaffList(MOCK_STAFF_V4));
        } else {
           dispatch(setStaffList(staff));
        }
        
        // (アサイン結果は常にDBから読み込む)
        dispatch(setAssignments(assignmentsDB)); 

      } catch (e) {
        console.error("v5: DBデータの読み込み/初期化に失敗:", e);
        if (e instanceof Dexie.UpgradeError) {
          alert("データベースのスキーマ更新に失敗しました。\n開発者ツールで IndexedDB (ShiftWorkAppDB) を手動で削除し、リロードしてください。");
        }
      }
    };
    loadData();
  }, [dispatch]);

  // タブ切り替えハンドラ
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // ★★★ v5.9 修正: 公休配置ロジックを外部関数呼び出しに変更 ★★★
  const handleHolidayPlacementClick = useCallback(async () => {
    // 依存するすべてのデータを引数として渡す
    await allocateHolidays({
      assignments,
      staffList,
      unitList,
      patternMap,
      staffMap,
      staffHolidayRequirements,
      dispatch
    });
  }, [assignments, staffList, unitList, patternMap, staffHolidayRequirements, dispatch, staffMap]);
  // ★★★ v5.9 修正ここまで ★★★


  // ★★★ v5.9 修正: 労働配置ロジック(ざっくり埋める)を外部関数呼び出しに変更 ★★★
  const handleRoughFillClick = useCallback(async () => {
    // 依存するすべてのデータを引数として渡す
    await allocateWork({
      assignments,
      staffList,
      unitList,
      patternMap,
      shiftPatterns, // (find でパターン配列本体も参照していたため)
      dispatch
    });
  }, [assignments, staffList, unitList, patternMap, shiftPatterns, dispatch]);
  // ★★★ v5.9 修正ここまで ★★★


  // v4版: アサインリセット
  const handleResetClick = async () => {
    if (window.confirm("「公休」も含め、すべてのアサイン結果をリセットしますか？")) {
      try {
        await db.assignments.clear();
        dispatch(setAssignments([]));
      } catch (e) {
        console.error("アサインのリセットに失敗:", e);
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
      alert("勤務枠ビューからの手動調整は未実装です。\n(「スタッフビュー」からセルをクリックして調整してください)");
    }
  };

  const handleCloseDialog = () => {
    setEditingTarget(null);
  };

  // (handleAssignPattern, handleFetchAdvice, availablePatternsForStaff は AssignPatternModal に移動済み)

  // ★★★ v5.7 追加: スタッフステータスモーダルの保存ハンドラ ★★★
  const handleSaveStaffStatus = (newHolidayReq: number) => {
    if (editingStaffStatus) {
      setStaffHolidayRequirements(prevMap => {
        const newMap = new Map(prevMap);
        newMap.set(editingStaffStatus.staffId, newHolidayReq);
        return newMap;
      });
    }
    setEditingStaffStatus(null);
  };

  // ★★★ v5.8 追加: AI調整の実行ハンドラ ★★★
  const handleRunAiAdjustment = () => {
    if (!window.confirm("AIによる全体調整を実行しますか？\n（現在の勤務表下書きがAIによって上書きされます）")) {
      return;
    }
    dispatch(fetchAiAdjustment({
      instruction: aiInstruction,
      allStaff: staffList,
      allPatterns: shiftPatterns,
      allUnits: unitList,
      allAssignments: assignments, // 現在の下書き
      monthInfo: {
        year: 2025, // (※ハードコード)
        month: 11, // (※ハードコード)
        days: MONTH_DAYS
      }
    }));
  };

  return (
    // ★★★ v5.9 修正: ページ全体のレイアウトを変更 (縦分割) ★★★
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', // ★ 縦分割
      height: '100%', // 親(App.tsxのBox)から高さを100%受け取る
      p: '24px', // ★ 上下左右のパディング (ヘッダーとの間隔はここで管理)
      gap: 2 // ★ 上下エリア間の隙間
    }}>
      
      {/* ★ 上部エリア (カレンダー + サイドバー) */}
      <Box sx={{
        display: 'flex',
        flexGrow: 1, // ★ 高さいっぱいに広がる
        gap: 2,
        minHeight: 0 // ★ 縮小できるように
      }}>
        {/* メインエリア (スクロール可能) */}
        <Paper sx={{ 
          flex: 1, // 残りの幅をすべて使用
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'auto', // ★ このエリア(カレンダー側)だけがスクロールする
          minWidth: 0, // 縮小できるように
        }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange}>
              <Tab label="スタッフビュー" />
              <Tab label="勤務枠ビュー" />
            </Tabs>
          </Box>
          
          <TabPanel value={tabValue} index={0}>
            <StaffCalendarView 
              onCellClick={handleCellClick} 
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <WorkSlotCalendarView 
              onCellClick={handleCellClick}
              onHolidayPlacementClick={handleHolidayPlacementClick} // (公休配置)
              onRoughFillClick={handleRoughFillClick}
              onResetClick={handleResetClick} // (リセット)
            />
          </TabPanel>
        </Paper>

        {/* ★★★ v5.9 修正: サイドバーの呼び出しに変更 ★★★ */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData}
          staffMap={staffMap}
          onStaffClick={(staff) => setEditingStaffStatus(staff)}
        />
        {/* ★★★ v5.9 修正ここまで ★★★ */}

      </Box> {/* ★ 上部エリアここまで */}


      {/* ★★★ v5.9 修正: AIサポートペインの呼び出しに変更 ★★★ */}
      <AiSupportPane
        instruction={aiInstruction}
        onInstructionChange={setAiInstruction}
        isLoading={adjustmentLoading}
        error={adjustmentError}
        onClearError={() => dispatch(clearAdjustmentError())}
        onExecute={handleRunAiAdjustment}
      />
      {/* ★★★ v5.9 修正ここまで ★★★ */}


      {/* ★★★ v5.9 修正: 手動アサインモーダルの呼び出しに変更 ★★★ */}
      <AssignPatternModal
        target={editingTarget}
        allStaff={staffList}
        allPatterns={shiftPatterns}
        allUnits={unitList}
        allAssignments={assignments}
        burdenData={Array.from(staffBurdenData.values())}
        onClose={handleCloseDialog}
      />

      {/* ★★★ v5.9 修正: スタッフステータスモーダルの呼び出しに変更 ★★★ */}
      <StaffStatusModal
        staff={editingStaffStatus}
        currentHolidayReq={staffHolidayRequirements.get(editingStaffStatus?.staffId || '') || getDefaultRequiredHolidays()}
        onClose={() => setEditingStaffStatus(null)}
        onSave={handleSaveStaffStatus}
      />

    </Box>
  );
}

export default ShiftCalendarPage;