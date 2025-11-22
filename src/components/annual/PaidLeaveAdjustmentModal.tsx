import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, List, ListItem, ListItemText, IconButton,
  Stack, ToggleButton, ToggleButtonGroup, InputAdornment, useTheme
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  History as HistoryIcon,
  EventNote as NoteIcon
} from '@mui/icons-material';
import { IStaff, IPaidLeaveAdjustment } from '../../db/dexie';

interface PaidLeaveAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (type: 'Grant' | 'Expire' | 'Adjustment', days: number, memo: string) => void;
  onDelete: (id: number) => void;
  staff: IStaff | null;
  targetMonthLabel: string;
  history: IPaidLeaveAdjustment[];
}

export default function PaidLeaveAdjustmentModal({
  isOpen, onClose, onSave, onDelete, staff, targetMonthLabel, history = [] 
}: PaidLeaveAdjustmentModalProps) {
  
  const theme = useTheme();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [type, setType] = useState<'Grant' | 'Expire' | 'Adjustment'>('Grant');
  const [days, setDays] = useState<string>('10');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (isOpen) {
      setView(history.length === 0 ? 'form' : 'list');
      setType('Grant');
      setDays('10');
      setMemo('');
    }
  }, [isOpen, history.length]);

  const handleSave = () => {
    const numDays = parseFloat(days);
    if (isNaN(numDays) || numDays <= 0) {
      alert('有効な日数を入力してください');
      return;
    }
    onSave(type, numDays, memo);
    setView('list');
  };

  const handleIncrement = () => {
    const val = parseFloat(days) || 0;
    setDays(String(val + 0.5));
  };

  const handleDecrement = () => {
    const val = parseFloat(days) || 0;
    setDays(String(Math.max(0.5, val - 0.5)));
  };

  // リスト表示モード
  const renderListView = () => (
    <>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box>
          <Typography variant="h6">有給調整履歴</Typography>
          <Typography variant="caption" color="text.secondary">
            {staff?.name} / {targetMonthLabel}
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          size="small" 
          startIcon={<AddIcon />} 
          onClick={() => setView('form')}
        >
          新規登録
        </Button>
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, minHeight: 300 }}>
        {history.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4, color: 'text.secondary' }}>
            <HistoryIcon sx={{ fontSize: 48, mb: 2, opacity: 0.2 }} />
            <Typography variant="body2">履歴はありません</Typography>
          </Box>
        ) : (
          <List>
            {history.map((item) => {
              const isGrant = item.type === 'Grant';
              const isExpire = item.type === 'Expire';
              const label = isGrant ? '付与' : (isExpire ? '消滅' : '修正');
              const sign = isGrant ? '+' : (isExpire ? '-' : '');
              const color = isGrant ? 'success.main' : (isExpire ? 'error.main' : 'text.primary');
              const Icon = isGrant ? AddIcon : (isExpire ? RemoveIcon : EditIcon);
              
              const dateStr = item.createdAt 
                ? new Date(item.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '-';

              return (
                <ListItem
                  key={item.id}
                  divider
                  secondaryAction={
                    <IconButton edge="end" onClick={() => item.id && onDelete(item.id)} size="small">
                      <DeleteIcon fontSize="small" color="action" />
                    </IconButton>
                  }
                >
                  <Box sx={{ mr: 2, display: 'flex', color: color }}>
                    <Icon fontSize="small" />
                  </Box>
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ fontWeight: 'bold', color }}>
                        {label} {sign}{item.days}日
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" component="span" display="block" color="text.primary" sx={{ my: 0.5 }}>
                          {item.memo || '(メモなし)'}
                        </Typography>
                        <Typography variant="caption" component="span" color="text.secondary">
                          操作: {dateStr}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </>
  );

  // フォーム入力モード
  const renderFormView = () => (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <IconButton size="small" onClick={() => setView('list')} sx={{ ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
        {/* ★ 修正: タイトルを変更 */}
        <Typography variant="h6">有給調整ー新規登録</Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={3} sx={{ mt: 1 }}>
          
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              区分
            </Typography>
            <ToggleButtonGroup
              value={type}
              exclusive
              onChange={(_, newVal) => { if (newVal) setType(newVal); }}
              fullWidth
              color="primary"
              size="medium"
            >
              <ToggleButton value="Grant">
                <AddIcon fontSize="small" sx={{ mr: 1 }} /> 付与
              </ToggleButton>
              <ToggleButton value="Expire">
                <RemoveIcon fontSize="small" sx={{ mr: 1 }} /> 消滅
              </ToggleButton>
              <ToggleButton value="Adjustment">
                <EditIcon fontSize="small" sx={{ mr: 1 }} /> 修正
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              日数
            </Typography>
             <TextField
              value={days}
              onChange={(e) => setDays(e.target.value)}
              type="number"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconButton onClick={handleDecrement} edge="start" size="small">
                      <RemoveIcon />
                    </IconButton>
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Typography variant="body2" color="text.secondary" sx={{ mx: 1 }}>
                      日
                    </Typography>
                    <IconButton onClick={handleIncrement} edge="end" size="small">
                      <AddIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              inputProps={{ 
                step: 0.5, 
                style: { textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' } 
              }}
              helperText={type === 'Expire' ? '※ 減らす日数を正の値で入力してください' : ''}
            />
          </Box>

          <TextField
            label="メモ (任意)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="例: 2025年度付与分"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mt: 1.5 }}>
                  <NoteIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Button onClick={() => setView('list')} color="inherit">
          キャンセル
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disableElevation
        >
          変更を確定
        </Button>
      </DialogActions>
    </>
  );

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="xs" fullWidth>
      {view === 'list' ? renderListView() : renderFormView()}
    </Dialog>
  );
}