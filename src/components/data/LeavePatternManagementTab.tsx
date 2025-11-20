import { useState, useMemo } from 'react';
import {
  Box, Paper, Typography, IconButton, Button,
  List, ListItem, ListItemText, ListItemAvatar, Avatar,
  Divider, TextField, Tooltip, Stack, FormControl, InputLabel, Select, MenuItem,
  Accordion, AccordionSummary, AccordionDetails, ListItemButton // ★ 追加
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { IShiftPattern } from '../../db/dexie';
import { addNewPattern, updatePattern, deletePattern } from '../../store/patternSlice';

// 休暇パターン用のコンポーネント
export default function LeavePatternManagementTab() {
  const dispatch: AppDispatch = useDispatch();
  const patternList = useSelector((state: RootState) => state.pattern.patterns);

  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [isEditingNew, setIsEditingNew] = useState(false);

  const [formData, setFormData] = useState<Partial<IShiftPattern>>({});

  const targetPattern = useMemo(() => {
    if (isEditingNew) return formData;
    return patternList.find(p => p.patternId === selectedPatternId) || null;
  }, [selectedPatternId, isEditingNew, patternList, formData]);

  const handleSelect = (p: IShiftPattern) => {
    if (isEditingNew) return;
    setIsEditingNew(false);
    setSelectedPatternId(p.patternId);
    setFormData({ ...p });
  };

  const handleCreateNew = () => {
    const newInit: IShiftPattern = {
      patternId: `休${Date.now().toString().slice(-4)}`,
      symbol: '休',
      name: '新規休日',
      mainCategory: '休み',
      workType: 'Holiday', // ★ デフォルトは Holiday (その他の休日)
      crossUnitWorkType: '-',
      startTime: '00:00',
      endTime: '00:00',
      breakDurationMinutes: 0,
      durationHours: 0,
      isNightShift: false,
      isFlex: false
    };
    setFormData(newInit);
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

  const handleSave = () => {
    if (!formData.patternId || !formData.name) return;
    const patternToSave = formData as IShiftPattern;

    if (isEditingNew) {
      dispatch(addNewPattern(patternToSave));
      setIsEditingNew(false);
      setSelectedPatternId(patternToSave.patternId);
    } else {
      dispatch(updatePattern(patternToSave));
    }
  };

  const handleDelete = () => {
    if (selectedPatternId && window.confirm("この休暇パターンを削除しますか？")) {
      dispatch(deletePattern(selectedPatternId));
      setSelectedPatternId(null);
      setFormData({});
    }
  };

  // ★ フィルタ: 休日タイプのみ表示
  const sortedPatterns = useMemo(() => {
    return [...patternList]
      .filter(p => p.workType === 'StatutoryHoliday' || p.workType === 'PaidLeave' || p.workType === 'Holiday')
      .sort((a, b) => {
        // システム定義(公休・有給)を先頭に
        const isSysA = a.workType !== 'Holiday';
        const isSysB = b.workType !== 'Holiday';
        if (isSysA && !isSysB) return -1;
        if (!isSysA && isSysB) return 1;
        return a.patternId.localeCompare(b.patternId);
      });
  }, [patternList]);

  // システム定義（公休・有給）は削除・ID変更不可にするためのフラグ
  // ★ null チェックを含めて boolean に強制変換 (undefined/null回避)
  const isSystemType = !!(targetPattern && (targetPattern.workType === 'StatutoryHoliday' || targetPattern.workType === 'PaidLeave'));

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2, overflow: 'hidden' }}>
      {/* Left Pane: List */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} variant="outlined">
        {isEditingNew && (
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.5)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, backdropFilter: 'blur(2px)' }}>
            <Typography variant="subtitle1" sx={{ color: 'white', bgcolor: 'rgba(0,0,0,0.7)', px: 3, py: 1, borderRadius: 4 }}>右側で編集・保存してください</Typography>
            <Button variant="contained" color="inherit" onClick={handleCancel} startIcon={<CloseIcon />} sx={{ bgcolor: 'rgba(255,255,255,0.9)', color: 'black', '&:hover': { bgcolor: 'white' } }}>キャンセル</Button>
          </Box>
        )}
        <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">休暇パターン一覧</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateNew} disabled={isEditingNew}>新規作成</Button>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <List dense disablePadding>
            {sortedPatterns.map((p) => {
              const isSelected = selectedPatternId === p.patternId;
              const isSys = p.workType !== 'Holiday';
              return (
                // ★ 修正: ListItem + button ではなく ListItemButton を使用
                <ListItem key={p.patternId} disablePadding divider>
                  <ListItemButton 
                    onClick={() => handleSelect(p)}
                    selected={isSelected}
                  >
                    <ListItemAvatar>
                      <Avatar variant="rounded" sx={{ width: 32, height: 32, fontSize: '0.8rem', bgcolor: isSys ? '#ef5350' : '#ff9800', color: '#fff', fontWeight: 'bold', borderRadius: '3px' }}>
                        {p.symbol || p.patternId.slice(0, 2)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText 
                      primary={p.name} 
                      secondary={isSys ? (p.workType === 'StatutoryHoliday' ? '公休' : '有給') : 'その他の休日'} 
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Paper>

      {/* Right Pane: Editor */}
      <Paper sx={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f9f9f9' }} variant="outlined">
        {targetPattern ? (
          <Box sx={{ p: 3, overflowY: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}>
              <Typography variant="h6">{isEditingNew ? '新規休日作成' : '休暇パターン編集'}</Typography>
              <Box flexGrow={1} />
              <Tooltip title="編集をキャンセル"><IconButton onClick={handleCancel} sx={{ mr: 1 }}><CloseIcon /></IconButton></Tooltip>
              {!isEditingNew && !isSystemType && (<IconButton onClick={handleDelete} color="error"><DeleteIcon /></IconButton>)}
            </Stack>
            
            <Divider sx={{ mb: 3 }} />

            <Stack spacing={3} sx={{ maxWidth: 600, mx: 'auto' }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                 <Avatar variant="rounded" sx={{ width: 64, height: 64, fontSize: '1.5rem', fontWeight: 'bold', borderRadius: '4px', bgcolor: (formData.workType !== 'Holiday') ? '#ef5350' : '#ff9800' }}>
                    {formData.symbol || '??'}
                 </Avatar>
                 <Stack spacing={2} sx={{ flex: 1 }}>
                    <TextField label="休暇名" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} size="small" fullWidth required />
                    <TextField label="表記 (Symbol)" value={formData.symbol || ''} onChange={(e) => handleChange('symbol', e.target.value)} size="small" fullWidth placeholder="例: 休, 有, 育" required />
                 </Stack>
              </Box>
              
              {/* ★ 修正: disabled に boolean を渡す */}
              <FormControl size="small" fullWidth disabled={isSystemType}>
                <InputLabel>タイプ</InputLabel>
                <Select value={formData.workType} label="タイプ" onChange={(e) => handleChange('workType', e.target.value)}>
                   <MenuItem value="Holiday">その他の休日 (育休・特別休など)</MenuItem>
                   <MenuItem value="StatutoryHoliday" disabled>公休 (システム)</MenuItem>
                   <MenuItem value="PaidLeave" disabled>有給 (システム)</MenuItem>
                </Select>
              </FormControl>
              
              <Box sx={{ display: 'none' }}>
                 <TextField value={formData.startTime} />
                 <TextField value={formData.endTime} />
              </Box>

              <Accordion variant="outlined" sx={{ bgcolor: 'transparent', '&:before': {display: 'none'} }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, px: 1 }}>
                    <Typography variant="caption" color="text.secondary">システムID (詳細設定)</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1 }}>
                    <TextField 
                      label="ID (一意な識別子)" 
                      value={formData.patternId || ''} 
                      onChange={(e) => handleChange('patternId', e.target.value)} 
                      size="small" fullWidth 
                      // ★ 修正: disabled に boolean を渡す
                      disabled={!isEditingNew || isSystemType} 
                      helperText="※公休・有給のID変更は推奨されません" 
                    />
                  </AccordionDetails>
              </Accordion>

              <Button 
                variant="contained" 
                startIcon={<SaveIcon />} 
                onClick={handleSave} 
                size="large" 
                // ★ 修正: disabled に boolean を渡す
                disabled={isSystemType && false}
              >
                保存する
              </Button>
            </Stack>
          </Box>
        ) : (
           <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
            <Typography>左のリストから選択するか、新規作成してください</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}