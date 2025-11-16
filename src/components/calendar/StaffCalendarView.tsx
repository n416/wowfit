import React, { CSSProperties, useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { 
  IconButton, 
  Table, TableBody, TableCell, TableHead, TableRow,
  Box,
  Collapse, 
  FormControlLabel, 
  Checkbox 
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment } from '../../db/dexie';
import { MONTH_DAYS } from '../../utils/dateUtils';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
// ★ TableVirtuoso の型をインポート
import { TableVirtuoso, TableVirtuosoHandle } from 'react-virtuoso';
import { CellCoords, ClickMode } from '../../hooks/useCalendarInteractions';

interface StaffCalendarViewProps {
  sortedStaffList: IStaff[]; 
  onCellClick: (date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
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
  workAreaRef: React.RefObject<HTMLDivElement | null>;
  // ★ 型 'RefObject<HTMLElement | null>' は正しい
  mainCalendarScrollerRef: React.RefObject<HTMLElement | null>;
}

// (styles 定義 - box-shadow 修正済み)
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
    padding: '4px', // ★ tdのpadding(8px) -> 4px に上書き
    borderLeft: '1px solid #e0e0e0',
    cursor: 'pointer',
  },
  cellSelectable: {
    padding: '4px', // ★ tdのpadding(8px) -> 4px に上書き
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
  // ★★★ 作業領域セル用のスタイル ★★★
  workAreaCell: {
    padding: '8px', // ★ 基本のpaddingは8px
    border: '1px solid #e0e0e0',
    verticalAlign: 'top',
    userSelect: 'none',
    minHeight: '60px', 
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
};


export default function StaffCalendarView({ 
  // (props)
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
  // ★ ref を受け取る
  workAreaRef,
  mainCalendarScrollerRef
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
  
  // (作業領域 state - 変更なし)
  const [showWorkArea, setShowWorkArea] = useState(false);
  const lastClickModeRef = useRef(clickMode);
  useEffect(() => {
    if (clickMode !== lastClickModeRef.current) {
      if (clickMode === 'select') {
        setShowWorkArea(true); 
      } else {
        setShowWorkArea(false); 
      }
      lastClickModeRef.current = clickMode;
    }
  }, [clickMode]);
  
  // (作業領域 仮想セル定義 - 変更なし)
  const workAreaRowCount = useMemo(() => {
    const calculatedRows = Math.ceil(sortedStaffList.length * 1.5);
    return Math.max(10, calculatedRows);
  }, [sortedStaffList.length]);
  const workAreaColCount = useMemo(() => MONTH_DAYS.length, []);
  const virtualWorkAreaRows = useMemo(() => {
    return Array.from({ length: workAreaRowCount }, (_, index) => {
      return {
        staffId: `WA_STAFF_${index}`, 
        staffIndex: 900 + index, 
      };
    });
  }, [workAreaRowCount]);
  const virtualWorkAreaCols = useMemo(() => {
    return MONTH_DAYS.map((dayInfo, index) => {
      return {
        date: `WA_DATE_${index}`,
        dateIndex: 900 + index,
        originalDateKey: dayInfo.dateStr, 
        isWeekend: dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6,
      };
    });
  }, []); 
  
  // (ヘッダー行 - 変更なし)
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

  // (データ行をレンダリングする関数 - box-shadow修正済み)
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

        {/* (日付セル - 変更あり) */}
        {MONTH_DAYS.map((dayInfo, dayIndex) => {
          const key = `${staff.staffId}_${dayInfo.dateStr}`;
          const assignmentsForCell = assignmentsMap.get(key) || [];
          const isWeekend = dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6;
          
          // (スタイル計算 - 変更なし)
          const isSelected = selectedRangeIndices && 
                             staffIndex >= selectedRangeIndices.minStaff && 
                             staffIndex <= selectedRangeIndices.maxStaff &&
                             dayIndex >= selectedRangeIndices.minDate && 
                             dayIndex <= selectedRangeIndices.maxDate;
          const isActive = activeCell && 
                           activeCell.staffId === staff.staffId && 
                           activeCell.date === dayInfo.dateStr;
          const cellStyle = clickMode === 'select' ? styles.cellSelectable : styles.cellClickable;
          
          // (box-shadowロジック - 変更なし)
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
              style={{
                ...styles.td, 
                ...cellStyle, 
                ...(isWeekend ? styles.weekendBg : {}),
                ...rowBorderStyle,
                ...(isSelected ? { backgroundColor: 'rgba(25, 118, 210, 0.1)' } : {}),
                ...selectionStyle, 
              }}
              // (イベントハンドラ - 変更なし)
              onClick={() => onCellClick(dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
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
    sortedStaffList, staffHolidayRequirements, assignmentsMap, patternMap, 
    onHolidayDecrement, onHolidayIncrement, onStaffNameClick,
    clickMode, activeCell, selectedRangeIndices,
    onCellClick, onCellMouseDown, onCellMouseMove, onCellMouseUp
  ]);
  
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* 1. メインのカレンダー (Virtuoso) */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TableVirtuoso
          // ★★★ ここが修正点です ★★★
          // scrollerRef={mainCalendarScrollerRef} (誤)
          scrollerRef={(ref) => { // (正)
            // Virtuoso から受け取った scroller (HTMLElement | Window | null) を
            // 親 (Page) から渡された ref (RefObject) に設定する
            if (ref && !(ref instanceof Window)) {
              mainCalendarScrollerRef.current = ref;
            } else {
              mainCalendarScrollerRef.current = null;
            }
          }}
          // ★★★ 修正ここまで ★★★
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
      
      {/* 2. チェックボックス (カレンダーの下) */}
      <Box sx={{ 
        // (変更なし)
        p: '4px 16px', 
        display: 'flex', 
        justifyContent: 'flex-end', 
        alignItems: 'center', 
        flexShrink: 0, 
        border: '1px solid #e0e0e0', 
        borderTop: 'none', 
        backgroundColor: '#fff' 
      }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={showWorkArea}
              onChange={(e) => setShowWorkArea(e.target.checked)}
              size="small"
            />
          }
          label={<span style={{ fontSize: '0.875rem' }}>作業用セルを表示する</span>}
        />
      </Box>

      {/* ★★★ 3. 作業用セル領域 (CSS Grid) ★★★ */}
      <Collapse in={showWorkArea} sx={{ flexShrink: 0, borderBottom: '1px solid #e0e0e0' }}>
        {/* ★ スクロール用のコンテナ */}
        <Box 
          // ★ ref を設定 (変更なし)
          ref={workAreaRef} 
          sx={{
            height: '250px', 
            overflow: 'auto', 
            border: '1px solid #e0e0e0',
            borderTop: 'none',
            backgroundColor: '#f9f9f9', 
          }}
        >
          {/* ★ CSS Grid 本体 */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${workAreaColCount}, minmax(80px, 1fr))`,
            gridTemplateRows: `repeat(${workAreaRowCount}, minmax(60px, auto))`, 
          }}>
            
            {/* ★ 仮想の行 x 仮想の列 でセルを生成 */}
            {virtualWorkAreaRows.map((row) => (
              virtualWorkAreaCols.map((col) => {
                
                const key = `${row.staffId}_${col.date}`;
                const assignmentsForCell = assignmentsMap.get(key) || [];

                // (スタイル計算 - 変更なし)
                const isSelected = selectedRangeIndices && 
                                  (row.staffIndex >= selectedRangeIndices.minStaff && 
                                    row.staffIndex <= selectedRangeIndices.maxStaff &&
                                    col.dateIndex >= selectedRangeIndices.minDate && 
                                    col.dateIndex <= selectedRangeIndices.maxDate);
                const isActive = activeCell && 
                                  activeCell.staffId === row.staffId && 
                                  activeCell.date === col.date;
                
                // (box-shadowロジック - 変更なし)
                let selectionStyle: CSSProperties = {}; 
                const shadowColor = '#1976d2'; 
                const shadowWidth = '2px';
                const shadows: string[] = [];
                if (clickMode === 'select' && isSelected && selectedRangeIndices) {
                  const { minStaff, maxStaff, minDate, maxDate } = selectedRangeIndices;
                  if (row.staffIndex === minStaff) shadows.push(`inset 0 ${shadowWidth} 0 0 ${shadowColor}`);
                  if (row.staffIndex === maxStaff) shadows.push(`inset 0 -${shadowWidth} 0 0 ${shadowColor}`);
                  if (col.dateIndex === minDate) shadows.push(`inset ${shadowWidth} 0 0 0 ${shadowColor}`);
                  if (col.dateIndex === maxDate) shadows.push(`inset -${shadowWidth} 0 0 0 ${shadowColor}`);
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
                  <Box
                    key={key}
                    style={{
                      ...styles.workAreaCell, 
                      cursor: (clickMode === 'select' ? styles.cellSelectable.cursor : styles.cellClickable.cursor),
                      backgroundColor: col.isWeekend ? '#f5f5f5' : '#fff', // 週末背景
                      ...(isSelected ? { backgroundColor: 'rgba(25, 118, 210, 0.1)' } : {}), // 選択背景
                      ...selectionStyle, // ★ ここで適用
                    }}
                    // (イベントハンドラ - 変更なし)
                    onClick={() => onCellClick(col.date, row.staffId, row.staffIndex, col.dateIndex)}
                    onMouseDown={(e) => onCellMouseDown(e, col.date, row.staffId, row.staffIndex, col.dateIndex)}
                    onMouseMove={() => onCellMouseMove(col.date, row.staffId, row.staffIndex, col.dateIndex)}
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
                  </Box>
                );
              })
            ))}
          </Box>
        </Box>
      </Collapse>
      
    </Box>
  );
};