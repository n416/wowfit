import React from 'react';
import { 
  Box, Paper, Typography, 
  List, ListItem, ListItemText, Avatar, Chip,
  Collapse,
  IconButton,
  ListItemButton // ★ v5.9 修正
} from '@mui/material';
import { IStaff } from '../../db/dexie'; 

// アイコンのインポート
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

// (ShiftCalendarPage.tsx からサイドバーのコードを移動)

// ★ v5.9 staffBurdenData の型定義
type StaffBurdenData = {
  staffId: string;
  name: string;
  assignmentCount: number;
  nightShiftCount: number;
  totalHours: number;
  weekendCount: number;
  maxHours: number;
  holidayCount: number;
  requiredHolidays: number;
};

interface BurdenSidebarProps {
  // ★ v5.9 サイドバーに必要な props を定義
  isOpen: boolean;
  onToggle: () => void;
  staffBurdenData: Map<string, StaffBurdenData>; // ★ Map をそのまま受け取る
  staffMap: Map<string, IStaff>; // ★ スタッフオブジェクト全体も受け取る
  onStaffClick: (staff: IStaff) => void;
}

// export default を追加
export default function BurdenSidebar({ 
  isOpen, onToggle, staffBurdenData, staffMap, onStaffClick 
}: BurdenSidebarProps) {

  return (
    <Box sx={{ 
      display: 'flex',
      flexDirection: 'column', // 縦に並べる
      transition: 'width 0.2s, min-width 0.2s', // アニメーション
      width: isOpen ? '20vw' : '56px', // 幅を変更
      minWidth: isOpen ? '300px' : '56px', // 最小幅
    }}>
      
      <Paper sx={{ 
        flexGrow: 1, // Box の高さいっぱいに広がる
        overflow: 'hidden', // 閉じたときにはみ出さないように
        display: 'flex',
        flexDirection: 'column', // 縦に並べる
        p: isOpen ? 2 : 0, // 閉じている時はパディング削除
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
            {/* ListItemButton を使用 */}
            {Array.from(staffBurdenData.values()).map(staffData => {
              const hourViolation = staffData.totalHours > staffData.maxHours; 
              const holidayViolation = staffData.holidayCount < staffData.requiredHolidays; 
              
              return (
                <ListItem 
                  key={staffData.staffId} 
                  disablePadding 
                  divider
                >
                  <ListItemButton
                    // ★ v5.9 staffMap から完全な IStaff を引いて渡す
                    onClick={() => {
                      const staff = staffMap.get(staffData.staffId);
                      if (staff) onStaffClick(staff);
                    }} 
                  >
                    <Avatar sx={{ width: 32, height: 32, mr: 2, fontSize: '0.8rem' }}>
                      {staffData.name.charAt(0)}
                    </Avatar>
                    <ListItemText
                      primary={staffData.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip label={`計: ${staffData.assignmentCount} 回`} size="small" variant="outlined" />
                          <Chip 
                            label={`公: ${staffData.holidayCount}/${staffData.requiredHolidays} 日`} 
                            size="small" 
                            variant="outlined" 
                            color={holidayViolation ? 'error' : 'default'} 
                          />
                          <Chip label={`夜: ${staffData.nightShiftCount} 回`} size="small" variant="outlined" color={staffData.nightShiftCount > 0 ? 'secondary' : 'default'} />
                          <Chip label={`土日: ${staffData.weekendCount} 回`} size="small" variant="outlined" />
                          <Chip label={`時: ${staffData.totalHours} h`} size="small" variant="outlined" color={hourViolation ? 'error' : 'default'} />
                        </Box>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Collapse>
      </Paper>
    </Box>
  );
}