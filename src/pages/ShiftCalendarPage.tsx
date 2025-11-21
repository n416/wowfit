// src/pages/ShiftCalendarPage.tsx
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Box, Paper, Tabs, Tab, 
  Button,
  ToggleButton, ToggleButtonGroup,
  Stack,
  Divider
} from '@mui/material';
import { useSelector, useDispatch, useStore } from 'react-redux';
import { ActionCreators as UndoActionCreators } from 'redux-undo';
import { db } from '../db/dexie'; 
import { setStaffList } from '../store/staffSlice'; 
import { setPatterns } from '../store/patternSlice';
import { setUnits } from '../store/unitSlice';
import { _syncAssignments } from '../store/assignmentSlice'; 
import { goToNextMonth, goToPrevMonth, _setIsMonthLoading } from '../store/calendarSlice'; 
import type { AppDispatch, RootState } from '../store';
import { getMonthDays, getPrevDateStr } from '../utils/dateUtils'; 

// コンポーネント
import StaffCalendarView from '../components/calendar/StaffCalendarView';
import WorkSlotCalendarView from '../components/calendar/WorkSlotCalendarView';
import AssignPatternModal from '../components/calendar/AssignPatternModal'; 
import AiSupportPane from '../components/calendar/AiSupportPane'; 
import BurdenSidebar from '../components/calendar/BurdenSidebar'; 
import DailyUnitGanttModal from '../components/calendar/DailyUnitGanttModal';
import ClearStaffAssignmentsModal from '../components/calendar/ClearStaffAssignmentsModal'; 
import TabPanel from '../components/TabPanel'; 
import MonthNavigation from '../components/calendar/MonthNavigation';
import FloatingActionMenu from '../components/calendar/FloatingActionMenu';

import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';

// カスタムフック
import { useStaffBurdenData } from '../hooks/useStaffBurdenData';
import { useDemandMap } from '../hooks/useDemandMap';
import { useUndoRedoKeyboard } from '../hooks/useUndoRedoKeyboard';
import { useCalendarInteractions } from '../hooks/useCalendarInteractions';
import { useShiftCalendarModals } from '../hooks/useShiftCalendarModals';
import { useShiftCalendarLogic } from '../hooks/useShiftCalendarLogic';

// アイコン
import EditIcon from '@mui/icons-material/Edit'; 
import HolidayIcon from '@mui/icons-material/BeachAccess'; 
import PaidLeaveIcon from '@mui/icons-material/FlightTakeoff'; 
import SelectAllIcon from '@mui/icons-material/SelectAll'; 
import UndoIcon from '@mui/icons-material/Undo'; 
import RedoIcon from '@mui/icons-material/Redo'; 
import RefreshIcon from '@mui/icons-material/Refresh'; 

