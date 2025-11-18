import { useState, useEffect } from 'react';
import { 
  Box, Paper, Typography, Tabs, Tab, 
  // ★ 未使用のMUIコンポーネント (TextField, Button, Select, Dialog 等) を削除
  Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, IconButton, 
  Alert,
  Chip, // ★★★ Chip をインポート (未使用警告の修正)
  // ★ 削除
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit'; 
// import AddIcon from '@mui/icons-material/Add'; // ★ 未使用のため削除
import ContentCopyIcon from '@mui/icons-material/ContentCopy'; // ★ アイコンをインポート
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
// v5 スキーマの型をインポート
import { 
  db, 
  IStaff, 
  // ★ 未使用の型 (IStaffConstraints, CrossUnitWorkType, WorkType) を削除
  IShiftPattern, IUnit, 
  // ★ 未使用の関数 (getDefaultDemand) を削除
} from '../db/dexie'; 
// v5 スライスの Action をインポート
// ★★★ copyStaff をインポート ★★★
// ★ 未使用のアクション (addNewStaff, parseAndSaveConstraints) を削除
import { deleteStaff, updateStaff, setStaffList, copyStaff } from '../store/staffSlice'; 
// ★ 未使用のアクション (addNewPattern) を削除
import { deletePattern, updatePattern, setPatterns } from '../store/patternSlice'; 
// (※ timeSlotRuleSlice はインポートしない)
// ★ 未使用のアクション (addNewUnit) を削除
import { deleteUnit, updateUnit, setUnits } from '../store/unitSlice';
import Dexie from 'dexie'; // (Dexieエラー型判定用)

// ★★★↓ インポートを修正 ↓★★★
import NewUnitForm from '../components/data/NewUnitForm';
import EditUnitModal from '../components/data/EditUnitModal';
import NewPatternForm from '../components/data/NewPatternForm';
import EditPatternModal from '../components/data/EditPatternModal';
import NewStaffForm from '../components/data/NewStaffForm';
import EditStaffModal from '../components/data/EditStaffModal';
// ★★★↓ v5.9 モックデータをインポート ↓★★★
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';
// ★★★ 変更点 1: 汎用 TabPanel をインポート ★★★
import TabPanel from '../components/TabPanel';


// ★★★ 変更点 2: ローカルの TabPanel 定義 (約13行) を削除 ★★★
/*
... (削除済み) ...
*/
// ★★★ 変更点 2 ここまで ★★★

// (getDefaultDemand は削除済み)

// ★★★ v5.9 修正: モックデータの定義 (約200行) をすべて削除 ★★★
/*
... (削除済み) ...
*/
// ★★★ v5.9 修正ここまで ★★★


// (NewUnitForm, EditUnitModal, NewPatternForm, EditPatternModal, NewStaffForm, EditStaffModal は削除済み)


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
  // ★★★ スタッフコピーハンドラを追加 ★★★
  const handleStaffCopy = (staffId: string) => {
    if (window.confirm('このスタッフをコピーして新しいスタッフを作成しますか？')) {
      dispatch(copyStaff(staffId));
    }
  };
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
    // ★★★ 修正: p: '0 24px 24px 24px' -> p: '24px' に変更 (ShiftCalendarPageと合わせる) ★★★
    <Box sx={{ flexGrow: 1, p: '24px' }}>
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {/* ★★★ 未使用の引数 'e' を '_' に変更 ★★★ */}
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="ユニット・デマンド管理" />
            <Tab label="勤務パターン管理" />
            <Tab label="スタッフ管理" />
            <Tab label="インポート/エクスポート (未)" />
          </Tabs>
        </Box>
        
        {/* ★★★ v5.2: ユニット・デマンド管理タブ (★ 汎用コンポーネントを使用) ★★★ */}
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

        {/* ★★★ v5: 勤務パターン管理タブ (★ 汎用コンポーネントを使用) ★★★ */}
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

        {/* ★★★ v5: スタッフ管理タブ (★ 汎用コンポーネントを使用) ★★★ */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>新規スタッフの登録</Typography>
          {/* ★★★↓ コンポーポーネント呼び出しに変更 ↓★★★ */}
          <NewStaffForm />
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              {/* ★★★ 「ステータス」列を追加 ★★★ */}
              <TableHead><TableRow><TableCell>氏名</TableCell><TableCell>ステータス</TableCell><TableCell>雇用形態</TableCell><TableCell>所属ユニット</TableCell><TableCell>勤務可能パターン</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
              <TableBody>
                {staffList.map((staff: IStaff) => (
                  <TableRow key={staff.staffId}>
                    <TableCell>{staff.name}</TableCell>
                    {/* ★★★ ステータス列のセルを追加 ★★★ */}
                    <TableCell>
                      {staff.status === 'OnLeave' ? (
                        <Chip label="休職中" color="error" size="small" />
                      ) : (
                        <Chip label="勤務中" color="success" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>{staff.employmentType}</TableCell>
                    <TableCell>{staff.unitId}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(staff.availablePatternIds || []).join(', ')}
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setEditingStaff(staff)} color="primary"><EditIcon /></IconButton>
                      {/* ★★★ コピーボタンを追加 ★★★ */}
                      <IconButton size="small" onClick={() => handleStaffCopy(staff.staffId)} color="default" title="このスタッフをコピー">
                        <ContentCopyIcon />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleStaffDelete(staff.staffId)} color="error"><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
        
        {/* ★ 汎用コンポーネントを使用 */}
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