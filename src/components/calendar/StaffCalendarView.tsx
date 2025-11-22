import React, { CSSProperties, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
  IconButton,
  Table, TableBody, TableCell, TableHead, TableRow,
  Box,
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment } from '../../db/dexie';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { TableVirtuoso, TableComponents } from 'react-virtuoso';
import { CellCoords, ClickMode } from '../../hooks/useCalendarInteractions';
import { getPrevDateStr, MonthDay } from '../../utils/dateUtils';
import { useGridInteraction, GridSelection } from '../../hooks/useGridInteraction';
import { useGridOverlayPosition, OverlayCalculator } from '../../hooks/useGridOverlayPosition';
import { SelectionOverlay } from '../common/SelectionOverlay';

const COL_WIDTH = 80;
const ROW_HEIGHT = 48;
const LEFT_COL_WIDTH = 270;
const BORDER_COLOR = '#e0e0e0';
const CELL_BORDER = `1px solid ${BORDER_COLOR}`;

const styles: { [key: string]: CSSProperties } = {
  th: {
    padding: '4px', borderBottom: CELL_BORDER, borderRight: CELL_BORDER, backgroundColor: '#fff', position: 'sticky', top: 0, zIndex: 40, textAlign: 'left', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', height: 'auto', boxSizing: 'border-box', display: 'table-cell', verticalAlign: 'middle', backgroundClip: 'padding-box'
  },
  td: {
    padding: 0, borderBottom: CELL_BORDER, borderRight: CELL_BORDER, verticalAlign: 'middle', userSelect: 'none', height: `${ROW_HEIGHT}px`, maxHeight: `${ROW_HEIGHT}px`, overflow: 'hidden', textAlign: 'center', boxSizing: 'border-box', display: 'table-cell', touchAction: 'none'
  },
  stickyCell: {
    position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 30, textAlign: 'left', paddingLeft: '12px'
  },
  dateHeaderCell: {
    minWidth: COL_WIDTH, width: COL_WIDTH, maxWidth: COL_WIDTH, textAlign: 'center', padding: 0, display: 'table-cell', verticalAlign: 'middle'
  },
  staffNameCell: {
    minWidth: 150, width: 150, maxWidth: 150, cursor: 'pointer', verticalAlign: 'middle',
  },
  holidayAdjustCell: {
    minWidth: 120, width: 120, maxWidth: 120, textAlign: 'center', left: 150, verticalAlign: 'middle', padding: 0
  },
  weekendBg: { backgroundColor: '#f5f5f5' },
  holidayBg: { backgroundColor: '#ffebee' },
  cellClickable: { cursor: 'pointer' },
  cellSelectable: { cursor: 'cell' },
  assignmentChipContainer: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  assignmentChip: { borderRadius: '3px', padding: '2px 4px', fontSize: '0.75rem', display: 'inline-flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '90%', boxSizing: 'border-box', pointerEvents: 'none', lineHeight: 1.1, minHeight: '34px', maxHeight: '44px', overflow: 'hidden' },
};

interface StaffCellProps {
  staffId: string; dateStr: string; staffIndex: number; dayIndex: number;
  assignments: IAssignment[]; patternMap: Map<string, IShiftPattern>;
  isWeekend: boolean; clickMode: ClickMode; rowBorderStyle: CSSProperties;
  prevAssignments?: IAssignment[];
  onCellMouseUp: (e: React.MouseEvent, staffId: string, dateStr: string, sIdx: number, dIdx: number) => void;
}

const StaffCell = React.memo(({
  staffId, dateStr, staffIndex, dayIndex,
  assignments, patternMap, isWeekend, clickMode, rowBorderStyle,
  prevAssignments, onCellMouseUp
}: StaffCellProps) => {
  const cellStyle = clickMode === 'select' ? styles.cellSelectable : styles.cellClickable;
  
  let contentNodes: React.ReactNode = null;
  if (assignments.length > 0) {
      contentNodes = assignments.map(assignment => {
          const pattern = assignment.patternId ? patternMap.get(assignment.patternId) : null;
          let bgColor = '#e0e0e0', textColor = 'rgba(0, 0, 0, 0.87)';
          const symbolText = pattern?.symbol || pattern?.patternId || '??';
          let chipContent: React.ReactNode = symbolText;
          if (pattern?.workType === 'StatutoryHoliday') { bgColor = '#ef9a9a'; }
          else if (pattern?.workType === 'PaidLeave') { bgColor = '#90caf9'; }
          else if (pattern?.workType === 'Holiday') { bgColor = '#ffcc80'; }
          else if (pattern?.isNightShift) { bgColor = '#bdbdbd'; }
          else if (pattern?.isFlex) {
              bgColor = '#ffe082';
              const timeStr = (assignment.overrideStartTime || pattern?.startTime || "").replace(':', '');
              chipContent = (<><div>{symbolText}</div><div style={{ fontSize: '0.65rem', transform: 'scale(0.9)', lineHeight: 1, opacity: 0.8 }}>{timeStr}</div></>);
          }
          return (<div key={assignment.id} style={{ ...styles.assignmentChip, backgroundColor: bgColor, color: textColor }}>{chipContent}</div>);
      });
  } else {
      let isHalfHoliday = false;
      if (prevAssignments && prevAssignments.length > 0) {
          const hasPrevNightShift = prevAssignments.some(a => { const p = patternMap.get(a.patternId); return p?.isNightShift === true; });
          if (hasPrevNightShift) { isHalfHoliday = true; }
      }
      if (isHalfHoliday) { contentNodes = (<div style={{ ...styles.assignmentChip, backgroundColor: 'transparent', color: '#757575', fontSize: '1.2rem', fontWeight: 'bold' }}>/</div>); } 
      else { contentNodes = <span style={{ color: '#e0e0e0', fontSize: '0.8rem' }}>-</span>; }
  }

  return (
    <TableCell
      style={{
        ...styles.td, ...cellStyle, ...(isWeekend ? styles.weekendBg : {}), ...rowBorderStyle,
        touchAction: clickMode === 'select' ? 'none' : 'auto'
      }}
      data-staff-id={staffId}
      data-date={dateStr}
      data-staff-index={staffIndex}
      data-date-index={dayIndex}
      id={`cell-${staffId}-${dateStr}`}
      onMouseUp={(e) => onCellMouseUp(e, staffId, dateStr, staffIndex, dayIndex)}
    >
      <div style={styles.assignmentChipContainer}>{contentNodes}</div>
    </TableCell>
  );
}, (prev, next) => {
    if (prev.staffId !== next.staffId || prev.dateStr !== next.dateStr || prev.isWeekend !== next.isWeekend || prev.clickMode !== next.clickMode || prev.rowBorderStyle !== next.rowBorderStyle) return false;
    if (prev.assignments.length !== next.assignments.length) return false;
    for (let i = 0; i < prev.assignments.length; i++) {
        if (prev.assignments[i].id !== next.assignments[i].id || prev.assignments[i].patternId !== next.assignments[i].patternId || prev.assignments[i].overrideStartTime !== next.assignments[i].overrideStartTime) return false;
    }
    const prevLen = prev.prevAssignments?.length || 0; const nextLen = next.prevAssignments?.length || 0;
    if (prevLen !== nextLen) return false;
    if (prevLen > 0 && next.prevAssignments) { for (let i = 0; i < prevLen; i++) { if (prev.prevAssignments![i].patternId !== next.prevAssignments[i].patternId) return false; } }
    return true;
});

interface StaffCalendarViewProps {
  sortedStaffList: IStaff[];
  onCellClick: (e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onHolidayIncrement: (staffId: string) => void;
  onHolidayDecrement: (staffId: string) => void;
  onHolidayReset: (staffId: string) => void;
  staffHolidayRequirements: Map<string, number>;
  onStaffNameClick: (staff: IStaff) => void;
  onDateHeaderClick: (date: string) => void;
  clickMode: ClickMode;
  selectionRange: { start: CellCoords, end: CellCoords } | null;
  onSelectionChange?: (range: { start: CellCoords, end: CellCoords } | null) => void;
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>;
  monthDays: MonthDay[];
  onAutoScroll?: (x: number, y: number) => void; 
  // Props追加
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
}

export default function StaffCalendarView({
  sortedStaffList,
  onCellClick,
  onHolidayIncrement, onHolidayDecrement, onHolidayReset,
  staffHolidayRequirements, onStaffNameClick, onDateHeaderClick,
  clickMode,
  selectionRange,
  onSelectionChange,
  mainCalendarScrollerRef,
  monthDays,
  onCopy, onPaste, onCut
}: StaffCalendarViewProps) {

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

  const [headerHeight, setHeaderHeight] = useState(50);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headerRow = document.getElementById('calendar-header-row');
    if (!headerRow) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) { 
        const target = entry.target as HTMLElement;
        setHeaderHeight(target.offsetHeight); 
      }
    });
    observer.observe(headerRow);
    return () => observer.disconnect();
  }, [monthDays]);

  const pointToGrid = useCallback((x: number, y: number) => {
    const scrollLeft = mainCalendarScrollerRef.current?.scrollLeft || 0;
    const scrollTop = mainCalendarScrollerRef.current?.scrollTop || 0;

    const contentX = x + scrollLeft;
    const contentY = y + scrollTop;

    if (x < LEFT_COL_WIDTH) return null;
    if (y < headerHeight) return null;

    const r = Math.floor((contentY - headerHeight) / ROW_HEIGHT);
    const c = Math.floor((contentX - LEFT_COL_WIDTH) / COL_WIDTH);

    if (r < 0 || r >= sortedStaffList.length) return null;
    if (c < 0 || c >= monthDays.length) return null;

    return { r, c };
  }, [headerHeight, sortedStaffList.length, monthDays.length]);

  const { containerProps, isDraggingRef } = useGridInteraction({
    scrollerRef: mainCalendarScrollerRef,
    converter: pointToGrid,
    maxRow: sortedStaffList.length - 1,
    maxCol: monthDays.length - 1,
    isEnabled: clickMode === 'select',
    onCopy, onPaste, onCut,
    onSelectionChange: (sel) => {
      if (!onSelectionChange) return;
      if (!sel) {
        onSelectionChange(null);
        return;
      }
      const startStaff = sortedStaffList[sel.start.r];
      const startDate = monthDays[sel.start.c];
      const endStaff = sortedStaffList[sel.end.r];
      const endDate = monthDays[sel.end.c];

      if (startStaff && startDate && endStaff && endDate) {
        onSelectionChange({
          start: { staffId: startStaff.staffId, date: startDate.dateStr, staffIndex: sel.start.r, dateIndex: sel.start.c },
          end: { staffId: endStaff.staffId, date: endDate.dateStr, staffIndex: sel.end.r, dateIndex: sel.end.c }
        });
      }
    }
  });

  const calculateOverlay: OverlayCalculator = useCallback(({ minR, maxR, minC, maxC }) => {
    const top = headerHeight + (minR * ROW_HEIGHT);
    const left = LEFT_COL_WIDTH + (minC * COL_WIDTH);
    const width = (maxC - minC + 1) * COL_WIDTH;
    const height = (maxR - minR + 1) * ROW_HEIGHT;
    return { top, left, width, height };
  }, [headerHeight]);

  const gridSelection: GridSelection | null = useMemo(() => {
    if (!selectionRange) return null;
    return {
      start: { r: selectionRange.start.staffIndex, c: selectionRange.start.dateIndex },
      end: { r: selectionRange.end.staffIndex, c: selectionRange.end.dateIndex }
    };
  }, [selectionRange]);

  useGridOverlayPosition(overlayRef, gridSelection, calculateOverlay);

  const VirtuosoComponents = useMemo<TableComponents<any>>(() => ({
    Scroller: React.forwardRef<HTMLDivElement, any>((props, ref) => (
      <div {...props} ref={ref} style={{ ...props.style, position: 'relative' }}>
        {props.children}
        <SelectionOverlay overlayRef={overlayRef} />
      </div>
    )),
    Table: (props) => <Table {...props} style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed', borderTop: CELL_BORDER, borderLeft: CELL_BORDER }} />,
    TableHead: React.forwardRef((props, ref) => <TableHead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 40 }} />),
    TableRow: TableRow,
    TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
  }), []);

  // ★ isDraggingRef を使ってクリックガード
  const handleCellMouseUpWithClick = useCallback((e: React.MouseEvent, staffId: string, dateStr: string, sIdx: number, dIdx: number) => {
    if (!isDraggingRef.current && clickMode !== 'select') {
      onCellClick(e, dateStr, staffId, sIdx, dIdx);
    }
  }, [clickMode, onCellClick]);

  const fixedHeaderContent = () => (
    <TableRow id="calendar-header-row">
      <TableCell style={{ ...styles.th, ...styles.stickyCell, ...styles.staffNameCell, zIndex: 50 }}>スタッフ</TableCell>
      <TableCell style={{ ...styles.th, ...styles.stickyCell, ...styles.holidayAdjustCell, zIndex: 50 }}>公休調整</TableCell>
      {monthDays.map(dayInfo => {
        const isHoliday = !!dayInfo.holidayName;
        const isSunday = dayInfo.dayOfWeek === 0;
        const isSaturday = dayInfo.dayOfWeek === 6;
        let color = 'inherit', bgColor = '#fff';
        if (isHoliday || isSunday) { color = '#d32f2f'; bgColor = '#ffebee'; } 
        else if (isSaturday) { color = '#1976d2'; bgColor = '#e3f2fd'; }
        return (
          <TableCell key={dayInfo.dateStr} style={{ ...styles.th, ...styles.dateHeaderCell, backgroundColor: bgColor, color: color, cursor: 'pointer', lineHeight: 1.2 }} onClick={() => onDateHeaderClick(dayInfo.dateStr)} title={dayInfo.holidayName}>
            {dayInfo.dateStr.split('-')[2] && (<>{dayInfo.dateStr.split('-')[2]}<br /><div style={{ fontSize: '0.6rem' }}>{dayInfo.weekday}</div></>)}
            {dayInfo.holidayName && <div style={{ fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dayInfo.holidayName}</div>}
          </TableCell>
        );
      })}
    </TableRow>
  );

  const itemContent = useCallback((index: number, staff: IStaff) => {
    const staffIndex = index;
    let rowBorderStyle: CSSProperties = {};
    if (index > 0) {
      const prevStaff = sortedStaffList[index - 1];
      if (staff.unitId !== prevStaff.unitId) { rowBorderStyle = { borderTop: '3px double #000' }; }
    }
    const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || 0;

    return (
      <>
        <TableCell style={{ ...styles.td, ...styles.stickyCell, ...styles.staffNameCell, ...rowBorderStyle }} onClick={() => onStaffNameClick(staff)}>
          {staff.name}
          <span style={{ display: 'block', fontSize: '0.75rem', color: staff.employmentType === 'FullTime' ? '#1976d2' : '#666', fontWeight: 'normal' }}>({staff.unitId || 'フリー'})</span>
        </TableCell>
        <TableCell style={{ ...styles.td, ...styles.stickyCell, ...styles.holidayAdjustCell, ...rowBorderStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconButton size="small" onClick={() => onHolidayDecrement(staff.staffId)}><RemoveCircleOutlineIcon sx={{ fontSize: '1.25rem' }} /></IconButton>
            <span style={{ padding: '0 4px', fontWeight: 'bold', cursor: 'pointer', borderBottom: '1px dotted #ccc', userSelect: 'none' }} title="クリックで自動計算（デフォルト）にリセット" onClick={(e) => { e.stopPropagation(); if (window.confirm(`${staff.name}さんの必要公休数を、デフォルト（自動計算値）に戻しますか？`)) { onHolidayReset(staff.staffId); } }}>{requiredHolidays} 日</span>
            <IconButton size="small" onClick={() => onHolidayIncrement(staff.staffId)}><AddCircleOutlineIcon sx={{ fontSize: '1.25rem' }} /></IconButton>
          </div>
        </TableCell>
        {monthDays.map((dayInfo, dayIndex) => {
          const key = `${staff.staffId}_${dayInfo.dateStr}`;
          const assignmentsForCell = assignmentsMap.get(key) || [];
          const isWeekend = dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6;
          const isHoliday = !!dayInfo.holidayName;
          const prevDateStr = getPrevDateStr(dayInfo.dateStr);
          const prevKey = `${staff.staffId}_${prevDateStr}`;
          const prevAssignments = assignmentsMap.get(prevKey) || [];

          return (
            <StaffCell
                key={key}
                staffId={staff.staffId} dateStr={dayInfo.dateStr} staffIndex={staffIndex} dayIndex={dayIndex}
                assignments={assignmentsForCell} patternMap={patternMap} isWeekend={isWeekend} clickMode={clickMode}
                rowBorderStyle={{ ...rowBorderStyle, ...(isHoliday ? styles.holidayBg : (isWeekend ? styles.weekendBg : {})) }}
                prevAssignments={prevAssignments}
                onCellMouseUp={handleCellMouseUpWithClick}
            />
          );
        })}
      </>
    );
  }, [sortedStaffList, staffHolidayRequirements, assignmentsMap, patternMap, monthDays, onHolidayDecrement, onHolidayIncrement, onHolidayReset, onStaffNameClick, clickMode, handleCellMouseUpWithClick]);

  return (
    <Box
      sx={{ flex: 1, minHeight: 0 }}
      {...(clickMode === 'select' ? containerProps : {})}
    >
      <TableVirtuoso
        scrollerRef={(ref) => {
          if (ref && !(ref instanceof Window)) {
            mainCalendarScrollerRef.current = ref;
          }
        }}
        style={{ height: '100%', border: '1px solid #e0e0e0', borderRadius: '4px' }}
        data={sortedStaffList}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={itemContent}
        components={VirtuosoComponents}
      />
    </Box>
  );
}