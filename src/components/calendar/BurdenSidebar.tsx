import {
  Box, Paper, Typography,
  List, ListItem, ListItemText, Avatar, Chip,
  IconButton
} from '@mui/material';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface BurdenDataValue {
  staffId: string;
  name: string;
  assignmentCount: number;
  nightShiftCount: number;
  earlyShiftCount: number;
  lateShiftCount: number;
  totalHours: number;
  weekendCount: number;
  maxHours: number;
  holidayCount: number;
  requiredHolidays: number;
  holidayDetails: Map<string, number>;
}

interface BurdenSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  staffBurdenData: Map<string, BurdenDataValue>;
  width: number;
  isResizing?: boolean;
}

export default function BurdenSidebar({
  isOpen, onToggle, staffBurdenData, width, isResizing = false
}: BurdenSidebarProps) {

  // 閉じた状態の固定幅
  const CLOSED_WIDTH = 56;

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      // 幅を直接制御
      width: isOpen ? width : CLOSED_WIDTH,
      minWidth: isOpen ? 250 : CLOSED_WIDTH,
      flexShrink: 0,
      // リサイズ中はtransitionを切ることで追従性を高める
      transition: isResizing ? 'none' : 'width 0.2s',
      height: '100%',
      overflow: 'hidden'
    }}>
      <Paper
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          p: 0,
          cursor: !isOpen ? 'pointer' : 'default',
          '&:hover': {
            bgcolor: !isOpen ? 'rgba(0, 0, 0, 0.04)' : undefined
          },
          height: '100%',
          borderRadius: '4px',
        }}
        onClick={!isOpen ? onToggle : undefined}
      >
        {/* ヘッダーエリア (固定高さ) */}
        <Box
          onClick={isOpen ? onToggle : undefined}
          sx={{
            display: 'flex',
            justifyContent: isOpen ? 'space-between' : 'center',
            alignItems: 'center',
            p: isOpen ? 2 : 1.5,
            borderBottom: isOpen ? '1px solid #eee' : 'none',
            flexShrink: 0,
            height: '56px',
            boxSizing: 'border-box',
            cursor: isOpen ? 'pointer' : 'inherit'
          }}
        >
          {isOpen && (
            <Typography variant="h6" noWrap>
              集計
            </Typography>
          )}

          <IconButton onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}>
            {isOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Box>

        {/* コンテンツエリア (isOpenの時のみ描画、または表示) */}
        {isOpen && (
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {isResizing ? (
              // リサイズ中のプレースホルダー
              <Box sx={{ width: '100%', height: '100%', bgcolor: '#f5f5f5' }} />
            ) : (
              <List dense>
                {Array.from(staffBurdenData.values()).map(staffData => {
                  const hourViolation = staffData.totalHours > staffData.maxHours;
                  const holidayViolation = staffData.holidayCount < staffData.requiredHolidays;

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

                            <Chip
                              label={`早: ${staffData.earlyShiftCount} 回`}
                              size="small"
                              variant="outlined"
                              sx={{ borderColor: '#ffcc80', bgcolor: '#fff8e1' }}
                            />
                            <Chip
                              label={`遅: ${staffData.lateShiftCount} 回`}
                              size="small"
                              variant="outlined"
                              sx={{ borderColor: '#81d4fa', bgcolor: '#e1f5fe' }}
                            />

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
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
