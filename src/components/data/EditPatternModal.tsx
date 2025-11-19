import React, { useState, useEffect } from 'react';
import { 
  Box, TextField, Button, Select, 
  MenuItem, InputLabel, FormControl, Checkbox, FormControlLabel,
  Dialog, DialogActions, DialogContent, DialogTitle, FormHelperText // FormHelperText追加
} from '@mui/material';
import { IShiftPattern, WorkType, CrossUnitWorkType } from '../../db/dexie'; 

interface EditPatternModalProps {
  pattern: IShiftPattern | null;
  onClose: () => void;
  onSave: (updatedPattern: IShiftPattern) => void;
}

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
  // ★ 追加
  const [isFlex, setIsFlex] = useState(false);

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
      // ★ 追加
      setIsFlex(pattern.isFlex || false);
    }
  }, [pattern]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern) return;
    const updatedPattern: IShiftPattern = {
      ...pattern, 
      name: name.trim(),
      mainCategory, workType, crossUnitWorkType,
      startTime, endTime,
      breakDurationMinutes: Number(breakDurationMinutes) || 0,
      durationHours: Number(durationHours) || 0,
      crossesMidnight, isNightShift,
      // ★ 追加
      isFlex
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
          
          {/* ★ ラベルの分岐 */}
          <TextField 
            label={isFlex ? "枠開始 (HH:MM)" : "開始 (HH:MM)"} 
            value={startTime} onChange={(e) => setStartTime(e.target.value)} required size="small" fullWidth 
            helperText={isFlex ? "勤務可能な開始時刻" : ""}
          />
          <TextField 
            label={isFlex ? "枠終了 (HH:MM)" : "終了 (HH:MM)"} 
            value={endTime} onChange={(e) => setEndTime(e.target.value)} required size="small" fullWidth 
            helperText={isFlex ? "勤務可能な終了時刻" : ""}
          />
          
          <TextField label="休憩(分)" value={breakDurationMinutes} onChange={(e) => setBreakDurationMinutes(Number(e.target.value))} required size="small" type="number" fullWidth />
          <TextField 
            label={isFlex ? "実働(h) ※必須" : "実働(h)"}
            value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} required size="small" type="number" fullWidth 
          />
          
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
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControlLabel control={<Checkbox checked={crossesMidnight} onChange={(e) => setCrossesMidnight(e.target.checked)} />} label="日付またぎ" />
            <FormControlLabel control={<Checkbox checked={isNightShift} onChange={(e) => setIsNightShift(e.target.checked)} />} label="夜勤" />
          </Box>

          {/* ★ 追加: フレックス */}
          <Box sx={{ border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
             <FormControlLabel 
              control={<Checkbox checked={isFlex} onChange={(e) => setIsFlex(e.target.checked)} color="secondary" />} 
              label="実働時間指定 (Flex)" 
            />
            {isFlex && <FormHelperText>このパターンは「枠」の中で指定された「実働時間」働くシフトとして扱われます。<br/>ガントチャートで時間をドラッグして調整できます。</FormHelperText>}
          </Box>

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSubmit} variant="contained">保存</Button>
      </DialogActions>
    </Dialog>
  );
};