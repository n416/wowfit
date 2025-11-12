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
    >
      {value === index && (
        // ★ ShiftCalendarPage v5.9 の修正に基づき、
        // TabPanel 自身はスクロールやパディングを持たず、
        // 中身（children）がそれを制御するようにします。
        <Box sx={{ height: '100%' }}> 
          {children}
        </Box>
      )}
    </div>
  );
}