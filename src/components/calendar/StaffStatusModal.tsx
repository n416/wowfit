import React, { useState, useEffect } from 'react';
import { 
  Typography, TextField, Button, 
  Dialog, DialogActions, DialogContent, DialogTitle
} from '@mui/material';
import { IStaff } from '../../db/dexie';
// ★★★ v5.9 修正: 共通ユーティリティからインポート ★★★
import { getDefaultRequiredHolidays } from '../../utils/dateUtils'; 

interface StaffStatusModalProps {
  staff: IStaff | null;
  currentHolidayReq: number;
  onClose: () => void;
  onSave: (newHolidayReq: number) => void;
}

// export default を追加
export default function StaffStatusModal({ staff, currentHolidayReq, onClose, onSave }: StaffStatusModalProps) {
  const [holidayReq, setHolidayReq] = useState(currentHolidayReq);

  useEffect(() => {
    setHolidayReq(currentHolidayReq);
  }, [currentHolidayReq]);

  const handleSave = () => {
    onSave(Number(holidayReq));
  };

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
          helperText={`デフォルト (今月の土日数): ${getDefaultRequiredHolidays()} 日`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSave} variant="contained">保存</Button>
      </DialogActions>
    </Dialog>
  );
}