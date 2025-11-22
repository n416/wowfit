import { Paper, Typography, Box, IconButton, Tabs, Tab } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import SettingsIcon from '@mui/icons-material/Settings';

function Header() {
  const location = useLocation();
  // タブのマッチングロジックを少し柔軟にします
  const currentTab = location.pathname === '/' ? '/' 
                   : location.pathname.startsWith('/annual') ? '/annual'
                   : location.pathname.startsWith('/data') ? '/data'
                   : false;

  return (
    <Paper
      elevation={2}
      sx={{ 
        p: '12px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        zIndex: 1, 
        position: 'relative'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Typography variant="h5" component="h1">
          勤務表作成アプリ
        </Typography>

        <Tabs
          value={currentTab}
          sx={{ minHeight: 0 }}
        >
          <Tab label="勤務表" value="/" to="/" component={Link} sx={{ py: 1, minHeight: 0 }} />
          {/* ★ 追加 */}
          <Tab label="年間集計" value="/annual" to="/annual" component={Link} sx={{ py: 1, minHeight: 0 }} />
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