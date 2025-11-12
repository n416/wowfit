import React from 'react';
import { 
  Box, Paper, Typography, Button, Chip,
  Tooltip, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment, IUnit } from '../../db/dexie';

// 共通ファイルから MONTH_DAYS をインポート
import { MONTH_DAYS } from '../../utils/dateUtils';


// (ShiftCalendarPage.tsx から WorkSlotCalendarView のコードをそのまま移動)
interface WorkSlotCalendarViewProps {
  onCellClick: (date: string, unitId: string | null) => void;
  onHolidayPlacementClick: () => void;
  onRoughFillClick: () => void;
  onResetClick: () => void;
}

// export default を追加
export default function WorkSlotCalendarView({
  onCellClick,
  onHolidayPlacementClick,
  onRoughFillClick,
  onResetClick
}: WorkSlotCalendarViewProps) {
  const { staff: staffList } = useSelector((state: RootState) => state.staff);
  const unitList = useSelector((state: RootState) => state.unit.units);
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);

  const staffMap = React.useMemo(() => new Map(staffList.map((s: IStaff) => [s.staffId, s])), [staffList]);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // v5: アサイン結果を (日付 x ユニット) のマップに変換
  const assignmentsMap = React.useMemo(() => {
    const map = new Map<string, IAssignment[]>(); 
    for (const assignment of assignments) {
      if (assignment.unitId) {
        const key = `${assignment.date}_${assignment.unitId}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(assignment);
      }
    }
    return map;
  }, [assignments]);

  // v5.2: 人員不足(Demand)を計算するロジック
  const demandMap = React.useMemo(() => {
    const map = new Map<string, { required: number; actual: number }>(); 
    
    // 1. Demand (必要人数) を計算
    for (const day of MONTH_DAYS) {
      for (const unit of unitList) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day.dateStr}_${unit.unitId}_${hour}`;
          const requiredStaff = (unit.demand && unit.demand[hour]) || 0; 
          map.set(key, { required: requiredStaff, actual: 0 });
        }
      }
    }
    // 2. Actual (実績) をカウント
    for (const assignment of assignments) {
      const pattern = assignment.patternId ? patternMap.get(assignment.patternId) : null;
      if (assignment.unitId && pattern && pattern.workType === 'Work') {
        
        const startTime = parseInt(pattern.startTime.split(':')[0]);
        // ★★★ v5.5 修正: 終了時間が 9:30 のように分を持つ場合、次の時間枠までカバーするよう修正 ★★★
        const [endH, endM] = pattern.endTime.split(':').map(Number);
        const endTime = (endM > 0) ? endH + 1 : endH;
        // ★★★ 修正ここまで ★★★

        if (!pattern.crossesMidnight) {
          // ★★★ v5.5 修正: endTime を (パースしなおした) endTime に変更 ★★★
          for (let hour = startTime; hour < endTime; hour++) { 
            const key = `${assignment.date}_${assignment.unitId}_${hour}`;
            const entry = map.get(key);
            if (entry) entry.actual += 1;
          }
        } else {
          // 1日目
          for (let hour = startTime; hour < 24; hour++) {
            const key = `${assignment.date}_${assignment.unitId}_${hour}`;
            const entry = map.get(key);
            if (entry) entry.actual += 1;
          }
          // 2日目
          const nextDate = new Date(assignment.date.replace(/-/g, '/'));
          nextDate.setDate(nextDate.getDate() + 1);
          const nextDateStr = nextDate.toISOString().split('T')[0];
          
          // ★★★ v5.5 修正: endTime を (パースしなおした) endTime に変更 ★★★
          for (let hour = 0; hour < endTime; hour++) {
            const key = `${nextDateStr}_${assignment.unitId}_${hour}`;
            const entry = map.get(key);
            if (entry) entry.actual += 1;
          }
        }
      }
    }
    return map;
  }, [assignments, unitList, patternMap]);


  return (
    <>
      <Typography variant="h6" gutterBottom>ステップ1/2：公休配置 と 自動アサイン</Typography>
      {/* v5: ボタンのラベル修正 */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={onHolidayPlacementClick}>
          1. 「公休」を自動配置 (v5)
        </Button>
        <Typography>&gt;&gt;</Typography>
        <Button variant="contained" color="secondary" onClick={onRoughFillClick}>
          2. 「労働」を自動アサイン (v5)
        </Button>
        <Button variant="outlined" color="error" onClick={onResetClick} sx={{ ml: 'auto' }}>
          アサインをリセット
        </Button>
      </Box>

      {/* カレンダーUI (縦:日付, 横:ユニット) */}
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 120 }}>日付</TableCell>
              {unitList.map((unit: IUnit) => (
                <TableCell key={unit.unitId} sx={{ minWidth: 150 }}>
                  {unit.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {MONTH_DAYS.map(dayInfo => (
              <TableRow key={dayInfo.dateStr} hover>
                <TableCell component="th" scope="row">
                  {dayInfo.dateStr.split('-')[2]}日 ({dayInfo.weekday})
                </TableCell>
                
                {unitList.map((unit: IUnit) => {
                  const key = `${dayInfo.dateStr}_${unit.unitId}`;
                  const assignmentsForCell = assignmentsMap.get(key) || [];
                  
                  // ★★★ v5.9 修正: 24時間ステータスバーを表示 ★★★
                  return (
                    <TableCell 
                      key={key} 
                      sx={{ 
                        verticalAlign: 'top', 
                        borderLeft: '1px solid', 
                        borderColor: 'divider',
                        p: 0.5, 
                        cursor: 'pointer',
                      }}
                      onClick={() => onCellClick(dayInfo.dateStr, unit.unitId)}
                    >
                      {/* ★★★ 24時間デマンドバー ★★★ */}
                      <Box sx={{ 
                        display: 'flex', 
                        width: '100%', 
                        height: '16px', 
                        mb: 0.5, 
                        border: '1px solid', 
                        borderColor: 'divider',
                        backgroundColor: 'grey.100' // デマンド0のデフォルト色
                      }}>
                        {Array.from({ length: 24 }).map((_, hour) => {
                          const demandKey = `${dayInfo.dateStr}_${unit.unitId}_${hour}`;
                          const demandData = demandMap.get(demandKey);
                          let bgColor = 'transparent'; // デマンド0は親の背景色(grey.100)
                          let title = `${hour}:00 - ${hour+1}:00\n必要: 0`;

                          if (demandData && demandData.required > 0) {
                            if (demandData.actual < demandData.required) {
                              bgColor = 'error.main'; // 不足 (赤)
                              title = `${hour}:00 - ${hour+1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (不足)`;
                            } else if (demandData.actual > demandData.required) {
                              bgColor = 'success.light'; // 過剰 (薄緑)
                              title = `${hour}:00 - ${hour+1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (過剰)`;
                            } else {
                              bgColor = 'primary.main'; // 充足 (青)
                              title = `${hour}:00 - ${hour+1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (充足)`;
                            }
                          }
                          
                          return (
                            <Tooltip title={title} key={hour}>
                              <Box sx={{ 
                                flex: 1, 
                                backgroundColor: bgColor,
                                // (6時間ごとの区切り線)
                                borderRight: (hour + 1) % 6 === 0 && hour < 23 ? '1px solid' : 'none',
                                borderColor: 'grey.400'
                              }} />
                            </Tooltip>
                          );
                        })}
                      </Box>
                      {/* ★★★ 提案ここまで ★★★ */}

                      {/* (既存のChip表示) */}
                      {assignmentsForCell.map(assignment => {
                        const staff = staffMap.get(assignment.staffId);
                        const pattern = patternMap.get(assignment.patternId);
                        return (
                          <Chip 
                            key={assignment.id}
                            label={`${pattern?.patternId || '??'} (${staff?.name || '??'})`}
                            size="small"
                            sx={{ mr: 0.5, mb: 0.5 }}
                            color={pattern?.isNightShift ? 'secondary' : 'default'}
                          />
                        );
                      })}
                    </TableCell>
                  );
                  // ★★★ v5.9 修正ここまで ★★★
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};