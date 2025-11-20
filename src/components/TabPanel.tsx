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
      style={{ height: '100%' }} 
    >
      {value === index && (
        <Box sx={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          p: 3 // ★ 修正: p: 2 -> p: 3 (24px) に統一
        }}> 
          {children}
        </Box>
      )}
    </div>
  );
}