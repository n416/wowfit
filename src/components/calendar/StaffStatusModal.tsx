import { useState, useEffect } from 'react';
import { 
  Typography, TextField, Button, 
  Dialog, DialogActions, DialogContent, DialogTitle
} from '@mui/material';
import { IStaff } from '../../db/dexie';
import { MonthDay,  getDefaultRequiredHolidays } from '../../utils/dateUtils'; 

// ★ MonthDay型を定義（または共有型からインポート）

interface StaffStatusModalProps {
  staff: IStaff | null;
  currentHolidayReq: number;
  onClose: () => void;
  onSave: (newHolidayReq: number) => void;
  monthDays: MonthDay[]; // ★ 追加: 月の日付情報を受け取る
}

export default function StaffStatusModal({ 
  staff, 
  currentHolidayReq, 
  onClose, 
  onSave, 
  monthDays // ★ 追加
}: StaffStatusModalProps) {
  const [holidayReq, setHolidayReq] = useState(currentHolidayReq);

  useEffect(() => {
    setHolidayReq(currentHolidayReq);
  }, [currentHolidayReq]);

  const handleSave = () => {
    onSave(Number(holidayReq));
  };

  // ★ 修正: monthDays を渡す
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
          // ★ 修正: 計算結果を表示
          helperText={`デフォルト (今月の土日数): ${defaultHolidays} 日`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSave} variant="contained">保存</Button>
      </DialogActions>
    </Dialog>
  );
}