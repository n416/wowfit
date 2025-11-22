import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import Header from './components/Header';
import { useMasterData } from './hooks/useMasterData'; // ★ 追加

const ShiftCalendarPage = lazy(() => import('./pages/ShiftCalendarPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DataManagementPage = lazy(() => import('./pages/DataManagementPage'));
const AnnualSummaryPage = lazy(() => import('./pages/AnnualSummaryPage'));

export default function App() {
  // ★ アプリ起動時に必ずマスタデータをロードする
  useMasterData();

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      bgcolor: 'background.default',
      overflowX: 'hidden' 
    }}>
      <Header />
      
      <Box sx={{
        flexGrow: 1, 
        overflow: 'hidden', 
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        }>
          <Routes>
            <Route path="/" element={<ShiftCalendarPage />} />
            <Route path="/annual" element={<AnnualSummaryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/data" element={<DataManagementPage />} />
          </Routes>
        </Suspense>
      </Box>
    </Box>
  );
}