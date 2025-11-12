import React, { useState, useEffect } from 'react';
import { 
  Box, Paper, Typography, Tabs, Tab, TextField, Button, Select, 
  MenuItem, InputLabel, FormControl, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, IconButton, Checkbox, FormControlLabel,
  Alert,
  Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItem, ListItemButton, ListItemText, Chip, Divider,
  Grid 
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit'; 
import AddIcon from '@mui/icons-material/Add';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
// v5 スキーマの型をインポート
import { 
  db, 
  IStaff, IStaffConstraints, IShiftPattern, IUnit, CrossUnitWorkType, WorkType,
  getDefaultDemand // ★ getDefaultDemand をインポート
} from '../db/dexie'; 
// v5 スライスの Action をインポート
import { addNewStaff, deleteStaff, updateStaff, setStaffList, parseAndSaveConstraints } from '../store/staffSlice'; 
import { addNewPattern, deletePattern, updatePattern, setPatterns } from '../store/patternSlice'; 
// (※ timeSlotRuleSlice はインポートしない)
import { addNewUnit, deleteUnit, updateUnit, setUnits } from '../store/unitSlice';
import Dexie from 'dexie'; // (Dexieエラー型判定用)

// ★★★↓ インポートを修正 ↓★★★
import NewUnitForm from '../components/data/NewUnitForm';
import EditUnitModal from '../components/data/EditUnitModal';
import NewPatternForm from '../components/data/NewPatternForm';
import EditPatternModal from '../components/data/EditPatternModal';
import NewStaffForm from '../components/data/NewStaffForm';
import EditStaffModal from '../components/data/EditStaffModal';
// ★★★↑ インポートを修正 ↑★★★


// TabPanel (変更なし)
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3, overflow: 'auto' }}>{children}</Box>}
    </div>
  );
}

// (getDefaultDemand は削除済み)

// ★★★ v5版: 勤務パターンの初期データ ★★★
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

// ★★★ v5版: ユニットの初期データ (24hデマンド配列を持つ) ★★★
const MOCK_UNITS_V5: IUnit[] = [
  { unitId: 'U01', name: 'ユニットA', demand: [
    1, 1, 1, 1, 1, 1, 2, 2, // 0-7時 (深夜1, 早出1)
    3, 3, 3, 3, 2, 2, 2, 2, // 8-15時 (日勤3)
    2, 2, 2, 1, 1, 1, 1, 1  // 16-23時 (夜勤1, 遅出1)
  ]},
  { unitId: 'U02', name: 'ユニットB', demand: [
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, // 0-7時 (0.5人)
    2, 2, 2, 2, 2, 2, 1, 1, // 8-15時 (日勤2)
    1, 1, 1, 1, 1, 1, 0.5, 0.5 // 16-23時 (夜勤0.5, 遅出0.5)
  ]},
];

// ★★★↓ getDefaultConstraints の定義を削除 ↓★★★
/*
const getDefaultConstraints = (): IStaffConstraints => ({
  maxConsecutiveDays: 5,
  minIntervalHours: 12,
});
*/
// ★★★↑ getDefaultConstraints の定義を削除 ↑★★★

// ★★★ v5.4 修正: availablePatternIds から 「公休」「有給」を削除 ★★★
// v4版: スタッフの初期データ (ご要望の10名)
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


// (NewUnitForm, EditUnitModal, NewPatternForm, EditPatternModal は削除済み)


// ★★★↓ NewStaffForm の定義を削除 ↓★★★
/*
const NewStaffForm: React.FC = () => {
  // ... (中身は src/components/data/NewStaffForm.tsx に移動) ...
};
*/
// ★★★↑ NewStaffForm の定義を削除 ↑★★★

// ★★★↓ EditStaffModal の定義を削除 ↓★★★
/*
interface EditStaffModalProps {
  // ...
}
const EditStaffModal: React.FC<EditStaffModalProps> = ({ staff, onClose, onSave }) => {
  // ... (中身は src/components/data/EditStaffModal.tsx に移動) ...
};
*/
// ★★★↑ EditStaffModal の定義を削除 ↑★★★



