import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Paper, Typography, IconButton, Button,
  List, ListItem, ListItemAvatar, Avatar,
  Chip, Divider, TextField, Stack, FormControl, InputLabel, Select, MenuItem,
  InputAdornment, Grid, Accordion, AccordionSummary, AccordionDetails,
  Tooltip,
  ButtonBase
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  AccessTime as AccessTimeIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  DragIndicator as DragIndicatorIcon // ★ 追加: ドラッグハンドル用アイコン
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { IStaff, IShiftPattern } from '../../db/dexie';
import { addNewStaff, updateStaff, deleteStaff, reorderStaff } from '../../store/staffSlice';

// --- Constants ---
const DEFAULT_CONSTRAINTS = { maxConsecutiveDays: 5, minIntervalHours: 12 };

// --- Helper Functions ---
const getPatternColor = (p: IShiftPattern) => {
  if (p.isNightShift) return '#424242';
  if (p.mainCategory.includes('早出')) return '#ffa726';
  if (p.mainCategory.includes('遅出')) return '#29b6f6';
  return '#66bb6a';
};

// --- Helper Components ---

const SkillsInput = ({ skills, onChange }: { skills: string[], onChange: (s: string[]) => void }) => {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!skills.includes(input.trim())) {
        onChange([...skills, input.trim()]);
      }
      setInput('');
    }
  };
  const handleDelete = (skillToDelete: string) => {
    onChange(skills.filter(s => s !== skillToDelete));
  };
  return (
    <Box>
      <TextField
        label="スキル・資格 (Enterで追加)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        size="small"
        fullWidth
        placeholder="例: リーダー, 喀痰吸引"
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
        {skills.map((skill) => (
          <Chip key={skill} label={skill} onDelete={() => handleDelete(skill)} size="small" color="primary" variant="outlined" />
        ))}
      </Box>
    </Box>
  );
};

// --- Main Component ---

