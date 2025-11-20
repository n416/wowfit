import { Box, IconButton, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface MonthNavigationProps {
  currentYear: number;
  currentMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isLoading: boolean;
}

export default function MonthNavigation({
  currentYear,
  currentMonth,
  onPrevMonth,
  onNextMonth,
  isLoading
}: MonthNavigationProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton onClick={onPrevMonth} disabled={isLoading} size="small">
        <ChevronLeftIcon />
      </IconButton>
      
      <Typography 
        variant="subtitle1" 
        component="div" 
        sx={{ 
          minWidth: '100px', 
          textAlign: 'center', 
          fontWeight: 'bold', 
          fontSize: '1rem',
          userSelect: 'none'
        }}
      >
        {isNaN(currentYear) || isNaN(currentMonth) ? '...' : `${currentYear}年 ${currentMonth}月`}
      </Typography>

      <IconButton onClick={onNextMonth} disabled={isLoading} size="small">
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}