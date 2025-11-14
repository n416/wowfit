import React, { CSSProperties } from 'react'; // ★ CSSProperties をインポート
import { 
  // ★★★ v5.44 修正: 未使用の Paper, Typography, Stack を削除 ★★★
  IconButton, 
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment } from '../../db/dexie';
import { MONTH_DAYS } from '../../utils/dateUtils';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';

interface StaffCalendarViewProps {
  onCellClick: (date: string, staffId: string) => void; 
  onHolidayIncrement: (staffId: string) => void;
  onHolidayDecrement: (staffId: string) => void;
  staffHolidayRequirements: Map<string, number>; 
}

// ★★★ v5.41 修正: CSS Grid用のスタイル定義 ★★★
const styles: { [key: string]: CSSProperties } = {
  gridContainer: {
    maxHeight: 600,
    overflow: 'auto', // 縦横のスクロール
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    backgroundColor: '#fff',
  },
  grid: {
    display: 'grid',
    // 列定義: [スタッフ名] [公休調整] [日付...] (日付は30日分)
    gridTemplateColumns: `150px 120px repeat(${MONTH_DAYS.length}, minmax(80px, 1fr))`,
    position: 'relative', // sticky の基準
  },
  headerCell: {
    padding: '8px',
    borderBottom: '1px solid #e0e0e0',
    borderRight: '1px solid #e0e0e0',
    backgroundColor: '#f9f9f9',
    position: 'sticky',
    top: 0,
    zIndex: 11,
    fontWeight: 'bold',
  },
  dateHeaderCell: {
    textAlign: 'center',
    minWidth: 80,
  },
  stickyCol1: { // スタッフ名
    position: 'sticky',
    left: 0,
    zIndex: 10,
  },
  stickyCol2: { // 公休調整
    position: 'sticky',
    left: 150, // Col1の幅
    zIndex: 10,
  },
  cell: {
    padding: '4px',
    borderBottom: '1px solid #e0e0e0',
    borderRight: '1px solid #e0e0e0',
    minHeight: '50px', // セルの最小高さ
  },
  cellClickable: {
    cursor: 'pointer',
  },
  staffNameCell: {
    backgroundColor: '#fff', // スクロール時に日付が透けないように
  },
  adjustCell: {
    backgroundColor: '#fff', // スクロール時に日付が透けないように
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekendBg: {
    backgroundColor: '#f5f5f5',
  },
  rowBorderTop: {
    borderTop: '3px double #000',
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
// ★★★ v5.41 修正ここまで ★★★


export default function StaffCalendarView({ 
  onCellClick, 
  onHolidayIncrement, 
  onHolidayDecrement,
  staffHolidayRequirements 
}: StaffCalendarViewProps) {
  
  const { staff: staffList } = useSelector((state: RootState) => state.staff);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const patternMap = React.useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  const sortedStaffList = React.useMemo(() => {
    return [...staffList].sort((a, b) => {
      const unitA = a.unitId || 'ZZZ';
      const unitB = b.unitId || 'ZZZ';
      if (unitA === unitB) {
        return a.name.localeCompare(b.name);
      }
      // ★★★ v5.44 修正: b.unitB を unitB に修正 ★★★
      return unitA.localeCompare(unitB);
    });
  }, [staffList]);

  const assignmentsMap = React.useMemo(() => {
    const map = new Map<string, IAssignment[]>(); 
    for (const assignment of assignments) { 
      const key = `${assignment.staffId}_${assignment.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(assignment); 
    }
    return map;
  }, [assignments]);

  return (
    <>
      {/* ★★★ v5.41 修正: Typography を h6 に ★★★ */}
      <h6 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 500 }}>
        スタッフビュー（カレンダー）
      </h6>
      
      {/* ★★★ v5.41 修正: <table> を CSS Grid (div) に置換 ★★★ */}
      <div style={styles.gridContainer}>
        <div style={styles.grid}>
          
          {/* Header Row */}
          <div style={{ ...styles.headerCell, ...styles.stickyCol1, zIndex: 12 }}>スタッフ</div>
          <div style={{ ...styles.headerCell, ...styles.stickyCol2, zIndex: 12 }}>公休調整</div>
          {MONTH_DAYS.map(dayInfo => (
            <div 
              key={dayInfo.dateStr}
              style={{
                ...styles.headerCell,
                ...styles.dateHeaderCell,
                backgroundColor: (dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6) ? '#eeeeee' : '#f9f9f9'
              }}
            >
              {dayInfo.dateStr.split('-')[2]}<br/>({dayInfo.weekday})
            </div>
          ))}

          {/* Data Rows (CSS Gridは行を意識せずセルを並べるだけ) */}
          {sortedStaffList.map((staff: IStaff, index: number) => {
            
            let rowBorderStyle: CSSProperties = {};
            if (index > 0) {
              const prevStaff = sortedStaffList[index - 1];
              if (staff.unitId !== prevStaff.unitId) {
                rowBorderStyle = styles.rowBorderTop;
              }
            }
            
            const requiredHolidays = staffHolidayRequirements.get(staff.staffId) || 0; 

            return (
              <React.Fragment key={staff.staffId}>
                {/* Staff Name Cell */}
                <div style={{ ...styles.cell, ...styles.stickyCol1, ...styles.staffNameCell, ...rowBorderStyle }}>
                  {staff.name}
                  <span style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    color: staff.employmentType === 'FullTime' ? '#1976d2' : '#666'
                  }}>
                    ({staff.unitId || 'フリー'})
                  </span>
                </div>
                
                {/* Holiday Adjust Cell */}
                <div style={{ ...styles.cell, ...styles.stickyCol2, ...styles.adjustCell, ...rowBorderStyle }}>
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

                {/* Date Cells */}
                {MONTH_DAYS.map(dayInfo => {
                  const key = `${staff.staffId}_${dayInfo.dateStr}`;
                  const assignmentsForCell = assignmentsMap.get(key) || [];
                  const isWeekend = dayInfo.dayOfWeek === 0 || dayInfo.dayOfWeek === 6;
                  
                  return (
                    <div 
                      key={key} 
                      style={{
                        ...styles.cell,
                        ...styles.cellClickable,
                        ...(isWeekend ? styles.weekendBg : {}),
                        ...rowBorderStyle
                      }}
                      onClick={() => onCellClick(dayInfo.dateStr, staff.staffId)}
                    >
                      {assignmentsForCell.length === 0 ? (
                        <span style={{ display: 'block', textAlign: 'center', color: '#888' }}>
                          -
                        </span>
                      ) : (
                        assignmentsForCell.map(assignment => {
                          const pattern = assignment.patternId ? patternMap.get(assignment.patternId) : null;
                          let bgColor = '#e0e0e0'; // default
                          let textColor = 'rgba(0, 0, 0, 0.87)';
                            
                            if (pattern?.workType === 'StatutoryHoliday' || pattern?.workType === 'PaidLeave') {
                              bgColor = '#ef9a9a'; // 赤系
                            } else if (pattern?.isNightShift) {
                              bgColor = '#bdbdbd'; // 濃いグレー
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
                              {pattern?.patternId || '??'}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
};