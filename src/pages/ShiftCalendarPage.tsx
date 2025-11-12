import React, { useEffect, useState } from 'react';
import { 
  Box, Paper, Typography, Tabs, Tab, TextField, Button, 
  CircularProgress, Alert, List, ListItem, ListItemText, Avatar, Chip,
  Tooltip, ListSubheader,
  Dialog, DialogTitle, DialogContent, DialogActions, ListItemButton,
  Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Collapse, // ★ v5.7 追加
  IconButton // ★ v5.7 追加
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
import { setAssignments, clearAdvice, fetchAssignmentAdvice } from '../store/assignmentSlice'; 
import type { AppDispatch, RootState } from '../store';
import Dexie from 'dexie'; // (v5.3: Dexieエラー型判定用)

// ★★★↓ コンポーネントのインポートを修正 ↓★★★
import StaffCalendarView from '../components/calendar/StaffCalendarView';
import WorkSlotCalendarView from '../components/calendar/WorkSlotCalendarView';
// ★★★↓ 共通ユーティリティのインポートを追加 ↓★★★
import { MONTH_DAYS } from '../utils/dateUtils';

// ★★★ v5.7 追加: 折りたたみ用アイコン ★★★
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';


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
      <Box sx={{ p: 3, overflow: 'auto' }}>{children}</Box>
    </div>
  );
}

