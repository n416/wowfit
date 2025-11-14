import React, { useState, useMemo } from 'react';
import { 
  Paper, TextField, Button, Select, 
  MenuItem, InputLabel, FormControl, Checkbox, ListItemText
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { IStaff, IUnit, IShiftPattern } from '../../db/dexie'; 
import { addNewStaff } from '../../store/staffSlice'; 

export default function NewStaffForm() {
  const dispatch: AppDispatch = useDispatch();
  const unitList = useSelector((state: RootState) => state.unit.units);
  const patternList = useSelector((state: RootState) => state.pattern.patterns);
  
  const [name, setName] = useState('');
  // ★★★ v5.11 修正: 型定義を拡張 ★★★
  const [employmentType, setEmploymentType] = useState<'FullTime' | 'PartTime' | 'Rental'>('FullTime');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [availablePatternIds, setAvailablePatternIds] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const newStaff: Omit<IStaff, 'staffId' | 'constraints'> = {
      name: name.trim(), employmentType, skills: [], 
      unitId: unitId || null, availablePatternIds, memo: ''
    };
    dispatch(addNewStaff(newStaff));
    setName(''); setEmploymentType('FullTime'); setUnitId(null); setAvailablePatternIds([]);
  };

  // 選択肢から「非労働パターン」を除外
  const workPatterns = useMemo(() => {
    return patternList.filter(p => p.workType === 'Work');
  }, [patternList]);

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField label="氏名" value={name} onChange={(e) => setName(e.target.value)} required size="small" />
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>雇用形態</InputLabel>
        {/* ★★★ v5.11 修正: Rentalを追加 ★★★ */}
        <Select value={employmentType} label="雇用形態" onChange={(e) => setEmploymentType(e.target.value as any)}>
          <MenuItem value="FullTime">常勤</MenuItem>
          <MenuItem value="PartTime">パート</MenuItem>
          <MenuItem value="Rental">応援・派遣</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>所属ユニット</InputLabel>
        <Select value={unitId || ''} label="所属ユニット" onChange={(e) => setUnitId(e.target.value || null)}>
          <MenuItem value="">(なし)</MenuItem>
          {unitList.map((u: IUnit) => (
            <MenuItem key={u.unitId} value={u.unitId}>{u.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {/* ... (以降変更なし) ... */}
      <FormControl size="small" sx={{ minWidth: 250 }}>
        <InputLabel>勤務可能パターン (労働のみ)</InputLabel>
        <Select
          multiple
          value={availablePatternIds}
          label="勤務可能パターン (労働のみ)"
          onChange={(e) => setAvailablePatternIds(e.target.value as string[])}
          renderValue={(selected) => (selected as string[]).join(', ')}
        >
          {workPatterns.map((p: IShiftPattern) => (
            <MenuItem key={p.patternId} value={p.patternId}>
              <Checkbox checked={availablePatternIds.includes(p.patternId)} />
              <ListItemText primary={p.patternId} secondary={p.name} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button type="submit" variant="contained">スタッフ追加</Button>
    </Paper>
  );
};