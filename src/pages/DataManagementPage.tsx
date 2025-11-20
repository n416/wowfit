import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Tabs, Tab, IconButton,
  Alert,
  Stack, TextField
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../store';

import {
  db,
  IUnit,
} from '../db/dexie';

import { setStaffList } from '../store/staffSlice';
import { setPatterns } from '../store/patternSlice'; 
import { deleteUnit, updateUnit, setUnits } from '../store/unitSlice';
import Dexie from 'dexie';

// コンポーネント
import NewUnitForm from '../components/data/NewUnitForm';
import { DemandGraphEditor } from '../components/data/DemandGraphEditor';
import PatternManagementTab from '../components/data/PatternManagementTab'; 
import StaffManagementTab from '../components/data/StaffManagementTab';
import ImportExportTab from '../components/data/ImportExportTab';

import TabPanel from '../components/TabPanel';
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';

// --- メインコンポーネント ---
function DataManagementPage() {
  const [tabValue, setTabValue] = useState(0);
  const dispatch: AppDispatch = useDispatch();

  const unitList = useSelector((state: RootState) => state.unit.units);
  // staffList は StaffManagementTab 内で取得するため不要

  // データ読み込み
  useEffect(() => {
    const loadData = async () => {
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
        console.error("v5: DBデータの読み込み/初期化に失敗:", e);
        if (e instanceof Dexie.UpgradeError) {
          alert("データベースのスキーマ更新に失敗しました。");
        }
      }
    };
    loadData();
  }, [dispatch]);


  // --- ハンドラ ---

  // ユニット更新ハンドラ
  const handleUnitChange = useCallback((unit: IUnit, field: keyof IUnit, value: any) => {
    const updatedUnit = { ...unit, [field]: value };
    dispatch(updateUnit(updatedUnit));
  }, [dispatch]);

  const handleUnitDelete = (unitId: string) => {
    if (window.confirm('このユニットを削除してもよろしいですか？')) {
      dispatch(deleteUnit(unitId));
    }
  };

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
            <Tab label="インポート/エクスポート" />
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

          {/* Tab 2: 勤務パターン管理 */}
          <TabPanel value={tabValue} index={1}>
            <PatternManagementTab />
          </TabPanel>

          {/* Tab 3: スタッフ管理 */}
          <TabPanel value={tabValue} index={2}>
            <StaffManagementTab />
          </TabPanel>

          {/* Tab 4: インポート/エクスポート (実装完了) */}
          <TabPanel value={tabValue} index={3}>
            <ImportExportTab />
          </TabPanel>

        </Box>
      </Paper>
    </Box>
  );
}

export default DataManagementPage;