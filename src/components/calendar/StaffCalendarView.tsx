import React, { CSSProperties, useMemo, useCallback } from 'react';
import { 
  IconButton, 
  Table, TableBody, TableCell, TableHead, TableRow,
  Box,
  // ★★★ 修正: Collapse, FormControlLabel, Checkbox を削除
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment } from '../../db/dexie';
// ★★★ 修正: MONTH_DAYS のインポートを削除 ★★★
// import { MONTH_DAYS } from '../../utils/dateUtils';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
// ★ 修正: 未使用の TableVirtuosoHandle を削除
import { TableVirtuoso } from 'react-virtuoso';
import { CellCoords, ClickMode } from '../../hooks/useCalendarInteractions';

// ★ 修正: 動的な monthDays の型を定義
type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
};

interface StaffCalendarViewProps {
  sortedStaffList: IStaff[]; 
  onCellClick: (e: React.MouseEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onHolidayIncrement: (staffId: string) => void;
  onHolidayDecrement: (staffId: string) => void;
  staffHolidayRequirements: Map<string, number>; 
  onStaffNameClick: (staff: IStaff) => void;
  clickMode: ClickMode;
  activeCell: CellCoords | null;
  selectionRange: { start: CellCoords, end: CellCoords } | null;
  onCellMouseDown: (e: React.MouseEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onCellMouseMove: (date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onCellMouseUp: () => void;
  // ★★★ 修正: workAreaRef を Props から削除 ★★★
  // workAreaRef: React.RefObject<HTMLDivElement | null>;
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>;
  monthDays: MonthDay[]; // ★ 追加
}

// (styles 定義 - 変更なし)
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  td: {
    padding: '8px',
    border: '1px solid #e0e0e0',
    verticalAlign: 'top',
    userSelect: 'none',
  },
  stickyCell: {
    position: 'sticky',
    left: 0,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  dateHeaderCell: {
    minWidth: 80,
    width: 80,
    textAlign: 'center',
  },
  staffNameCell: {
    minWidth: 150,
    width: 150,
    cursor: 'pointer',
  },
  holidayAdjustCell: {
    minWidth: 120,
    width: 120,
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
  cellSelectable: {
    padding: '4px', 
    borderLeft: '1px solid #e0e0e0',
    cursor: 'cell',
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
    pointerEvents: 'none',
  },
  // ★★★ 修正: workAreaCell スタイルを削除 ★★★
  // workAreaCell: { ... },
};


export default function StaffCalendarView({ 
  // (props - 変更なし)
  sortedStaffList, 
  onCellClick, 
  onHolidayIncrement, 
  onHolidayDecrement,
  staffHolidayRequirements,
  onStaffNameClick,
  clickMode,
  activeCell,
  selectionRange,
  onCellMouseDown,
  onCellMouseMove,
  onCellMouseUp,
  // ★★★ 修正: workAreaRef を Props から削除 ★★★
  mainCalendarScrollerRef,
  monthDays // ★ 追加
}: StaffCalendarViewProps) {
  
  // (フック - 変更なし)
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>(); 
    for (const assignment of assignments) { 
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment); 
    }
    return map;
  }, [assignments]);
  
  // (選択範囲インデックス - 変更なし)
  const selectedRangeIndices = useMemo(() => {
    if (!selectionRange) return null;
    return {
      minStaff: Math.min(selectionRange.start.staffIndex, selectionRange.end.staffIndex),
      maxStaff: Math.max(selectionRange.start.staffIndex, selectionRange.end.staffIndex),
      minDate: Math.min(selectionRange.start.dateIndex, selectionRange.end.dateIndex),
      maxDate: Math.max(selectionRange.start.dateIndex, selectionRange.end.dateIndex),
    };
  }, [selectionRange]);
  
  // ★★★ 修正: 作業領域関連の state, ref, useEffect, フック (workAreaRowCount, workAreaColCount, virtualWorkAreaCols, virtualWorkAreaRows) をすべて削除 ★★★
  
  
  // (ヘッダー行 - 変更なし)
  const fixedHeaderContent = () => (
    <TableRow>
      <TableCell style={{...styles.th, ...styles.stickyCell, ...styles.staffNameCell, zIndex: 12}}>スタッフ</TableCell>
      <TableCell style={{...styles.th, ...styles.stickyCell, ...styles.holidayAdjustCell, zIndex: 12}}>
        公休調整
      </TableCell> 
      {monthDays.map(dayInfo => (
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

  // (データ行 - 変更なし)
  const itemContent = useCallback((index: number, staff: IStaff) => {
    const staffIndex = index;
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
        {/* (スタッフ名セル - 変更なし) */}
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
        
        {/* (公休調整セル - 変更なし) */}
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

        {/* (日付セル - 変更なし) */}
        {monthDays.map((dayInfo, dayIndex) => {
          const key = `${staff.staffId}_${dayInfo.dateStr}`;
          const assignmentsForCell = assignmentsMap.get(key) || [];
          const isWeekend = dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6;
          
          const isSelected = selectedRangeIndices && 
                             staffIndex >= selectedRangeIndices.minStaff && 
                             staffIndex <= selectedRangeIndices.maxStaff &&
                             dayIndex >= selectedRangeIndices.minDate && 
                             dayIndex <= selectedRangeIndices.maxDate;
          const isActive = activeCell && 
                           activeCell.staffId === staff.staffId && 
                           activeCell.date === dayInfo.dateStr;
          const cellStyle = clickMode === 'select' ? styles.cellSelectable : styles.cellClickable;
          
          let selectionStyle: CSSProperties = {}; 
          const shadowColor = '#1976d2'; 
          const shadowWidth = '2px';
          const shadows: string[] = [];
          if (clickMode === 'select' && isSelected && selectedRangeIndices) {
            const { minStaff, maxStaff, minDate, maxDate } = selectedRangeIndices;
            if (staffIndex === minStaff) shadows.push(`inset 0 ${shadowWidth} 0 0 ${shadowColor}`);
            if (staffIndex === maxStaff) shadows.push(`inset 0 -${shadowWidth} 0 0 ${shadowColor}`);
            if (dayIndex === minDate) shadows.push(`inset ${shadowWidth} 0 0 0 ${shadowColor}`);
            if (dayIndex === maxDate) shadows.push(`inset -${shadowWidth} 0 0 0 ${shadowColor}`);
            if (shadows.length > 0) {
              selectionStyle.boxShadow = shadows.join(', ');
              selectionStyle.zIndex = 1; 
              selectionStyle.position = 'relative';
            }
          }
          if (isActive) {
            selectionStyle.outline = '2px dotted #0d47a1'; 
            selectionStyle.outlineOffset = '-2px'; 
            selectionStyle.zIndex = 2; 
            selectionStyle.position = 'relative'; 
          }

          return (
            <TableCell 
              key={key} 
              id={`cell-${staff.staffId}-${dayInfo.dateStr}`}
              style={{
                ...styles.td, 
                ...cellStyle, 
                ...(isWeekend ? styles.weekendBg : {}),
                ...rowBorderStyle,
                ...(isSelected ? { backgroundColor: 'rgba(25, 118, 210, 0.1)' } : {}),
                ...selectionStyle, 
              }}
              onClick={(e) => onCellClick(e, dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
              onMouseDown={(e) => onCellMouseDown(e, dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
              onMouseMove={() => onCellMouseMove(dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
              onMouseUp={onCellMouseUp}
            >
              {/* (チップ描画ロジック - 変更なし) */}
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
  }, [
    // (依存配列 - 変更なし)
    sortedStaffList, staffHolidayRequirements, assignmentsMap, patternMap, monthDays,
    onHolidayDecrement, onHolidayIncrement, onStaffNameClick,
    clickMode, activeCell, selectedRangeIndices,
    onCellClick, onCellMouseDown, onCellMouseMove, onCellMouseUp
  ]);
  
  
  return (
    // ★★★ 修正: Boxラッパーを削除し、TableVirtuoso を直接返す (または flex: 1 の Box のみ残す) ★★★
    <Box sx={{ flex: 1, minHeight: 0 }}>
      
      {/* 1. メインのカレンダー (Virtuoso) */}
      <TableVirtuoso
        // (scrollerRef 修正済み)
        scrollerRef={(ref) => { 
          if (ref && !(ref instanceof Window)) {
            mainCalendarScrollerRef.current = ref;
          } else {
            mainCalendarScrollerRef.current = null;
          }
        }}
        style={{ height: '100%', border: '1px solid #e0e0e0', borderRadius: '4px' }}
        data={sortedStaffList} 
        fixedHeaderContent={fixedHeaderContent} // ★ monthDays に依存
        itemContent={itemContent} // ★ monthDays に依存
        components={{
          Table: (props) => <Table {...props} style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }} />,
          TableHead: TableHead,
          TableRow: TableRow,
          TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
        }}
      />
      
      {/* ★★★ 修正: チェックボックス (Box) と 作業用セル領域 (Collapse) をすべて削除 ★★★ */}
      
    </Box>
  );
};