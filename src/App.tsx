import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import Header from './components/Header'; // ヘッダーをインポート

// ページを遅延読み込み
const ShiftCalendarPage = lazy(() => import('./pages/ShiftCalendarPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
// ★★★ 修正: データ管理ページのコメントアウトを解除 ★★★
const DataManagementPage = lazy(() => import('./pages/DataManagementPage'));

// export "default" function App()
export default function App() { 
  return (
    // ★★★ v5.7 修正: 画面全体のレイアウト修正 ★★★
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', // 画面全体の高さを100%に固定
      bgcolor: 'background.default',
      overflowX: 'hidden' // ★ 画面全体の横スクロールを禁止
    }}>
      
      {/* 1. ヘッダーを常時表示 (高さは固定) */}
      <Header />
      
      {/* 2. ページ本体 */}
      {/* ★ v5.7 修正: overflowY: 'auto' を削除し、overflow: 'hidden' に変更 */}
      {/* (ページコンポーネント自体がスクロールを管理するようにするため) */}
      <Box sx={{
        flexGrow: 1, // 残りの高さをすべて使用
        overflow: 'hidden', // ★ スクロールを禁止
        minHeight: 0, // (flexレイアウトで縮小できるようにするため)
      }}>
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        }>
          <Routes>
            <Route path="/" element={<ShiftCalendarPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* ★★★ 修正: データ管理ページのコメントアウトを解除 ★★★ */}
            <Route path="/data" element={<DataManagementPage />} />
          </Routes>
        </Suspense>
      </Box>
      {/* ★★★↑ 修正ここまで ↑★★★ */}
      
    </Box>
  );
}