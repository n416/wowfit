import { Paper, IconButton, Tooltip, Stack, Zoom } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

interface FloatingActionMenuProps {
  visible: boolean;
  onCopy: () => void;
  onCut?: () => void; // オプショナルに変更
  onPaste?: () => void; // オプショナルに変更
}

export default function FloatingActionMenu({ visible, onCopy, onCut, onPaste }: FloatingActionMenuProps) {
  return (
    <Zoom in={visible}>
      <Paper
        elevation={4}
        sx={{
          position: 'fixed',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          padding: '8px 16px',
          borderRadius: '50px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(4px)',
          border: '1px solid #e0e0e0'
        }}
      >
        <Stack direction="row" spacing={1}>
          {/* Copyは必須 */}
          <Tooltip title="コピー">
            <IconButton onClick={onCopy} color="primary">
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
          
          {/* Cutがあれば表示 */}
          {onCut && (
            <Tooltip title="カット">
              <IconButton onClick={onCut} color="primary">
                <ContentCutIcon />
              </IconButton>
            </Tooltip>
          )}
          
          {/* Pasteがあれば表示 */}
          {onPaste && (
            <Tooltip title="ペースト">
              <IconButton onClick={onPaste} color="secondary">
                <ContentPasteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Paper>
    </Zoom>
  );
}