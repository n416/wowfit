import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Paper, Tabs, Tab, 
  Button,
  ToggleButton, ToggleButtonGroup,
  IconButton
} from '@mui/material';
// import WarningAmberIcon from '@mui/icons-material/WarningAmber'; // 未使用
import { useSelector, useDispatch } from 'react-redux';
// ★★★ v5スキーマの型とDBをインポート ★★★
import { 
  db, 
  IStaff,
} from '../db/dexie'; 
// ★★★ v5スライスのActionをインポート ★★★
import { setStaffList } from '../store/staffSlice'; 
import { setPatterns } from '../store/patternSlice';
import { setUnits } from '../store/unitSlice';
import { 
  setAssignments,
  undoAssignments, redoAssignments,
} from '../store/assignmentSlice'; 
import type { AppDispatch, RootState } from '../store';

// コンポーネント
import StaffCalendarView from '../components/calendar/StaffCalendarView';
import WorkSlotCalendarView from '../components/calendar/WorkSlotCalendarView';
import AssignPatternModal from '../components/calendar/AssignPatternModal'; 
import AiSupportPane from '../components/calendar/AiSupportPane'; 
import BurdenSidebar from '../components/calendar/BurdenSidebar'; 
import DailyUnitGanttModal from '../components/calendar/DailyUnitGanttModal';
import ClearStaffAssignmentsModal from '../components/calendar/ClearStaffAssignmentsModal'; 

// ★★★ 修正: 未使用の MONTH_DAYS のインポートを削除 ★★★
// import { MONTH_DAYS } from '../utils/dateUtils'; 
// ★★★↓ v5.9 モックデータをインポート ↓★★★
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';

// カスタムフック
import { useStaffBurdenData } from '../hooks/useStaffBurdenData';
import { useDemandMap } from '../hooks/useDemandMap';
import { useUnitGroups } from '../hooks/useUnitGroups';
import { useUndoRedoKeyboard } from '../hooks/useUndoRedoKeyboard';
import { useCalendarInteractions } from '../hooks/useCalendarInteractions';
import { useShiftCalendarModals } from '../hooks/useShiftCalendarModals';
import { useShiftCalendarLogic } from '../hooks/useShiftCalendarLogic';

