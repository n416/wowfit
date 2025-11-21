// src/components/calendar/StaffCalendarView.tsx
import React, { CSSProperties, useMemo, useCallback, useRef, useEffect } from 'react';
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

interface StaffCalendarViewProps {
  sortedStaffList: IStaff[];
  onCellClick: (e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onHolidayIncrement: (staffId: string) => void;
  onHolidayDecrement: (staffId: string) => void;
  onHolidayReset: (staffId: string) => void; // ★ 追加
  staffHolidayRequirements: Map<string, number>;
  onStaffNameClick: (staff: IStaff) => void;
  onDateHeaderClick: (date: string) => void;
  clickMode: ClickMode;
  selectionRange: { start: CellCoords, end: CellCoords } | null;
  onCellMouseDown: (e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onCellMouseMove: (date: string, staffId: string, sIdx: number, dIdx: number) => void;
  onCellMouseUp: () => void;
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>;
  monthDays: MonthDay[];
  onAutoScroll: (x: number, y: number) => void;
}

const COL_WIDTH = 80;
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 50; 
const LEFT_COL_WIDTH = 270; 
const BORDER_COLOR = '#e0e0e0';
const CELL_BORDER = `1px solid ${BORDER_COLOR}`;

const styles: { [key: string]: CSSProperties } = {
  th: {
    padding: '4px',
    borderBottom: CELL_BORDER,
    borderRight: CELL_BORDER,
    backgroundColor: '#fff', 
    position: 'sticky',      
    top: 0,                  
    zIndex: 40,
    textAlign: 'left',
    fontWeight: 'bold',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    height: `${HEADER_HEIGHT}px`,
    maxHeight: `${HEADER_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'table-cell',
    verticalAlign: 'middle',
    backgroundClip: 'padding-box'
  },
  td: {
    padding: 0,
    borderBottom: CELL_BORDER,
    borderRight: CELL_BORDER,
    verticalAlign: 'middle',
    userSelect: 'none',
    height: `${ROW_HEIGHT}px`,
    maxHeight: `${ROW_HEIGHT}px`,
    overflow: 'hidden',
    textAlign: 'center',
    boxSizing: 'border-box',
    display: 'table-cell',
    touchAction: 'none'
  },
  stickyCell: {
    position: 'sticky',
    left: 0,
    backgroundColor: '#fff',
    zIndex: 30,
    textAlign: 'left',
    paddingLeft: '12px'
  },
  dateHeaderCell: {
    minWidth: COL_WIDTH,
    width: COL_WIDTH,
    maxWidth: COL_WIDTH,
    textAlign: 'center',
    padding: 0,
    display: 'table-cell',
    verticalAlign: 'middle'
  },
  staffNameCell: {
    minWidth: 150,
    width: 150,
    maxWidth: 150,
    cursor: 'pointer',
    verticalAlign: 'middle',
  },
  holidayAdjustCell: {
    minWidth: 120,
    width: 120,
    maxWidth: 120,
    textAlign: 'center',
    left: 150,
    verticalAlign: 'middle',
    padding: 0
  },
  weekendBg: {
    backgroundColor: '#f5f5f5',
  },
  holidayBg: {
    backgroundColor: '#ffebee', // 薄い赤
  },
  cellClickable: {
    cursor: 'pointer',
  },
  cellSelectable: {
    cursor: 'cell',
  },
  assignmentChipContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentChip: {
    borderRadius: '3px',
    padding: '2px 4px',
    fontSize: '0.75rem',
    display: 'inline-flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '90%',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    lineHeight: 1.1,
    minHeight: '34px',
    maxHeight: '44px',
    overflow: 'hidden'
  },
};

interface StaffCellProps {
  staffId: string;
  dateStr: string;
  staffIndex: number;
  dayIndex: number;
  assignments: IAssignment[];
  patternMap: Map<string, IShiftPattern>;
  isWeekend: boolean;
  clickMode: ClickMode;
  rowBorderStyle: CSSProperties;
  onCellClick: (e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, sIdx: number, dIdx: number) => void;
  onCellMouseDown: (e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, sIdx: number, dIdx: number) => void;
  onCellMouseMove: (date: string, staffId: string, sIdx: number, dIdx: number) => void;
  onCellMouseUp: () => void;
  prevAssignments?: IAssignment[];
}

const StaffCell = React.memo(({
  staffId, dateStr, staffIndex, dayIndex,
  assignments, patternMap,
  isWeekend, clickMode, rowBorderStyle,
  onCellClick, onCellMouseDown, onCellMouseMove, onCellMouseUp,
  prevAssignments
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
        const timeStr = (assignment.overrideStartTime || pattern.startTime || "").replace(':', '');
        chipContent = (
          <>
            <div>{symbolText}</div>
            <div style={{ fontSize: '0.65rem', transform: 'scale(0.9)', lineHeight: 1, opacity: 0.8 }}>
              {timeStr}
            </div>
          </>
        );
      }
      
      return (
        <div
          key={assignment.id}
          style={{ 
            ...styles.assignmentChip, 
            backgroundColor: bgColor, 
            color: textColor,
          }}
        >
          {chipContent}
        </div>
      );
    });
  } else {
    let isHalfHoliday = false;
    if (prevAssignments && prevAssignments.length > 0) {
      const hasPrevNightShift = prevAssignments.some(a => {
        const p = patternMap.get(a.patternId);
        return p?.isNightShift === true;
      });
      if (hasPrevNightShift) {
        isHalfHoliday = true;
      }
    }

    if (isHalfHoliday) {
      contentNodes = (
        <div style={{ ...styles.assignmentChip, backgroundColor: 'transparent', color: '#757575', fontSize: '1.2rem', fontWeight: 'bold' }}>
          /
        </div>
      );
    } else {
      contentNodes = <span style={{ color: '#e0e0e0', fontSize: '0.8rem' }}>-</span>;
    }
  }

  return (
    <TableCell
      data-staff-id={staffId}
      data-date={dateStr}
      data-staff-index={staffIndex}
      data-date-index={dayIndex}
      id={`cell-${staffId}-${dateStr}`}
      style={{
        ...styles.td,
        ...cellStyle,
        ...(isWeekend ? styles.weekendBg : {}),
        ...rowBorderStyle,
        touchAction: clickMode === 'select' ? 'none' : 'auto'
      }}
      onClick={(e) => onCellClick(e, dateStr, staffId, staffIndex, dayIndex)}
      onMouseDown={(e) => onCellMouseDown(e, dateStr, staffId, staffIndex, dayIndex)}
      onMouseMove={() => onCellMouseMove(dateStr, staffId, staffIndex, dayIndex)}
      onMouseUp={onCellMouseUp}
    >
      <div style={styles.assignmentChipContainer}>
        {contentNodes}
      </div>
    </TableCell>
  );
}, (prev, next) => {
  if (
    prev.staffId !== next.staffId ||
    prev.dateStr !== next.dateStr ||
    prev.isWeekend !== next.isWeekend ||
    prev.clickMode !== next.clickMode ||
    prev.rowBorderStyle !== next.rowBorderStyle
  ) {
    return false;
  }
  if (prev.assignments.length !== next.assignments.length) return false;
  for (let i = 0; i < prev.assignments.length; i++) {
    if (
      prev.assignments[i].id !== next.assignments[i].id ||
      prev.assignments[i].patternId !== next.assignments[i].patternId ||
      prev.assignments[i].overrideStartTime !== next.assignments[i].overrideStartTime
    ) {
      return false;
    }
  }
  const prevLen = prev.prevAssignments?.length || 0;
  const nextLen = next.prevAssignments?.length || 0;
  if (prevLen !== nextLen) return false;
  if (prevLen > 0 && next.prevAssignments) {
      for (let i = 0; i < prevLen; i++) {
         if (prev.prevAssignments![i].patternId !== next.prevAssignments[i].patternId) return false;
      }
  }
  return true;
});

const ScrollerWithOverlay = React.forwardRef<HTMLDivElement, any>((props, ref) => (
  <div {...props} ref={ref} style={{ ...props.style, position: 'relative' }}>
    {props.children}
    <div 
      id="selection-overlay" 
      style={{
        position: 'absolute',
        pointerEvents: 'none', 
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
        border: '2px solid #1976d2',
        zIndex: 5, 
        display: 'none',
        boxSizing: 'border-box',
        transition: 'none'
      }} 
    />
  </div>
));

const VirtuosoTableComponents: TableComponents<any> = {
  Scroller: ScrollerWithOverlay,
  Table: (props) => (
    <Table 
      {...props} 
      style={{ 
        borderCollapse: 'separate', 
        borderSpacing: 0, 
        width: '100%', 
        tableLayout: 'fixed',
        borderTop: CELL_BORDER,
        borderLeft: CELL_BORDER
      }} 
    />
  ),
  TableHead: React.forwardRef((props, ref) => (
    <TableHead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 40 }} />
  )),
  TableRow: TableRow,
  TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
};

export default function StaffCalendarView({
  sortedStaffList,
  onCellClick,
  onHolidayIncrement,
  onHolidayDecrement,
  onHolidayReset,
  staffHolidayRequirements,
  onStaffNameClick,
  onDateHeaderClick,
  clickMode,
  selectionRange,
  onCellMouseDown,
  onCellMouseMove,
  onCellMouseUp,
  mainCalendarScrollerRef,
  monthDays,
  onAutoScroll
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

  useEffect(() => {
    const overlay = document.getElementById('selection-overlay');
    if (!overlay) return;
    if (!selectionRange || clickMode !== 'select') {
      overlay.style.display = 'none';
      return;
    }
    const sIdx = Math.min(selectionRange.start.staffIndex, selectionRange.end.staffIndex);
    const eIdx = Math.max(selectionRange.start.staffIndex, selectionRange.end.staffIndex);
    const dStart = Math.min(selectionRange.start.dateIndex, selectionRange.end.dateIndex);
    const dEnd = Math.max(selectionRange.start.dateIndex, selectionRange.end.dateIndex);
    const top = HEADER_HEIGHT + (sIdx * ROW_HEIGHT);
    const height = (eIdx - sIdx + 1) * ROW_HEIGHT;
    const left = LEFT_COL_WIDTH + (dStart * COL_WIDTH);
    const width = (dEnd - dStart + 1) * COL_WIDTH;
    overlay.style.display = 'block';
    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
  }, [selectionRange, clickMode]);

  const onCellClickRef = useRef(onCellClick);
  const onCellMouseDownRef = useRef(onCellMouseDown);
  const onCellMouseMoveRef = useRef(onCellMouseMove);
  const onCellMouseUpRef = useRef(onCellMouseUp);

  useEffect(() => {
    onCellClickRef.current = onCellClick;
    onCellMouseDownRef.current = onCellMouseDown;
    onCellMouseMoveRef.current = onCellMouseMove;
    onCellMouseUpRef.current = onCellMouseUp;
  });

  const stableOnCellClick = useCallback((e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, sIdx: number, dIdx: number) => {
    onCellClickRef.current(e, date, staffId, sIdx, dIdx);
  }, []);
  const stableOnCellMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, date: string, staffId: string, sIdx: number, dIdx: number) => {
    onCellMouseDownRef.current(e, date, staffId, sIdx, dIdx);
  }, []);
  const stableOnCellMouseMove = useCallback((date: string, staffId: string, sIdx: number, dIdx: number) => {
    onCellMouseMoveRef.current(date, staffId, sIdx, dIdx);
  }, []);
  const stableOnCellMouseUp = useCallback(() => {
    onCellMouseUpRef.current();
  }, []);

  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const lastTouchMoveTimeRef = useRef<number>(0);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (clickMode !== 'select') return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    
    const element = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const cell = element?.closest('td');
    if (cell) {
      const staffId = cell.getAttribute('data-staff-id');
      const dateStr = cell.getAttribute('data-date');
      const sIdx = Number(cell.getAttribute('data-staff-index'));
      const dIdx = Number(cell.getAttribute('data-date-index'));
      
      if (staffId && dateStr && !isNaN(sIdx) && !isNaN(dIdx)) {
        stableOnCellMouseDown(e, dateStr, staffId, sIdx, dIdx);
      }
    }
  }, [clickMode, stableOnCellMouseDown]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (clickMode !== 'select') return;
    
    const now = Date.now();
    if (now - lastTouchMoveTimeRef.current < 30) {
      return;
    }
    lastTouchMoveTimeRef.current = now;

    const touch = e.touches[0];
    onAutoScroll(touch.clientX, touch.clientY);
    
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = element?.closest('td');
    if (cell) {
      const staffId = cell.getAttribute('data-staff-id');
      const dateStr = cell.getAttribute('data-date');
      const sIdx = Number(cell.getAttribute('data-staff-index'));
      const dIdx = Number(cell.getAttribute('data-date-index'));
      
      if (staffId && dateStr && !isNaN(sIdx) && !isNaN(dIdx)) {
        stableOnCellMouseMove(dateStr, staffId, sIdx, dIdx);
      }
    }
  }, [clickMode, stableOnCellMouseMove, onAutoScroll]);

  const handleTouchEnd = useCallback(() => {
    stableOnCellMouseUp();
    touchStartRef.current = null;
  }, [stableOnCellMouseUp]);

  const fixedHeaderContent = () => (
    <TableRow>
      <TableCell style={{ ...styles.th, ...styles.stickyCell, ...styles.staffNameCell, zIndex: 50 }}>スタッフ</TableCell>
      <TableCell style={{ ...styles.th, ...styles.stickyCell, ...styles.holidayAdjustCell, zIndex: 50 }}>
        公休調整
      </TableCell>
      {monthDays.map(dayInfo => {
        // ★ 祝日判定ロジック
        const isHoliday = !!dayInfo.holidayName;
        const isSunday = dayInfo.dayOfWeek === 0;
        const isSaturday = dayInfo.dayOfWeek === 6;
        
        let color = 'inherit';
        let bgColor = '#fff';
        
        if (isHoliday || isSunday) {
          color = '#d32f2f'; // 赤
          bgColor = '#ffebee'; // 薄い赤背景
        } else if (isSaturday) {
          color = '#1976d2'; // 青
          bgColor = '#e3f2fd'; // 薄い青背景
        } else {
          bgColor = '#fff';
        }

        return (
          <TableCell
            key={dayInfo.dateStr}
            style={{
              ...styles.th,
              ...styles.dateHeaderCell,
              backgroundColor: bgColor,
              color: color,
              cursor: 'pointer'
            }}
            onClick={() => onDateHeaderClick(dayInfo.dateStr)}
            title={dayInfo.holidayName}
          >
            {dayInfo.dateStr.split('-')[2]}<br />({dayInfo.weekday})
            {dayInfo.holidayName && <div style={{fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{dayInfo.holidayName}</div>}
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
      if (staff.unitId !== prevStaff.unitId) {
        rowBorderStyle = { borderTop: '3px double #000' };
      }
    }
    const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || 0;

    return (
      <>
        <TableCell
          style={{ ...styles.td, ...styles.stickyCell, ...styles.staffNameCell, ...rowBorderStyle }}
          onClick={() => onStaffNameClick(staff)}
        >
          {staff.name}
          <span style={{
            display: 'block',
            fontSize: '0.75rem',
            color: staff.employmentType === 'FullTime' ? '#1976d2' : '#666',
            fontWeight: 'normal'
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
            
            {/* ★ リセット用クリックハンドラ */}
            <span 
              style={{ 
                padding: '0 4px', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                borderBottom: '1px dotted #ccc',
                userSelect: 'none'
              }}
              title="クリックで自動計算（デフォルト）にリセット"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`${staff.name}さんの必要公休数を、デフォルト（自動計算値）に戻しますか？`)) {
                  onHolidayReset(staff.staffId);
                }
              }}
            >
              {requiredHolidays} 日
            </span>

            <IconButton size="small" onClick={() => onHolidayIncrement(staff.staffId)}>
              <AddCircleOutlineIcon sx={{ fontSize: '1.25rem' }} />
            </IconButton>
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
              staffId={staff.staffId}
              dateStr={dayInfo.dateStr}
              staffIndex={staffIndex}
              dayIndex={dayIndex}
              assignments={assignmentsForCell} 
              patternMap={patternMap}
              isWeekend={isWeekend}
              clickMode={clickMode}
              rowBorderStyle={{
                ...rowBorderStyle,
                ...(isHoliday ? styles.holidayBg : (isWeekend ? styles.weekendBg : {}))
              }}
              onCellClick={stableOnCellClick}
              onCellMouseDown={stableOnCellMouseDown}
              onCellMouseMove={stableOnCellMouseMove}
              onCellMouseUp={stableOnCellMouseUp}
              prevAssignments={prevAssignments}
            />
          );
        })}
      </>
    );
  }, [
    sortedStaffList, staffHolidayRequirements, assignmentsMap, patternMap, monthDays,
    onHolidayDecrement, onHolidayIncrement, onHolidayReset, onStaffNameClick,
    clickMode,
    stableOnCellClick, stableOnCellMouseDown, stableOnCellMouseMove, stableOnCellMouseUp
  ]);

  return (
    <Box 
      sx={{ flex: 1, minHeight: 0 }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <TableVirtuoso
        scrollerRef={(ref) => {
          if (ref && !(ref instanceof Window)) {
            mainCalendarScrollerRef.current = ref;
          } else {
            mainCalendarScrollerRef.current = null;
          }
        }}
        style={{ height: '100%', border: '1px solid #e0e0e0', borderRadius: '4px' }}
        data={sortedStaffList}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={itemContent}
        components={VirtuosoTableComponents}
      />
    </Box>
  );
};