import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, TextField, Button, Select,
  MenuItem, InputLabel, FormControl, Checkbox, ListItemText, Chip, Divider,
  Dialog, DialogActions, DialogContent, DialogTitle,
  CircularProgress, IconButton, Typography 
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add'; 
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import {
  IStaff, IStaffConstraints, IShiftPattern, IUnit, ITimeRange
} from '../../db/dexie';
import { parseAndSaveConstraints } from '../../store/staffSlice';

const getDefaultConstraints = (): IStaffConstraints => ({
  maxConsecutiveDays: 5,
  minIntervalHours: 12,
});

interface EditStaffModalProps {
  staff: IStaff | null;
  onClose: () => void;
  onSave: (updatedStaff: IStaff) => void;
}

export default function EditStaffModal({ staff, onClose, onSave }: EditStaffModalProps) {
  const dispatch: AppDispatch = useDispatch();
  const unitList = useSelector((state: RootState) => state.unit.units);
  const patternList = useSelector((state: RootState) => state.pattern.patterns);

  const [name, setName] = useState('');
  const [employmentType, setEmploymentType] = useState<'FullTime' | 'PartTime' | 'Rental'>('FullTime');
  const [status, setStatus] = useState<'Active' | 'OnLeave'>('Active');
  const [skills, setSkills] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [availablePatternIds, setAvailablePatternIds] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [constraints, setConstraints] = useState<IStaffConstraints>(getDefaultConstraints());
  const [aiLoading, setAiLoading] = useState(false);

  const [workableTimeRanges, setWorkableTimeRanges] = useState<ITimeRange[]>([]);

  useEffect(() => {
    if (staff) {
      setName(staff.name);
      setEmploymentType(staff.employmentType);
      setStatus(staff.status || 'Active');
      setSkills(staff.skills.join(', '));
      setUnitId(staff.unitId);
      setAvailablePatternIds(staff.availablePatternIds);
      setMemo(staff.memo || '');
      setConstraints(staff.constraints);

      if (staff.employmentType === 'PartTime') {
        setWorkableTimeRanges(staff.workableTimeRanges && staff.workableTimeRanges.length > 0
          ? staff.workableTimeRanges
          : [{ start: '08:00', end: '20:00' }]
        );
      } else {
        setWorkableTimeRanges([]);
      }
    }
  }, [staff]);

  const handleEmploymentTypeChange = (type: 'FullTime' | 'PartTime' | 'Rental') => {
    setEmploymentType(type);
    if (type === 'PartTime' && workableTimeRanges.length === 0) {
      setWorkableTimeRanges([{ start: '08:00', end: '20:00' }]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;

    if (employmentType === 'PartTime') {
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

      for (let i = 0; i < workableTimeRanges.length; i++) {
        for (let j = i + 1; j < workableTimeRanges.length; j++) {
          const rangeA = workableTimeRanges[i];
          const rangeB = workableTimeRanges[j];

          if (rangeA.start < rangeB.end && rangeB.start < rangeA.end) {
            alert(`時間帯が重複しています。\n・${i + 1}番目: ${rangeA.start}～${rangeA.end}\n・${j + 1}番目: ${rangeB.start}～${rangeB.end}`);
            return;
          }
        }
      }
    }

    let finalTimeRanges: ITimeRange[] | undefined = undefined;
    if (employmentType === 'PartTime') {
      finalTimeRanges = workableTimeRanges.length > 0 ? workableTimeRanges : [{ start: '08:00', end: '20:00' }];
    }

    const updatedStaff: IStaff = {
      ...staff,
      name: name.trim(),
      employmentType: employmentType,
      status: status,
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      unitId: unitId || null,
      availablePatternIds: availablePatternIds,
      memo: memo.trim(),
      constraints: constraints,
      workableTimeRanges: finalTimeRanges
    };
    onSave(updatedStaff);
  };

  const handleParseMemo = () => {
    if (!staff) return;
    setAiLoading(true);
    dispatch(parseAndSaveConstraints({
      staffId: staff.staffId,
      memo: memo,
      shiftPatterns: patternList, 
      currentMonthInfo: { month: '2025-11', dayOfWeekOn10th: '月曜日' }
    })).then((action) => {
      if (parseAndSaveConstraints.fulfilled.match(action)) {
        setAvailablePatternIds(action.payload.availablePatternIds || []);
        setMemo(action.payload.memo || '');
      }
      setAiLoading(false);
    });
  };

  const workPatterns = useMemo(() => {
    return patternList.filter(p => p.workType === 'Work' || p.isFlex);
  }, [patternList]);

  const handleAddRange = () => setWorkableTimeRanges([...workableTimeRanges, { start: '08:00', end: '20:00' }]);
  const handleRemoveRange = (i: number) => setWorkableTimeRanges(workableTimeRanges.filter((_, idx) => idx !== i));
  const handleChangeRange = (i: number, f: 'start' | 'end', v: string) => {
    const newRanges = [...workableTimeRanges];
    newRanges[i] = { ...newRanges[i], [f]: v };
    setWorkableTimeRanges(newRanges);
  };

  return (
    <Dialog open={!!staff} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>スタッフ情報の編集</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="氏名" value={name} onChange={(e) => setName(e.target.value)} required size="small" fullWidth />

          <FormControl size="small" fullWidth>
            <InputLabel>ステータス</InputLabel>
            <Select value={status} label="ステータス" onChange={(e) => setStatus(e.target.value as any)}>
              <MenuItem value="Active">勤務中</MenuItem>
              <MenuItem value="OnLeave">休職中</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>雇用形態</InputLabel>
            <Select value={employmentType} label="雇用形態" onChange={(e) => handleEmploymentTypeChange(e.target.value as any)}>
              <MenuItem value="FullTime">常勤</MenuItem>
              <MenuItem value="PartTime">パート</MenuItem>
              <MenuItem value="Rental">応援・派遣</MenuItem>
            </Select>
          </FormControl>

          {employmentType === 'PartTime' && (
            <Box sx={{ border: '1px dashed #ccc', p: 2, borderRadius: 1, bgcolor: '#fafafa' }}>
              <Typography variant="subtitle2" gutterBottom>契約時間帯 (パート)</Typography>
              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                ※ 指定された時間帯のいずれかに収まるようにシフトを割り当ててください。
              </Typography>
              {workableTimeRanges.map((range, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <TextField
                    label="開始" type="time" size="small" value={range.start}
                    onChange={(e) => handleChangeRange(idx, 'start', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <Typography>～</Typography>
                  <TextField
                    label="終了" type="time" size="small" value={range.end}
                    onChange={(e) => handleChangeRange(idx, 'end', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <IconButton size="small" onClick={() => handleRemoveRange(idx)} color="error"><DeleteIcon /></IconButton>
                </Box>
              ))}
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddRange}>時間帯を追加</Button>
            </Box>
          )}

          <FormControl size="small" fullWidth>
            <InputLabel>所属ユニット</InputLabel>
            <Select value={unitId || ''} label="所属ユニット" onChange={(e) => setUnitId(e.target.value || null)}>
              <MenuItem value="">(なし)</MenuItem>
              {unitList.map((u: IUnit) => (
                <MenuItem key={u.unitId} value={u.unitId}>{u.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="スキル (カンマ区切り)" value={skills} onChange={(e) => setSkills(e.target.value)} size="small" fullWidth />

          <Divider sx={{ my: 1 }}><Chip label="勤務可能パターン (AI解釈)" /></Divider>

          <TextField
            label="メモ (AI解釈の元データ)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            size="small"
            multiline
            rows={3}
            fullWidth
          />
          <Button onClick={handleParseMemo} variant="outlined" disabled={aiLoading}>
            {aiLoading ? <CircularProgress size={24} /> : 'AIで「メモ」から「勤務可能パターン」を解釈'}
          </Button>
          <FormControl size="small" fullWidth sx={{ mt: 1 }}>
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

          <Divider sx={{ my: 1 }}><Chip label="基本制約" /></Divider>
          <TextField
            label="最大連勤日数"
            value={constraints?.maxConsecutiveDays || 5}
            onChange={(e) => setConstraints(c => ({ ...c, maxConsecutiveDays: Number(e.target.value) }))}
            size="small" type="number"
          />
          <TextField
            label="最短勤務間隔 (時間)"
            value={constraints?.minIntervalHours || 12}
            onChange={(e) => setConstraints(c => ({ ...c, minIntervalHours: Number(e.target.value) }))}
            size="small" type="number"
          />

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        {/* ★ 修正: 保存 -> 変更を確定 */}
        <Button onClick={handleSubmit} variant="contained" disableElevation>変更を確定</Button>
      </DialogActions>
    </Dialog>
  );
};