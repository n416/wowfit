import React, { useState } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, 
  CircularProgress, Alert, AlertTitle,
  Collapse,
  IconButton
} from '@mui/material';

// アイコンのインポート
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

// (ShiftCalendarPage.tsx から AIサポートペインのコードを移動)

interface AiSupportPaneProps {
  // ★ v5.9 AIペインに必要な props を定義
  instruction: string;
  onInstructionChange: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
  onExecute: () => void;
}

// export default を追加
export default function AiSupportPane({
  instruction, onInstructionChange, isLoading, error, onClearError, onExecute
}: AiSupportPaneProps) {

  // ★ v5.9 折りたたみ状態は、このコンポーネントの内部で管理
  const [isAiSupportOpen, setIsAiSupportOpen] = useState(true);

  return (
    <Paper 
      variant="outlined" 
      sx={{ 
        flexShrink: 0, // 高さが縮まないように
        borderColor: isLoading ? 'primary.main' : 'divider',
        borderWidth: isLoading ? 2 : 1,
        overflow: 'hidden' // Collapse のため
      }}
    >
      <Box 
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', p: 2 }}
        onClick={() => setIsAiSupportOpen(!isAiSupportOpen)}
      >
        <Typography variant="h6">AIサポート</Typography>
        <IconButton size="small">
          {isAiSupportOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={isAiSupportOpen}>
        <Box sx={{ p: 2, pt: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && (
            <Alert severity="error" onClose={onClearError}>
              <AlertTitle>AI調整エラー</AlertTitle>
              {error}
            </Alert>
          )}
          <TextField
            label="AIへの指示 (情緒的な要望など)"
            multiline
            rows={3}
            fullWidth
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            placeholder="例: 夜勤さんXは今月夜勤を少なめに。日勤Aさんと日勤Bさんはなるべく同じ日に休ませないで。"
            disabled={isLoading}
          />
          <Button 
            variant="contained" 
            color="primary"
            startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
            onClick={onExecute}
            disabled={isLoading}
          >
            {isLoading ? 'AI調整中...' : 'AIで調整を実行'}
          </Button>
        </Box>
      </Collapse>
    </Paper>
  );
}