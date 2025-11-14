import { 
  Button, 
  Dialog, DialogActions, DialogContent, DialogTitle,
  Typography
} from '@mui/material';
import { IStaff } from '../../db/dexie'; 

interface ClearStaffAssignmentsModalProps {
  staff: IStaff | null;
  onClose: () => void;
  onClear: (staffId: string) => void;
}

export default function ClearStaffAssignmentsModal({ staff, onClose, onClear }: ClearStaffAssignmentsModalProps) {

  const handleClear = () => {
    if (staff) {
      onClear(staff.staffId);
    }
  };

  return (
    <Dialog open={!!staff} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>スタッフのアサイン削除</DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          **{staff?.name}** さんの、今月のすべてのアサイン（勤務、公休、有給など）を削除します。
        </Typography>
        <Typography color="error">
          この操作は元に戻せません。よろしいですか？
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleClear} variant="contained" color="error">
          アサインを全クリアする
        </Button>
      </DialogActions>
    </Dialog>
  );
}