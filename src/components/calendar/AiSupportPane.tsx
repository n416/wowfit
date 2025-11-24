import { useState, useEffect } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, 
  CircularProgress, Alert, AlertTitle,
  Collapse, IconButton, Stack, Divider,
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
  // ★ 追加: ロックされていない下書きがあるか
  hasDraftAssignments: boolean; 
}

export default function AiSupportPane({
  instruction, onInstructionChange, isLoading, error, onClearError,
  onExecuteDefault, 
  onExecuteCustom,  
  isAnalysisLoading, analysisResult, analysisError, onClearAnalysis, onExecuteAnalysis,
  onFillRental, onForceAdjustHolidays,
  isOverallDisabled,
  hasDraftAssignments
}: AiSupportPaneProps) {

  const [isAiSupportOpen, setIsAiSupportOpen] = useState(() => {
    const saved = localStorage.getItem('isAiSupportPaneOpen');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // ★ ダイアログ管理用ステート
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'default' | 'custom' | null>(null);

  useEffect(() => {
    localStorage.setItem('isAiSupportPaneOpen', JSON.stringify(isAiSupportOpen));
  }, [isAiSupportOpen]);

  // 実行ボタンが押された時のハンドラ
  const handleRequestExecute = (actionType: 'default' | 'custom') => {
    if (hasDraftAssignments) {
      // 下書きがある場合はダイアログで聞く
      setPendingAction(actionType);
      setDialogOpen(true);
    } else {
      // 下書きがない（または全部ロック済み）なら、問答無用で実行（keep=falseでも影響なし）
      if (actionType === 'default') onExecuteDefault(false);
      else onExecuteCustom(false);
    }
  };

  // ダイアログでの選択ハンドラ
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

  return (
    <Paper 
      elevation={2} 
      sx={{ 
        width: '100%', 
        flexShrink: 0, 
        outline: isAiLoading ? '2px solid #1976d2' : 'none', 
        outlineOffset: '-2px', 
        overflow: 'hidden' 
      }}
    >
      <Box 
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', p: 2 }}
        onClick={() => setIsAiSupportOpen(!isAiSupportOpen)}
      >
        <Typography variant="h6">AIサポート & 自動調整</Typography>
        <IconButton size="small">
          {isAiSupportOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={isAiSupportOpen}>
        <Box sx={{ p: 2, pt: 0 }}>
          
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

          <Stack spacing={3}>
            
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
      </Collapse>

      {/* ★ 実行モード確認ダイアログ */}
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