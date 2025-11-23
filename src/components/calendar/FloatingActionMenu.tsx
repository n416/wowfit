import { Paper, IconButton, Tooltip, Stack, Zoom, SvgIcon, SvgIconProps } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

// ★ 修正: 中身を「塗りつぶし」かつ「4つ並べる」デザインに変更
function CustomSelectAllIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      {/* 外側の点線枠 (角丸) */}
      <rect 
        x="3" y="3" width="20" height="20" rx="1.5" ry="1.5" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeDasharray="3 1" 
      />
      
      {/* 内側の4つの塗りつぶし四角 (2x2グリッド) */}
      {/* 左上 */}
      <rect x="7" y="7" width="5" height="5" fill="currentColor" />
      {/* 右上 */}
      <rect x="14" y="7" width="5" height="5" fill="currentColor" />
      {/* 左下 */}
      <rect x="7" y="14" width="5" height="5" fill="currentColor" />
      {/* 右下 */}
      <rect x="14" y="14" width="5" height="5" fill="currentColor" />
    </SvgIcon>
  );
}

interface FloatingActionMenuProps {
  visible: boolean;
  onCopy: () => void;
  onCut?: () => void; 
  onPaste?: () => void; 
  onSelectAll?: () => void;
}

export default function FloatingActionMenu({ visible, onCopy, onCut, onPaste, onSelectAll }: FloatingActionMenuProps) {
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
          {onSelectAll && (
            <Tooltip title="全選択">
              <IconButton onClick={onSelectAll} color="primary">
                <CustomSelectAllIcon />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="コピー">
            <IconButton onClick={onCopy} color="primary">
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
          
          {onCut && (
            <Tooltip title="カット">
              <IconButton onClick={onCut} color="primary">
                <ContentCutIcon />
              </IconButton>
            </Tooltip>
          )}
          
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