import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Box, Paper, Tabs, Tab, 
  Button,
  ToggleButton, ToggleButtonGroup,
  IconButton,
  Typography 
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
  // ★ 修正: setAssignments を削除
  _syncAssignments
} from '../store/assignmentSlice'; 
import { 
  goToNextMonth, 
  goToPrevMonth, 
  // ★ 修正: setCurrentMonth を削除
  _setIsMonthLoading // ★ インポート
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


// --- メインコンポーネント ---
function ShiftCalendarPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch(); 

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const workAreaRef = useRef<HTMLDivElement | null>(null);
  const mainCalendarScrollerRef = useRef<HTMLElement | null>(null);

  // --- 1. グローバル状態の取得 ---
  
  // (assignment state)
  const { 
    past, 
    future,
    present: {
      assignments, 
      isSyncing, // DB書き込み中
      adjustmentLoading, // ★ 取得
      adjustmentError,
      analysisLoading, // ★ 取得
      analysisResult, 
      analysisError,
      patchLoading, // ★ 取得
      patchError,
      adviceLoading // ★ (Plan E) adviceLoading も取得
    }
  } = useSelector((state: RootState) => state.assignment);
  
  // (他のスライス)
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { units: unitList } = useSelector((state: RootState) => state.unit);
  const { staff: staffList } = useSelector((state: RootState) => state.staff); 
  
  // (calendar state)
  const { 
    currentYear, 
    currentMonth, 
    isMonthLoading // ★ 月読み込み中フラグを取得
  } = useSelector((state: RootState) => state.calendar);

  // (動的に monthDays を計算)
  const monthDays = useMemo(() => {
    // ★ NaNガードを追加
    if (isNaN(currentYear) || isNaN(currentMonth)) {
      // (もしNaNなら、クラッシュを防ぐためデフォルトの月を返す)
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
    invalidateSyncLock, // ★★★ 修正: useCalendarInteractions がダミー関数を返す
  } = useCalendarInteractions(sortedStaffList, workAreaRef, mainCalendarScrollerRef, monthDays); 

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
  } = useShiftCalendarLogic(currentYear, currentMonth, monthDays);

  // (キーボードショートカットフック)
  useUndoRedoKeyboard(invalidateSyncLock); // ★ 修正済みフックを呼び出す


  // ★ (Plan E) ローディング状態の集中監視ログ
  useEffect(() => {
    // このログは、いずれかのローディングフラグが変更されるたびに（UNDO/REDOを含む）実行されます
    console.log(`(Plan E) [StateWatch] Loading flags changed:`, {
      // assignmentSlice
      isSyncing,
      adjustmentLoading,
      patchLoading,
      analysisLoading,
      adviceLoading,
      // calendarSlice
      isMonthLoading,
      // 総合判断
      isOverallLoading: isSyncing || adjustmentLoading || patchLoading || isMonthLoading || analysisLoading || adviceLoading,
    });
  }, [isSyncing, adjustmentLoading, patchLoading, isMonthLoading, analysisLoading, adviceLoading]);
  // ★ (Plan E) ログここまで


  // ★ 4. ページ固有のロジック (データ読み込み - ★ 月遷移のロジックを修正)
  const store = useStore<RootState>(); // (isMonthLoading の最新状態チェック用)
  
  useEffect(() => {
    // (loadMasterData)
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
    
    // (loadAssignments)
    const loadAssignments = async () => {
      // ★ 月データが空か、既に読み込み中なら何もしない
      // (※ store.getState() で最新の isMonthLoading をチェック)
      if (!monthDays || monthDays.length === 0 || store.getState().calendar.isMonthLoading) {
        return;
      }
      
      try {
        // ★ 読み込み開始を通知
        dispatch(_setIsMonthLoading(true)); 

        const firstDay = monthDays[0].dateStr;
        const lastDay = monthDays[monthDays.length - 1].dateStr;

        const assignmentsDB = await db.assignments
          .where('date')
          .between(firstDay, lastDay, true, true)
          .toArray();
        
        // (初回ロードか、月遷移かを staffList.length で判定)
        if (staffList.length === 0) {
          // (初回ロード時は履歴に残さない)
          dispatch(_syncAssignments(assignmentsDB));
        } else {
          // ★★★ 修正: 月遷移時も履歴に登録しない ★★★
          dispatch(_syncAssignments(assignmentsDB));
          
          // ★★★ バグ修正 ★★★
          // 月をまたいだ場合、UNDO履歴が混在すると危険なため、履歴をクリアする
          // (これにより、11月の履歴が12月に影響しなくなる)
          dispatch(UndoActionCreators.clearHistory());
          // ★★★ 修正ここまで ★★★
        }

      } catch (e) {
        console.error(`${currentYear}年${currentMonth}月のアサイン読み込みに失敗:`, e);
      } finally {
        // ★ 成功・失敗に関わらず、読み込み完了を通知
        dispatch(_setIsMonthLoading(false));
      }
    };

    if (unitList.length === 0 || shiftPatterns.length === 0 || staffList.length === 0) {
      loadMasterData();
    }
    loadAssignments();

  }, [dispatch, currentYear, currentMonth, monthDays, unitList.length, shiftPatterns.length, staffList.length, store]); // ★ store を依存配列に追加


  // (タブ切り替え)
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setClickMode('normal'); 
  };

  // (セルクリック振り分け)
  const handleCellClick = (
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
      if (clickMode === 'normal' && !staffIdOrUnitId.startsWith('WA_STAFF_')) {
        openAssignModal(date, staffIdOrUnitId);
      } else {
        handleInteractionCellClick(e, date, staffIdOrUnitId, staffIndex, dateIndex);
      }
    }
  };

  // ★ (Plan E) isOverallLoading の定義を StateWatch と完全に一致
  const isOverallLoading = isSyncing || adjustmentLoading || patchLoading || isMonthLoading || analysisLoading || adviceLoading;

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      p: '24px', 
      gap: 2 
    }}>
      
      {/* (上部エリア) */}
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
          
          {/* (タブヘッダーと月選択UI) */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderBottom: 1, 
            borderColor: 'divider',
            pl: 2
          }}>
            {/* 左側: タブ */}
            <Box sx={{ flexGrow: 1 }}>
              <Tabs value={tabValue} onChange={handleTabChange}>
                <Tab label="スタッフビュー" />
                <Tab label="勤務枠ビュー" />
              </Tabs>
            </Box>
            
            {/* 中央: 月選択 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
              {/* ★ isOverallLoading で無効化 */}
              <IconButton onClick={() => dispatch(goToPrevMonth())} size="small" disabled={isOverallLoading}>
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="h6" component="div" sx={{ minWidth: '150px', textAlign: 'center' }}>
                {/* ★ NaNガード */}
                {isNaN(currentYear) || isNaN(currentMonth) ? '...' : `${currentYear}年 ${currentMonth}月`}
              </Typography>
              {/* ★ isOverallLoading で無効化 */}
              <IconButton onClick={() => dispatch(goToNextMonth())} size="small" disabled={isOverallLoading}>
                <ChevronRightIcon />
              </IconButton>
            </Box>

            {/* 右側: Undo/Redo/リセット */}
            <Box sx={{ flexShrink: 0, pr: 2, display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', flexGrow: 1 }}>
              <IconButton 
                title="元に戻す (Ctrl+Z)"
                onClick={() => {
                  dispatch(UndoActionCreators.undo());
                  // invalidateSyncLock(); // ★ 呼び出しは削除済み
                }} 
                disabled={past.length === 0 || isOverallLoading} // ★ 無効化
              >
                <UndoIcon />
              </IconButton>
              <IconButton 
                title="やり直す (Ctrl+Y)"
                onClick={() => {
                  dispatch(UndoActionCreators.redo());
                  // invalidateSyncLock(); // ★ 呼び出しは削除済み
                }} 
                disabled={future.length === 0 || isOverallLoading} // ★ 無効化
              >
                <RedoIcon />
              </IconButton>
              
              <Button 
                variant="outlined" 
                color="error" 
                onClick={handleResetClick} 
                size="small"
                sx={{ ml: 1 }}
                disabled={isOverallLoading} // ★ 無効化
              >
                アサインをリセット
              </Button>
            </Box>
          </Box>
          
          {/* タブパネル */}
          <TabPanel value={tabValue} index={0}>
            {/* (ToggleButtonGroup) */}
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
                disabled={isOverallLoading} // ★ ローディング中はモード変更不可
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
            
            {/* (StaffCalendarView) */}
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
              monthDays={monthDays} 
            />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ p: 3, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
              {/* (WorkSlotCalendarView) */}
              <WorkSlotCalendarView 
                onCellClick={(date, unitId) => handleCellClick({ shiftKey: false } as React.MouseEvent, date, unitId)}
                demandMap={demandMap} 
                monthDays={monthDays}
              />
            </Box>
          </TabPanel>
        </Paper>

        {/* (サイドバー) */}
        <BurdenSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          staffBurdenData={staffBurdenData} 
        />

      </Box> {/* 上部エリアここまで */}


      {/* (AIサポートパネル) */}
      <AiSupportPane
        instruction={aiInstruction} 
        onInstructionChange={setAiInstruction} 
        
        // ★ (Plan E) 拡張版の isOverallLoading を渡す
        isLoading={isOverallLoading}
        
        error={adjustmentError || patchError}
        onClearError={handleClearError} 
        onExecuteDefault={handleRunAiDefault}     
        onExecuteCustom={handleRunAiAdjustment}  
        
        // ★ (Plan E) 拡張版の isOverallLoading を渡す
        isAnalysisLoading={isOverallLoading}

        analysisResult={analysisResult}
        analysisError={analysisError}
        onClearAnalysis={handleClearAnalysis} 
        onExecuteAnalysis={handleRunAiAnalysis} 
        onFillRental={handleFillRental} 
        onForceAdjustHolidays={handleRunAiHolidayPatch} 
      />


      {/* (モーダル群) */}
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