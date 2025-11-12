import React, { useState } from 'react';
import { 
  Paper, TextField, Button, Select, 
  MenuItem, InputLabel, FormControl, Checkbox, FormControlLabel
} from '@mui/material';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { IShiftPattern, WorkType, CrossUnitWorkType } from '../../db/dexie'; 
import { addNewPattern } from '../../store/patternSlice'; 

// (DataManagementPage.tsx から NewPatternForm のコードをそのまま移動)
export default function NewPatternForm() {
  const dispatch: AppDispatch = useDispatch();
  const [patternId, setPatternId] = useState('');
  const [name, setName] = useState('');
  const [mainCategory, setMainCategory] = useState('日勤');
  const [workType, setWorkType] = useState<WorkType>('Work');
  const [crossUnitWorkType, setCrossUnitWorkType] = useState<CrossUnitWorkType>('-');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [breakDurationMinutes, setBreakDurationMinutes] = useState(60);
  const [durationHours, setDurationHours] = useState(8);
  const [crossesMidnight, setCrossesMidnight] = useState(false);
  const [isNightShift, setIsNightShift] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patternId.trim() || !name.trim()) return;
    const newPattern: IShiftPattern = {
      patternId: patternId.trim(), name: name.trim(), mainCategory, workType,
      crossUnitWorkType, startTime, endTime,
      breakDurationMinutes: Number(breakDurationMinutes) || 0,
      durationHours: Number(durationHours) || 0,
      crossesMidnight, isNightShift,
    };
    dispatch(addNewPattern(newPattern));
    setPatternId(''); setName('');
  };

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField label="表内名称 (ID)" value={patternId} onChange={(e) => setPatternId(e.target.value)} required size="small" sx={{ width: 100 }} helperText="例: C, SA, N"/>
      <TextField label="勤務種別 (名前)" value={name} onChange={(e) => setName(e.target.value)} required size="small" sx={{ width: 150 }} />
      <TextField label="大勤務種別" value={mainCategory} onChange={(e) => setMainCategory(e.target.value)} required size="small" sx={{ width: 100 }} />
      <TextField label="開始 (HH:MM)" value={startTime} onChange={(e) => setStartTime(e.target.value)} required size="small" sx={{ width: 100 }} />
      <TextField label="終了 (HH:MM)" value={endTime} onChange={(e) => setEndTime(e.target.value)} required size="small" sx={{ width: 100 }} />
      <TextField label="休憩(分)" value={breakDurationMinutes} onChange={(e) => setBreakDurationMinutes(Number(e.target.value))} required size="small" type="number" sx={{ width: 80 }} />
      <TextField label="実働(h)" value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} required size="small" type="number" sx={{ width: 80 }} />
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>勤務タイプ</InputLabel>
        <Select value={workType} label="勤務タイプ" onChange={(e) => setWorkType(e.target.value as WorkType)}>
          <MenuItem value="Work">労働</MenuItem>
          <MenuItem value="StatutoryHoliday">公休</MenuItem>
          <MenuItem value="PaidLeave">有給</MenuItem>
          <MenuItem value="Meeting">会議</MenuItem>
          <MenuItem value="Other">その他</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>他ユニット</InputLabel>
        <Select value={crossUnitWorkType} label="他ユニット" onChange={(e) => setCrossUnitWorkType(e.target.value as CrossUnitWorkType)}>
          <MenuItem value="-">-</MenuItem>
          <MenuItem value="有">有</MenuItem>
          <MenuItem value="サポート">サポート</MenuItem>
        </Select>
      </FormControl>
      <FormControlLabel control={<Checkbox checked={crossesMidnight} onChange={(e) => setCrossesMidnight(e.target.checked)} />} label="日付またぎ" />
      <FormControlLabel control={<Checkbox checked={isNightShift} onChange={(e) => setIsNightShift(e.target.checked)} />} label="夜勤" />
      <Button type="submit" variant="contained">パターン追加</Button>
    </Paper>
  );
};