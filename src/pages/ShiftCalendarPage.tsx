import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Box, Paper, Tabs, Tab, Button, ToggleButton, ToggleButtonGroup,
  Stack, Divider, Tooltip, Typography
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { ActionCreators as UndoActionCreators } from 'redux-undo';
import { db } from '../db/dexie'; 
import { setStaffList } from '../store/staffSlice'; 
import { setPatterns } from '../store/patternSlice';
import { setUnits } from '../store/unitSlice';
import { _syncAssignments } from '../store/assignmentSlice'; 
import { goToNextMonth, goToPrevMonth, _setIsMonthLoading } from '../store/calendarSlice'; 
import type { AppDispatch, RootState } from '../store';
import { getMonthDays, getPrevDateStr } from '../utils/dateUtils'; 

// Components
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
import WeeklyShareModal from '../components/calendar/WeeklyShareModal';
import StaffStatusModal from '../components/calendar/StaffStatusModal';

import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';

// Hooks
import { useStaffBurdenData } from '../hooks/useStaffBurdenData';
import { useDemandMap } from '../hooks/useDemandMap';
import { useUndoRedoKeyboard } from '../hooks/useUndoRedoKeyboard';
import { useCalendarInteractions, CellCoords } from '../hooks/useCalendarInteractions';
import { useShiftCalendarModals } from '../hooks/useShiftCalendarModals';
import { useShiftCalendarLogic } from '../hooks/useShiftCalendarLogic';

// Icons
import EditIcon from '@mui/icons-material/Edit'; 
import HolidayIcon from '@mui/icons-material/BeachAccess'; 
import PaidLeaveIcon from '@mui/icons-material/FlightTakeoff'; 
import SelectAllIcon from '@mui/icons-material/SelectAll'; 
import UndoIcon from '@mui/icons-material/Undo'; 
import RedoIcon from '@mui/icons-material/Redo'; 
import RefreshIcon from '@mui/icons-material/Refresh'; 
import ImageIcon from '@mui/icons-material/Image';

const useDataSync = (currentYear: number, currentMonth: number, monthDays: { dateStr: string }[]) => {
  const dispatch: AppDispatch = useDispatch();
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { staff: staffList } = useSelector((state: RootState) => state.staff);

  useEffect(() => {
    const loadMasterData = async () => {
      console.log('[useDataSync] Loading Master Data...');
      try {
        const [units, patterns, staff] = await Promise.all([
          db.units.toArray(), db.shiftPatterns.toArray(), db.staffList.toArray()
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
        console.error("[useDataSync] Master load failed", e); 
      }
    };
    
    const loadAssignments = async () => {
      if (!monthDays || monthDays.length === 0) return;
      
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
        console.error("[useDataSync] Assignment load failed", e); 
      } finally { 
        dispatch(_setIsMonthLoading(false)); 
      }
    };

    if (unitList.length === 0 || shiftPatterns.length === 0 || staffList.length === 0) {
      loadMasterData();
    }
    loadAssignments();
  }, [dispatch, currentYear, currentMonth, monthDays, unitList.length, shiftPatterns.length, staffList.length]); 
};

const ControlToolbar = React.memo(({
  currentYear, currentMonth, onPrevMonth, onNextMonth, isLoading,
  clickMode, setClickMode, onUndo, canUndo, onRedo, canRedo, onReset, showTools = false, sx, onShareClick
}: any) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, width: '100%', ...sx }}>
      <MonthNavigation currentYear={currentYear} currentMonth={currentMonth} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} isLoading={isLoading} />
      {showTools && setClickMode && (
        <>
          <ToggleButtonGroup value={clickMode} exclusive onChange={(_, newMode) => { if(newMode) setClickMode(newMode); }} size="small" disabled={isLoading} sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <ToggleButton value="normal"><EditIcon fontSize="small" sx={{ mr: 0.5 }} /> 通常</ToggleButton>
            <Divider flexItem orientation="vertical" />
            <ToggleButton value="holiday"><HolidayIcon fontSize="small" sx={{ mr: 0.5 }} /> 公休</ToggleButton>
            <Divider flexItem orientation="vertical" />
            <ToggleButton value="paid_leave"><PaidLeaveIcon fontSize="small" sx={{ mr: 0.5 }} /> 有給</ToggleButton>
            <Divider flexItem orientation="vertical" />
            <ToggleButton value="select"><SelectAllIcon fontSize="small" sx={{ mr: 0.5 }} /> 選択</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={1} alignItems="center">
             <Tooltip title="週間シフト画像を保存"><Button onClick={onShareClick} disabled={isLoading} sx={{ minWidth: 'auto', p: 0.5 }}><ImageIcon fontSize="small" /><Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 'bold' }}>Weekly</Typography></Button></Tooltip>
             <Divider orientation="vertical" flexItem />
             <Button variant="text" size="small" onClick={onUndo} disabled={!canUndo || isLoading} startIcon={<UndoIcon fontSize="small" />} sx={{ minWidth: 'auto', px: 1 }} />
             <Button variant="text" size="small" onClick={onRedo} disabled={!canRedo || isLoading} startIcon={<RedoIcon fontSize="small" />} sx={{ minWidth: 'auto', px: 1 }} />
             <Divider orientation="vertical" flexItem />
             <Button variant="outlined" color="error" onClick={onReset} size="small" startIcon={<RefreshIcon />} disabled={isLoading} sx={{ fontSize: '0.75rem' }}>リセット</Button>
          </Stack>
        </>
      )}
    </Box>
  );
});

