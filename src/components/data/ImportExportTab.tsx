import React, { useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, Stack,
  CircularProgress, Snackbar
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { db } from '../../db/dexie';
import { useDispatch } from 'react-redux';
import { setUnits } from '../../store/unitSlice';
import { setPatterns } from '../../store/patternSlice';
import { setStaffList } from '../../store/staffSlice';
import { setAssignments } from '../../store/assignmentSlice';

export default function ImportExportTab() {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      const units = await db.units.toArray();
      const patterns = await db.shiftPatterns.toArray();
      const staff = await db.staffList.toArray();
      const assignments = await db.assignments.toArray();

      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        units,
        shiftPatterns: patterns,
        staffList: staff,
        assignments
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shift_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'バックアップファイルをダウンロードしました。' });
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: `エクスポートに失敗しました: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('【警告】\n現在のデータはすべて消去され、ファイルの内容で上書きされます。\n本当によろしいですか？\n(必要であれば先に現在のデータをバックアップしてください)')) {
      e.target.value = '';
      return;
    }

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (!data.units || !data.shiftPatterns || !data.staffList || !data.assignments) {
          throw new Error('無効なファイル形式です。必要なデータが含まれていません。');
        }

        await db.transaction('rw', db.units, db.shiftPatterns, db.staffList, db.assignments, async () => {
          await Promise.all([
            db.units.clear(),
            db.shiftPatterns.clear(),
            db.staffList.clear(),
            db.assignments.clear()
          ]);

          await Promise.all([
            db.units.bulkAdd(data.units),
            db.shiftPatterns.bulkAdd(data.shiftPatterns),
            db.staffList.bulkAdd(data.staffList),
            db.assignments.bulkAdd(data.assignments)
          ]);
        });

        dispatch(setUnits(data.units));
        dispatch(setPatterns(data.shiftPatterns));
        dispatch(setStaffList(data.staffList));
        dispatch(setAssignments(data.assignments));

        setMessage({ type: 'success', text: 'データの復元が完了しました。' });
      } catch (err: any) {
        console.error(err);
        setMessage({ type: 'error', text: `インポートに失敗しました: ${err.message}` });
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  return (
    // ★ 修正: コンポーネント自体の p: 3 を削除（TabPanelの p: 3 に任せる）
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom>データのバックアップと復元</Typography>
      
      {/* ★ 修正: mb: 4 -> mb: 3 (他のタブと統一) */}
      <Alert severity="info" sx={{ mb: 3 }}>
        ブラウザに保存されているすべてのデータ（ユニット、勤務パターン、スタッフ、シフト表）をJSONファイルとして保存・復元できます。
        <br />
        別のPCにデータを移行したい場合や、万が一のデータ消失に備えて定期的にバックアップを取ることをお勧めします。
      </Alert>

      <Stack spacing={4} maxWidth={600} mx="auto">
        <Paper sx={{ p: 3 }} variant="outlined">
          <Stack spacing={2} alignItems="center">
            <StorageIcon sx={{ fontSize: 48, color: 'primary.main' }} />
            <Typography variant="h6">バックアップ (エクスポート)</Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              現在のデータを「shift_backup_yyyy-mm-dd.json」という名前でダウンロードします。
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              disabled={loading}
            >
              データをダウンロード
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3, bgcolor: '#fff5f5', borderColor: '#ffcdd2' }} variant="outlined">
          <Stack spacing={2} alignItems="center">
            <UploadIcon sx={{ fontSize: 48, color: 'error.main' }} />
            <Typography variant="h6" color="error">データの復元 (インポート)</Typography>
            <Typography variant="body2" color="error.dark" textAlign="center" fontWeight="bold">
              注意: インポートを行うと、現在のデータはすべて消去され、ファイルの内容で上書きされます。
            </Typography>
            
            <Button
              variant="contained"
              color="error"
              size="large"
              component="label"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <UploadIcon />}
              disabled={loading}
            >
              バックアップファイルを選択して復元
              <input
                type="file"
                hidden
                accept=".json"
                onChange={handleImport}
              />
            </Button>
          </Stack>
        </Paper>
      </Stack>

      <Snackbar
        open={!!message}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setMessage(null)} severity={message?.type || 'info'} sx={{ width: '100%' }}>
          {message?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}