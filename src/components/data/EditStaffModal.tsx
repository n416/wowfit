import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, Select, 
  MenuItem, InputLabel, FormControl, Checkbox, FormControlLabel,
  CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItem, ListItemButton, ListItemText, Chip, Divider,
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { 
  IStaff, IStaffConstraints, IShiftPattern, IUnit
} from '../../db/dexie'; 
import { parseAndSaveConstraints } from '../../store/staffSlice'; 

// (DataManagementPage.tsx から EditStaffModal のコードをそのまま移動)

// ★★★ (v4の簡略化された制約のデフォルトをコピー) ★★★
const getDefaultConstraints = (): IStaffConstraints => ({
  maxConsecutiveDays: 5,
  minIntervalHours: 12,
});

interface EditStaffModalProps {
  staff: IStaff | null;
  onClose: () => void;
  onSave: (updatedStaff: IStaff) => void;
}

// export default を追加
export default function EditStaffModal({ staff, onClose, onSave }: EditStaffModalProps) {
  const dispatch: AppDispatch = useDispatch();
  const unitList = useSelector((state: RootState) => state.unit.units);
  const patternList = useSelector((state: RootState) => state.pattern.patterns);
  const shiftPatterns = useSelector((state: RootState) => state.pattern.patterns); // (AI解釈用)

  // (v5スキーマ対応)
  const [name, setName] = useState('');
  const [employmentType, setEmploymentType] = useState<'FullTime' | 'PartTime'>('FullTime');
  const [skills, setSkills] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [availablePatternIds, setAvailablePatternIds] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [constraints, setConstraints] = useState<IStaffConstraints>(getDefaultConstraints());
  const [aiLoading, setAiLoading] = useState(false); // (AI解釈専用ローディング)

  useEffect(() => {
    if (staff) {
      setName(staff.name);
      setEmploymentType(staff.employmentType);
      setSkills(staff.skills.join(', '));
      setUnitId(staff.unitId);
      setAvailablePatternIds(staff.availablePatternIds);
      setMemo(staff.memo || '');
      setConstraints(staff.constraints); 
    }
  }, [staff]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    const updatedStaff: IStaff = {
      ...staff,
      name: name.trim(),
      employmentType: employmentType,
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      unitId: unitId || null,
      availablePatternIds: availablePatternIds,
      memo: memo.trim(),
      constraints: constraints, 
    };
    onSave(updatedStaff);
  };
  
  // (AI解釈ハンドラ)
  const handleParseMemo = () => {
    if (!staff) return;
    setAiLoading(true);
    dispatch(parseAndSaveConstraints({
      staffId: staff.staffId,
      memo: memo,
      shiftPatterns: shiftPatterns,
      currentMonthInfo: { month: '2025-11', dayOfWeekOn10th: '月曜日' } // (仮)
    })).then((action) => {
      // (AIの実行結果をモーダルのStateに即時反映)
      if (parseAndSaveConstraints.fulfilled.match(action)) {
        setAvailablePatternIds(action.payload.availablePatternIds || []);
        setMemo(action.payload.memo || '');
      }
      setAiLoading(false);
    });
  };

  // 選択肢から「非労働パターン」を除外
  const workPatterns = useMemo(() => {
    return patternList.filter(p => p.workType === 'Work');
  }, [patternList]);

  return (
    <Dialog open={!!staff} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>スタッフ情報の編集</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="氏名" value={name} onChange={(e) => setName(e.target.value)} required size="small" fullWidth />
          <FormControl size="small" fullWidth>
            <InputLabel>雇用形態</InputLabel>
            <Select value={employmentType} label="雇用形態" onChange={(e) => setEmploymentType(e.target.value as any)}>
              <MenuItem value="FullTime">常勤</MenuItem>
              <MenuItem value="PartTime">パート</MenuItem>
            </Select>
          </FormControl>
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
            value={constraints?.maxConsecutiveDays || 5} // (フォールバック)
            onChange={(e) => setConstraints(c => ({...c, maxConsecutiveDays: Number(e.target.value)}))}
            size="small" type="number"
          />
          <TextField 
            label="最短勤務間隔 (時間)" 
            value={constraints?.minIntervalHours || 12} // (フォールバック)
            onChange={(e) => setConstraints(c => ({...c, minIntervalHours: Number(e.target.value)}))}
            size="small" type="number"
          />

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSubmit} variant="contained">保存</Button>
      </DialogActions>
    </Dialog>
  );
};