export default function StaffManagementTab() {
  const dispatch: AppDispatch = useDispatch();
  const reduxStaffList = useSelector((state: RootState) => state.staff.staff);
  const unitList = useSelector((state: RootState) => state.unit.units);
  const patternList = useSelector((state: RootState) => state.pattern.patterns);

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [isEditingNew, setIsEditingNew] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('Active');

  const [formData, setFormData] = useState<Partial<IStaff>>({});

  // ★ ドラッグアンドドロップ用のローカルState (リアルタイム並び替え用)
  const [localStaffList, setLocalStaffList] = useState<IStaff[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ★ 初期化 & Reduxとの同期 (ドラッグ中以外)
  useEffect(() => {
    if (!draggingId) {
      // displayOrder順にソートしてローカルStateにセット
      const sorted = [...reduxStaffList].sort((a, b) => {
        const oA = a.displayOrder ?? 999999;
        const oB = b.displayOrder ?? 999999;
        if (oA !== oB) return oA - oB;
        // fallback
        const uA = a.unitId || 'ZZZ';
        const uB = b.unitId || 'ZZZ';
        if (uA !== uB) return uA.localeCompare(uB);
        return a.name.localeCompare(b.name);
      });
      setLocalStaffList(sorted);
    }
  }, [reduxStaffList, draggingId]);

  // ★ フィルタ適用 (ローカルリストに対してフィルタ)
  const filteredStaffList = useMemo(() => {
    return localStaffList.filter(staff => {
      const matchName = staff.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchUnit = filterUnit === 'All' || (filterUnit === 'Unassigned' ? !staff.unitId : staff.unitId === filterUnit);
      const matchType = filterType === 'All' || staff.employmentType === filterType;
      const matchStatus = filterStatus === 'All' || (filterStatus === 'Active' ? staff.status !== 'OnLeave' : staff.status === 'OnLeave');
      return matchName && matchUnit && matchType && matchStatus;
    });
  }, [localStaffList, searchTerm, filterUnit, filterType, filterStatus]);

  const targetStaff = useMemo(() => {
    if (isEditingNew) return formData;
    return reduxStaffList.find(s => s.staffId === selectedStaffId) || null;
  }, [selectedStaffId, isEditingNew, reduxStaffList, formData]);

  const { groupedPatterns, categoryOrder } = useMemo(() => {
    const filtered = patternList.filter(p => p.workType === 'Work' || p.isFlex);
    const groups: { [key: string]: IShiftPattern[] } = {};
    
    filtered.forEach(p => {
      if (!groups[p.mainCategory]) groups[p.mainCategory] = [];
      groups[p.mainCategory].push(p);
    });

    const preferredOrder = ['早出', '日勤', '遅出', '夜勤', '半日', '契約', '休み', 'その他'];
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return { groupedPatterns: groups, categoryOrder: sortedKeys };
  }, [patternList]);

  // --- Drag & Drop Handlers (Live Sorting) ---

  const handleDragStart = (e: React.DragEvent, staffId: string) => {
    setDraggingId(staffId);
    e.dataTransfer.effectAllowed = 'move';
    // ドラッグ中のゴースト画像の透明度調整などはブラウザのデフォルトに任せる
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // ドロップ可能にするために必須
  };

  // ★ アグレッシブに動く: 重なった瞬間にリストを入れ替える
  const handleDragEnter = (targetId: string) => {
    if (!draggingId || targetId === draggingId) return;

    setLocalStaffList((prevList) => {
      const newList = [...prevList];
      const srcIndex = newList.findIndex((s) => s.staffId === draggingId);
      const tgtIndex = newList.findIndex((s) => s.staffId === targetId);

      if (srcIndex === -1 || tgtIndex === -1) return prevList;

      // 配列内の位置を移動 (SwapではなくMove)
      const [movedItem] = newList.splice(srcIndex, 1);
      newList.splice(tgtIndex, 0, movedItem);

      return newList;
    });
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    // 確定した並び順をRedux(DB)に保存
    dispatch(reorderStaff(localStaffList));
  };

  // --- Other Handlers ---

  const handleSelect = (staff: IStaff) => {
    if (isEditingNew) return;
    setSelectedStaffId(staff.staffId);
    setFormData(JSON.parse(JSON.stringify(staff))); 
  };

  const handleCreateNew = () => {
    const newStaff: Partial<IStaff> = {
      name: '',
      employmentType: 'FullTime',
      status: 'Active',
      unitId: null,
      skills: [],
      availablePatternIds: [],
      constraints: { ...DEFAULT_CONSTRAINTS },
      workableTimeRanges: [],
      memo: ''
    };
    setFormData(newStaff);
    setIsEditingNew(true);
    setSelectedStaffId(null);
  };

  const handleCopy = (e: React.MouseEvent, staff: IStaff) => {
    e.stopPropagation();
    const copyData: Partial<IStaff> = {
      ...staff,
      staffId: undefined, 
      name: `${staff.name} (コピー)`,
      displayOrder: undefined, 
    };
    setFormData(copyData);
    setIsEditingNew(true);
    setSelectedStaffId(null);
  };

  const handleCancel = () => {
    setIsEditingNew(false);
    setSelectedStaffId(null);
    setFormData({});
  };

  const handleChange = (field: keyof IStaff, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConstraintChange = (field: keyof typeof DEFAULT_CONSTRAINTS, value: number) => {
    setFormData(prev => ({
      ...prev,
      constraints: { ...prev.constraints!, [field]: value }
    }));
  };

  const handleTogglePattern = (patternId: string) => {
    setFormData(prev => {
      const current = prev.availablePatternIds || [];
      if (current.includes(patternId)) {
        return { ...prev, availablePatternIds: current.filter(id => id !== patternId) };
      } else {
        return { ...prev, availablePatternIds: [...current, patternId] };
      }
    });
  };

  const handleToggleCategory = (patterns: IShiftPattern[]) => {
    const ids = patterns.map(p => p.patternId);
    const current = formData.availablePatternIds || [];
    const isAllSelected = ids.every(id => current.includes(id));

    if (isAllSelected) {
      setFormData(prev => ({
        ...prev,
        availablePatternIds: current.filter(id => !ids.includes(id))
      }));
    } else {
      const toAdd = ids.filter(id => !current.includes(id));
      setFormData(prev => ({
        ...prev,
        availablePatternIds: [...current, ...toAdd]
      }));
    }
  };

  const handleAddRange = () => {
    const currentRanges = formData.workableTimeRanges || [];
    setFormData(prev => ({ ...prev, workableTimeRanges: [...currentRanges, { start: '08:00', end: '20:00' }] }));
  };
  const handleRemoveRange = (index: number) => {
    const currentRanges = formData.workableTimeRanges || [];
    setFormData(prev => ({ ...prev, workableTimeRanges: currentRanges.filter((_, i) => i !== index) }));
  };
  const handleChangeRange = (index: number, field: 'start' | 'end', val: string) => {
    const currentRanges = [...(formData.workableTimeRanges || [])];
    currentRanges[index] = { ...currentRanges[index], [field]: val };
    setFormData(prev => ({ ...prev, workableTimeRanges: currentRanges }));
  };

  const handleSave = () => {
    if (!formData.name) return;

    if (formData.employmentType === 'PartTime') {
      const ranges = formData.workableTimeRanges || [];
      if (ranges.length === 0) {
        ranges.push({ start: '08:00', end: '20:00' });
      }
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (!r.start || !r.end) { alert(`時間帯 ${i+1}: 時刻が未入力です`); return; }
        if (r.start >= r.end) { alert(`時間帯 ${i+1}: 開始 < 終了 にしてください`); return; }
        for (let j = i + 1; j < ranges.length; j++) {
          const r2 = ranges[j];
          if (r.start < r2.end && r2.start < r.end) {
            alert(`時間帯 ${i+1} と ${j+1} が重複しています`);
            return;
          }
        }
      }
      formData.workableTimeRanges = ranges;
    } else {
      formData.workableTimeRanges = undefined;
    }

    if (isEditingNew) {
      dispatch(addNewStaff(formData as any));
      setIsEditingNew(false);
      setSelectedStaffId(null);
    } else {
      if (formData.staffId) {
        dispatch(updateStaff(formData as IStaff));
      }
    }
  };

  const handleDelete = () => {
    if (selectedStaffId && window.confirm("本当に削除しますか？")) {
      dispatch(deleteStaff(selectedStaffId));
      setSelectedStaffId(null);
      setFormData({});
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2, overflow: 'hidden' }}>
      
      {/* --- Left Pane: List & Filters --- */}
      <Paper sx={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} variant="outlined">
        
        {isEditingNew && (
          <Box sx={{
            position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            backdropFilter: 'blur(2px)'
          }}>
            <Typography variant="subtitle1" sx={{ color: 'white', bgcolor: 'rgba(0,0,0,0.7)', px: 3, py: 1, borderRadius: 4 }}>
              右側のパネルでスタッフ情報を入力してください
            </Typography>
            <Button variant="contained" color="inherit" onClick={handleCancel} startIcon={<CloseIcon />} sx={{ bgcolor: 'rgba(255,255,255,0.9)', color: 'black', '&:hover': { bgcolor: 'white' } }}>
              キャンセル
            </Button>
          </Box>
        )}

        <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ mr: 'auto' }}>スタッフ一覧</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateNew} disabled={isEditingNew}>
            新規登録
          </Button>
        </Box>

        <Box sx={{ p: 1.5, bgcolor: '#fafafa', borderBottom: '1px solid #eee', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            placeholder="名前で検索..."
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ width: 200 }}
          />
          <FormControl size="small" sx={{ width: 120 }}>
            <InputLabel>ユニット</InputLabel>
            <Select value={filterUnit} label="ユニット" onChange={(e) => setFilterUnit(e.target.value)}>
              <MenuItem value="All">全て</MenuItem>
              <MenuItem value="Unassigned">所属なし</MenuItem>
              {unitList.map(u => <MenuItem key={u.unitId} value={u.unitId}>{u.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: 120 }}>
            <InputLabel>形態</InputLabel>
            <Select value={filterType} label="形態" onChange={(e) => setFilterType(e.target.value)}>
              <MenuItem value="All">全て</MenuItem>
              <MenuItem value="FullTime">常勤</MenuItem>
              <MenuItem value="PartTime">パート</MenuItem>
              <MenuItem value="Rental">応援</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: 110 }}>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} displayEmpty>
              <MenuItem value="Active">勤務中</MenuItem>
              <MenuItem value="OnLeave">休職中</MenuItem>
              <MenuItem value="All">全て</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <List sx={{ flex: 1, overflowY: 'auto' }}>
          {filteredStaffList.map((staff) => {
            const unitName = unitList.find(u => u.unitId === staff.unitId)?.name || '未所属';
            const isSelected = staff.staffId === selectedStaffId;
            const isDragging = staff.staffId === draggingId;
            
            return (
              <ListItem 
                key={staff.staffId} 
                divider 
                disablePadding
                draggable={!isEditingNew} // 編集モードでない時のみドラッグ可能
                onDragStart={(e) => handleDragStart(e, staff.staffId)}
                onDragOver={handleDragOver}
                onDragEnter={() => handleDragEnter(staff.staffId)} // ★ ここで入れ替えを実行
                onDragEnd={handleDragEnd} // ★ ドロップ（終了）時に保存
                sx={{
                  opacity: isDragging ? 0.3 : 1, // ドラッグ元の透明度を下げる
                  cursor: isEditingNew ? 'default' : 'move',
                  bgcolor: isDragging ? '#e3f2fd' : (isSelected ? 'action.selected' : 'inherit'),
                  transition: 'background-color 0.2s, opacity 0.2s', // アニメーション
                }}
                secondaryAction={
                   <Stack direction="row" spacing={0}>
                      <Tooltip title="コピーして新規作成">
                        <IconButton edge="end" onClick={(e) => handleCopy(e, staff)} size="small" disabled={isEditingNew}>
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                   </Stack>
                }
              >
                <Box 
                  onClick={() => handleSelect(staff)}
                  sx={{ 
                    width: '100%', display: 'flex', alignItems: 'center', p: 1.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  {/* ★ ドラッグハンドルアイコン */}
                  <Box 
                    component="span" 
                    sx={{ 
                      mr: 1.5, 
                      color: 'text.secondary', 
                      display: 'flex', 
                      alignItems: 'center', 
                      cursor: isEditingNew ? 'default' : 'grab',
                      '&:active': { cursor: 'grabbing' }
                    }}
                  >
                    <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.4 }} />
                  </Box>

                  <ListItemAvatar>
                    <Avatar sx={{ 
                      bgcolor: staff.status === 'OnLeave' ? 'grey.400' : (staff.employmentType === 'FullTime' ? 'primary.main' : 'warning.main'),
                      width: 36, height: 36, fontSize: '1rem'
                    }}>
                      {staff.name.charAt(0)}
                    </Avatar>
                  </ListItemAvatar>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2">{staff.name}</Typography>
                      {staff.status === 'OnLeave' && <Chip label="休" size="small" color="default" sx={{ height: 20, fontSize: '0.7rem' }} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {unitName} | {staff.employmentType === 'FullTime' ? '常勤' : (staff.employmentType === 'PartTime' ? 'パート' : '応援')}
                    </Typography>
                    {staff.skills.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {staff.skills.map(skill => (
                          <Chip key={skill} label={skill} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#e3f2fd' }} />
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              </ListItem>
            );
          })}
          {filteredStaffList.length === 0 && (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              該当するスタッフがいません
            </Box>
          )}
        </List>
      </Paper>

      {/* --- Right Pane: Editor --- */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f9f9f9' }} variant="outlined">
        {targetStaff ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <Typography variant="h6">{isEditingNew ? '新規スタッフ登録' : 'スタッフ詳細・編集'}</Typography>
                  {isEditingNew && <Chip label="New" color="primary" size="small" />}
              </Stack>
              
              <Box>
                <Tooltip title="編集をキャンセルして一覧に戻る">
                   <IconButton onClick={handleCancel} sx={{ mr: 1 }}><CloseIcon /></IconButton>
                </Tooltip>
                {!isEditingNew && (
                  <IconButton onClick={handleDelete} color="error"><DeleteIcon /></IconButton>
                )}
              </Box>
            </Box>

            {/* プレビュー付きヘッダー */}
            <Box sx={{ p: 2, bgcolor: '#fff', display: 'flex', gap: 2, alignItems: 'flex-start', borderBottom: '1px solid #eee' }}>
              <Box sx={{ textAlign: 'center', minWidth: 64 }}>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Preview</Typography>
                  <Avatar 
                    sx={{ 
                      width: 64, height: 64, 
                      fontSize: '2rem', 
                      bgcolor: formData.status === 'OnLeave' ? 'grey.400' : (formData.employmentType === 'FullTime' ? 'primary.main' : 'warning.main'),
                    }}
                  >
                    {formData.name ? formData.name.charAt(0) : '?'}
                  </Avatar>
              </Box>
              <Stack spacing={2} sx={{ flex: 1 }}>
                  <TextField 
                    label="氏名" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)}
                    fullWidth size="small" required
                  />
                  <Grid container spacing={1}>
                    <Grid size={6}>
                        <FormControl fullWidth size="small">
                        <InputLabel>ステータス</InputLabel>
                        <Select value={formData.status || 'Active'} label="ステータス" onChange={(e) => handleChange('status', e.target.value)}>
                            <MenuItem value="Active">勤務中</MenuItem>
                            <MenuItem value="OnLeave">休職中</MenuItem>
                        </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={6}>
                       <FormControl fullWidth size="small">
                        <InputLabel>雇用形態</InputLabel>
                        <Select value={formData.employmentType || 'FullTime'} label="雇用形態" onChange={(e) => handleChange('employmentType', e.target.value)}>
                          <MenuItem value="FullTime">常勤</MenuItem>
                          <MenuItem value="PartTime">パート</MenuItem>
                          <MenuItem value="Rental">応援</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
              </Stack>
            </Box>
            
            {/* Form Scroll Area */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
              <Stack spacing={3}>
                
                {/* Basic Info */}
                <Paper sx={{ p: 2 }} variant="outlined">
                  <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon fontSize="small" /> 所属・契約
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>所属ユニット</InputLabel>
                        <Select value={formData.unitId || ''} label="所属ユニット" onChange={(e) => handleChange('unitId', e.target.value || null)}>
                          <MenuItem value="">(所属なし)</MenuItem>
                          {unitList.map(u => <MenuItem key={u.unitId} value={u.unitId}>{u.name}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={6}>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Part Time Settings */}
                {formData.employmentType === 'PartTime' && (
                  <Paper sx={{ p: 2, bgcolor: '#fff8e1', borderColor: '#ffecb3' }} variant="outlined">
                     <Typography variant="subtitle2" gutterBottom sx={{ color: 'warning.dark', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccessTimeIcon fontSize="small" /> パート契約時間帯
                    </Typography>
                    <Typography variant="caption" display="block" mb={1}>
                      ※ シフトはこの時間帯の範囲内でのみ割り当てられます。
                    </Typography>
                    {(formData.workableTimeRanges || []).map((range, idx) => (
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
                  </Paper>
                )}

                {/* Skills & Constraints */}
                <Paper sx={{ p: 2 }} variant="outlined">
                  <Stack spacing={2}>
                     <SkillsInput 
                       skills={formData.skills || []} 
                       onChange={(newSkills) => handleChange('skills', newSkills)} 
                     />
                     
                     <Divider />
                     
                     <Typography variant="subtitle2">勤務制約</Typography>
                     <Stack direction="row" spacing={2}>
                        <TextField
                          label="最大連勤日数" type="number" size="small"
                          value={formData.constraints?.maxConsecutiveDays ?? 5}
                          onChange={(e) => handleConstraintChange('maxConsecutiveDays', Number(e.target.value))}
                        />
                        <TextField
                          label="最短インターバル(h)" type="number" size="small"
                          value={formData.constraints?.minIntervalHours ?? 12}
                          onChange={(e) => handleConstraintChange('minIntervalHours', Number(e.target.value))}
                        />
                     </Stack>
                  </Stack>
                </Paper>

                {/* Improved Available Patterns Selector */}
                <Accordion variant="outlined" defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle2">勤務可能パターン設定</Typography>
                    <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
                      {formData.availablePatternIds?.length || 0} 個選択中
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    
                    <Stack spacing={3}>
                      {categoryOrder.map(category => {
                        const patterns = groupedPatterns[category];
                        if (!patterns || patterns.length === 0) return null;

                        const groupColor = getPatternColor(patterns[0]);
                        const isAllSelected = patterns.every(p => formData.availablePatternIds?.includes(p.patternId));

                        return (
                          <Box 
                            key={category} 
                            sx={{ 
                              border: isAllSelected ? `2px solid ${groupColor}` : '1px dashed #e0e0e0',
                              borderRadius: 2,
                              p: 1.5,
                              position: 'relative',
                              bgcolor: isAllSelected ? alpha(groupColor, 0.05) : 'transparent',
                              transition: 'all 0.2s'
                            }}
                          >
                            {/* Group Title (Click to toggle all) */}
                            <Box 
                              onClick={() => handleToggleCategory(patterns)}
                              sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                mb: 1, 
                                cursor: 'pointer', 
                                userSelect: 'none',
                                '&:hover': { opacity: 0.8 }
                              }}
                            >
                              <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mr: 1 }}>
                                {category}
                              </Typography>
                              {isAllSelected ? (
                                <CheckCircleIcon sx={{ fontSize: 20, color: groupColor }} />
                              ) : (
                                <RadioButtonUncheckedIcon sx={{ fontSize: 20, color: '#e0e0e0' }} />
                              )}
                            </Box>

                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {patterns.map(p => {
                                const isSelected = formData.availablePatternIds?.includes(p.patternId);
                                const color = getPatternColor(p);
                                
                                return (
                                  <ButtonBase
                                    key={p.patternId}
                                    onClick={() => handleTogglePattern(p.patternId)}
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      pl: 0.5, pr: 1.5, py: 0.5,
                                      borderRadius: '6px',
                                      border: '1px solid',
                                      borderColor: isSelected ? color : '#e0e0e0',
                                      bgcolor: isSelected ? alpha(color, 0.1) : 'white',
                                      transition: 'all 0.1s',
                                      '&:hover': {
                                        bgcolor: isSelected ? alpha(color, 0.2) : '#f5f5f5',
                                      }
                                    }}
                                  >
                                    <Box sx={{ 
                                      width: 24, height: 24, 
                                      bgcolor: color, 
                                      color: '#fff', 
                                      borderRadius: '4px', 
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '0.75rem', fontWeight: 'bold'
                                    }}>
                                      {p.symbol || p.patternId.slice(0, 2)}
                                    </Box>
                                    
                                    <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#333' : '#666' }}>
                                      {p.name}
                                    </Typography>
                                    
                                    {isSelected && <CheckIcon sx={{ fontSize: 16, color: color, ml: 0.5 }} />}
                                  </ButtonBase>
                                );
                              })}
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                    
                    <Accordion variant="outlined" sx={{ mt: 2, bgcolor: 'transparent', '&:before': {display: 'none'} }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, px: 1 }}>
                            <Typography variant="caption" color="text.secondary">システムID・メモ (詳細設定)</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1 }}>
                            <TextField 
                                label="ID (一意な識別子)" 
                                value={formData.staffId || ''} 
                                size="small" 
                                fullWidth
                                disabled
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                label="制約メモ (AI生成のヒント)"
                                value={formData.memo || ''}
                                onChange={(e) => handleChange('memo', e.target.value)}
                                multiline rows={3} fullWidth size="small"
                                placeholder="例: 夜勤は月2回まで / Aさんとは別シフト希望"
                            />
                        </AccordionDetails>
                    </Accordion>
                  </AccordionDetails>
                </Accordion>

              </Stack>
            </Box>
            
            {/* Footer Actions */}
            <Box sx={{ p: 2, borderTop: '1px solid #ddd', bgcolor: '#fff', textAlign: 'right' }}>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} size="large">
                保存する
              </Button>
            </Box>

          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
            <Typography>左のリストからスタッフを選択するか、<br/>新規登録してください</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