// --- メインコンポーネント ---
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  // ★ 修正: ローカルストレージから初期値を読み込む
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('isBurdenSidebarOpen');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // ★ 追加: 状態変更時にローカルストレージへ保存
  useEffect(() => {
    localStorage.setItem('isBurdenSidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);
  
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
    selectionRange,
    handleCellClick: handleInteractionCellClick, 
    handleCellMouseDown,
    handleCellMouseMove,
    handleCellMouseUp,
    handleAutoScroll,
    handleCopy,
    handlePaste,
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
        
        const prevDay = getPrevDateStr(firstDay);

        const assignmentsDB = await db.assignments
          .where('date')
          .between(prevDay, lastDay, true, true) 
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


  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setClickMode('normal'); 
  }, [setClickMode]);

  const handleCellClick = useCallback((
    e: React.MouseEvent | React.TouchEvent, 
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


  const showFloatingMenu = clickMode === 'select' && !!selectionRange;

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      p: '24px', 
      gap: 2 
    }}>
      
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
          
          {/* --- コンテンツ (Staff View) --- */}
          <TabPanel value={tabValue} index={0}>
            
            {/* ツールバー */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              mb: 2,
              bgcolor: 'background.paper'
            }}>
              <MonthNavigation
                currentYear={currentYear}
                currentMonth={currentMonth}
                onPrevMonth={handleGoToPrevMonth}
                onNextMonth={handleGoToNextMonth}
                isLoading={isOverallLoading}
              />

              <ToggleButtonGroup
                value={clickMode}
                exclusive
                onChange={(_, newMode) => { if(newMode) setClickMode(newMode as any); }}
                size="small"
                disabled={isOverallLoading}
                sx={{ 
                  '& .MuiToggleButton-root': { 
                    px: 2,
                    py: 0.5,
                    border: 'none',
                    '&.Mui-selected': {
                      bgcolor: 'rgba(25, 118, 210, 0.1)',
                      color: 'primary.main',
                      fontWeight: 'bold'
                    },
                    '&:hover': {
                      bgcolor: 'rgba(0, 0, 0, 0.04)'
                    }
                  },
                  border: '1px solid #e0e0e0',
                  borderRadius: 1
                }}
              >
                <ToggleButton value="normal" title="通常モード（詳細編集）">
                  <EditIcon fontSize="small" sx={{ mr: 0.5 }} /> 通常
                </ToggleButton>
                <Divider flexItem orientation="vertical" sx={{ mx: 0, my: 0 }} />
                <ToggleButton value="holiday" title="公休ポチポチモード">
                  <HolidayIcon fontSize="small" sx={{ mr: 0.5 }} /> 公休
                </ToggleButton>
                <Divider flexItem orientation="vertical" sx={{ mx: 0, my: 0 }} />
                <ToggleButton value="paid_leave" title="有給ポチポチモード">
                  <PaidLeaveIcon fontSize="small" sx={{ mr: 0.5 }} /> 有給
                </ToggleButton>
                <Divider flexItem orientation="vertical" sx={{ mx: 0, my: 0 }} />
                <ToggleButton value="select" title="セル選択モード (Ctrl+C, V, X)">
                  <SelectAllIcon fontSize="small" sx={{ mr: 0.5 }} /> 選択
                </ToggleButton>
              </ToggleButtonGroup>

              <Stack direction="row" spacing={1} alignItems="center">
                 <Button 
                    variant="text" 
                    size="small"
                    onClick={() => dispatch(UndoActionCreators.undo())} 
                    disabled={past.length === 0 || isOverallLoading} 
                    startIcon={<UndoIcon fontSize="small" />}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                  </Button>
                  <Button 
                    variant="text" 
                    size="small"
                    onClick={() => dispatch(UndoActionCreators.redo())} 
                    disabled={future.length === 0 || isOverallLoading} 
                    startIcon={<RedoIcon fontSize="small" />}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                  </Button>
                  
                  <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

                  <Button 
                    variant="outlined" 
                    color="error" 
                    onClick={handleResetClick} 
                    size="small"
                    startIcon={<RefreshIcon />}
                    disabled={isOverallLoading}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    リセット
                  </Button>
              </Stack>
            </Box>
            
            <StaffCalendarView 
              sortedStaffList={sortedStaffList} 
              onCellClick={handleCellClick} 
              staffHolidayRequirements={staffHolidayRequirements} 
              onHolidayIncrement={handleHolidayIncrement} 
              onHolidayDecrement={handleHolidayDecrement} 
              onStaffNameClick={openClearStaffModal} 
              onDateHeaderClick={handleDateHeaderClick} 
              clickMode={clickMode}
              selectionRange={selectionRange}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseMove={handleCellMouseMove}
              onCellMouseUp={handleCellMouseUp}
              mainCalendarScrollerRef={mainCalendarScrollerRef}
              monthDays={monthDays} 
              onAutoScroll={handleAutoScroll}
            />
          </TabPanel>
          
          {/* --- コンテンツ (Work Slot View) --- */}
          <TabPanel value={tabValue} index={1}>
             <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              mb: 2,
              p: 1,
              border: '1px solid #e0e0e0',
              borderRadius: 2,
              bgcolor: 'background.paper'
            }}>
              <MonthNavigation
                currentYear={currentYear}
                currentMonth={currentMonth}
                onPrevMonth={handleGoToPrevMonth}
                onNextMonth={handleGoToNextMonth}
                isLoading={isOverallLoading}
              />
            </Box>

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

      <FloatingActionMenu
        visible={showFloatingMenu}
        onCopy={() => handleCopy(false)}
        onCut={() => handleCopy(true)}
        onPaste={handlePaste}
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