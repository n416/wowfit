import { useState, useEffect } from 'react';
import { 
  Typography, TextField, Button, 
  Dialog, DialogActions, DialogContent, DialogTitle,
  ToggleButtonGroup, ToggleButton, Box, Stack,
  InputAdornment, IconButton, useTheme
} from '@mui/material';
import { 
  AutoAwesome as AutoIcon, 
  Edit as EditIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { IStaff } from '../../db/dexie';
import { MonthDay, getDefaultRequiredHolidays } from '../../utils/dateUtils'; 

interface StaffStatusModalProps {
  staff: IStaff | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (staffId: string, newHolidayReq: number | null) => void;
  currentSetting: number | undefined;
  monthDays: MonthDay[]; 
}

export default function StaffStatusModal({ 
  staff, 
  isOpen,
  onClose, 
  onSave, 
  currentSetting,
  monthDays 
}: StaffStatusModalProps) {
  
  const theme = useTheme();
  const defaultHolidays = monthDays ? getDefaultRequiredHolidays(monthDays) : 0;
  
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [manualValue, setManualValue] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (currentSetting === undefined) {
        setMode('auto');
        setManualValue(String(defaultHolidays));
      } else {
        setMode('manual');
        setManualValue(String(currentSetting));
      }
    }
  }, [isOpen, currentSetting, defaultHolidays]);

  const handleSave = () => {
    if (!staff) return;
    if (mode === 'auto') {
      onSave(staff.staffId, null);
    } else {
      const val = parseInt(manualValue, 10);
      if (isNaN(val) || val < 0) {
        alert("有効な日数を入力してください。");
        return;
      }
      onSave(staff.staffId, val);
    }
    onClose();
  };

  const handleIncrement = () => {
    const val = parseInt(manualValue, 10) || 0;
    setManualValue(String(val + 1));
  };

  const handleDecrement = () => {
    const val = parseInt(manualValue, 10) || 0;
    setManualValue(String(Math.max(0, val - 1)));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <IconButton size="small" onClick={onClose} sx={{ ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6">公休数の設定</Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Box sx={{ mb: 3 }}>
           <Typography variant="subtitle1" fontWeight="bold">{staff?.name}</Typography>
           <Typography variant="caption" color="text.secondary">今月の公休数を設定します。</Typography>
        </Box>

        <Stack spacing={3}>
          
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              計算モード
            </Typography>
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(_, val) => { if (val) setMode(val); }}
              fullWidth
              color="primary"
              size="medium"
            >
              <ToggleButton value="auto">
                <AutoIcon fontSize="small" sx={{ mr: 1 }} /> 自動計算
              </ToggleButton>
              <ToggleButton value="manual">
                <EditIcon fontSize="small" sx={{ mr: 1 }} /> 手動指定
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {mode === 'auto' ? (
            <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1, textAlign: 'center', border: `1px dashed ${theme.palette.divider}` }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                カレンダーの土日祝日数から自動計算
              </Typography>
              <Typography variant="h4" color="primary" fontWeight="bold">
                {defaultHolidays}
                <Typography component="span" variant="body2" sx={{ ml: 1 }}>日</Typography>
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                公休数
              </Typography>
              {/* ★ 修正: 無理なflexレイアウトをやめ、TextFieldの機能でボタンを内包 */}
              <TextField
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
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
                  style: { textAlign: 'center', fontSize: '1.25rem', fontWeight: 'bold' } 
                }}
                helperText={`デフォルト: ${defaultHolidays}日`}
              />
            </Box>
          )}

        </Stack>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Button onClick={onClose} color="inherit">キャンセル</Button>
        <Button onClick={handleSave} variant="contained" disableElevation>
          変更を確定
        </Button>
      </DialogActions>
    </Dialog>
  );
}