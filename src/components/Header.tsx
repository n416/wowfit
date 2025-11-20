// src/components/Header.tsx
import { Paper, Typography, Box, IconButton, Tabs, Tab } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import SettingsIcon from '@mui/icons-material/Settings';

function Header() {
  const location = useLocation();
  const TABS = ['/', '/data'];

  return (
    <Paper
      elevation={2}
      // ★ 修正: mb: 2 を削除し、コンテンツとの隙間を詰める
      sx={{ 
        p: '12px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        zIndex: 1, // 念のため
        position: 'relative'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Typography variant="h5" component="h1">
          勤務表作成アプリ
        </Typography>

        <Tabs
          value={TABS.includes(location.pathname) ? location.pathname : false}
          sx={{ minHeight: 0 }}
        >
          <Tab label="勤務表" value="/" to="/" component={Link} sx={{ py: 1, minHeight: 0 }} />
          <Tab label="データ管理" value="/data" to="/data" component={Link} sx={{ py: 1, minHeight: 0 }} /> 
        </Tabs>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton component={Link} to="/settings" aria-label="user settings">
          <SettingsIcon />
        </IconButton>
      </Box>
    </Paper>
  );
}

export default Header;