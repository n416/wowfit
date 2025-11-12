import React, { useState, useEffect } from 'react';
import { 
  Box, TextField, Button, Select, 
  MenuItem, InputLabel, FormControl, Checkbox, FormControlLabel,
  Dialog, DialogActions, DialogContent, DialogTitle
} from '@mui/material';
import { IShiftPattern, WorkType, CrossUnitWorkType } from '../../db/dexie'; 

// (DataManagementPage.tsx から EditPatternModal のコードをそのまま移動)
interface EditPatternModalProps {
  pattern: IShiftPattern | null;
  onClose: () => void;
  onSave: (updatedPattern: IShiftPattern) => void;
}

// export default を追加
export default function EditPatternModal({ pattern, onClose, onSave }: EditPatternModalProps) {
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

  useEffect(() => {
    if (pattern) {
      setName(pattern.name);
      setMainCategory(pattern.mainCategory);
      setWorkType(pattern.workType);
      setCrossUnitWorkType(pattern.crossUnitWorkType);
      setStartTime(pattern.startTime);
      setEndTime(pattern.endTime);
      setBreakDurationMinutes(pattern.breakDurationMinutes);
      setDurationHours(pattern.durationHours);
      setCrossesMidnight(pattern.crossesMidnight);
      setIsNightShift(pattern.isNightShift);
    }
  }, [pattern]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern) return;
    const updatedPattern: IShiftPattern = {
      ...pattern, // patternId はそのまま維持
      name: name.trim(),
      mainCategory, workType, crossUnitWorkType,
      startTime, endTime,
      breakDurationMinutes: Number(breakDurationMinutes) || 0,
      durationHours: Number(durationHours) || 0,
      crossesMidnight, isNightShift,
    };
    onSave(updatedPattern);
  };

  return (
    <Dialog open={!!pattern} onClose={onClose}>
      <DialogTitle>勤務パターンの編集 (ID: {pattern?.patternId})</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="勤務種別 (名前)" value={name} onChange={(e) => setName(e.target.value)} required size="small" fullWidth />
          <TextField label="大勤務種別" value={mainCategory} onChange={(e) => setMainCategory(e.target.value)} required size="small" fullWidth />
          <TextField label="開始 (HH:MM)" value={startTime} onChange={(e) => setStartTime(e.target.value)} required size="small" fullWidth />
          <TextField label="終了 (HH:MM)" value={endTime} onChange={(e) => setEndTime(e.target.value)} required size="small" fullWidth />
          <TextField label="休憩(分)" value={breakDurationMinutes} onChange={(e) => setBreakDurationMinutes(Number(e.target.value))} required size="small" type="number" fullWidth />
          <TextField label="実働(h)" value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} required size="small" type="number" fullWidth />
          <FormControl size="small" fullWidth>
            <InputLabel>勤務タイプ</InputLabel>
            <Select value={workType} label="勤務タイプ" onChange={(e) => setWorkType(e.target.value as WorkType)}>
              <MenuItem value="Work">労働</MenuItem>
              <MenuItem value="StatutoryHoliday">公休</MenuItem>
              <MenuItem value="PaidLeave">有給</MenuItem>
              <MenuItem value="Meeting">会議</MenuItem>
              <MenuItem value="Other">その他</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>他ユニット</InputLabel>
            <Select value={crossUnitWorkType} label="他ユニット" onChange={(e) => setCrossUnitWorkType(e.target.value as CrossUnitWorkType)}>
              <MenuItem value="-">-</MenuItem>
              <MenuItem value="有">有</MenuItem>
              <MenuItem value="サポート">サポート</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel control={<Checkbox checked={crossesMidnight} onChange={(e) => setCrossesMidnight(e.target.checked)} />} label="日付またぎ" />
          <FormControlLabel control={<Checkbox checked={isNightShift} onChange={(e) => setIsNightShift(e.target.checked)} />} label="夜勤" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSubmit} variant="contained">保存</Button>
      </DialogActions>
    </Dialog>
  );
};