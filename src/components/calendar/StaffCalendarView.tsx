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
// ★ useCalendarInteractions から型をインポート
import { CellCoords, ClickMode } from '../../hooks/useCalendarInteractions';

interface StaffCalendarViewProps {
  // ★ sortedStaffList を Prop で受け取るように変更
  sortedStaffList: IStaff[]; 
  // ★ onCellClick のシグネチャ変更 (index を追加)
  onCellClick: (date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onHolidayIncrement: (staffId: string) => void;
  onHolidayDecrement: (staffId: string) => void;
  staffHolidayRequirements: Map<string, number>; 
  onStaffNameClick: (staff: IStaff) => void;
  
  // --- ★ 選択モード用の Props を追加 ---
  clickMode: ClickMode;
  activeCell: CellCoords | null;
  selectionRange: { start: CellCoords, end: CellCoords } | null;
  onCellMouseDown: (e: React.MouseEvent, date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onCellMouseMove: (date: string, staffId: string, staffIndex: number, dateIndex: number) => void;
  onCellMouseUp: () => void;
  // --- ★ 追加ここまで ---
}

// (styles 定義は変更なし)
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
    // ★ セルの選択を無効化 (ドラッグ用)
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
  // ★ selectモード用のカーソル
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
    // ★ チップ上でドラッグが開始されるのを防ぐ
    pointerEvents: 'none',
  }
};


export default function StaffCalendarView({ 
  sortedStaffList, // ★ Prop で受け取る
  onCellClick, 
  onHolidayIncrement, 
  onHolidayDecrement,
  staffHolidayRequirements,
  onStaffNameClick,
  // ★ 選択モード用の Props を受け取る
  clickMode,
  activeCell,
  selectionRange,
  onCellMouseDown,
  onCellMouseMove,
  onCellMouseUp
}: StaffCalendarViewProps) {
  
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  // ★ 修正: state.assignment.present から assignments を取得
  const { assignments } = useSelector((state: RootState) => state.assignment.present);
  
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  // ★ 内部でのソートロジックを削除 (props で sortedStaffList を受け取るため)

  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment[]>(); 
    for (const assignment of assignments) { 
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment); 
    }
    return map;
  }, [assignments]);
  
  // ★ 選択範囲のインデックスを計算
  const selectedRangeIndices = useMemo(() => {
    if (!selectionRange) return null;
    return {
      minStaff: Math.min(selectionRange.start.staffIndex, selectionRange.end.staffIndex),
      maxStaff: Math.max(selectionRange.start.staffIndex, selectionRange.end.staffIndex),
      minDate: Math.min(selectionRange.start.dateIndex, selectionRange.end.dateIndex),
      maxDate: Math.max(selectionRange.start.dateIndex, selectionRange.end.dateIndex),
    };
  }, [selectionRange]);
  
  // (ヘッダー行は変更なし)
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
    // 'index' が staffIndex に相当
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

        {MONTH_DAYS.map((dayInfo, dayIndex) => {
          const key = `${staff.staffId}_${dayInfo.dateStr}`;
          const assignmentsForCell = assignmentsMap.get(key) || [];
          const isWeekend = dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6;
          
          // --- ★ スタイル計算 ---
          const isSelected = selectedRangeIndices && 
                             staffIndex >= selectedRangeIndices.minStaff && 
                             staffIndex <= selectedRangeIndices.maxStaff &&
                             dayIndex >= selectedRangeIndices.minDate && 
                             dayIndex <= selectedRangeIndices.maxDate;
          
          const isActive = activeCell && 
                           activeCell.staffId === staff.staffId && 
                           activeCell.date === dayInfo.dateStr;
          
          const cellStyle = clickMode === 'select' ? styles.cellSelectable : styles.cellClickable;
          
          // ★★★ 要望1の修正箇所 ★★★
          let selectionBorderStyle: CSSProperties = {};
          if (clickMode === 'select' && isSelected && selectedRangeIndices) {
            const { minStaff, maxStaff, minDate, maxDate } = selectedRangeIndices;
            
            // 選択範囲の外枠に太い罫線を引く
            const borderStyle = '2px solid #1976d2'; // (primary.main)
            if (staffIndex === minStaff) {
              selectionBorderStyle.borderTop = borderStyle;
            }
            if (staffIndex === maxStaff) {
              selectionBorderStyle.borderBottom = borderStyle;
            }
            if (dayIndex === minDate) {
              selectionBorderStyle.borderLeft = borderStyle;
            }
            if (dayIndex === maxDate) {
              selectionBorderStyle.borderRight = borderStyle;
            }
          }

          // アクティブセル（点線のフォーカス）は、選択範囲の罫線より優先・共存する
          if (isActive) {
            selectionBorderStyle = { 
              ...selectionBorderStyle, // 選択範囲の罫線を維持
              outline: '2px dotted #0d47a1', // (primary.dark)
              outlineOffset: '-2px',
              zIndex: 1, 
              position: 'relative', 
            };
          }
          // ★★★ 修正ここまで ★★★

          return (
            <TableCell 
              key={key} 
              style={{
                ...styles.td,
                ...cellStyle, // ★ カーソルをモードによって変更
                ...(isWeekend ? styles.weekendBg : {}),
                ...rowBorderStyle,
                
                // ★ 選択範囲の背景色
                ...(isSelected ? { backgroundColor: 'rgba(25, 118, 210, 0.1)' } : {}),
                
                // ★ 修正: 罫線とフォーカス枠を適用
                ...selectionBorderStyle,
              }}
              // ★ クリックとマウスイベントを接続 (index と dayIndex を渡す)
              onClick={() => onCellClick(dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
              onMouseDown={(e) => onCellMouseDown(e, dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
              onMouseMove={() => onCellMouseMove(dayInfo.dateStr, staff.staffId, staffIndex, dayIndex)}
              onMouseUp={onCellMouseUp}
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
  }, [
    sortedStaffList, staffHolidayRequirements, assignmentsMap, patternMap, 
    onHolidayDecrement, onHolidayIncrement, onStaffNameClick,
    // ★ 依存配列に追加
    clickMode, activeCell, selectedRangeIndices,
    onCellClick, onCellMouseDown, onCellMouseMove, onCellMouseUp
  ]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* (h6 ヘッダーは ShiftCalendarPage に移動済み) */}
      
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TableVirtuoso
          style={{ height: '100%', border: '1px solid #e0e0e0', borderRadius: '4px' }}
          data={sortedStaffList} // ★ props の sortedStaffList を使用
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