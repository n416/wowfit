import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Box, Paper, Tabs, Tab, 
  Button,
  ToggleButton, ToggleButtonGroup,
  IconButton
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { ActionCreators as UndoActionCreators } from 'redux-undo';
import { 
  db, 
} from '../db/dexie'; 
import { setStaffList } from '../store/staffSlice'; 
import { setPatterns } from '../store/patternSlice';
import { setUnits } from '../store/unitSlice';
import { 
  setAssignments,
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

// (TabPanel 定義は削除済み)

// --- メインコンポーネント ---
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // (ref定義 - 変更なし)
  const workAreaRef = useRef<HTMLDivElement | null>(null);
  const mainCalendarScrollerRef = useRef<HTMLElement | null>(null);

  // (グローバル状態の取得 - 変更なし)
  const { 
    past, 
    future,
    present: {
      assignments, 
      adjustmentLoading, adjustmentError,
      analysisLoading, analysisResult, analysisError,
      patchLoading, patchError
    }
  } = useSelector((state: RootState) => state.assignment);
  
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  
  // (計算フック - 変更なし)
  const {
    staffList: activeStaffList,
    staffBurdenData,
    staffHolidayRequirements,
    handleHolidayIncrement,
    handleHolidayDecrement
  } = useStaffBurdenData(); 
  
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
  
  const demandMap = useDemandMap(); 

  // (インタラクションフック - 変更なし)
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
  } = useCalendarInteractions(sortedStaffList, workAreaRef, mainCalendarScrollerRef); 

  // (モーダルフック - 変更なし)
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
  
  const unitGroups = useUnitGroups(showingGanttTarget);

  // (AI・自動化ロジックフック - 変更なし)
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
  } = useShiftCalendarLogic();

  // (キーボードショートカットフック - 変更なし)
  useUndoRedoKeyboard(invalidateSyncLock); 


  // (DB初期化ロジック - 変更なし)
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

  // (タブ切り替え - 変更なし)
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setClickMode('normal'); 
  };

  // (handleCellClick - 変更なし)
  const handleCellClick = (
    e: React.MouseEvent, 
    date: string, 
    staffIdOrUnitId: string | null, 
    staffIndex?: number, 
    dateIndex?: number
  ) => {
    // 勤務枠ビュー (tabValue === 1)
    if (tabValue === 1) {
      openGanttModal(date, staffIdOrUnitId);
      return;
    }

    // スタッフビュー (tabValue === 0)
    if (staffIdOrUnitId && staffIndex !== undefined && dateIndex !== undefined) {
      if (clickMode === 'normal' && !staffIdOrUnitId.startsWith('WA_STAFF_')) {
        openAssignModal(date, staffIdOrUnitId);
      } else {
        handleInteractionCellClick(e, date, staffIdOrUnitId, staffIndex, dateIndex);
      }
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
      
      {/* (上部エリア - 変更なし) */}
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
          {/* (タブヘッダーとリセット/UNDOボタン - 変更なし) */}
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
                onClick={() => {
                  dispatch(UndoActionCreators.undo());
                  invalidateSyncLock();
                }} 
                disabled={past.length === 0}
              >
                <UndoIcon />
              </IconButton>
              <IconButton 
                title="やり直す (Ctrl+Y)"
                onClick={() => {
                  dispatch(UndoActionCreators.redo());
                  invalidateSyncLock();
                }} 
                disabled={future.length === 0}
              >
                <RedoIcon />
              </IconButton>
              
              <Button 
                variant="outlined" 
                color="error" 
                onClick={handleResetClick} 
                size="small"
                sx={{ ml: 1 }}
              >
                アサインをリセット
              </Button>
            </Box>
          </Box>
          
          {/* タブパネル */}
          <TabPanel value={tabValue} index={0}>
            {/* (ToggleButtonGroup - 変更なし) */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: '0 24px 16px 24px' }}>
              <h6 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 500 }}>
                スタッフビュー（カレンダー）
              </h6>
              
              <ToggleButtonGroup
                value={clickMode}
                exclusive
                onChange={(_, newMode) => { 
                  if(newMode) {
                    setClickMode(newMode as any); 
                  }
                }}
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
                <ToggleButton value="select" title="セル選択モード (Ctrl+C, V, X)">
                  <SelectAllIcon />
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            
            {/* (StaffCalendarView - 変更なし) */}
            <StaffCalendarView 
              sortedStaffList={sortedStaffList} 
              onCellClick={handleCellClick} 
              staffHolidayRequirements={staffHolidayRequirements} 
              onHolidayIncrement={handleHolidayIncrement} 
              onHolidayDecrement={handleHolidayDecrement} 
              onStaffNameClick={openClearStaffModal} 
              clickMode={clickMode}
              activeCell={activeCell}
              selectionRange={selectionRange}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseMove={handleCellMouseMove}
              onCellMouseUp={handleCellMouseUp}
              workAreaRef={workAreaRef} 
              mainCalendarScrollerRef={mainCalendarScrollerRef}
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ p: 3, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
              <WorkSlotCalendarView 
                // ★★★ ここが修正点です ★★★
                // new MouseEvent('click') -> { shiftKey: false } as React.MouseEvent
                onCellClick={(date, unitId) => handleCellClick({ shiftKey: false } as React.MouseEvent, date, unitId)}
                // ★★★ 修正ここまで ★★★
                demandMap={demandMap} 
              />
            </Box>
          </TabPanel>
        </Paper>

        {/* (サイドバー - 変更なし) */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData} 
        />

      </Box> {/* 上部エリアここまで */}


      {/* (AIサポートパネル - 変更なし) */}
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
      />


      {/* (モーダル群 - 変更なし) */}
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
        unitGroups={unitGroups} 
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