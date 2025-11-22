import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Box, Paper, Typography, IconButton, CircularProgress, FormControl, Select, MenuItem
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { db, IAssignment, IPaidLeaveAdjustment, IStaff } from '../db/dexie';
import AnnualSummaryView, { AnnualRowData, AnnualEvent } from '../components/annual/AnnualSummaryView';
import PaidLeaveAdjustmentModal from '../components/annual/PaidLeaveAdjustmentModal';

const SUMMARY_ITEMS = [
  { key: 'paidLeave', label: '有給消化', color: '#2196f3' },
  { key: 'paidLeaveRemain', label: '有給残日数', color: '#4caf50', isInteractive: true },
  { key: 'holiday', label: '公休数', color: '#f44336' },
  { key: 'nightShift', label: '夜勤回数', color: '#424242' },
  { key: 'workDays', label: '勤務日数', color: '#4caf50' },
  { key: 'workHours', label: '労働時間(h)', color: '#ff9800' },
];

export default function AnnualSummaryPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(() => {
    const saved = localStorage.getItem('annualStartMonth');
    return saved ? Number(saved) : 4;
  });

  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<IAssignment[]>([]);
  const [adjustments, setAdjustments] = useState<IPaidLeaveAdjustment[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<{ staff: IStaff, dateStr: string, monthLabel: string } | null>(null);
  const [modalHistory, setModalHistory] = useState<IPaidLeaveAdjustment[]>([]);
  
  const scrollerRef = useRef<HTMLElement | null>(null);

  const staffList = useSelector((state: RootState) => state.staff.staff);
  const patterns = useSelector((state: RootState) => state.pattern.patterns);
  const patternMap = useMemo(() => new Map(patterns.map(p => [p.patternId, p])), [patterns]);

  useEffect(() => {
    localStorage.setItem('annualStartMonth', String(startMonth));
  }, [startMonth]);

  const periodMonths = useMemo(() => {
    const res = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(year, (startMonth - 1) + i, 1);
      res.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1
      });
    }
    return res;
  }, [year, startMonth]);

  const displayMonths = useMemo(() => periodMonths.map(pm => pm.month), [periodMonths]);
  const headerTitle = useMemo(() => {
    const endPm = periodMonths[11];
    return `項目 / ${periodMonths[0].year}年${periodMonths[0].month}月 〜 ${endPm.year}年${endPm.month}月`;
  }, [periodMonths]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const firstPm = periodMonths[0];
      const startStr = `${firstPm.year}-${String(firstPm.month).padStart(2, '0')}-01`;
      const lastPm = periodMonths[11];
      const lastDate = new Date(lastPm.year, lastPm.month, 0); 
      const endStr = `${lastPm.year}-${String(lastPm.month).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;

      const [assignData, adjustData] = await Promise.all([
        db.assignments.where('date').between(startStr, endStr, true, true).toArray(),
        db.paidLeaveAdjustments.toArray() 
      ]);
        
      setAssignments(assignData);
      setAdjustments(adjustData);
    } catch (e) {
      console.error("データ取得エラー", e);
    } finally {
      setLoading(false);
    }
  }, [periodMonths]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows = useMemo<AnnualRowData[]>(() => {
    if (staffList.length === 0 || patterns.length === 0) return [];
    
    const sortedStaff = [...staffList].sort((a, b) => {
        const uA = a.unitId || 'ZZZ';
        const uB = b.unitId || 'ZZZ';
        if (uA !== uB) return uA.localeCompare(uB);
        return a.name.localeCompare(b.name);
    });

    const resultRows: AnnualRowData[] = [];
    let lastUnitId = '';

    sortedStaff.forEach(staff => {
      const isFirstOfUnit = staff.unitId !== lastUnitId;
      lastUnitId = staff.unitId || '';

      resultRows.push({
        id: `header-${staff.staffId}`,
        type: 'header',
        staff: staff,
        label: staff.name,
        monthlyValues: [],
        totalValue: 0,
        isFirstOfUnit: isFirstOfUnit
      });

      const stats: { [key: string]: number[] } = {};
      SUMMARY_ITEMS.forEach(item => { stats[item.key] = Array(12).fill(0); });
      
      const stockEventDisplay: (AnnualEvent | null)[] = Array(12).fill(null);

      const periodStartDateStr = `${periodMonths[0].year}-${String(periodMonths[0].month).padStart(2, '0')}-01`;
      let initialStock = 0;
      
      const monthlyAdjustments = Array(12).fill(0);
      
      adjustments.forEach(adj => {
        if (adj.staffId !== staff.staffId) return;
        const [y, m] = adj.date.split('-').map(Number);
        
        const idx = periodMonths.findIndex(pm => pm.year === y && pm.month === m);
        if (idx >= 0) {
          const val = (adj.type === 'Expire') ? -adj.days : adj.days;
          monthlyAdjustments[idx] += val;
          stockEventDisplay[idx] = { type: adj.type, days: adj.days }; 
        } else if (adj.date < periodStartDateStr) {
          const val = (adj.type === 'Expire') ? -adj.days : adj.days;
          initialStock += val;
        }
      });

      const monthlyUsage = Array(12).fill(0);
      
      assignments.forEach(a => {
        if (a.staffId !== staff.staffId) return;
        const [aY, aM] = a.date.split('-').map(Number);
        const idx = periodMonths.findIndex(pm => pm.year === aY && pm.month === aM);
        if (idx === -1) return;

        const pattern = patternMap.get(a.patternId);
        if (!pattern) return;

        if (pattern.workType === 'PaidLeave') {
          stats['paidLeave'][idx]++;
          monthlyUsage[idx]++;
        }
        if (pattern.workType === 'StatutoryHoliday') stats['holiday'][idx]++;
        if (pattern.workType === 'Work') {
          stats['workDays'][idx]++;
          stats['workHours'][idx] += pattern.durationHours;
          if (pattern.isNightShift) stats['nightShift'][idx]++;
        }
      });

      let currentStock = initialStock;
      for (let i = 0; i < 12; i++) {
        const usage = monthlyUsage[i];
        const adjust = monthlyAdjustments[i];
        currentStock = currentStock + adjust - usage;
        stats['paidLeaveRemain'][i] = currentStock;
      }

      SUMMARY_ITEMS.forEach(item => {
        const monthlyVals = stats[item.key];
        const total = (item.key === 'paidLeaveRemain') 
          ? monthlyVals[11] 
          : monthlyVals.reduce((sum, v) => sum + v, 0);
        
        if (item.key === 'workHours') {
            for(let i=0; i<12; i++) monthlyVals[i] = Math.round(monthlyVals[i] * 10) / 10;
        }

        resultRows.push({
          id: `data-${staff.staffId}-${item.key}`,
          type: 'data',
          label: item.label,
          monthlyValues: monthlyVals,
          monthlyEvents: (item.key === 'paidLeaveRemain') ? stockEventDisplay : undefined,
          totalValue: (item.key === 'workHours') ? Math.round(total * 10) / 10 : total,
          isFirstOfUnit: false,
          isInteractive: !!item.isInteractive,
          staff: staff,
        });
      });
    });
    return resultRows;
  }, [assignments, adjustments, staffList, patterns, patternMap, periodMonths]);

  const handleCellClick = (_: number, c: number, row: AnnualRowData) => {
    if (row.isInteractive && c >= 0 && c <= 11 && row.staff) {
      const pm = periodMonths[c];
      const dateStr = `${pm.year}-${String(pm.month).padStart(2, '0')}-01`;
      
      setModalTarget({
        staff: row.staff,
        dateStr: dateStr,
        monthLabel: `${pm.year}年${pm.month}月`
      });

      const history = adjustments.filter(a => 
        a.staffId === row.staff!.staffId && 
        a.date.startsWith(`${pm.year}-${String(pm.month).padStart(2, '0')}`)
      );
      setModalHistory(history);
      setModalOpen(true);
    }
  };

  const handleSaveAdjustment = async (type: 'Grant' | 'Expire' | 'Adjustment', days: number, memo: string) => {
    if (!modalTarget) return;
    try {
      const newRecord: IPaidLeaveAdjustment = {
        staffId: modalTarget.staff.staffId,
        date: modalTarget.dateStr,
        type,
        days,
        memo,
        createdAt: new Date().toISOString()
      };

      const id = await db.paidLeaveAdjustments.add(newRecord);
      setModalHistory(prev => [...prev, { ...newRecord, id: id as number }]);
      loadData(); 
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    }
  };

  const handleDeleteAdjustment = async (id: number) => {
    if (!window.confirm('この履歴を削除しますか？')) return;
    try {
      await db.paidLeaveAdjustments.delete(id);
      setModalHistory(prev => prev.filter(item => item.id !== id));
      loadData(); 
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: '24px', gap: 2 }}>
      <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => setYear(year - 1)}><ChevronLeftIcon /></IconButton>
          <Typography variant="h5" sx={{ minWidth: 80, textAlign: 'center' }}>{year}年</Typography>
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <Select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              displayEmpty
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <MenuItem key={m} value={m}>{m}月開始</MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={() => setYear(year + 1)}><ChevronRightIcon /></IconButton>
          {loading && <CircularProgress size={24} sx={{ ml: 2 }} />}
        </Box>
        <Typography variant="body2" color="text.secondary">
          ※ データベースに保存されているアサイン情報から集計しています
        </Typography>
      </Paper>

      <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} variant="outlined">
        {/* ★ onSelectionChange等の不要なPropsを削除 */}
        <AnnualSummaryView 
          rows={rows}
          months={displayMonths}
          title={headerTitle}
          scrollerRef={scrollerRef}
          onCellClick={handleCellClick}
        />
      </Paper>

      <PaidLeaveAdjustmentModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveAdjustment}
        onDelete={handleDeleteAdjustment}
        staff={modalTarget?.staff || null}
        targetMonthLabel={modalTarget?.monthLabel || ''}
        history={modalHistory}
      />
    </Box>
  );
}