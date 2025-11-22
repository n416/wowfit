import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, RadioGroup, FormControlLabel, Radio,
  Typography, Box, List, ListItem, ListItemText, IconButton,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HistoryIcon from '@mui/icons-material/History';
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
  
  const [view, setView] = useState<'list' | 'form'>('list');
  const [type, setType] = useState<'Grant' | 'Expire' | 'Adjustment'>('Grant');
  const [days, setDays] = useState<string>('10');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (isOpen) {
      setView(history.length === 0 ? 'list' : 'list');
      setType('Grant');
      setDays('10');
      setMemo('');
    }
  }, [isOpen, history.length]);

  const handleSave = () => {
    const numDays = parseFloat(days);
    if (isNaN(numDays) || numDays === 0) {
      alert('有効な日数を入力してください');
      return;
    }
    onSave(type, numDays, memo);
    setView('list');
  };

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'Grant': return '付与';
      case 'Expire': return '消滅';
      case 'Adjustment': return '修正';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'Grant': return 'success';
      case 'Expire': return 'error';
      default: return 'default';
    }
  };

  const renderListView = () => (
    <>
      <DialogContent sx={{ minHeight: 300, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">{staff?.name}</Typography>
          <Chip icon={<HistoryIcon />} label={`${history.length} 件の履歴`} size="small" />
        </Box>

        {history.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', flexDirection: 'column', gap: 1 }}>
            <Typography>この月の調整履歴はありません。</Typography>
            <Typography variant="caption">「追加」ボタンから付与や消滅を登録してください。</Typography>
          </Box>
        ) : (
          <List sx={{ bgcolor: '#f5f5f5', borderRadius: 2, overflow: 'auto', flex: 1 }}>
            {history.map((item) => {
              const dateStr = item.createdAt 
                ? new Date(item.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '日時不明';

              return (
                <ListItem
                  key={item.id}
                  divider
                  secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={() => item.id && onDelete(item.id)}>
                      <DeleteIcon color="error" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip 
                          label={getTypeLabel(item.type)} 
                          color={getTypeColor(item.type) as any} 
                          size="small" 
                          variant="outlined"
                        />
                        <Typography fontWeight="bold" variant="body1">
                          {item.days} 日
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', flexDirection: 'column', mt: 0.5 }}>
                        {item.memo && <span>メモ: {item.memo}</span>}
                        <Typography variant="caption" color="text.secondary">
                          操作: {dateStr}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">閉じる</Button>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={() => setView('form')}
        >
          新規追加
        </Button>
      </DialogActions>
    </>
  );

  const renderFormView = () => (
    <>
      <DialogContent>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={() => setView('list')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">新規登録</Typography>
        </Box>

        <RadioGroup
          row
          value={type}
          onChange={(e) => setType(e.target.value as any)}
          sx={{ mb: 3, justifyContent: 'center' }}
        >
          <FormControlLabel value="Grant" control={<Radio />} label="付与 (+)" />
          <FormControlLabel value="Expire" control={<Radio color="error" />} label="消滅 (-)" />
          <FormControlLabel value="Adjustment" control={<Radio color="default" />} label="修正" />
        </RadioGroup>

        <TextField
          label="日数"
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          fullWidth
          sx={{ mb: 3 }}
          inputProps={{ step: 0.5 }}
          autoFocus
          helperText={type === 'Expire' ? '減らしたい日数を正の値で入力（例: 5）' : ''}
        />

        <TextField
          label="メモ (任意)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          fullWidth
          multiline
          rows={2}
          placeholder="例: 2024年度付与分"
        />
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setView('list')} color="inherit" sx={{ mr: 'auto' }}>
          一覧に戻る
        </Button>
        <Button onClick={handleSave} variant="contained" color={type === 'Expire' ? 'error' : 'primary'}>
          保存する
        </Button>
      </DialogActions>
    </>
  );

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ borderBottom: '1px solid #eee', pb: 1 }}>
        有給調整 ({targetMonthLabel})
      </DialogTitle>
      
      {view === 'list' ? renderListView() : renderFormView()}
    </Dialog>
  );
}