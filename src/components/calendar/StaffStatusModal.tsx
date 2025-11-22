import { useState, useEffect } from 'react';
import { 
  Typography, TextField, Button, 
  Dialog, DialogActions, DialogContent, DialogTitle
} from '@mui/material';
import { IStaff } from '../../db/dexie';
import { MonthDay,  getDefaultRequiredHolidays } from '../../utils/dateUtils'; 

interface StaffStatusModalProps {
  staff: IStaff | null;
  currentHolidayReq: number;
  onClose: () => void;
  onSave: (newHolidayReq: number) => void;
  monthDays: MonthDay[]; 
}

export default function StaffStatusModal({ 
  staff, 
  currentHolidayReq, 
  onClose, 
  onSave, 
  monthDays 
}: StaffStatusModalProps) {
  const [holidayReq, setHolidayReq] = useState(currentHolidayReq);

  useEffect(() => {
    setHolidayReq(currentHolidayReq);
  }, [currentHolidayReq]);

  const handleSave = () => {
    onSave(Number(holidayReq));
  };

  const defaultHolidays = monthDays ? getDefaultRequiredHolidays(monthDays) : 0;

  return (
    <Dialog open={!!staff} onClose={onClose}>
      <DialogTitle>{staff?.name} の月間ステータス</DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          今月の必要公休数を設定します。（繰越・前借を反映）
        </Typography>
        <TextField
          label="今月の必要公休数"
          type="number"
          value={holidayReq}
          onChange={(e) => setHolidayReq(Number(e.target.value))}
          fullWidth
          margin="normal"
          helperText={`デフォルト (今月の土日数): ${defaultHolidays} 日`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        {/* ★ 修正: 保存 -> 変更を確定 */}
        <Button onClick={handleSave} variant="contained" disableElevation>変更を確定</Button>
      </DialogActions>
    </Dialog>
  );
}