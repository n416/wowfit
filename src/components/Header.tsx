import { Paper, Typography, Box, IconButton, Tabs, Tab } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import SettingsIcon from '@mui/icons-material/Settings';

function Header() {
  const location = useLocation();
  // ★★★ 修正: /data を TABS に戻す ★★★
  const TABS = ['/', '/data'];

  return (
    <Paper
      elevation={2}
      sx={{ p: '12px 24px', mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Typography variant="h5" component="h1">
          勤務表作成アプリ
        </Typography>

        <Tabs
          // ★★★ 修正: TABSに含まれないパス(例: /settings)の場合は、valueに false を設定し、
          // どのタブも選択状態にしないようにする
          value={TABS.includes(location.pathname) ? location.pathname : false}
          sx={{ minHeight: 0 }}
        >
          <Tab label="勤務表" value="/" to="/" component={Link} sx={{ py: 1, minHeight: 0 }} />
          {/* ★★★ 修正: データ管理タブのコメントアウトを解除 ★★★ */}
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