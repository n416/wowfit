// src/components/data/PatternManagementTab.tsx
import React, { useState, useMemo } from 'react';
import {
  Box, Paper, Typography, IconButton, Button,
  List, ListItem, ListItemText, ListItemAvatar, Avatar,
  Chip, Divider, TextField, Tooltip, Stack, FormControl, InputLabel, Select, MenuItem,
  Slider, Switch, FormControlLabel,
  Accordion, AccordionSummary, AccordionDetails, Grid
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { IShiftPattern } from '../../db/dexie'; 
import { addNewPattern, updatePattern, deletePattern } from '../../store/patternSlice';

// --- Helper Functions ---
const timeToMin = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const minToTime = (min: number) => {
  let h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  if (h >= 24) h -= 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getPatternColor = (p: IShiftPattern) => {
  if (p.isNightShift) return '#424242';
  if (p.mainCategory.includes('早出')) return '#ffa726';
  if (p.mainCategory.includes('遅出')) return '#29b6f6';
  return '#66bb6a';
};

const getFlexFrameStyle = () => ({
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.5) 75%, transparent 75%, transparent)',
  backgroundSize: '10px 10px',
  backgroundColor: '#ffb74d',
  border: '2px dashed #f57c00',
});

export default function PatternManagementTab() {
  const dispatch: AppDispatch = useDispatch();
  const patternList = useSelector((state: RootState) => state.pattern.patterns);
  const staffList = useSelector((state: RootState) => state.staff.staff);

  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [isEditingNew, setIsEditingNew] = useState(false);

  const [formData, setFormData] = useState<Partial<IShiftPattern>>({});

  // ★ 動的に「日付またぎ」を判定
  const isCrossesMidnight = useMemo(() => {
    const start = formData.startTime || '00:00';
    const end = formData.endTime || '00:00';
    return start > end; // 文字列比較で判定
  }, [formData.startTime, formData.endTime]);

  const targetPattern = useMemo(() => {
    if (isEditingNew) return formData;
    return patternList.find(p => p.patternId === selectedPatternId) || null;
  }, [selectedPatternId, isEditingNew, patternList, formData]);

  const availableStaff = useMemo(() => {
    if (!targetPattern || !targetPattern.patternId) return [];
    if (isEditingNew && !targetPattern.patternId) return [];
    return staffList.filter(s => 
      s.availablePatternIds.includes(targetPattern.patternId!) && s.status !== 'OnLeave'
    );
  }, [targetPattern, staffList, isEditingNew]);

  // --- Handlers ---
  const handleSelect = (p: IShiftPattern) => {
    if (isEditingNew) return;
    setIsEditingNew(false);
    setSelectedPatternId(p.patternId);
    setFormData({ ...p });
  };

  const handleCreateNew = () => {
    const newInit: IShiftPattern = {
      patternId: `P${Date.now().toString().slice(-4)}`,
      symbol: '新',
      name: '新規シフト',
      mainCategory: '日勤',
      workType: 'Work',
      crossUnitWorkType: '-',
      startTime: '09:00',
      endTime: '18:00',
      breakDurationMinutes: 60,
      durationHours: 8,
      isNightShift: false,
      // crossesMidnight はデータとして持たない
      isFlex: false
    };
    setFormData(newInit);
    setIsEditingNew(true);
    setSelectedPatternId(null);
  };

  const handleDuplicate = (p: IShiftPattern, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy: IShiftPattern = {
      ...p,
      patternId: `${p.patternId}'`,
      name: `${p.name} (コピー)`
    };
    setFormData(copy);
    setIsEditingNew(true);
    setSelectedPatternId(null);
  };

  const handleCancel = () => {
    setIsEditingNew(false);
    setSelectedPatternId(null);
    setFormData({});
  };

  const handleChange = (field: keyof IShiftPattern, val: any) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleTimeSliderChange = (_: Event, newValue: number | number[]) => {
    if (Array.isArray(newValue)) {
      const [v1, v2] = newValue;
      let startMin = v1;
      let endMin = v2;

      // ★ 日付またぎ中（start > end）なら、スライダーの選択範囲は「勤務外」を意味するので反転して解釈
      if (isCrossesMidnight) {
        startMin = v2; 
        endMin = v1;
      }

      const startStr = minToTime(startMin);
      const endStr = minToTime(endMin);
      
      let duration = 0;
      if (startMin > endMin) {
         duration = ((24 * 60) - startMin + endMin) / 60;
      } else {
         duration = (endMin - startMin) / 60;
      }
      if (duration < 0) duration += 24;

      setFormData(prev => {
        const updates: Partial<IShiftPattern> = {
          startTime: startStr,
          endTime: endStr,
        };
        if (!prev.isFlex) {
          updates.durationHours = Math.floor(duration * 100) / 100;
        }
        return { ...prev, ...updates };
      });
    }
  };

  const handleSave = () => {
    if (!formData.patternId || !formData.name) return;
    // ★ crossesMidnight を含まないオブジェクトとして保存
    const patternToSave = formData as IShiftPattern;
    
    // (念のため削除しておくが、Partialで管理しているので元々ないはず)
    // delete (patternToSave as any).crossesMidnight; 

    if (isEditingNew) {
      dispatch(addNewPattern(patternToSave));
      setIsEditingNew(false);
      setSelectedPatternId(patternToSave.patternId);
    } else {
      dispatch(updatePattern(patternToSave));
    }
  };

  const handleDelete = () => {
    if (selectedPatternId && window.confirm("このパターンを削除しますか？")) {
      dispatch(deletePattern(selectedPatternId));
      setSelectedPatternId(null);
      setFormData({});
    }
  };

  const sortedPatterns = useMemo(() => {
    return [...patternList]
      .filter(p => p.workType !== 'StatutoryHoliday' && p.workType !== 'PaidLeave')
      .sort((a, b) => {
        if (!!a.isFlex !== !!b.isFlex) {
          return a.isFlex ? 1 : -1;
        }
        return timeToMin(a.startTime) - timeToMin(b.startTime);
      });
  }, [patternList]);

  const previewStyle = targetPattern ? {
    bgcolor: targetPattern.isFlex ? 'warning.light' : getPatternColor(targetPattern as IShiftPattern),
    color: targetPattern.isFlex ? 'warning.dark' : '#fff',
    border: '1px solid rgba(0,0,0,0.1)'
  } : {};
  
  const sliderValue = useMemo(() => {
    const s = timeToMin(formData.startTime || '09:00');
    const e = timeToMin(formData.endTime || '18:00');
    return [s, e].sort((a, b) => a - b);
  }, [formData.startTime, formData.endTime]);


  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2, overflow: 'hidden' }}>
      <Paper sx={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} variant="outlined">
        {/* (Left Pane: リスト表示部分は大きな変更なし。crossesMidnight参照箇所のみ動的判定に変更) */}
        {isEditingNew && (
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.5)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, backdropFilter: 'blur(2px)' }}>
            <Typography variant="subtitle1" sx={{ color: 'white', bgcolor: 'rgba(0,0,0,0.7)', px: 3, py: 1, borderRadius: 4 }}>右側のパネルで編集・保存してください</Typography>
            <Button variant="contained" color="inherit" onClick={handleCancel} startIcon={<CloseIcon />} sx={{ bgcolor: 'rgba(255,255,255,0.9)', color: 'black', '&:hover': { bgcolor: 'white' } }}>キャンセルして一覧に戻る</Button>
          </Box>
        )}
        <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">パターン一覧・俯瞰</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateNew} disabled={isEditingNew}>新規作成</Button>
        </Box>
        <Box sx={{ display: 'flex', px: 2, py: 1, borderBottom: '1px solid #eee', bgcolor: '#fafafa' }}>
          <Box sx={{ width: 120, flexShrink: 0 }}><Typography variant="caption">パターン名</Typography></Box>
          <Box sx={{ flex: 1, position: 'relative', height: 20 }}>
            {[0, 6, 12, 18, 24].map(h => (
              <Typography key={h} variant="caption" sx={{ position: 'absolute', left: `${(h/24)*100}%`, transform: 'translateX(-50%)', color: '#999' }}>{h}</Typography>
            ))}
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {sortedPatterns.map((p, index) => {
            const startMin = timeToMin(p.startTime);
            const endMin = timeToMin(p.endTime);
            // ★ リスト内でも動的に判定
            const pCrossesMidnight = startMin > endMin;

            let frameStartPercent = (startMin / (24 * 60)) * 100;
            let frameWidthPercent = 0;
            
            if (pCrossesMidnight) {
              frameWidthPercent = ((24 * 60) - startMin + endMin) / (24 * 60) * 100;
              if (frameWidthPercent < 0) frameWidthPercent += 100;
            } else {
              frameWidthPercent = ((endMin - startMin) / (24 * 60)) * 100;
            }
            if (startMin === endMin && p.durationHours > 0 && !p.isFlex) {
              frameWidthPercent = 100;
            }

            const isSelected = selectedPatternId === p.patternId;
            const prevPattern = sortedPatterns[index - 1];
            const isFirstFlex = p.isFlex && (!prevPattern || !prevPattern.isFlex);

            let actualWorkBarWidthPercent = 0;
            let actualWorkBarLeftPercent = 0;
            if (p.isFlex) {
              const actualWorkMin = p.durationHours * 60;
              actualWorkBarWidthPercent = (actualWorkMin / (24 * 60)) * 100;
              const frameDurationMin = (pCrossesMidnight ? ((24 * 60) - startMin + endMin) : (endMin - startMin));
              const offsetMin = (frameDurationMin - actualWorkMin) / 2;
              actualWorkBarLeftPercent = ((startMin + offsetMin) / (24 * 60)) * 100;
              
              if (startMin === endMin && p.durationHours > 0) {
                 actualWorkBarLeftPercent = (offsetMin / (24 * 60)) * 100;
              }
            }

            return (
              <React.Fragment key={p.patternId}>
                {isFirstFlex && (
                  <Box sx={{ px: 2, py: 1, bgcolor: '#fff3e0', borderTop: '1px solid #ffe0b2', borderBottom: '1px solid #ffe0b2' }}>
                    <Typography variant="caption" color="warning.main" fontWeight="bold">▼ フレックス・枠管理パターン</Typography>
                  </Box>
                )}
                <Box onClick={() => handleSelect(p)} sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, cursor: 'pointer', bgcolor: isSelected ? 'action.selected' : (p.isFlex ? '#fffbf5' : 'transparent'), '&:hover': { bgcolor: 'action.hover' }, borderBottom: '1px solid #f5f5f5' }}>
                  <Box sx={{ width: 120, flexShrink: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Avatar variant="rounded" sx={{ width: 32, height: 32, fontSize: '0.85rem', bgcolor: getPatternColor(p), color: '#fff', fontWeight: 'bold', borderRadius: '3px' }}>
                        {p.symbol || p.patternId.slice(0, 2)}
                      </Avatar>
                      <Box sx={{ overflow: 'hidden' }}>
                        <Typography variant="subtitle2" noWrap title={p.name}>{p.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>ID: {p.patternId}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                  <Box sx={{ flex: 1, position: 'relative', height: 24, bgcolor: '#f0f0f0', borderRadius: 1, overflow: 'hidden' }}>
                    {[0, 6, 12, 18].map(h => (
                      <Box key={h} sx={{ position: 'absolute', left: `${(h/24)*100}%`, top: 0, bottom: 0, borderLeft: '1px dashed #ddd' }} />
                    ))}
                    <Box sx={{ position: 'absolute', left: `${frameStartPercent}%`, width: `${frameWidthPercent}%`, top: 4, bottom: 4, borderRadius: 1, boxShadow: 1, ...(p.isFlex ? getFlexFrameStyle() : { bgcolor: getPatternColor(p) }) }} />
                    {p.isFlex && p.durationHours > 0 && (
                      <Box sx={{ position: 'absolute', left: `${actualWorkBarLeftPercent}%`, width: `${actualWorkBarWidthPercent}%`, top: 4, bottom: 4, bgcolor: getPatternColor({ ...p, isFlex: false }), borderRadius: 1, zIndex: 1, opacity: 0.8 }} />
                    )}
                    {pCrossesMidnight && !p.isFlex && (
                      <Box sx={{ position: 'absolute', left: 0, width: `${frameWidthPercent - (100 - frameStartPercent)}%`, top: 4, bottom: 4, borderRadius: 1, opacity: 0.7, bgcolor: getPatternColor(p) }} />
                    )}
                  </Box>
                  <Box sx={{ ml: 1 }}>
                     <Tooltip title="複製して新規作成"><IconButton size="small" onClick={(e) => handleDuplicate(p, e)} disabled={isEditingNew}><CopyIcon fontSize="small" /></IconButton></Tooltip>
                  </Box>
                </Box>
              </React.Fragment>
            );
          })}
        </Box>
      </Paper>

      {/* --- Right Pane: Editor --- */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f9f9f9' }} variant="outlined">
        {targetPattern ? (
          <>
            <Box sx={{ p: 2, borderBottom: '1px solid #ddd', bgcolor: '#fff', overflowY: 'auto', maxHeight: '60%' }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <Typography variant="h6">{isEditingNew ? '新規作成' : 'パターン編集'}</Typography>
                {isEditingNew && <Chip label="New" color="primary" size="small" />}
                <Box flexGrow={1} />
                <Tooltip title="編集をキャンセルして一覧に戻る"><IconButton onClick={handleCancel} color="default" size="small" sx={{mr: 1}}><CloseIcon /></IconButton></Tooltip>
                {!isEditingNew && (<IconButton onClick={handleDelete} color="error" size="small"><DeleteIcon /></IconButton>)}
              </Stack>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ textAlign: 'center', minWidth: 64 }}>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Preview</Typography>
                  <Avatar variant="rounded" sx={{ width: 64, height: 64, fontSize: '1.5rem', fontWeight: 'bold', borderRadius: '4px', ...previewStyle }}>
                    {formData.symbol || (formData.patternId ? formData.patternId.slice(0, 2) : '??')}
                  </Avatar>
                </Box>
                <Stack spacing={2} sx={{ flex: 1 }}>
                  <TextField label="正式名称" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} size="small" fullWidth />
                  <TextField label="勤務表の表記 (Symbol)" value={formData.symbol || ''} onChange={(e) => handleChange('symbol', e.target.value)} size="small" fullWidth placeholder="例: 早, A, 🌅" helperText="※2文字以内推奨" required />
                </Stack>
              </Box>
              <Divider sx={{ my: 2 }} />

              <Stack spacing={2}>
                <Grid container spacing={2}>
                   <Grid size={6}>
                     <TextField label="開始" type="time" value={formData.startTime} onChange={(e) => handleChange('startTime', e.target.value)} size="small" InputLabelProps={{ shrink: true }} fullWidth />
                   </Grid>
                   <Grid size={6}>
                    <TextField label="終了" type="time" value={formData.endTime} onChange={(e) => handleChange('endTime', e.target.value)} size="small" InputLabelProps={{ shrink: true }} fullWidth />
                   </Grid>
                   <Grid size={6}>
                    <TextField label="実働(h)" type="number" value={formData.durationHours} onChange={(e) => handleChange('durationHours', Number(e.target.value))} size="small" fullWidth />
                   </Grid>
                   <Grid size={6}>
                    <TextField label="休憩(分)" type="number" value={formData.breakDurationMinutes} onChange={(e) => handleChange('breakDurationMinutes', Number(e.target.value))} size="small" fullWidth />
                   </Grid>
                </Grid>
                
                <Box sx={{ px: 1 }}>
                  <Typography variant="caption" color="text.secondary">時間帯調整スライダー (目安)</Typography>
                  <Slider
                    value={sliderValue}
                    onChange={handleTimeSliderChange}
                    min={0} max={1440} step={30}
                    valueLabelDisplay="auto"
                    valueLabelFormat={minToTime}
                    // ★ 動的判定でトラック反転
                    track={isCrossesMidnight ? "inverted" : "normal"}
                  />
                </Box>

                <Grid container spacing={2}>
                  <Grid size={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>タイプ</InputLabel>
                      <Select value={formData.workType} label="タイプ" onChange={(e) => handleChange('workType', e.target.value)}>
                        <MenuItem value="Work">労働</MenuItem>
                        <MenuItem value="Meeting">会議</MenuItem>
                        <MenuItem value="Other">その他</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>カテゴリ</InputLabel>
                      <Select value={formData.mainCategory} label="カテゴリ" onChange={(e) => handleChange('mainCategory', e.target.value)}>
                        <MenuItem value="早出">早出</MenuItem>
                        <MenuItem value="日勤">日勤</MenuItem>
                        <MenuItem value="遅出">遅出</MenuItem>
                        <MenuItem value="夜勤">夜勤</MenuItem>
                        <MenuItem value="半日">半日</MenuItem>
                        <MenuItem value="休み">休み</MenuItem>
                        <MenuItem value="その他">その他</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <FormControlLabel control={<Switch checked={formData.isNightShift || false} onChange={(e) => handleChange('isNightShift', e.target.checked)} />} label="夜勤扱い" sx={{ mr: 0 }} />
                  {/* ★ 日付またぎスイッチを削除 */}
                  <FormControlLabel control={<Switch checked={formData.isFlex || false} onChange={(e) => handleChange('isFlex', e.target.checked)} />} label="Flex(枠のみ)" />
                </Stack>

                <Accordion variant="outlined" sx={{ bgcolor: 'transparent', '&:before': {display: 'none'} }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, px: 1 }}>
                    <Typography variant="caption" color="text.secondary">システムID (詳細設定)</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1 }}>
                    <TextField label="ID (一意な識別子)" value={formData.patternId || ''} onChange={(e) => handleChange('patternId', e.target.value)} size="small" fullWidth disabled={!isEditingNew} helperText="※通常は自動生成されたIDのままで構いません" />
                  </AccordionDetails>
                </Accordion>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} size="large">保存する</Button>
              </Stack>
            </Box>
            {/* (Pattern Usage List - unchanged) */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#fafafa', borderTop: '1px solid #eee' }}>
               {/* 省略 (変更なし) */}
               <List dense>
                  {availableStaff.map(staff => (
                    <ListItem key={staff.staffId}>
                      <ListItemAvatar><Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem' }}>{staff.name.charAt(0)}</Avatar></ListItemAvatar>
                      <ListItemText primary={staff.name} secondary={staff.unitId || '所属なし'} />
                    </ListItem>
                  ))}
                </List>
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
            <Typography>左のリストからパターンを選択するか、<br/>新規作成してください</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}