// ★★★ データ管理ページ本体 (v5.2) ★★★
function DataManagementPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch();
  
  // v5 スライスのデータを取得
  const unitList = useSelector((state: RootState) => state.unit.units);
  const patternList = useSelector((state: RootState) => state.pattern.patterns);
  const staffList = useSelector((state: RootState) => state.staff.staff);

  // 編集モーダルのState
  const [editingStaff, setEditingStaff] = useState<IStaff | null>(null);
  const [editingPattern, setEditingPattern] = useState<IShiftPattern | null>(null);
  // (※ v5では editingRule は不要)
  const [editingUnit, setEditingUnit] = useState<IUnit | null>(null);

  // v5 スキーマのデータを読み込む
  useEffect(() => {
    const loadData = async () => {
      try {
        const [units, patterns, staff] = await Promise.all([
          db.units.toArray(),
          db.shiftPatterns.toArray(),
          db.staffList.toArray()
        ]);
        
        // (※ v5では timeSlotRules はロードしない)
        // dispatch(setTimeSlotRules([]));

        if (patterns.length === 0) {
          console.log("v5: 勤務パターンが空のため、初期データを書き込みます。");
          await db.shiftPatterns.bulkPut(MOCK_PATTERNS_V5); 
          dispatch(setPatterns(MOCK_PATTERNS_V5));
        } else {
          dispatch(setPatterns(patterns));
        }
        
        if (units.length === 0) {
          console.log("v5: ユニットが空のため、初期データを書き込みます。");
          await db.units.bulkPut(MOCK_UNITS_V5); 
          dispatch(setUnits(MOCK_UNITS_V5));
        } else {
          dispatch(setUnits(units));
        }
        
        if (staff.length === 0) {
           console.log("v5: スタッフが空のため、初期データ (MOCK_STAFF_V4) を書き込みます。");
           await db.staffList.bulkPut(MOCK_STAFF_V4); 
           dispatch(setStaffList(MOCK_STAFF_V4));
        } else {
          console.log("v5: 既存のスタッフデータを読み込みます。");
          dispatch(setStaffList(staff));
        }
        
      } catch (e) {
        console.error("v5: DBデータの読み込み/初期化に失敗:", e);
        if (e instanceof Dexie.UpgradeError) {
          alert("データベースのスキーマ更新に失敗しました。\n開発者ツールで IndexedDB (ShiftWorkAppDB) を手動で削除し、リロードしてください。");
        }
      }
    };
    loadData();
  }, [dispatch]);


  // --- ハンドラ ---
  const handleStaffDelete = (staffId: string) => dispatch(deleteStaff(staffId));
  const handleStaffUpdate = (updatedStaff: IStaff) => {
    dispatch(updateStaff(updatedStaff));
    setEditingStaff(null);
  };
  const handlePatternDelete = (patternId: string) => dispatch(deletePattern(patternId));
  const handlePatternUpdate = (updatedPattern: IShiftPattern) => {
    dispatch(updatePattern(updatedPattern));
    setEditingPattern(null);
  };
  const handleUnitDelete = (unitId: string) => dispatch(deleteUnit(unitId));
  const handleUnitUpdate = (updatedUnit: IUnit) => { 
    dispatch(updateUnit(updatedUnit));
    setEditingUnit(null);
  };
  // (※ v5では TimeSlotRule のハンドラは不要)


  return (
    <Box sx={{ flexGrow: 1, p: '0 24px 24px 24px' }}>
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab label="ユニット・デマンド管理" />
            <Tab label="勤務パターン管理" />
            <Tab label="スタッフ管理" />
            <Tab label="インポート/エクスポート (未)" />
          </Tabs>
        </Box>
        
        {/* ★★★ v5.2: ユニット・デマンド管理タブ ★★★ */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>ユニットの登録</Typography>
          {/* ★★★↓ コンポーネント呼び出しに変更 ↓★★★ */}
          <NewUnitForm />
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>ユニット一覧・デマンド設定</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            ユニットの「編集」ボタンから、各ユニットの「24時間デマンド（時間帯ごとの必要人数）」をブロック単位で設定できます。
          </Alert>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell>ID</TableCell><TableCell>ユニット名</TableCell><TableCell>デマンド(0-3時)</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
              <TableBody>
                {unitList.map((u: IUnit) => (
                  <TableRow key={u.unitId}>
                    <TableCell>{u.unitId}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>
                      {(u.demand || []).slice(0, 4).join(', ')}...
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setEditingUnit(u)} color="primary"><EditIcon /></IconButton>
                      <IconButton size="small" onClick={() => handleUnitDelete(u.unitId)} color="error"><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* ★★★ v5: 勤務パターン管理タブ ★★★ */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>勤務パターンの登録</Typography>
          {/* ★★★↓ コンポーネント呼び出しに変更 ↓★★★ */}
          <NewPatternForm />
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow><TableCell>ID</TableCell><TableCell>名称</TableCell><TableCell>カテゴリ</TableCell><TableCell>時間</TableCell><TableCell>実働</TableCell><TableCell>他ユニット</TableCell><TableCell>タイプ</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
              <TableBody>
                {patternList.map((p: IShiftPattern) => (
                  <TableRow key={p.patternId}>
                    <TableCell>{p.patternId}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.mainCategory}</TableCell>
                    <TableCell>{p.startTime}-{p.endTime}</TableCell>
                    <TableCell>{p.durationHours}h</TableCell>
                    <TableCell>{p.crossUnitWorkType}</TableCell>
                    <TableCell>{p.workType}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setEditingPattern(p)} color="primary"><EditIcon /></IconButton>
                      <IconButton size="small" onClick={() => handlePatternDelete(p.patternId)} color="error"><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* ★★★ v5: スタッフ管理タブ ★★★ */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>新規スタッフの登録</Typography>
          {/* ★★★↓ コンポーネント呼び出しに変更 ↓★★★ */}
          <NewStaffForm />
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow><TableCell>氏名</TableCell><TableCell>雇用形態</TableCell><TableCell>所属ユニット</TableCell><TableCell>勤務可能パターン</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
              <TableBody>
                {staffList.map((staff: IStaff) => (
                  <TableRow key={staff.staffId}>
                    <TableCell>{staff.name}</TableCell>
                    <TableCell>{staff.employmentType}</TableCell>
                    <TableCell>{staff.unitId}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(staff.availablePatternIds || []).join(', ')}
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setEditingStaff(staff)} color="primary"><EditIcon /></IconButton>
                      <IconButton size="small" onClick={() => handleStaffDelete(staff.staffId)} color="error"><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
        
        <TabPanel value={tabValue} index={3}><Typography>インポート/エクスポート（未実装）</Typography></TabPanel>
        
      </Paper>

      {/* 編集モーダルをレンダリング */}
      {/* ★★★↓ コンポーネント呼び出しに変更 ↓★★★ */}
      <EditStaffModal 
        staff={editingStaff}
        onClose={() => setEditingStaff(null)}
        onSave={handleStaffUpdate}
      />
      {/* ★★★↓ コンポーネント呼び出しに変更 ↓★★★ */}
      <EditPatternModal
        pattern={editingPattern}
        onClose={() => setEditingPattern(null)}
        onSave={handlePatternUpdate}
      />
      {/* ★★★↓ コンポーネント呼び出しに変更 ↓★★★ */}
      <EditUnitModal 
        unit={editingUnit}
        onClose={() => setEditingUnit(null)}
        onSave={handleUnitUpdate}
      />
    </Box>
  );
}

export default DataManagementPage;