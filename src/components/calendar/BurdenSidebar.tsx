import { 
  Box, Paper, Typography, 
  List, ListItem, ListItemText, Avatar, Chip,
  Collapse,
  IconButton
} from '@mui/material';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

// ★ 追加: 必要な型定義を行う
interface BurdenDataValue {
  staffId: string;
  name: string;
  assignmentCount: number;
  nightShiftCount: number;
  totalHours: number;
  weekendCount: number;
  maxHours: number;
  holidayCount: number;
  requiredHolidays: number;
  holidayDetails: Map<string, number>; // ★ ここが重要
}

interface BurdenSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  // ★ 修正: any ではなく具体的な型を指定
  staffBurdenData: Map<string, BurdenDataValue>; 
}

export default function BurdenSidebar({ 
  isOpen, onToggle, staffBurdenData 
}: BurdenSidebarProps) {

  return (
    <Box sx={{ 
      display: 'flex',
      flexDirection: 'column', 
      transition: 'width 0.2s, min-width 0.2s', 
      width: isOpen ? '20vw' : '56px', 
      minWidth: isOpen ? '300px' : '56px', 
    }}>
      
      <Paper sx={{ 
        flexGrow: 1, 
        overflow: 'hidden', 
        display: 'flex',
        flexDirection: 'column', 
        p: isOpen ? 2 : 0, 
      }}>
        {/* 開閉ボタンエリア */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: isOpen ? 'space-between' : 'center', 
          alignItems: 'center',
          mb: isOpen ? 1 : 0,
          pl: isOpen ? 1 : 0, 
        }}>
          <Collapse in={isOpen} orientation="horizontal">
            <Typography variant="h6">
              負担の可視化
            </Typography>
          </Collapse>
          <IconButton onClick={onToggle}>
            {isOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Box>
        
        {/* Collapse で中身を隠す */}
        <Collapse in={isOpen} sx={{ flexGrow: 1, overflowY: 'auto', minHeight: 0 }}>
          <List dense>
            {Array.from(staffBurdenData.values()).map(staffData => {
              const hourViolation = staffData.totalHours > staffData.maxHours; 
              const holidayViolation = staffData.holidayCount < staffData.requiredHolidays; 
              
              // ★ 型定義によりエラーが解消されます
              const holidayDetailChips = Array.from(staffData.holidayDetails.entries()).map(([key, count]) => (
                <Chip 
                  key={key}
                  label={`${key}: ${count}`} 
                  size="small" 
                  variant="outlined" 
                  sx={{ borderColor: '#ffb74d', color: '#f57c00', bgcolor: '#fff3e0' }} 
                />
              ));

              return (
                <ListItem key={staffData.staffId} divider>
                  <Avatar sx={{ width: 32, height: 32, mr: 2, fontSize: '0.8rem' }}>
                    {staffData.name.charAt(0)}
                  </Avatar>
                  <ListItemText
                    primary={staffData.name}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
                        <Chip label={`計: ${staffData.assignmentCount} 回`} size="small" variant="outlined" />
                        
                        <Chip 
                          label={`公: ${staffData.holidayCount}/${staffData.requiredHolidays} 日`} 
                          size="small" 
                          variant="outlined" 
                          color={holidayViolation ? 'error' : 'default'} 
                        />

                        {holidayDetailChips}

                        <Chip label={`夜: ${staffData.nightShiftCount} 回`} size="small" variant="outlined" color={staffData.nightShiftCount > 0 ? 'secondary' : 'default'} />
                        <Chip label={`土日: ${staffData.weekendCount} 回`} size="small" variant="outlined" />
                        <Chip label={`時: ${staffData.totalHours} h`} size="small" variant="outlined" color={hourViolation ? 'error' : 'default'} />
                      </Box>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              );
            })}
          </List>
        </Collapse>
      </Paper>
    </Box>
  );
}