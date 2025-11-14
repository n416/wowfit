import React, { useMemo, CSSProperties } from 'react';
import {
  Typography, Button,
  Table, TableBody, TableCell, TableHead, TableRow
} from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment, IUnit } from '../../db/dexie';
import { MONTH_DAYS, /* getPrevDateStr */ } from '../../utils/dateUtils';
import { TableVirtuoso } from 'react-virtuoso';


interface WorkSlotCalendarViewProps {
  onCellClick: (date: string, unitId: string | null) => void;
  onResetClick: () => void;
  demandMap: Map<string, { required: number; actual: number }>;
}

// ★★★ v5.67 修正: CLS対策 ＋ 日付列の幅を 100px に変更 ★★★
const styles: { [key: string]: CSSProperties } = {
  th: {
    border: '1px solid #e0e0e0',
    padding: '6px',
    backgroundColor: '#fff',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    fontWeight: 'bold',
    textAlign: 'left',
    overflow: 'hidden', // ★ CLS対策
    textOverflow: 'ellipsis', // ★ CLS対策
  },
  td: {
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
    minWidth: '1em', // ★ 修正
    width: '1em', // ★ 修正
  },
  unitHeaderCell: {
    minWidth: '150px',
    width: '150px',
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


export default function WorkSlotCalendarView({
  onCellClick,
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

  const fixedHeaderContent = () => (
    <TableRow>
      <TableCell style={{ ...styles.th, ...styles.dateCell, zIndex: 3 }}>日付</TableCell>
      {unitList.map((unit: IUnit) => (
        <TableCell key={unit.unitId} style={{ ...styles.th, ...styles.unitHeaderCell }}>
          {unit.name}
        </TableCell>
      ))}
    </TableRow>
  );

  const itemContent = (_: number, dayInfo: typeof MONTH_DAYS[0]) => {
    return (
      <>
        <TableCell style={{ ...styles.td, ...styles.dateCell }}>
          {dayInfo.dateStr.split('-')[2]}日
          <br />
          ({dayInfo.weekday})
        </TableCell>

        {unitList.map((unit: IUnit) => {
          const key = `${dayInfo.dateStr}_${unit.unitId}`;
          const assignmentsForCell = assignmentsMap.get(key) || [];

          return (
            <TableCell
              key={key}
              style={{ ...styles.td, ...styles.clickableCell }}
              onClick={() => onCellClick(dayInfo.dateStr, unit.unitId)}
            >
              {/* 24時間バー */}
              <div style={styles.barContainer}>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const demandKey = `${dayInfo.dateStr}_${unit.unitId}_${hour}`;
                  const demandData = demandMap.get(demandKey);
                  let bgColor = 'transparent', title = `${hour}:00 Need:0`;
                  if (demandData && demandData.required > 0) {
                    if (demandData.actual < demandData.required) {
                      bgColor = '#d32f2f'; title = `${hour}:00 - ${hour + 1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (不足)`;
                    } else if (demandData.actual > demandData.required) {
                      bgColor = '#66bb6a'; title = `${hour}:00 - ${hour + 1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (過剰)`;
                    } else {
                      bgColor = '#1976d2'; title = `${hour}:00 - ${hour + 1}:00\n必要: ${demandData.required}\n配置: ${demandData.actual} (充足)`;
                    }
                  }
                  return <div key={hour} title={title} style={{ flex: 1, backgroundColor: bgColor, borderRight: (hour + 1) % 6 === 0 && hour < 23 ? '1px solid #bdbdbd' : 'none' }} />;
                })}
              </div>
              {/* スタッフ表示 */}
              {assignmentsForCell.map(assignment => {
                const staff = staffMap.get(assignment.staffId);
                const pattern = patternMap.get(assignment.patternId);
                const isNight = pattern?.isNightShift;
                return (
                  <div key={assignment.id} style={{ ...styles.chip, backgroundColor: isNight ? '#e0e0e0' : '#e0e0e0', color: isNight ? '#d32f2f' : 'rgba(0, 0, 0, 0.87)' }}>
                    {`${pattern?.patternId || '??'} (${staff?.name || '??'})`}
                  </div>
                );
              })}
            </TableCell>
          );
        })}
      </>
    );
  };


  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Button variant="outlined" color="error" onClick={onResetClick}>
          アサインをリセット
        </Button>
      </div>

      <TableVirtuoso
        style={{ height: 600, border: '1px solid #e0e0e0', borderRadius: '4px' }}
        data={MONTH_DAYS}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={itemContent}
        components={{
          // ★★★ v5.66/v5.67 修正: tableLayout: 'fixed' を追加 ★★★
          Table: (props) => <Table {...props} style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }} />,
          TableHead: TableHead,
          TableRow: TableRow,
          TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
        }}
      />
    </>
  );
};