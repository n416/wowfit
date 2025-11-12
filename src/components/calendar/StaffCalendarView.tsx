import React from 'react';
import { 
  Paper, Typography, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment } from '../../db/dexie';

// 共通ファイルからインポート
import { MONTH_DAYS } from '../../utils/dateUtils';

interface StaffCalendarViewProps {
  onCellClick: (date: string, staffId: string) => void; 
}

export default function StaffCalendarView({ onCellClick }: StaffCalendarViewProps) {
  const { staff: staffList } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // ユニットIDでソートするロジック
  const sortedStaffList = React.useMemo(() => {
    return [...staffList].sort((a, b) => {
      const unitA = a.unitId || 'ZZZ'; // null (フリー) を最後にするため 'ZZZ' 等の大きな文字列として扱う
      const unitB = b.unitId || 'ZZZ';

      if (unitA === unitB) {
        // 同じユニットの場合は氏名でソート
        return a.name.localeCompare(b.name);
      }
      // ユニットIDでソート
      return unitA.localeCompare(unitB);
    });
  }, [staffList]);

  // アサインメントを (スタッフID x 日付) のマップに変換
  const assignmentsMap = React.useMemo(() => {
    const map = new Map<string, IAssignment[]>(); // (キー: "スタッフID_日付")
    for (const assignment of assignments) { 
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment); 
    }
    return map;
  }, [assignments]);

  return (
    <>
      <Typography variant="h6" gutterBottom>スタッフビュー（カレンダー）</Typography>
      {/* ★★★↓ v5.6 修正: 横スクロール (overflowX) を追加 ↓★★★ */}
      <TableContainer component={Paper} variant="outlined" sx={{ 
        maxHeight: 600, 
        overflowX: 'auto' 
      }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 150 }}>スタッフ</TableCell>
              {MONTH_DAYS.map(dayInfo => (
                <TableCell 
                  key={dayInfo.dateStr} 
                  sx={{ 
                    minWidth: 80, 
                    textAlign: 'center', 
                    background: (dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6) ? 'grey.200' : 'default' 
                  }}
                >
                  {dayInfo.dateStr.split('-')[2]}<br/>({dayInfo.weekday})
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStaffList.map((staff: IStaff, index: number) => {
              
              let rowStyle = {};
              if (index > 0) {
                const prevStaff = sortedStaffList[index - 1];
                if (staff.unitId !== prevStaff.unitId) {
                  rowStyle = {
                    borderTop: '3px double #000', // (黒の二重線)
                  };
                }
              }

              return (
                <TableRow key={staff.staffId} hover sx={rowStyle}> {/* (行自体への適用は不要だが念のため残す) */}
                  <TableCell component="th" scope="row" sx={rowStyle}>
                    {staff.name}
                    <Typography variant="caption" display="block" color={staff.employmentType === 'FullTime' ? 'primary' : 'textSecondary'}>
                      ({staff.unitId || 'フリー'})
                    </Typography>
                  </TableCell>
                  
                  {MONTH_DAYS.map(dayInfo => {
                    const key = `${staff.staffId}_${dayInfo.dateStr}`;
                    const assignmentsForCell = assignmentsMap.get(key) || [];
                    
                    return (
                      <TableCell 
                        key={key} 
                        sx={{ 
                          verticalAlign: 'top', 
                          borderLeft: '1px solid', 
                          borderColor: 'divider',
                          p: 0.5,
                          background: (dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6) ? 'grey.100' : 'default',
                          cursor: 'pointer',
                          ...rowStyle // ★★★↑ v5.6 修正: 二重線スタイルを日付セルにも適用 ★★★
                        }}
                        onClick={() => onCellClick(dayInfo.dateStr, staff.staffId)}
                      >
                        {assignmentsForCell.length === 0 ? (
                          <Typography variant="caption" color="textSecondary" sx={{display: 'block', textAlign: 'center'}}>
                            -
                          </Typography>
                        ) : (
                          assignmentsForCell.map(assignment => {
                            const pattern = assignment.patternId ? patternMap.get(assignment.patternId) : null;
                            let bgColor = 'default';
                            if (pattern?.workType === 'StatutoryHoliday' || pattern?.workType === 'PaidLeave') {
                              bgColor = 'error.light'; // 休みは赤系
                            } else if (pattern?.isNightShift) {
                              bgColor = 'grey.400'; // 夜勤はグレー
                            }
                            return (
                              <Chip 
                                key={assignment.id} 
                                label={pattern?.patternId || '??'} 
                                size="small" 
                                sx={{ 
                                  width: '100%', 
                                  mb: 0.5,
                                  background: bgColor,
                                }}
                              />
                            );
                          })
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};