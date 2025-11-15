import React, { CSSProperties, useMemo, useCallback } from 'react';
import { 
  IconButton, 
  Table, TableBody, TableCell, TableHead, TableRow,
  Box
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment } from '../../db/dexie';
import { MONTH_DAYS } from '../../utils/dateUtils';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { TableVirtuoso } from 'react-virtuoso';

interface StaffCalendarViewProps {
  staffList: IStaff[]; // ★★★ staffList を Prop で受け取る ★★★
  onCellClick: (date: string, staffId: string) => void; 
  onHolidayIncrement: (staffId: string) => void;
  onHolidayDecrement: (staffId: string) => void;
  staffHolidayRequirements: Map<string, number>; 
  // ★★★ v5.85 修正: スタッフ名クリックハンドラを追加 ★★★
  onStaffNameClick: (staff: IStaff) => void;
}

// ★★★ v5.66/v5.67 修正: CLS対策のため width を明示 ★★★
const styles: { [key: string]: CSSProperties } = {
  th: {
    padding: '8px',
    border: '1px solid #e0e0e0',
    backgroundColor: '#fff',
    position: 'sticky',
    top: 0,
    zIndex: 11,
    textAlign: 'left',
    fontWeight: 'bold',
    overflow: 'hidden', // ★ CLS対策
    textOverflow: 'ellipsis', // ★ CLS対策
  },
  td: {
    padding: '8px',
    border: '1px solid #e0e0e0',
    verticalAlign: 'top',
  },
  stickyCell: {
    position: 'sticky',
    left: 0,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  dateHeaderCell: {
    minWidth: 80,
    width: 80, // ★ CLS対策
    textAlign: 'center',
  },
  staffNameCell: {
    minWidth: 150,
    width: 150, // ★ CLS対策
    cursor: 'pointer', // ★★★ v5.85 修正: クリック可能カーソル ★★★
  },
  holidayAdjustCell: {
    minWidth: 120,
    width: 120, // ★ CLS対策
    textAlign: 'center',
    left: 150,
  },
  weekendBg: {
    backgroundColor: '#f5f5f5',
  },
  cellClickable: {
    padding: '4px',
    borderLeft: '1px solid #e0e0e0',
    cursor: 'pointer',
  },
  assignmentChip: {
    borderRadius: '16px',
    padding: '4px 8px',
    fontSize: '0.75rem',
    marginBottom: '4px',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #9e9e9e',
  }
};


export default function StaffCalendarView({ 
  staffList, // ★★★ Prop で受け取る
  onCellClick, 
  onHolidayIncrement, 
  onHolidayDecrement,
  staffHolidayRequirements,
  // ★★★ v5.85 修正: props を受け取る ★★★
  onStaffNameClick
}: StaffCalendarViewProps) {
  
  // const { staff: staffList } = useSelector((state: RootState) => state.staff); // ★★★ 削除 ★★★
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { assignments } = useSelector((state: RootState) => state.assignment);
  
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  const sortedStaffList = useMemo(() => {
    return [...staffList].sort((a, b) => { // ★ Prop の staffList を使用
      const unitA = a.unitId || 'ZZZ';
      const unitB = b.unitId || 'ZZZ';
      if (unitA === unitB) {
        return a.name.localeCompare(b.name);
      }
      return unitA.localeCompare(unitB);
    });
  }, [staffList]); // ★ 依存配列を Prop の staffList に変更

  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>(); 
    for (const assignment of assignments) { 
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment); 
    }
    return map;
  }, [assignments]);
  
  // (ヘッダー行をレンダリングする関数)
  const fixedHeaderContent = () => (
    <TableRow>
      <TableCell style={{...styles.th, ...styles.stickyCell, ...styles.staffNameCell, zIndex: 12}}>スタッフ</TableCell>
      <TableCell style={{...styles.th, ...styles.stickyCell, ...styles.holidayAdjustCell, zIndex: 12}}>
        公休調整
      </TableCell> 
      {MONTH_DAYS.map(dayInfo => (
        <TableCell 
          key={dayInfo.dateStr} 
          style={{
            ...styles.th,
            ...styles.dateHeaderCell,
            backgroundColor: (dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6) ? '#eeeeee' : '#fff'
          }}
        >
          {dayInfo.dateStr.split('-')[2]}<br/>({dayInfo.weekday})
        </TableCell>
      ))}
    </TableRow>
  );

  // (データ行をレンダリングする関数)
  const itemContent = useCallback((index: number, staff: IStaff) => {
    
    let rowBorderStyle: CSSProperties = {};
    if (index > 0) {
      const prevStaff = sortedStaffList[index - 1];
      if (staff.unitId !== prevStaff.unitId) {
        rowBorderStyle = { borderTop: '3px double #000' };
      }
    }
    
    const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || 0; 

    return (
      <>
        {/* ★★★ v5.85 修正: onClick を追加 ★★★ */}
        <TableCell 
          style={{ ...styles.td, ...styles.stickyCell, ...styles.staffNameCell, ...rowBorderStyle }}
          onClick={() => onStaffNameClick(staff)}
        >
          {staff.name}
          <span style={{ 
            display: 'block', 
            fontSize: '0.75rem', 
            color: staff.employmentType === 'FullTime' ? '#1976d2' : '#666'
          }}>
            ({staff.unitId || 'フリー'})
          </span>
        </TableCell>
        
        <TableCell style={{ 
          ...styles.td, 
          ...styles.stickyCell,
          ...styles.holidayAdjustCell,
          ...rowBorderStyle
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconButton size="small" onClick={() => onHolidayDecrement(staff.staffId)}>
              <RemoveCircleOutlineIcon sx={{ fontSize: '1.25rem' }} />
            </IconButton>
            <span style={{ padding: '0 4px', fontWeight: 'bold' }}>
              {requiredHolidays} 日
            </span>
            <IconButton size="small" onClick={() => onHolidayIncrement(staff.staffId)}>
              <AddCircleOutlineIcon sx={{ fontSize: '1.25rem' }} />
            </IconButton>
          </div>
        </TableCell>

        {MONTH_DAYS.map(dayInfo => {
          const key = `${staff.staffId}_${dayInfo.dateStr}`;
          const assignmentsForCell = assignmentsMap.get(key) || [];
          const isWeekend = dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6;
          
          return (
            <TableCell 
              key={key} 
              style={{
                ...styles.td,
                ...styles.cellClickable,
                ...(isWeekend ? styles.weekendBg : {}),
                ...rowBorderStyle
              }}
              onClick={() => onCellClick(dayInfo.dateStr, staff.staffId)}
            >
              {assignmentsForCell.length === 0 ? (
                <span style={{ display: 'block', textAlign: 'center', color: '#888' }}>-</span>
              ) : (
                assignmentsForCell.map(assignment => {
                  const pattern = assignment.patternId ? patternMap.get(assignment.patternId) : null;
                  let bgColor = '#e0e0e0', textColor = 'rgba(0, 0, 0, 0.87)';
                  if (pattern?.workType === 'StatutoryHoliday' || pattern?.workType === 'PaidLeave') {
                    bgColor = '#ef9a9a';
                  } else if (pattern?.isNightShift) {
                    bgColor = '#bdbdbd';
                  }
                  return (
                    <div 
                      key={assignment.id}
                      style={{ ...styles.assignmentChip, backgroundColor: bgColor, color: textColor }}
                    >
                      {pattern?.patternId || '??'}
                    </div>
                  );
                })
              )}
            </TableCell>
          );
        })}
      </>
    );
  }, [sortedStaffList, staffHolidayRequirements, assignmentsMap, patternMap, onCellClick, onHolidayDecrement, onHolidayIncrement, onStaffNameClick]); // ★ 依存配列に追加

  return (
    // ★★★ v5.70 修正: ルートを Box (flex-column) に変更 ★★★
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h6 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 500 }}>
        スタッフビュー（カレンダー）
      </h6>
      
      {/* ★★★ v5.70 修正: 仮想化テーブルをBoxでラップし、flex: 1 で伸縮させる ★★★ */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TableVirtuoso
          style={{ height: '100%', border: '1px solid #e0e0e0', borderRadius: '4px' }}
          data={sortedStaffList}
          fixedHeaderContent={fixedHeaderContent}
          itemContent={itemContent}
          components={{
            Table: (props) => <Table {...props} style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }} />,
            TableHead: TableHead,
            TableRow: TableRow,
            TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
          }}
        />
      </Box>
    </Box>
  );
};