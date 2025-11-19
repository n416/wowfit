import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Tabs, Tab,
  Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton,
  Alert,
  Chip,
  Stack, TextField
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../store';

import {
  db,
  IStaff,
  IUnit,
} from '../db/dexie';

import { deleteStaff, updateStaff, setStaffList, copyStaff } from '../store/staffSlice';
import { setPatterns } from '../store/patternSlice'; // 初期データロード用
import { deleteUnit, updateUnit, setUnits } from '../store/unitSlice';
import Dexie from 'dexie';

// コンポーネント
import NewUnitForm from '../components/data/NewUnitForm';
import { DemandGraphEditor } from '../components/data/DemandGraphEditor';
// ★ 新しいパターン管理コンポーネントをインポート
import PatternManagementTab from '../components/data/PatternManagementTab'; 

import NewStaffForm from '../components/data/NewStaffForm';
import EditStaffModal from '../components/data/EditStaffModal';
import TabPanel from '../components/TabPanel';
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';

// --- メインコンポーネント ---
function DataManagementPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch();

  const unitList = useSelector((state: RootState) => state.unit.units);
  // patternList は PatternManagementTab 側で取得するためここでは不要
  const staffList = useSelector((state: RootState) => state.staff.staff);

  // 編集モーダルのState
  const [editingStaff, setEditingStaff] = useState<IStaff | null>(null);
  
  // ★ 削除: Pattern用のStateとModalは不要になりました
  // const [editingPattern, setEditingPattern] = useState<IShiftPattern | null>(null);

  // データ読み込み (変更なし)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [units, patterns, staff] = await Promise.all([
          db.units.toArray(),
          db.shiftPatterns.toArray(),
          db.staffList.toArray()
        ]);

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

  // ユニット更新ハンドラ (即時保存)
  const handleUnitChange = useCallback((unit: IUnit, field: keyof IUnit, value: any) => {
    const updatedUnit = { ...unit, [field]: value };
    dispatch(updateUnit(updatedUnit));
  }, [dispatch]);

  const handleUnitDelete = (unitId: string) => {
    if (window.confirm('このユニットを削除してもよろしいですか？')) {
      dispatch(deleteUnit(unitId));
    }
  };

  // Staff用のハンドラ
  const handleStaffDelete = (staffId: string) => dispatch(deleteStaff(staffId));
  const handleStaffCopy = (staffId: string) => {
    if (window.confirm('このスタッフをコピーして新しいスタッフを作成しますか？')) {
      dispatch(copyStaff(staffId));
    }
  };
  const handleStaffUpdate = (updatedStaff: IStaff) => {
    dispatch(updateStaff(updatedStaff));
    setEditingStaff(null);
  };

  // ★ 削除: Pattern用のハンドラは不要になりました
  // const handlePatternDelete = ...
  // const handlePatternUpdate = ...


  return (
    <Box sx={{ flexGrow: 1, p: '24px', height: '100%', overflow: 'hidden' }}>
      <Paper sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="ユニット・デマンド管理" />
            <Tab label="勤務パターン管理" />
            <Tab label="スタッフ管理" />
            <Tab label="インポート/エクスポート (未)" />
          </Tabs>
        </Box>

        {/* コンテンツエリア全体をスクロール可能にする */}
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* Tab 1: ユニット・デマンド管理 */}
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>ユニット一覧・デマンド設定</Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              各ユニットのグラフをドラッグして範囲選択し、ボタンで必要人数を設定してください。変更は即座に保存されます。
            </Alert>

            <NewUnitForm />
            <Stack spacing={4} sx={{ pb: 10 }}>
              {unitList.map((unit: IUnit) => (
                <Paper key={unit.unitId} variant="outlined" sx={{ p: 3, backgroundColor: '#fcfcfc' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <TextField
                      label="ユニット名"
                      value={unit.name}
                      onChange={(e) => handleUnitChange(unit, 'name', e.target.value)}
                      size="small"
                      sx={{ width: 300, backgroundColor: '#fff' }}
                    />
                    <Typography variant="caption" color="text.secondary">ID: {unit.unitId}</Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <IconButton onClick={() => handleUnitDelete(unit.unitId)} color="error" title="ユニットを削除">
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                  <Box sx={{ pl: 1 }}>
                    <DemandGraphEditor
                      initialDemand={unit.demand || []}
                      onChange={(newDemand) => handleUnitChange(unit, 'demand', newDemand)}
                    />
                  </Box>
                </Paper>
              ))}
              {unitList.length === 0 && (
                <Typography color="text.secondary" align="center" sx={{ py: 5 }}>
                  ユニットがありません。上のフォームから追加してください。
                </Typography>
              )}
            </Stack>
          </TabPanel>

          {/* ★★★ Tab 2: 勤務パターン管理 (入れ替え完了) ★★★ */}
          <TabPanel value={tabValue} index={1}>
            {/* 古いリストとフォームを削除し、新しいコックピットを配置 */}
            <PatternManagementTab />
          </TabPanel>

          {/* Tab 3: スタッフ管理 */}
          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>新規スタッフの登録</Typography>
            <NewStaffForm />
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, maxHeight: 600 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>氏名</TableCell><TableCell>ステータス</TableCell><TableCell>雇用形態</TableCell><TableCell>所属ユニット</TableCell><TableCell>勤務可能パターン</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
                <TableBody>
                  {staffList.map((staff: IStaff) => (
                    <TableRow key={staff.staffId}>
                      <TableCell>{staff.name}</TableCell>
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

          <TabPanel value={tabValue} index={3}><Typography>インポート/エクスポート（未実装）</Typography></TabPanel>

        </Box>
      </Paper>

      {/* 編集モーダル */}
      <EditStaffModal
        staff={editingStaff}
        onClose={() => setEditingStaff(null)}
        onSave={handleStaffUpdate}
      />
      {/* ★ 削除: EditPatternModal は不要になりました */}
    </Box>
  );
}

export default DataManagementPage;