import React, { useState, useMemo } from 'react';
import {
  Paper, TextField, Button, Select,
  MenuItem, InputLabel, FormControl, Checkbox, ListItemText,
  Box, IconButton, Typography // 追加
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add'; // 追加
import DeleteIcon from '@mui/icons-material/Delete'; // 追加
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { IStaff, IUnit, IShiftPattern, ITimeRange } from '../../db/dexie';
import { addNewStaff } from '../../store/staffSlice';

export default function NewStaffForm() {
  const dispatch: AppDispatch = useDispatch();
  const unitList = useSelector((state: RootState) => state.unit.units);
  const patternList = useSelector((state: RootState) => state.pattern.patterns);

  const [name, setName] = useState('');
  const [employmentType, setEmploymentType] = useState<'FullTime' | 'PartTime' | 'Rental'>('FullTime');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [availablePatternIds, setAvailablePatternIds] = useState<string[]>([]);

  // ★ 追加: 勤務可能時間帯 (PartTime用)
  const [workableTimeRanges, setWorkableTimeRanges] = useState<ITimeRange[]>([{ start: '08:00', end: '20:00' }]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let finalTimeRanges: ITimeRange[] | undefined = undefined;

    // ★修正: パートタイム時の入力バリデーション強化
    if (employmentType === 'PartTime') {
      // 1. 個別の整合性チェック (未入力・逆転)
      for (let i = 0; i < workableTimeRanges.length; i++) {
        const range = workableTimeRanges[i];
        if (!range.start || !range.end) {
          alert(`${i + 1}番目の時間帯: 開始または終了時刻が未入力です。`);
          return;
        }
        if (range.start >= range.end) {
          alert(`${i + 1}番目の時間帯: 終了時刻は開始時刻より後ろに設定してください。(${range.start} ～ ${range.end})`);
          return;
        }
      }

      // 2. 時間帯同士の重複・包含チェック (新規追加)
      for (let i = 0; i < workableTimeRanges.length; i++) {
        for (let j = i + 1; j < workableTimeRanges.length; j++) {
          const rangeA = workableTimeRanges[i];
          const rangeB = workableTimeRanges[j];

          // 重複判定: Aの開始 < Bの終了 かつ Bの開始 < Aの終了
          // (例: 8:00-20:00 と 9:00-19:00 はここで引っかかります)
          if (rangeA.start < rangeB.end && rangeB.start < rangeA.end) {
            alert(`時間帯が重複しています。\n・${i + 1}番目: ${rangeA.start}～${rangeA.end}\n・${j + 1}番目: ${rangeB.start}～${rangeB.end}`);
            return;
          }
        }
      }

      finalTimeRanges = workableTimeRanges;
    }

    const newStaff: Omit<IStaff, 'staffId' | 'constraints'> = {
      name: name.trim(), employmentType, skills: [],
      unitId: unitId || null, availablePatternIds, memo: '',
      workableTimeRanges: finalTimeRanges // 修正
    };
    dispatch(addNewStaff(newStaff));

    // フォームリセット
    setName('');
    setEmploymentType('FullTime');
    setUnitId(null);
    setAvailablePatternIds([]);
    setWorkableTimeRanges([{ start: '08:00', end: '20:00' }]);
  };
  
  const workPatterns = useMemo(() => {
    return patternList.filter(p => p.workType === 'Work');
  }, [patternList]);

  // ★ 時間帯の追加・削除ハンドラ
  const handleAddRange = () => {
    setWorkableTimeRanges([...workableTimeRanges, { start: '08:00', end: '20:00' }]);
  };
  const handleRemoveRange = (index: number) => {
    const newRanges = [...workableTimeRanges];
    newRanges.splice(index, 1);
    setWorkableTimeRanges(newRanges);
  };
  const handleChangeRange = (index: number, field: 'start' | 'end', value: string) => {
    const newRanges = [...workableTimeRanges];
    newRanges[index] = { ...newRanges[index], [field]: value };
    setWorkableTimeRanges(newRanges);
  };

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField label="氏名" value={name} onChange={(e) => setName(e.target.value)} required size="small" />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>雇用形態</InputLabel>
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
      </Box>

      {/* ★ パート用: 時間帯設定UI */}
      {employmentType === 'PartTime' && (
        <Box sx={{ border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
          <Typography variant="caption" color="textSecondary">パート契約時間帯 (未設定時は 08:00-20:00)</Typography>
          {workableTimeRanges.map((range, idx) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <TextField
                label="開始"
                type="time"
                size="small"
                value={range.start}
                onChange={(e) => handleChangeRange(idx, 'start', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Typography>～</Typography>
              <TextField
                label="終了"
                type="time"
                size="small"
                value={range.end}
                onChange={(e) => handleChangeRange(idx, 'end', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <IconButton size="small" onClick={() => handleRemoveRange(idx)} color="error">
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} size="small" onClick={handleAddRange} sx={{ mt: 1 }}>
            時間帯を追加
          </Button>
        </Box>
      )}
    </Paper>
  );
};