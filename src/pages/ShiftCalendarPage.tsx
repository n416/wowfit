// src/pages/ShiftCalendarPage.tsx
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'; // useCallback追加
import { 
  Box, Paper, Tabs, Tab, 
  Button,
  ToggleButton, ToggleButtonGroup,
  IconButton,
  Typography,
  Stack
} from '@mui/material';
import { useSelector, useDispatch, useStore } from 'react-redux';
import { ActionCreators as UndoActionCreators } from 'redux-undo';
import { 
  db, 
} from '../db/dexie'; 
import { setStaffList } from '../store/staffSlice'; 
import { setPatterns } from '../store/patternSlice';
import { setUnits } from '../store/unitSlice';
import { 
  _syncAssignments
} from '../store/assignmentSlice'; 
import { 
  goToNextMonth, 
  goToPrevMonth, 
  _setIsMonthLoading
} from '../store/calendarSlice'; 
import type { AppDispatch, RootState } from '../store';

import { getMonthDays } from '../utils/dateUtils'; 

// コンポーネント
import StaffCalendarView from '../components/calendar/StaffCalendarView';
import WorkSlotCalendarView from '../components/calendar/WorkSlotCalendarView';
import AssignPatternModal from '../components/calendar/AssignPatternModal'; 
import AiSupportPane from '../components/calendar/AiSupportPane'; 
import BurdenSidebar from '../components/calendar/BurdenSidebar'; 
import DailyUnitGanttModal from '../components/calendar/DailyUnitGanttModal';
import ClearStaffAssignmentsModal from '../components/calendar/ClearStaffAssignmentsModal'; 
import TabPanel from '../components/TabPanel'; 

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
import SelectAllIcon from '@mui/icons-material/SelectAll';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'; 
import ChevronRightIcon from '@mui/icons-material/ChevronRight'; 
import RefreshIcon from '@mui/icons-material/Refresh'; 