// ★★★ v5.3: DataManagementPageからモックデータをコピー ★★★
const getDefaultDemand = (): number[] => {
  return Array(24).fill(0);
};
const MOCK_PATTERNS_V5: IShiftPattern[] = [
  { patternId: 'SA', name: '早出勤務', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '06:30', endTime: '15:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'A', name: '早出勤務1', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'AA', name: '早出勤務1’', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '有', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'A2', name: '早出勤務2', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '07:30', endTime: '16:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: '半', name: '半勤', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '07:00', endTime: '11:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半半', name: '半勤’', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '有', startTime: '07:00', endTime: '11:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半1', name: '半勤1', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '08:00', endTime: '12:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半2', name: '半勤2', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '08:30', endTime: '12:30', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半3', name: '半勤3', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '09:00', endTime: '13:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半4', name: '半勤4', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '12:00', endTime: '16:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半5', name: '半勤5', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '13:00', endTime: '17:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半6', name: '半勤6', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '13:00', endTime: '17:30', breakDurationMinutes: 0, durationHours: 4.5, isNightShift: false, crossesMidnight: false },
  { patternId: '半7', name: '半勤7', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '16:00', endTime: '20:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半8', name: '半勤8', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '17:00', endTime: '21:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半88', name: '半勤8’', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '有', startTime: '17:00', endTime: '21:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: 'C2', name: '日勤1', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'CC2', name: '日勤1’', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '有', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'C', name: '日勤2', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '08:30', endTime: '17:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'CC', name: '日勤2’', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '有', startTime: '08:30', endTime: '17:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'C3', name: '日勤3', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '09:30', endTime: '18:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'C4', name: '日勤4', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '10:00', endTime: '19:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E', name: '遅出', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '12:00', endTime: '21:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'EE', name: '遅出’', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '有', startTime: '12:00', endTime: '21:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E2', name: '遅出1', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '10:30', endTime: '19:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E3', name: '遅出2', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '11:00', endTime: '20:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E4', name: '遅出3', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '11:30', endTime: '20:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E5', name: '遅出4', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '12:30', endTime: '21:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'N', name: '夜勤1', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '16:00', endTime: '09:30', breakDurationMinutes: 90, durationHours: 16, isNightShift: true, crossesMidnight: true },
  { patternId: 'N3', name: '夜勤2', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'NN3', name: '夜勤2’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '有', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'SN3', name: '夜勤2’’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'N2', name: '夜勤3', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '21:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 8, isNightShift: true, crossesMidnight: true },
  { patternId: 'SN2', name: '夜勤3’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '21:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 8, isNightShift: true, crossesMidnight: true },
  { patternId: 'N4', name: '夜勤4', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '18:00', endTime: '08:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'SN4', name: '夜勤4’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '18:00', endTime: '08:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: '公休', name: '公休', mainCategory: '休み', workType: 'StatutoryHoliday', crossUnitWorkType: '-', startTime: '00:00', endTime: '00:00', breakDurationMinutes: 0, durationHours: 0, isNightShift: false, crossesMidnight: false },
  { patternId: '有給', name: '有給休暇', mainCategory: '休み', workType: 'PaidLeave', crossUnitWorkType: '-', startTime: '00:00', endTime: '00:00', breakDurationMinutes: 0, durationHours: 0, isNightShift: false, crossesMidnight: false },
  { patternId: '会議', name: '外部会議', mainCategory: 'その他', workType: 'Meeting', crossUnitWorkType: '-', startTime: '09:00', endTime: '17:00', breakDurationMinutes: 0, durationHours: 8, isNightShift: false, crossesMidnight: false },
];
const MOCK_UNITS_V5: IUnit[] = [
  { unitId: 'U01', name: 'ユニットA', demand: [
    1, 1, 1, 1, 1, 1, 2, 2, // 0-7時
    3, 3, 3, 3, 2, 2, 2, 2, // 8-15時
    2, 2, 2, 1, 1, 1, 1, 1  // 16-23時
  ]},
  { unitId: 'U02', name: 'ユニットB', demand: [
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, // 0-7時
    2, 2, 2, 2, 2, 2, 1, 1, // 8-15時
    1, 1, 1, 1, 1, 1, 0.5, 0.5 // 16-23時
  ]},
];
const getDefaultConstraints = (): IStaffConstraints => ({
  maxConsecutiveDays: 5,
  minIntervalHours: 12,
});
// ★★★ v5.4 修正: availablePatternIds から 「公休」「有給」を削除 ★★★
const MOCK_STAFF_V4: IStaff[] = [
  { staffId: 's001', name: '夜勤さんX', employmentType: 'FullTime', skills: ['Leader'], unitId: 'U01', 
    availablePatternIds: ['N', 'NN3', 'N2', 'N4', 'SN3', 'SN2', 'SN4'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤専門' },
  { staffId: 's002', name: '夜勤さんY', employmentType: 'FullTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['N', 'NN3', 'N2', 'N4', 'SN3', 'SN2', 'SN4'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤専門' },
  { staffId: 's003', name: '日勤Aさん', employmentType: 'FullTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE', 'C2', 'C3', 'C4', 'E2', 'E3', 'E4', 'E5', 'SA'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's004', name: '日勤Bさん', employmentType: 'FullTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's005', name: '日勤Cさん', employmentType: 'FullTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's006', name: '日勤Dさん', employmentType: 'FullTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's007', name: 'パートNさん', employmentType: 'PartTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's008', name: 'パートOさん', employmentType: 'PartTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's009', name: 'パートPさん', employmentType: 'PartTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's010', name: 'パートQさん', employmentType: 'PartTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
];
// ★★★ (v5.3) モックデータここまで ★★★


// (MONTH_DAYS, WorkSlotCalendarView, StaffCalendarView の定義はすべて削除済み)


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
  const { assignments, adviceLoading, adviceError, adviceResult } = useSelector((state: RootState) => state.assignment);

  // v5版: 手動調整ダイアログ用の State (対象が「スタッフ」と「日付」)
  const [editingTarget, setEditingTarget] = useState<{ date: string; staff: IStaff; } | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);


  const staffMap = React.useMemo(() => new Map(staffList.map((s: IStaff) => [s.staffId, s])), [staffList]);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // v5 負担データ
  const staffBurdenData = React.useMemo(() => {
    // ★★★ v5.3: 負担マップの初期化 (バグ修正) ★★★
    const burdenMap = new Map<string, {
        staffId: string; name: string; employmentType: 'FullTime' | 'PartTime';
        assignmentCount: number; nightShiftCount: number; totalHours: number; weekendCount: number;
        maxHours: number;
    }>();

    staffList.forEach((s: IStaff) => {
      burdenMap.set(s.staffId, { 
        staffId: s.staffId, name: s.name, employmentType: s.employmentType,
        assignmentCount: 0, nightShiftCount: 0, totalHours: 0, weekendCount: 0,
        // ★★★ v5.3: constraints が undefined でないかチェック ★★★
        maxHours: (s.constraints?.maxConsecutiveDays || 5) * 8 * 4, // (※仮の月間最大)
      });
    });
    // ★★★ v5.3: バグ修正ここまで ★★★

    for (const assignment of assignments) {
      if (assignment.staffId && assignment.patternId) {
        const staffData = burdenMap.get(assignment.staffId);
        const pattern = patternMap.get(assignment.patternId);
        if (staffData && pattern && pattern.workType === 'Work') { // 労働のみカウント
          staffData.assignmentCount++;
          staffData.totalHours += pattern.durationHours;
          if (pattern.isNightShift) staffData.nightShiftCount++;
          const dayOfWeek = new Date(assignment.date.replace(/-/g, '/')).getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) staffData.weekendCount++;
        }
      }
    }
    return burdenMap;
  }, [assignments, staffList, patternMap]);


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

  // ★★★ v5.8 修正: 「公休配置」ロジックをデマンド・バランス考慮型に変更 ★★★
  const handleHolidayPlacementClick = async () => {
    alert("「公休」を自動配置します。\n(v5.8: デマンドの「公休取得可能枠」と「7日ごと」のバランスを考慮して配置)");
    
    // --- Step 1: 公休取得可能枠の計算 ---
    const staffCount = staffList.length;
    const holidayCapacityMap = new Map<string, number>();
    
    for (const day of MONTH_DAYS) {
      let peakDemand = 0;
      // 0時から23時までのピークデマンドを計算
      for (let hour = 0; hour < 24; hour++) {
        let demandAtHour = 0;
        for (const unit of unitList) {
          demandAtHour += (unit.demand && unit.demand[hour]) || 0;
        }
        if (demandAtHour > peakDemand) {
          peakDemand = demandAtHour;
        }
      }
      // 公休枠 = スタッフ総数 - ピークデマンド
      holidayCapacityMap.set(day.dateStr, staffCount - peakDemand);
    }

    // --- Step 2: 既存の非公休アサイン（有給など）を反映 ---
    // (※手動の「有給」「会議」などは保持)
    const newAssignments = assignments.filter(a => {
      const p = patternMap.get(a.patternId);
      return p && p.workType !== 'StatutoryHoliday'; // 既存の公休以外は保持
    });
    
    // 既存アサインで枠を消費
    for (const assignment of newAssignments) {
      const currentCapacity = holidayCapacityMap.get(assignment.date) || 0;
      if (currentCapacity > 0) {
        holidayCapacityMap.set(assignment.date, currentCapacity - 1);
      }
    }
    
    // ヘルパー：特定の日が配置可能かチェック
    const isDayPlacable = (staffId: string, dateStr: string) => {
      if (!dateStr) return false;
      // 枠があるか？
      if ((holidayCapacityMap.get(dateStr) || 0) <= 0) return false;
      // 既にアサイン（有給など）がないか？
      if (newAssignments.some(a => a.staffId === staffId && a.date === dateStr)) return false;
      return true;
    };
    
    // ヘルパー：配置を実行
    const placeHoliday = (staffId: string, dateStr: string) => {
      newAssignments.push({ 
        date: dateStr, 
        staffId: staffId, 
        patternId: '公休',
        unitId: null 
      });
      const currentCapacity = holidayCapacityMap.get(dateStr) || 0;
      holidayCapacityMap.set(dateStr, currentCapacity - 1);
    };

    // --- Step 3: 公休の配置 ---
    // (※v5.8時点では、常勤・パートの区別はせず全員に適用)
    for (const staff of staffList) {
      let dayCounter = 0; // (連勤防止のための簡易カウンター)
      
      for (let i = 0; i < MONTH_DAYS.length; i++) {
        const day = MONTH_DAYS[i];
        dayCounter++;

        // (※既に他のアサインがなければ)
        if (newAssignments.some(a => a.staffId === staff.staffId && a.date === day.dateStr)) {
          dayCounter = 0; // (アサインがあるので連勤リセット)
          continue;
        }

        const isSunday = day.dayOfWeek === 0;
        const is7thDay = (dayCounter >= 7); // 7日目 *以降* let placed = false;
        
        // (A) 日曜 または 7日目以降 の場合、配置を試行
        if (isSunday || is7thDay) {
          if (isDayPlacable(staff.staffId, day.dateStr)) {
            // (A-1) 理想: その日に配置
            placeHoliday(staff.staffId, day.dateStr);
            placed = true;
          } else {
            // (B) ずらし配置: 理想日が枠不足の場合、前後を探す (土曜 -> 月曜)
            const prevDayStr = MONTH_DAYS[i-1]?.dateStr;
            const nextDayStr = MONTH_DAYS[i+1]?.dateStr;
            
            if (isDayPlacable(staff.staffId, prevDayStr)) {
              placeHoliday(staff.staffId, prevDayStr);
              placed = true;
            } else if (isDayPlacable(staff.staffId, nextDayStr)) {
              placeHoliday(staff.staffId, nextDayStr);
              placed = true;
              i++; // (※月曜に配置した場合、次のループは火曜から)
            }
          }
        }
        
        if (placed) {
          dayCounter = 0; // 公休で連勤リセット
        }
        
      } // (dayループ)
    } // (staffループ)
    
    try {
      await db.assignments.clear(); 
      await db.assignments.bulkPut(newAssignments);
      dispatch(setAssignments(newAssignments));
    } catch (e) {
      console.error("公休の配置に失敗:", e);
    }
  };
  // ★★★ v5.8 修正ここまで ★★★


  // ★★★ v5.2版: ヘルパー関数 (v5.2のざっくり埋めるで使用) ★★★
  const getEndTime = (dateStr: string, pattern: IShiftPattern) => {
    const dateTime = new Date(`${dateStr.replace(/-/g, '/')} ${pattern.endTime}`);
    if (pattern.crossesMidnight) {
      dateTime.setDate(dateTime.getDate() + 1);
    }
    return dateTime;
  };
  const getStartTime = (dateStr: string, pattern: IShiftPattern) => {
    return new Date(`${dateStr.replace(/-/g, '/')} ${pattern.startTime}`);
  };
  
  // ★★★ v5.2版: ステップ2「ざっくり埋める」 (ロジック実装) ★★★
  // ★★★ v5.5 バグ修正適用済み ★★★
  const handleRoughFillClick = async () => {
    if (unitList.length === 0) {
      alert("先に「データ管理」でユニットとデマンドを設定してください。");
      return;
    }

    // 1. Demand (必要な労働枠) を計算
    const demandMap = new Map<string, number>(); 
    for (const day of MONTH_DAYS) {
      for (const unit of unitList) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day.dateStr}_${unit.unitId}_${hour}`;
          const requiredStaff = (unit.demand && unit.demand[hour]) || 0; 
          demandMap.set(key, requiredStaff);
        }
      }
    }

    // 2. 既存のアサイン（公休など）を取得
    let newAssignments = assignments.filter(a => {
      const p = patternMap.get(a.patternId);
      return p && p.workType !== 'Work'; // 労働以外(公休/有給)は保持
    });
    
    const staffAssignments = new Map<string, IAssignment[]>();
    staffList.forEach(s => staffAssignments.set(s.staffId, []));
    newAssignments.forEach(a => { // (公休・有給のみ)
      if(staffAssignments.has(a.staffId)) {
        staffAssignments.get(a.staffId)!.push(a);
      }
    });

    // 3. 優先度リスト (常勤 -> パート)
    const staffPriorityList = [
      ...staffList.filter(s => s.employmentType === 'FullTime'), // 優先度4
      ...staffList.filter(s => s.employmentType === 'PartTime'), // 優先度5
    ];

    // 4. 全日付 x 全ユニット x 全時間帯 をループして Demand をチェック
    for (const day of MONTH_DAYS) {
      for (const unit of unitList) {
        for (let hour = 0; hour < 24; hour++) {
          
          const demandKey = `${day.dateStr}_${unit.unitId}_${hour}`;
          const required = demandMap.get(demandKey) || 0;
          if (required <= 0) continue; // この時間帯にDemandなし

          // (※カバレッジ計算: この時間帯にアサイン済みの人数)
          let actual = 0;
          for (const a of newAssignments) {
            const p = patternMap.get(a.patternId);
            if (a.unitId === unit.unitId && p && p.workType === 'Work') {
              
              // ★★★ v5.5 修正: 終了時間が 9:30 のように分を持つ場合、次の時間枠までカバーするよう修正 ★★★
              const startH = Number(p.startTime.split(':')[0]);
              const [endH_raw, endM_raw] = p.endTime.split(':').map(Number);
              const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw;
              // ★★★ 修正ここまで ★★★
              
              if (p.crossesMidnight) {
                if (a.date === day.dateStr && startH <= hour) { // 1日目 (16:00-23:00)
                  actual++;
                }
                const prevDate = new Date(day.dateStr.replace(/-/g, '/'));
                prevDate.setDate(prevDate.getDate() - 1);
                const prevDateStr = prevDate.toISOString().split('T')[0];
                // ★★★ v5.5 修正: endH を (パースしなおした) endH に変更 ★★★
                if (a.date === prevDateStr && hour < endH) { // 2日目 (00:00-07:00)
                  actual++;
                }
              } else {
                // ★★★ v5.5 修正: startH, endH を (パースしなおした) startH, endH に変更 ★★★
                if (a.date === day.dateStr && startH <= hour && hour < endH) {
                  actual++;
                }
              }
            }
          }

          // 4b. Demand を Actual が満たしていない場合のみアサイン試行
          if (actual < required) {
            
            // 4c. 候補者（常勤優先）をループ
            for (const staff of staffPriorityList) {
              
              // 4d. この時間帯(hour)をカバーできる、勤務可能なパターンを探す
              const possiblePattern = shiftPatterns.find(p => {
                if (p.workType !== 'Work' || !staff.availablePatternIds.includes(p.patternId)) return false;
                if (staff.unitId !== unit.unitId && p.crossUnitWorkType !== '有') return false;
                
                // (時間帯チェック)
                // ★★★ v5.5 修正: 終了時間が 9:30 のように分を持つ場合、次の時間枠までカバーするよう修正 ★★★
                const startH = Number(p.startTime.split(':')[0]);
                const [endH_raw, endM_raw] = p.endTime.split(':').map(Number);
                const endH = (endM_raw > 0) ? endH_raw + 1 : endH_raw;
                // ★★★ 修正ここまで ★★★

                if (p.crossesMidnight) {
                  return (startH <= hour); // (1日目)
                } else {
                  // ★★★ v5.5 修正: endH を (パースしなおした) endH に変更 ★★★
                  return (startH <= hour && hour < endH);
                }
              });
              if (!possiblePattern) continue; // このスタッフはNG

              // 4e. レベル1 (連勤/インターバル/休日) 絞り込み
              const myAssignments = staffAssignments.get(staff.staffId) || [];
              if (myAssignments.some(a => a.date === day.dateStr)) continue; // (同日アサイン済み)
              
              const sortedAssignments = [...myAssignments].sort((a,b) => a.date.localeCompare(b.date));
              const lastAssignment = sortedAssignments[sortedAssignments.length - 1];
              
              if (lastAssignment) {
                const lastPattern = lastAssignment.patternId ? patternMap.get(lastAssignment.patternId) : null;
                if (lastPattern && (lastPattern.workType === 'Work' || lastPattern.workType === 'Meeting')) { // (労働と会議のみインターバル考慮)
                  const lastEndTime = getEndTime(lastAssignment.date, lastPattern);
                  const currentStartTime = getStartTime(day.dateStr, possiblePattern);
                  const hoursBetween = (currentStartTime.getTime() - lastEndTime.getTime()) / (1000 * 60 * 60);
                  if (hoursBetween < staff.constraints.minIntervalHours) continue; 
                }
              }
              
              let consecutiveDays = 0;
              for (let i = 1; i <= staff.constraints.maxConsecutiveDays; i++) {
                const checkDate = new Date(day.dateStr.replace(/-/g, '/')); 
                checkDate.setDate(checkDate.getDate() - i);
                const checkDateStr = checkDate.toISOString().split('T')[0];
                if (myAssignments.some(a => a.date === checkDateStr && patternMap.get(a.patternId)?.workType === 'Work')) {
                  consecutiveDays++;
                } else {
                  break; 
                }
              }
              if (consecutiveDays >= staff.constraints.maxConsecutiveDays) continue; 

              // 4g. アサイン決定
              const newAssignment: Omit<IAssignment, 'id'> = {
                date: day.dateStr,
                staffId: staff.staffId,
                patternId: possiblePattern.patternId,
                unitId: unit.unitId,
              };
              const tempId = await db.assignments.add(newAssignment); 
              newAssignments.push({ ...newAssignment, id: tempId });
              staffAssignments.get(staff.staffId)!.push({ ...newAssignment, id: tempId });
              
              break; // このスタッフで埋まったので次の時間帯へ
            } // (スタッフ優先度ループ)
          } // (if actual < required)
        } // (hourループ)
      } // (unitループ)
    } // (dayループ)
    
    // 5. 最終結果をReduxに保存
    dispatch(setAssignments(newAssignments));
    alert("「ざっくり埋める」が完了しました。\n(※アルゴリズムはv5.2簡易版です)");
  };

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
        const existing = assignments.find(a => a.date === date && a.staffId === staff.staffId);
        setSelectedPatternId(existing?.patternId || null);
        dispatch(clearAdvice());
      }
    } else { // 勤務枠ビュー
      alert("勤務枠ビューからの手動調整は未実装です。\n(「スタッフビュー」からセルをクリックして調整してください)");
    }
  };

  const handleCloseDialog = () => {
    setEditingTarget(null);
    setSelectedPatternId(null);
  };

  // v4版: 担当者決定ロジック
  const handleAssignPattern = async () => {
    if (!editingTarget) return;
    const { date, staff } = editingTarget;
    try {
      const existing = await db.assignments
        .where('[date+staffId]')
        .equals([date, staff.staffId])
        .toArray();
      if (existing.length > 0) {
        await db.assignments.bulkDelete(existing.map(a => a.id!));
      }
      if (selectedPatternId) {
        const pattern = patternMap.get(selectedPatternId);
        if (pattern) {
          const newAssignment: Omit<IAssSignment, 'id'> = {
            date: date,
            staffId: staff.staffId,
            patternId: selectedPatternId,
            unitId: (pattern.workType === 'Work') ? staff.unitId : null
          };
          await db.assignments.add(newAssignment);
        }
      }
      const allAssignments = await db.assignments.toArray();
      dispatch(setAssignments(allAssignments));
    } catch (e) {
      console.error("アサインの更新に失敗:", e);
    }
    handleCloseDialog(); 
  };

  // 6. AI助言ボタンのハンドラ
  const handleFetchAdvice = () => {
    if (!editingTarget) return;
    dispatch(fetchAssignmentAdvice({
      targetDate: editingTarget.date,
      targetStaff: editingTarget.staff,
      allStaff: staffList,
      allPatterns: shiftPatterns,
      allUnits: unitList, // (v5: ユニットデマンドを渡す)
      burdenData: Array.from(staffBurdenData.values()),
      allAssignments: assignments,
    }));
  };

  // ★★★ v5.4 修正: ダイアログの選択肢ロジックを修正 ★★★
  // v5.4版: ダイアログで表示する勤務パターン
  // (スタッフ固有の勤務可能パターン + 全員共通の非労働パターン)
  const availablePatternsForStaff = React.useMemo(() => {
    if (!editingTarget?.staff) return [];

    // 1. スタッフが勤務可能なパターンID (['SA', 'A', 'N'] など)
    const staffSpecificPatternIds = editingTarget.staff.availablePatternIds || [];
    
    // 2. 全パターンから「非労働」パターン (['公休', '有給', '会議']) を抽出
    const nonWorkPatternIds = shiftPatterns
      .filter(p => p.workType !== 'Work') // 'Work' 以外
      .map(p => p.patternId);

    // 3. 1と2を合算し、重複を除外
    const combinedIds = [...new Set([...staffSpecificPatternIds, ...nonWorkPatternIds])];

    // 4. IDからパターンオブジェクトに変換し、ソート
    return combinedIds
      .map(pid => patternMap.get(pid))
      .filter((p): p is IShiftPattern => !!p) // (undefinedを除外)
      .sort((a, b) => { // (見やすいようにソート: 労働 -> 非労働)
        if (a.workType === 'Work' && b.workType !== 'Work') return -1;
        if (a.workType !== 'Work' && b.workType === 'Work') return 1;
        if (a.mainCategory === '休み' && b.mainCategory !== '休み') return 1; // 休みを最後
        if (a.mainCategory !== '休み' && b.mainCategory === '休み') return -1;
        return a.patternId.localeCompare(b.patternId);
      });
      
  }, [editingTarget?.staff, shiftPatterns, patternMap]);
  // ★★★ 修正ここまで ★★★


  return (
    // ★★★ v5.7 修正: ページ全体のレイアウトを変更 ★★★
    <Box sx={{ 
      display: 'flex', 
      gap: 2, 
      height: '100%', // 親(App.tsxのBox)から高さを100%受け取る
      p: '24px', // ★ 上下左右のパディング (ヘッダーとの間隔はここで管理)
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
          {/* ★★★↓ 呼び出すコンポーネントを変更 ↓★★★ */}
          <StaffCalendarView 
            onCellClick={handleCellClick} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          {/* ★★★↓ 呼び出すコンポーネントを変更 ↓★★★ */}
          <WorkSlotCalendarView 
            onCellClick={handleCellClick}
            onHolidayPlacementClick={handleHolidayPlacementClick} // (公休配置)
            onRoughFillClick={handleRoughFillClick}
            onResetClick={handleResetClick} // (リセット)
          />
        </TabPanel>
      </Paper>

      {/* サイドバー (折りたたみ可能) */}
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'column', // ★ 縦に並べる
        transition: 'width 0.2s, min-width 0.2s', // アニメーション
        width: isSidebarOpen ? '20vw' : '56px', // ★ 幅を変更 (アイコンボタン幅目安)
        minWidth: isSidebarOpen ? '300px' : '56px', // ★ 最小幅 (20vw だと潰れすぎるため固定値も指定)
      }}>
        
        <Paper sx={{ 
          flexGrow: 1, // ★ Box の高さいっぱいに広がる
          overflow: 'hidden', // ★ 閉じたときにはみ出さないように
          display: 'flex',
          flexDirection: 'column', // ★ 縦に並べる
          p: isSidebarOpen ? 2 : 0, // ★ 閉じている時はパディング削除
        }}>
          {/* 開閉ボタンエリア */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: isSidebarOpen ? 'space-between' : 'center', // ★
            alignItems: 'center',
            mb: isSidebarOpen ? 1 : 0,
            pl: isSidebarOpen ? 1 : 0, // ★
          }}>
            <Collapse in={isSidebarOpen} orientation="horizontal">
              <Typography variant="h6">
                負担の可視化
              </Typography>
            </Collapse>
            <IconButton onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Box>
          
          {/* ★ Collapse で中身を隠す */}
          <Collapse in={isSidebarOpen} sx={{ flexGrow: 1, overflowY: 'auto', minHeight: 0 }}>
            <List dense>
              {Array.from(staffBurdenData.values()).map(staff => {
                const constraints = staffMap.get(staff.staffId)?.constraints;
                const maxHours = (constraints?.maxConsecutiveDays || 5) * 8 * 4; // (※仮の月間最大)
                const hourViolation = staff.totalHours > maxHours; 
                
                return (
                  <ListItem key={staff.staffId} divider>
                    <Avatar sx={{ width: 32, height: 32, mr: 2, fontSize: '0.8rem' }}>
                      {staff.name.charAt(0)}
                    </Avatar>
                    <ListItemText
                      primary={staff.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip label={`計: ${staff.assignmentCount} 回`} size="small" variant="outlined" />
                          <Chip label={`夜: ${staff.nightShiftCount} 回`} size="small" variant="outlined" color={staff.nightShiftCount > 0 ? 'secondary' : 'default'} />
                          <Chip label={`土日: ${staff.weekendCount} 回`} size="small" variant="outlined" />
                          <Chip label={`時: ${staff.totalHours} h`} size="small" variant="outlined" color={hourViolation ? 'error' : 'default'} />
                        </Box>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Collapse>
        </Paper>
      </Box>

      {/* v4版: 手動調整ダイアログ (変更なし) */}
      <Dialog open={!!editingTarget} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          手動アサイン ({editingTarget?.staff.name} / {editingTarget?.date})
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', gap: 2 }}>
          
          {/* 左側: パターン選択リスト */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">1. 勤務パターンを選択</Typography>
            <List dense component={Paper} variant="outlined" sx={{maxHeight: 400, overflow: 'auto'}}>
              <ListItemButton onClick={() => setSelectedPatternId(null)} selected={selectedPatternId === null}>
                <Avatar sx={{ width: 32, height: 32, mr: 2, fontSize: '0.8rem' }}>?</Avatar>
                <ListItemText primary="--- アサインなし ---" />
              </ListItemButton>
              {/* (※スタッフの「勤務可能パターン」 + 「非労働パターン」を表示) */}
              {availablePatternsForStaff.map(pattern => (
                <ListItemButton 
                  key={pattern.patternId}
                  onClick={() => setSelectedPatternId(pattern.patternId)} 
                  selected={selectedPatternId === pattern.patternId}
                >
                  <ListItemText 
                    primary={pattern.patternId} 
                    secondary={pattern.name}
                  />
                  <Chip 
                    label={pattern.workType} 
                    size="small" 
                    color={pattern.workType !== 'Work' ? 'secondary' : 'default'}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          {/* 右側: AI助言エリア */}
          <Box sx={{ flex: 1, borderLeft: '1px solid', borderColor: 'divider', pl: 2 }}>
            <Typography variant="h6" gutterBottom>AI助言</Typography>
            <Button 
              variant="outlined" 
              onClick={handleFetchAdvice} 
              disabled={adviceLoading}
              startIcon={adviceLoading ? <CircularProgress size={16} /> : null}
            >
              {adviceLoading ? '分析中...' : '最適な候補を分析'}
            </Button>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1, minHeight: 150, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
              {adviceError && <Alert severity="error">{adviceError}</Alert>}
              {adviceResult ? (
                <Typography variant="body2">{adviceResult}</Typography>
              ) : (
                !adviceLoading && <Typography variant="body2" color="text.secondary">ボタンを押して助言を求めてください。</Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>キャンセル</Button>
          <Button 
            onClick={handleAssignPattern} // v4ロジック
            variant="contained"
          >
            決定
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default ShiftCalendarPage;