import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button,
  CircularProgress, Alert, AlertTitle,
  IconButton, Stack, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText
} from '@mui/material';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import CloseIcon from '@mui/icons-material/Close';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import BalanceIcon from '@mui/icons-material/Balance';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import EditNoteIcon from '@mui/icons-material/EditNote';

interface AiSupportPaneProps {
  instruction: string;
  onInstructionChange: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;

  onExecuteDefault: (keep: boolean) => void;
  onExecuteCustom: (keep: boolean) => void;

  isAnalysisLoading: boolean;
  analysisResult: string | null;
  analysisError: string | null;
  onClearAnalysis: () => void;
  onExecuteAnalysis: () => void;

  onFillRental: () => void;
  onForceAdjustHolidays: () => void;

  isOverallDisabled: boolean;
  hasDraftAssignments: boolean;

  height: number;
  isResizing?: boolean;

  // ★ 追加: 親から開閉状態を受け取る
  isOpen: boolean;
  onToggle: () => void;
}

export default function AiSupportPane({
  instruction, onInstructionChange, isLoading, error, onClearError,
  onExecuteDefault,
  onExecuteCustom,
  isAnalysisLoading, analysisResult, analysisError, onClearAnalysis, onExecuteAnalysis,
  onFillRental, onForceAdjustHolidays,
  isOverallDisabled,
  hasDraftAssignments,
  height,
  isResizing = false,
  isOpen, // ★ 追加
  onToggle // ★ 追加
}: AiSupportPaneProps) {

  // ★ 削除: 内部での状態管理を廃止
  // const [isAiSupportOpen, setIsAiSupportOpen] = useState(...);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'default' | 'custom' | null>(null);

  const handleRequestExecute = (actionType: 'default' | 'custom') => {
    if (hasDraftAssignments) {
      setPendingAction(actionType);
      setDialogOpen(true);
    } else {
      if (actionType === 'default') onExecuteDefault(false);
      else onExecuteCustom(false);
    }
  };

  const handleConfirm = (keep: boolean) => {
    setDialogOpen(false);
    if (pendingAction === 'default') {
      onExecuteDefault(keep);
    } else if (pendingAction === 'custom') {
      onExecuteCustom(keep);
    }
    setPendingAction(null);
  };

  const isAiLoading = isLoading || isAnalysisLoading;
  const displayResult = analysisResult;

  const HEADER_HEIGHT = 56; // ヘッダー高さ固定

  return (
    <Paper
      elevation={2}
      sx={{
        width: '100%',
        flexShrink: 0,
        outline: isAiLoading ? '2px solid #1976d2' : 'none',
        outlineOffset: '-2px',
        overflow: 'hidden',
        // isOpen プロパティを使用
        height: isOpen ? height : HEADER_HEIGHT,
        minHeight: HEADER_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        transition: isResizing ? 'none' : 'height 0.2s',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          p: 2,
          flexShrink: 0,
          height: `${HEADER_HEIGHT}px`,
          boxSizing: 'border-box'
        }}
        onClick={onToggle} // ★ 修正
      >
        <Typography variant="h6">AIサポート & 自動調整</Typography>
        <IconButton size="small">
          {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* isOpen プロパティを使用 */}
      {isOpen && (
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isResizing ? (
            <Box sx={{ flex: 1, bgcolor: '#f5f5f5', m: 1, borderRadius: 1 }} />
          ) : (
            <Box sx={{ p: 2, pt: 0, flex: 1, overflowY: 'auto' }}>

              {(error || analysisError) && (
                <Box sx={{ mb: 2 }}>
                  {error && (
                    <Alert severity="error" onClose={onClearError} sx={{ mb: 1 }}>
                      <AlertTitle>AI草案作成エラー</AlertTitle>
                      {error}
                    </Alert>
                  )}
                  {analysisError && (
                    <Alert severity="warning" onClose={onClearAnalysis}>
                      <AlertTitle>AI現況分析エラー</AlertTitle>
                      {analysisError}
                    </Alert>
                  )}
                </Box>
              )}

              {displayResult && (
                <Box sx={{ mb: 2 }}>
                  <Alert
                    severity="info"
                    sx={{
                      width: '100%',
                      '& .MuiAlert-message': { flexGrow: 1, minWidth: 0, overflow: 'hidden' }
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                        <AlertTitle sx={{ mb: 1, flexGrow: 1 }}>AI現況分析レポート</AlertTitle>
                        <IconButton size="small" onClick={onClearAnalysis} sx={{ mt: -0.5, mr: -1, color: 'info.main' }}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Box sx={{ maxHeight: '200px', overflowY: 'auto', pr: 1 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {displayResult}
                        </Typography>
                      </Box>
                    </Box>
                  </Alert>
                </Box>
              )}

              <Stack spacing={3} pb={2}>
                <Box>
                  <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 'bold' }}>
                    [生成グループ (1→2→3の順に実行推奨)]
                  </Typography>
                  <Stack spacing={2}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
                      onClick={() => handleRequestExecute('default')}
                      disabled={isOverallDisabled}
                      fullWidth
                    >
                      (1) {isLoading ? '作成中...' : '草案を作成（ＡＩ）'}
                    </Button>

                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<BalanceIcon color="primary" />}
                      onClick={onForceAdjustHolidays}
                      disabled={isOverallDisabled}
                      fullWidth
                      sx={{ fontSize: '0.8rem' }}
                    >
                      (2) 公休数補正(ＡＩ)
                    </Button>

                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<SupportAgentIcon color="primary" />}
                      onClick={onFillRental}
                      disabled={isOverallDisabled}
                      fullWidth
                      sx={{ fontSize: '0.8rem' }}
                    >
                      (3) 応援スタッフで埋める (ロジック)
                    </Button>
                  </Stack>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 'bold' }}>
                    [調整・分析]
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="指示: Aさんの夜勤を減らして..."
                          value={instruction}
                          onChange={(e) => onInstructionChange(e.target.value)}
                          disabled={isOverallDisabled}
                        />
                        <Button
                          variant="contained"
                          color="info"
                          onClick={() => handleRequestExecute('custom')}
                          disabled={isOverallDisabled}
                          sx={{ minWidth: '100px', whiteSpace: 'nowrap' }}
                        >
                          AI調整
                        </Button>
                      </Stack>
                    </Box>

                    <Button
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={isAnalysisLoading ? <CircularProgress size={16} color="inherit" /> : <FindInPageIcon />}
                      onClick={() => onExecuteAnalysis()}
                      disabled={isOverallDisabled}
                      fullWidth
                    >
                      {isAnalysisLoading ? '分析中...' : 'AI現況分析'}
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </Box>
          )}
        </Box>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      >
        <DialogTitle>生成モードの選択</DialogTitle>
        <DialogContent>
          <DialogContentText>
            現在、画面上に手動で入力された（または前回の）アサインが残っています。
            これをAIに考慮させますか？
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2, alignItems: 'stretch' }}>
          <Button
            onClick={() => handleConfirm(true)}
            variant="outlined"
            startIcon={<EditNoteIcon />}
            fullWidth
          >
            残して調整 (Refine)
            <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
              現在の配置を維持・改善します
            </Typography>
          </Button>
          <Button
            onClick={() => handleConfirm(false)}
            variant="contained"
            color="error"
            startIcon={<DeleteSweepIcon />}
            fullWidth
          >
            クリアして再生成 (New)
            <Typography variant="caption" sx={{ ml: 1, color: 'white' }}>
              ロック以外を消去して作り直します
            </Typography>
          </Button>
          <Button onClick={() => setDialogOpen(false)} color="inherit" sx={{ mt: 1 }}>
            キャンセル
          </Button>
        </DialogActions>
      </Dialog>

    </Paper>
  );
}
