import React from 'react';
import { Box } from '@mui/material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

export default function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div 
      hidden={value !== index}
      {...other}
      // ★★★ 変更点 1: TabPanelのdiv自体に高さを継承させる ★★★
      // (親コンポーネント(Paper)のflex: 1の高さを引き継ぐため)
      style={{ height: '100%' }} 
    >
      {value === index && (
        // ★★★ 変更点 2: flexコンテナに変更 + p: 3 を追加 ★★★
        // (中の子要素(ToggleBoxやStaffCalendarView)を縦に並べるため)
        <Box sx={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          p: 2 // ★★★ 修正: ここに p: 3 (24px) を追加 ★★★
        }}> 
          {children}
        </Box>
      )}
    </div>
  );
}