// アイコン
import EditIcon from '@mui/icons-material/Edit';
import HolidayIcon from '@mui/icons-material/BeachAccess';
import PaidLeaveIcon from '@mui/icons-material/FlightTakeoff';
import UndoIcon from '@mui/icons-material/Undo'; 
import RedoIcon from '@mui/icons-material/Redo'; 

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
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
      style={{ flex: 1, minHeight: 0 }}
    >
      {value === index && (
        <Box sx={{ 
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


// --- メインコンポーネント ---
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // --- 1. グローバル状態の取得 ---
  const { 
    assignments, 
    past, 
    future,
    adjustmentLoading, adjustmentError,
    analysisLoading, analysisResult, analysisError,
    patchLoading, patchError
  } = useSelector((state: RootState) => state.assignment);
  
  const { staff: allStaffFromStore } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  const allStaffMap = useMemo(() => 
    new Map(allStaffFromStore.map((s: IStaff) => [s.staffId, s])), 
  [allStaffFromStore]);


  // --- 2. カスタムフックによるロジックの分離 ---

  // (計算フック)
  const {
    staffList: activeStaffList,
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  } = useStaffBurdenData();
  
  const demandMap = useDemandMap();

  // (インタラクションフック)
  const {
    clickMode,
    setClickMode,
    toggleHoliday,
    holidayPatternId,
    paidLeavePatternId,
  } = useCalendarInteractions();

  // (モーダルフック)
  const {
    editingTarget,
    showingGanttTarget,
    clearingStaff,
    openAssignModal,
    openGanttModal,
    openClearStaffModal,
    closeModals,
    handleClearStaffAssignments,
  } = useShiftCalendarModals();
  
  // (ガントチャートモーダル用に計算フックを呼び出し)
  const unitGroups = useUnitGroups(showingGanttTarget);

  // (AI・自動化ロジックフック)
  const {
    aiInstruction,
    setAiInstruction,
    handleFillRental,
    handleRunAiAdjustment,
    handleRunAiDefault, // ★★★ 修正: 'handleRunAiDefault' を追加 ★★★
    handleRunAiAnalysis,
    handleRunAiHolidayPatch,
    handleResetClick,
    handleClearError,
    handleClearAnalysis
  } = useShiftCalendarLogic();

  // (キーボードショートカットフック)
  useUndoRedoKeyboard();


  // --- 3. ページ固有のロジック (データロード、イベント振り分け) ---

  // DB初期化ロジック (変更なし)
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

  // タブ切り替え
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setClickMode('normal'); // タブ切り替えで通常モードに戻す
  };

  /**
   * [最上位ハンドラ] セルクリック時の動作振り分け
   */
  const handleCellClick = (date: string, staffIdOrUnitId: string | null) => {
    // 勤務枠ビュー (tabValue === 1)
    if (tabValue === 1) {
      openGanttModal(date, staffIdOrUnitId);
      return;
    }

    // スタッフビュー (tabValue === 0)
    const staff = allStaffMap.get(staffIdOrUnitId || '');
    if (!staff) return;

    switch (clickMode) {
      case 'normal':
        openAssignModal(date, staff.staffId);
        break;
      case 'holiday':
        toggleHoliday(date, staff, holidayPatternId);
        break;
      case 'paid_leave':
        toggleHoliday(date, staff, paidLeavePatternId);
        break;
    }
  };


  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      p: '24px', 
      gap: 2 
    }}>
      
      {/* 上部エリア (カレンダー + サイドバー) */}
      <Box sx={{
        display: 'flex',
        flexGrow: 1, 
        gap: 2,
        minHeight: 0 
      }}>
        {/* メインエリア */}
        <Paper sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          minWidth: 0, 
          minHeight: 0,
        }}>
          {/* タブヘッダーとリセット/UNDOボタン */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderBottom: 1, 
            borderColor: 'divider',
            pl: 2
          }}>
            <Box sx={{ flexGrow: 1 }}>
              <Tabs value={tabValue} onChange={handleTabChange}>
                <Tab label="スタッフビュー" />
                <Tab label="勤務枠ビュー" />
              </Tabs>
            </Box>
            
            <Box sx={{ flexShrink: 0, pr: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton 
                title="元に戻す (Ctrl+Z)"
                onClick={() => dispatch(undoAssignments())} 
                disabled={past.length === 0}
              >
                <UndoIcon />
              </IconButton>
              <IconButton 
                title="やり直す (Ctrl+Y)"
                onClick={() => dispatch(redoAssignments())} 
                disabled={future.length === 0}
              >
                <RedoIcon />
              </IconButton>
              
              <Button 
                variant="outlined" 
                color="error" 
                onClick={handleResetClick} // from useShiftCalendarLogic
                size="small"
                sx={{ ml: 1 }}
              >
                アサインをリセット
              </Button>
            </Box>
          </Box>
          
          {/* タブパネル */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: '0 24px 16px 24px' }}>
              <h6 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 500 }}>
                スタッフビュー（カレンダー）
              </h6>
              
              <ToggleButtonGroup
                value={clickMode}
                exclusive
                onChange={(_, newMode) => { if(newMode) setClickMode(newMode as any); }}
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
              staffList={activeStaffList} // from useStaffBurdenData
              onCellClick={handleCellClick} // 最上位の振り分けハンドラ
              staffHolidayRequirements={staffHolidayRequirements} // from useStaffBurdenData
              onHolidayIncrement={handleHolidayIncrement} // from useStaffBurdenData
              onHolidayDecrement={handleHolidayDecrement} // from useStaffBurdenData
              onStaffNameClick={openClearStaffModal} // from useShiftCalendarModals
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ p: 3, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
              <WorkSlotCalendarView 
                onCellClick={handleCellClick} // 最上位の振り分けハンドラ
                demandMap={demandMap} // from useDemandMap
              />
            </Box>
          </TabPanel>
        </Paper>

        {/* サイドバー */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData} // from useStaffBurdenData
        />

      </Box> {/* 上部エリアここまで */}


      {/* AIサポートパネル */}
      {/* ★★★ 修正: 前回の提案 (AiSupportPane の props 分離) を適用 ★★★ */}
      <AiSupportPane
        instruction={aiInstruction} 
        onInstructionChange={setAiInstruction} 
        isLoading={adjustmentLoading || patchLoading}
        error={adjustmentError || patchError}
        onClearError={handleClearError} 
        
        // ★★★ 修正: 2つの onExecute を正しく分離 ★★★
        onExecuteDefault={handleRunAiDefault}     // 「AIで草案を作成」
        onExecuteCustom={handleRunAiAdjustment}  // 「AI調整」(カスタム)
        
        isAnalysisLoading={analysisLoading}
        analysisResult={analysisResult}
        analysisError={analysisError}
        onClearAnalysis={handleClearAnalysis} 
        onExecuteAnalysis={handleRunAiAnalysis} 
        
        onFillRental={handleFillRental} 
        onForceAdjustHolidays={handleRunAiHolidayPatch} 
      />


      {/* モーダル群 */}
      <AssignPatternModal
        target={editingTarget} // from useShiftCalendarModals
        allStaff={activeStaffList} // from useStaffBurdenData
        allPatterns={shiftPatterns}
        allUnits={unitList}
        allAssignments={assignments}
        burdenData={Array.from(staffBurdenData.values())} // from useStaffBurdenData
        onClose={closeModals} // from useShiftCalendarModals
      />
      
      <DailyUnitGanttModal
        target={showingGanttTarget} // from useShiftCalendarModals
        onClose={closeModals} // from useShiftCalendarModals
        allAssignments={assignments}
        demandMap={demandMap} // from useDemandMap
        unitGroups={unitGroups} // from useUnitGroups
      />

      <ClearStaffAssignmentsModal
        staff={clearingStaff} // from useShiftCalendarModals
        onClose={closeModals} // from useShiftCalendarModals
        onClear={handleClearStaffAssignments} // from useShiftCalendarModals
      />

    </Box>
  );
}

export default ShiftCalendarPage;