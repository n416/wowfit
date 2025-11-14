import React, { useMemo, CSSProperties } from 'react'; // ★ v5.44 修正: React を削除
import { 
  Typography, Button, 
  // ★★★ v5.44 修正: 未使用の Paper を削除 ★★★
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment, IUnit } from '../../db/dexie';
import { MONTH_DAYS, /* getPrevDateStr */ } from '../../utils/dateUtils'; // ★ v5.44 修正: 未使用

interface WorkSlotCalendarViewProps {
  onCellClick: (date: string, unitId: string | null) => void;
  onHolidayPlacementClick: () => void;
  onFillRentalClick: () => void;
  onResetClick: () => void;
  demandMap: Map<string, { required: number; actual: number }>;
}

// ★★★ v5.41 修正: CSS Grid用のスタイル定義 ★★★
const styles: { [key: string]: CSSProperties } = {
  gridContainer: {
    maxHeight: '600px',
    overflow: 'auto',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
  },
  grid: {
    display: 'grid',
    // gridTemplateColumns は動的に設定
    position: 'relative',
  },
  headerCell: {
    border: '1px solid #e0e0e0',
    padding: '6px',
    backgroundColor: '#fff',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  cell: {
    border: '1px solid #e0e0e0',
    padding: '4px',
    verticalAlign: 'top',
  },
  dateCell: {
    backgroundColor: '#f9f9f9',
    whiteSpace: 'nowrap',
    fontWeight: 'bold',
    position: 'sticky',
    left: 0,
    zIndex: 2,
    minWidth: '120px',
  },
  unitHeaderCell: {
    minWidth: '150px',
  },
  clickableCell: {
    cursor: 'pointer',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '16px',
    padding: '4px 8px',
    fontSize: '0.75rem',
    marginRight: '4px',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
  },
  barContainer: {
    display: 'flex', 
    width: '100%', 
    height: '16px', 
    marginBottom: '4px', 
    border: '1px solid #e0e0e0', 
    backgroundColor: '#f5f5f5'
  }
};
// ★★★ v5.41 修正ここまで ★★★


export default function WorkSlotCalendarView({
  onCellClick,
  onHolidayPlacementClick,
  onFillRentalClick,
  onResetClick,
  demandMap
}: WorkSlotCalendarViewProps) {
  const { staff: staffList } = useSelector((state: RootState) => state.staff);
  const unitList = useSelector((state: RootState) => state.unit.units);
  const { assignments } = useSelector((state: RootState) => state.assignment);
  const { patterns: shiftPatterns } = useSelector((state: RootState) => state.pattern);

  const staffMap = useMemo(() => new Map(staffList.map((s: IStaff) => [s.staffId, s])), [staffList]);
  const patternMap = useMemo(() => new Map(shiftPatterns.map((p: IShiftPattern) => [p.patternId, p])), [shiftPatterns]);
  
  const assignmentsMap = useMemo(() => {
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

  // ★★★ v5.41 修正: CSS Gridの列定義を動的に生成 ★★★
  const gridTemplateColumns = `120px repeat(${unitList.length}, minmax(150px, 1fr))`;

  return (
    <>
      <Typography variant="h6" gutterBottom>ステップ1/2：公休配置 と 応援スタッフ穴埋め</Typography>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={onHolidayPlacementClick}>
          1. 「公休」を自動配置 (v5)
        </Button>
        <Typography>&gt;&gt;</Typography>
        <Button variant="contained" color="secondary" onClick={onFillRentalClick}>
          2. 「応援スタッフ」で穴埋め (v5)
        </Button>
        <Button variant="outlined" color="error" onClick={onResetClick} style={{ marginLeft: 'auto' }}>
          アサインをリセット
        </Button>
      </div>

      {/* ★★★ v5.41 修正: <table> を CSS Grid (div) に置換 ★★★ */}
      <div style={styles.gridContainer}>
        <div style={{...styles.grid, gridTemplateColumns: gridTemplateColumns}}>
          
          {/* Header Row */}
          <div style={{ ...styles.headerCell, ...styles.dateCell, zIndex: 3 }}>日付</div>
          {unitList.map((unit: IUnit) => (
            <div key={unit.unitId} style={{ ...styles.headerCell, ...styles.unitHeaderCell }}>
              {unit.name}
            </div>
          ))}

          {/* Data Rows (Gridは行を意識せずセルを並べるだけ) */}
          {MONTH_DAYS.map(dayInfo => (
            <React.Fragment key={dayInfo.dateStr}>
              {/* Date Cell */}
              <div style={{ ...styles.cell, ...styles.dateCell }}>
                {dayInfo.dateStr.split('-')[2]}日 ({dayInfo.weekday})
              </div>
              
              {/* Unit Cells */}
              {unitList.map((unit: IUnit) => {
                const key = `${dayInfo.dateStr}_${unit.unitId}`;
                const assignmentsForCell = assignmentsMap.get(key) || [];
                
                return (
                  <div 
                    key={key} 
                    style={{ ...styles.cell, ...styles.clickableCell }}
                    onClick={() => onCellClick(dayInfo.dateStr, unit.unitId)}
                  >
                    {/* 24時間バー (変更なし) */}
                    <div style={styles.barContainer}>
                      {Array.from({ length: 24 }).map((_, hour) => {
                        const demandKey = `${dayInfo.dateStr}_${unit.unitId}_${hour}`;
                        const demandData = demandMap.get(demandKey);
                        
                        let bgColor = 'transparent';
                        let title = `${hour}:00 Need:0`;

                        if (demandData && demandData.required > 0) {
                          if (demandData.actual < demandData.required) {
                            bgColor = '#d32f2f'; // error
                            title = `${hour}:00 - ${hour+1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (不足)`;
                          } else if (demandData.actual > demandData.required) {
                            bgColor = '#66bb6a'; // success
                            title = `${hour}:00 - ${hour+1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (過剰)`;
                          } else {
                            bgColor = '#1976d2'; // primary
                            title = `${hour}:00 - ${hour+1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (充足)`;
                          }
                        }
                        
                        return (
                          <div 
                            key={hour}
                            title={title}
                            style={{ 
                              flex: 1, 
                              backgroundColor: bgColor,
                              borderRight: (hour + 1) % 6 === 0 && hour < 23 ? '1px solid #bdbdbd' : 'none',
                            }} 
                          />
                        );
                      })}
                    </div>

                    {/* スタッフ表示 (変更なし) */}
                    {assignmentsForCell.map(assignment => {
                      const staff = staffMap.get(assignment.staffId);
                      const pattern = patternMap.get(assignment.patternId);
                      const isNight = pattern?.isNightShift;
                      return (
                        <div 
                          key={assignment.id}
                          style={{
                            ...styles.chip,
                            backgroundColor: isNight ? '#e0e0e0' : '#e0e0e0',
                            color: isNight ? '#d32f2f' : 'rgba(0, 0, 0, 0.87)',
                          }}
                        >
                          {`${pattern?.patternId || '??'} (${staff?.name || '??'})`}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
};