// --- メインコンポーネント ---
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const mainCalendarScrollerRef = useRef<HTMLElement | null>(null);

  // --- 1. グローバル状態の取得 ---
  
  const { 
    past, 
    future,
    present: {
      assignments, 
      isSyncing, 
      adjustmentLoading, 
      adjustmentError,
      analysisLoading, 
      analysisResult, 
      analysisError,
      patchLoading, 
      patchError,
      adviceLoading
    }
  } = useSelector((state: RootState) => state.assignment);
  
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  const { staff: staffList } = useSelector((state: RootState) => state.staff); 
  
  const { 
    currentYear, 
    currentMonth, 
    isMonthLoading 
  } = useSelector((state: RootState) => state.calendar);

  const monthDays = useMemo(() => {
    if (isNaN(currentYear) || isNaN(currentMonth)) {
      const defaultDate = new Date();
      return getMonthDays(defaultDate.getFullYear(), defaultDate.getMonth() + 1);
    }
    return getMonthDays(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  
  // --- 2. カスタムフックによるロジックの分離 ---

  const {
    staffList: activeStaffList,
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  } = useStaffBurdenData(currentYear, currentMonth, monthDays); 
  
  const sortedStaffList = useMemo(() => {
    return [...activeStaffList].sort((a, b) => {
      const unitA = a.unitId || 'ZZZ';
      const unitB = b.unitId || 'ZZZ';
      if (unitA === unitB) {
        return a.name.localeCompare(b.name);
      }
      return unitA.localeCompare(unitB);
    });
  }, [activeStaffList]);
  
  const demandMap = useDemandMap(monthDays); 

  const {
    clickMode,
    setClickMode, 
    activeCell,
    selectionRange,
    handleCellClick: handleInteractionCellClick, 
    handleCellMouseDown,
    handleCellMouseMove,
    handleCellMouseUp,
    invalidateSyncLock,
  } = useCalendarInteractions(
    sortedStaffList, 
    mainCalendarScrollerRef, 
    monthDays
  ); 

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
  
  const unitGroups = useUnitGroups(showingGanttTarget, monthDays);

  const {
    aiInstruction,
    setAiInstruction,
    handleFillRental,
    handleRunAiAdjustment,
    handleRunAiDefault, 
    handleRunAiAnalysis,
    handleRunAiHolidayPatch,
    handleResetClick,
    handleClearError,
    handleClearAnalysis
  } = useShiftCalendarLogic(
    currentYear, 
    currentMonth, 
    monthDays,
    activeStaffList, 
    staffHolidayRequirements,
    demandMap
  );

  useUndoRedoKeyboard(invalidateSyncLock); 


  // ★ 4. ページ固有のロジック (データ読み込み)
  const store = useStore<RootState>(); 
  
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [units, patterns, staff] = await Promise.all([
          db.units.toArray(),
          db.shiftPatterns.toArray(),
          db.staffList.toArray()
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
      } catch (e) {
        console.error("DBマスタデータの読み込み/初期化に失敗:", e);
      }
    };
    
    const loadAssignments = async () => {
      if (!monthDays || monthDays.length === 0 || store.getState().calendar.isMonthLoading) {
        return;
      }
      
      try {
        dispatch(_setIsMonthLoading(true)); 

        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;

        const assignmentsDB = await db.assignments
          .where('date')
          .between(firstDay, lastDay, true, true)
          .toArray();
        
        if (staffList.length === 0) {
          dispatch(_syncAssignments(assignmentsDB));
        } else {
          dispatch(_syncAssignments(assignmentsDB));
          dispatch(UndoActionCreators.clearHistory());
        }

      } catch (e) {
        console.error(`${currentYear}年${currentMonth}月のアサイン読み込みに失敗:`, e);
      } finally {
        dispatch(_setIsMonthLoading(false));
      }
    };

    if (unitList.length === 0 || shiftPatterns.length === 0 || staffList.length === 0) {
      loadMasterData();
    }
    loadAssignments();

  }, [dispatch, currentYear, currentMonth, monthDays, unitList.length, shiftPatterns.length, staffList.length, store]);


  // ★ 修正: useCallback でメモ化
  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setClickMode('normal'); 
  }, [setClickMode]);

  // ★ 修正: useCallback でメモ化
  const handleCellClick = useCallback((
    e: React.MouseEvent, 
    date: string, 
    staffIdOrUnitId: string | null, 
    staffIndex?: number, 
    dateIndex?: number
  ) => {
    if (tabValue === 1) {
      openGanttModal(date, staffIdOrUnitId);
      return;
    }
    if (staffIdOrUnitId && staffIndex !== undefined && dateIndex !== undefined) {
      if (clickMode === 'normal') {
        openAssignModal(date, staffIdOrUnitId);
      } else {
        handleInteractionCellClick(e, date, staffIdOrUnitId, staffIndex, dateIndex);
      }
    }
  }, [tabValue, clickMode, openGanttModal, openAssignModal, handleInteractionCellClick]);

  // ★ 修正: useCallback でメモ化
  const handleDateHeaderClick = useCallback((date: string) => {
    openGanttModal(date, null);
  }, [openGanttModal]);

  const isOverallLoading = isSyncing || adjustmentLoading || patchLoading || isMonthLoading || analysisLoading || adviceLoading;

  const CONFIRMATION_MESSAGE = "移動するとデータが固定されます。「元に戻す」動作が出来なくなりますが宜しいですか？";

  const handleGoToPrevMonth = useCallback(() => {
    if (past.length > 0) {
      if (window.confirm(CONFIRMATION_MESSAGE)) {
        dispatch(goToPrevMonth());
      }
    } else {
      dispatch(goToPrevMonth());
    }
  }, [past.length, dispatch]);

  const handleGoToNextMonth = useCallback(() => {
    if (past.length > 0) {
      if (window.confirm(CONFIRMATION_MESSAGE)) {
        dispatch(goToNextMonth());
      }
    } else {
      dispatch(goToNextMonth());
    }
  }, [past.length, dispatch]);


  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      p: '24px', 
      gap: 2 
    }}>
      
      {/* --- コントロールバー (月選択 & 操作ボタン) --- */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0, minHeight: 36 }}>
        
        <Box sx={{ width: 200 }} /> 

        <Paper 
          elevation={0} 
          variant="outlined"
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 1, 
            py: 0, 
            borderRadius: 10,
            bgcolor: 'background.paper',
            borderColor: '#e0e0e0',
            height: 36 
          }}
        >
          <IconButton onClick={handleGoToPrevMonth} disabled={isOverallLoading} size="small">
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" component="div" sx={{ minWidth: '120px', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }}>
            {isNaN(currentYear) || isNaN(currentMonth) ? '...' : `${currentYear}年 ${currentMonth}月`}
          </Typography>
          <IconButton onClick={handleGoToNextMonth} disabled={isOverallLoading} size="small">
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Paper>

        <Stack direction="row" spacing={1} sx={{ width: 200, justifyContent: 'flex-end' }}>
          <IconButton 
            title="元に戻す (Ctrl+Z)"
            onClick={() => dispatch(UndoActionCreators.undo())} 
            disabled={past.length === 0 || isOverallLoading} 
            sx={{ bgcolor: 'white', border: '1px solid #e0e0e0', width: 32, height: 32 }}
            size="small"
          >
            <UndoIcon fontSize="small" />
          </IconButton>
          <IconButton 
            title="やり直す (Ctrl+Y)"
            onClick={() => dispatch(UndoActionCreators.redo())} 
            disabled={future.length === 0 || isOverallLoading} 
            sx={{ bgcolor: 'white', border: '1px solid #e0e0e0', width: 32, height: 32 }}
            size="small"
          >
            <RedoIcon fontSize="small" />
          </IconButton>
          
          <Button 
            variant="outlined" 
            color="error" 
            onClick={handleResetClick} 
            size="small"
            startIcon={<RefreshIcon />}
            disabled={isOverallLoading}
            sx={{ bgcolor: 'white', height: 32, fontSize: '0.75rem' }}
          >
            リセット
          </Button>
        </Stack>
      </Box>


      {/* --- ビューエリア (タブ + カレンダー) --- */}
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
          
          {/* タブヘッダー */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', pl: 2 }}>
            <Tabs value={tabValue} onChange={handleTabChange} sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 1 } }}>
              <Tab label="スタッフビュー" />
              <Tab label="勤務枠ビュー" />
            </Tabs>
          </Box>
          
          {/* コンテンツ */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <h6 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 500 }}>
                スタッフビュー
              </h6>
              <ToggleButtonGroup
                value={clickMode}
                exclusive
                onChange={(_, newMode) => { if(newMode) setClickMode(newMode as any); }}
                size="small"
                disabled={isOverallLoading}
                sx={{ '& .MuiToggleButton-root': { py: 0.5 } }}
              >
                <ToggleButton value="normal" title="通常モード（詳細編集）"><EditIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="holiday" title="公休ポチポチモード"><HolidayIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="paid_leave" title="有給ポチポチモード"><PaidLeaveIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="select" title="セル選択モード (Ctrl+C, V, X)"><SelectAllIcon fontSize="small" /></ToggleButton>
              </ToggleButtonGroup>
            </Box>
            
            <StaffCalendarView 
              sortedStaffList={sortedStaffList} 
              onCellClick={handleCellClick} 
              staffHolidayRequirements={staffHolidayRequirements} 
              onHolidayIncrement={handleHolidayIncrement} 
              onHolidayDecrement={handleHolidayDecrement} 
              onStaffNameClick={openClearStaffModal} 
              onDateHeaderClick={handleDateHeaderClick} // ★ メモ化したハンドラを使用
              clickMode={clickMode}
              activeCell={activeCell}
              selectionRange={selectionRange}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseMove={handleCellMouseMove}
              onCellMouseUp={handleCellMouseUp}
              mainCalendarScrollerRef={mainCalendarScrollerRef}
              monthDays={monthDays} 
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
              <WorkSlotCalendarView 
                onCellClick={(date, unitId) => handleCellClick({ shiftKey: false } as React.MouseEvent, date, unitId)}
                demandMap={demandMap} 
                monthDays={monthDays}
              />
            </Box>
          </TabPanel>
        </Paper>

        {/* サイドバー */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData} 
        />

      </Box>


      {/* AIサポートパネル */}
      <AiSupportPane
        instruction={aiInstruction} 
        onInstructionChange={setAiInstruction} 
        isLoading={adjustmentLoading || patchLoading}
        error={adjustmentError || patchError}
        onClearError={handleClearError} 
        onExecuteDefault={handleRunAiDefault}     
        onExecuteCustom={handleRunAiAdjustment}  
        isAnalysisLoading={analysisLoading}
        analysisResult={analysisResult}
        analysisError={analysisError}
        onClearAnalysis={handleClearAnalysis} 
        onExecuteAnalysis={handleRunAiAnalysis} 
        onFillRental={handleFillRental} 
        onForceAdjustHolidays={handleRunAiHolidayPatch} 
        isOverallDisabled={isOverallLoading}
      />

      {/* モーダル群 */}
      <AssignPatternModal
        target={editingTarget} 
        allStaff={activeStaffList} 
        allPatterns={shiftPatterns}
        allUnits={unitList}
        allAssignments={assignments} 
        burdenData={Array.from(staffBurdenData.values())} 
        onClose={closeModals} 
      />
      <DailyUnitGanttModal
        target={showingGanttTarget} 
        onClose={closeModals} 
        allAssignments={assignments} 
        demandMap={demandMap} 
        monthDays={monthDays} 
      />
      <ClearStaffAssignmentsModal
        staff={clearingStaff} 
        onClose={closeModals} 
        onClear={handleClearStaffAssignments} 
      />

    </Box>
  );
}

export default ShiftCalendarPage;