function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => { const saved = localStorage.getItem('isBurdenSidebarOpen'); return saved !== null ? JSON.parse(saved) : true; });
  useEffect(() => { localStorage.setItem('isBurdenSidebarOpen', JSON.stringify(isSidebarOpen)); }, [isSidebarOpen]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const mainCalendarScrollerRef = useRef<HTMLElement | null>(null);

  const { past, future, present: { assignments, isSyncing, adjustmentLoading, adjustmentError, analysisLoading, analysisResult, analysisError, patchLoading, patchError, adviceLoading } } = useSelector((state: RootState) => state.assignment);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  const { currentYear, currentMonth, isMonthLoading } = useSelector((state: RootState) => state.calendar);

  const monthDays = useMemo(() => {
    if (isNaN(currentYear) || isNaN(currentMonth)) { const d = new Date(); return getMonthDays(d.getFullYear(), d.getMonth() + 1); }
    return getMonthDays(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  useDataSync(currentYear, currentMonth, monthDays);

  const { staffList: activeStaffList, staffBurdenData, staffHolidayRequirements, updateHolidayRequirement } = useStaffBurdenData(currentYear, currentMonth, monthDays); 
  
  const sortedStaffList = useMemo(() => [...activeStaffList].sort((a, b) => (a.unitId || 'ZZZ').localeCompare(b.unitId || 'ZZZ') || a.name.localeCompare(b.name)), [activeStaffList]);
  
  const demandMap = useDemandMap(monthDays); 

  const {
    clickMode, setClickMode, 
    selectionRange, setSelectionRange,
    handleCellClick: handleInteractionCellClick, 
    handleCopy, handlePaste,
    invalidateSyncLock,
  } = useCalendarInteractions(sortedStaffList, monthDays); 

  const { editingTarget, showingGanttTarget, clearingStaff, statusTarget, openAssignModal, openGanttModal, openClearStaffModal, openStatusModal, closeModals, handleClearStaffAssignments } = useShiftCalendarModals();
  const { aiInstruction, setAiInstruction, handleFillRental, handleRunAiAdjustment, handleRunAiDefault, handleRunAiAnalysis, handleRunAiHolidayPatch, handleResetClick, handleClearError, handleClearAnalysis } = useShiftCalendarLogic(currentYear, currentMonth, monthDays, activeStaffList, staffHolidayRequirements, demandMap);

  useUndoRedoKeyboard(invalidateSyncLock); 

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => { setTabValue(newValue); setClickMode('normal'); }, [setClickMode]);
  const handleCellClick = useCallback((e: React.MouseEvent | React.TouchEvent, date: string, staffIdOrUnitId: string | null, staffIndex?: number, dateIndex?: number) => {
    if (tabValue === 1) { openGanttModal(date, staffIdOrUnitId); return; }
    if (staffIdOrUnitId && staffIndex !== undefined && dateIndex !== undefined) {
      if (clickMode === 'normal') openAssignModal(date, staffIdOrUnitId);
      else handleInteractionCellClick(e, date, staffIdOrUnitId, staffIndex, dateIndex);
    }
  }, [tabValue, clickMode, openGanttModal, openAssignModal, handleInteractionCellClick]);

  const handleDateHeaderClick = useCallback((date: string) => openGanttModal(date, null), [openGanttModal]);
  
  const isOverallLoading = isSyncing || adjustmentLoading || patchLoading || isMonthLoading || analysisLoading || adviceLoading;
  
  const handleGoToPrevMonth = useCallback(() => { if (past.length > 0 && !window.confirm("移動するとデータが固定されます。")) return; dispatch(goToPrevMonth()); }, [past.length, dispatch]);
  const handleGoToNextMonth = useCallback(() => { if (past.length > 0 && !window.confirm("移動するとデータが固定されます。")) return; dispatch(goToNextMonth()); }, [past.length, dispatch]);

  const handleSelectionChange = useCallback((range: { start: CellCoords, end: CellCoords } | null) => {
    if (setSelectionRange) setSelectionRange(range);
  }, [setSelectionRange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: '24px', gap: 2 }}>
      <Box sx={{ display: 'flex', flexGrow: 1, gap: 2, minHeight: 0 }}>
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', pl: 2 }}>
            <Tabs value={tabValue} onChange={handleTabChange} sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 1 } }}>
              <Tab label="スタッフビュー" />
              <Tab label="勤務枠ビュー" />
            </Tabs>
          </Box>
          
          <TabPanel value={tabValue} index={0}>
            <ControlToolbar
              currentYear={currentYear} currentMonth={currentMonth}
              onPrevMonth={handleGoToPrevMonth} onNextMonth={handleGoToNextMonth}
              isLoading={isOverallLoading} showTools={true}
              clickMode={clickMode} setClickMode={setClickMode}
              onUndo={() => dispatch(UndoActionCreators.undo())} canUndo={past.length > 0}
              onRedo={() => dispatch(UndoActionCreators.redo())} canRedo={future.length > 0}
              onReset={handleResetClick} sx={{ bgcolor: 'background.paper' }} 
              onShareClick={() => setIsShareModalOpen(true)}
            />
            <StaffCalendarView 
              sortedStaffList={sortedStaffList} onCellClick={handleCellClick} 
              staffHolidayRequirements={staffHolidayRequirements} 
              onStatusCellClick={openStatusModal}
              onStaffNameClick={openClearStaffModal} onDateHeaderClick={handleDateHeaderClick} 
              clickMode={clickMode} selectionRange={selectionRange} onSelectionChange={handleSelectionChange}
              mainCalendarScrollerRef={mainCalendarScrollerRef} monthDays={monthDays}
              onCopy={() => handleCopy(false)} 
              onCut={() => handleCopy(true)} 
              onPaste={handlePaste}
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <ControlToolbar currentYear={currentYear} currentMonth={currentMonth} onPrevMonth={handleGoToPrevMonth} onNextMonth={handleGoToNextMonth} isLoading={isOverallLoading} showTools={false} />
            <Box sx={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
              <WorkSlotCalendarView onCellClick={(date, unitId) => handleCellClick({ shiftKey: false } as React.MouseEvent, date, unitId)} demandMap={demandMap} monthDays={monthDays} />
            </Box>
          </TabPanel>
        </Paper>
        <BurdenSidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} staffBurdenData={staffBurdenData} />
      </Box>

      <AiSupportPane instruction={aiInstruction} onInstructionChange={setAiInstruction} isLoading={adjustmentLoading || patchLoading} error={adjustmentError || patchError} onClearError={handleClearError} onExecuteDefault={handleRunAiDefault} onExecuteCustom={handleRunAiAdjustment} isAnalysisLoading={analysisLoading} analysisResult={analysisResult} analysisError={analysisError} onClearAnalysis={handleClearAnalysis} onExecuteAnalysis={handleRunAiAnalysis} onFillRental={handleFillRental} onForceAdjustHolidays={handleRunAiHolidayPatch} isOverallDisabled={isOverallLoading} />
      <FloatingActionMenu visible={clickMode === 'select' && !!selectionRange} onCopy={() => handleCopy(false)} onCut={() => handleCopy(true)} onPaste={handlePaste} />
      
      <AssignPatternModal target={editingTarget} allStaff={activeStaffList} allPatterns={shiftPatterns} allUnits={unitList} allAssignments={assignments} burdenData={Array.from(staffBurdenData.values())} onClose={closeModals} />
      <DailyUnitGanttModal target={showingGanttTarget} onClose={closeModals} allAssignments={assignments} demandMap={demandMap} monthDays={monthDays} />
      <ClearStaffAssignmentsModal staff={clearingStaff} onClose={closeModals} onClear={handleClearStaffAssignments} />
      <WeeklyShareModal open={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} monthDays={monthDays} staffList={sortedStaffList} assignments={assignments} shiftPatterns={shiftPatterns} />
      
      <StaffStatusModal 
        staff={statusTarget} 
        isOpen={!!statusTarget} 
        onClose={closeModals} 
        onSave={updateHolidayRequirement} 
        currentSetting={statusTarget ? staffHolidayRequirements.get(statusTarget.staffId) : undefined}
        monthDays={monthDays} 
      />
    </Box>
  );
}

export default ShiftCalendarPage;