// src/components/calendar/AiSupportPane.tsx
import { useState, useEffect } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, 
  CircularProgress, Alert, AlertTitle,
  Collapse,
  IconButton,
  Stack,
  Divider
} from '@mui/material';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; 
import ExpandLessIcon from '@mui/icons-material/ExpandLess'; 

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FindInPageIcon from '@mui/icons-material/FindInPage'; 
import CloseIcon from '@mui/icons-material/Close';
import SupportAgentIcon from '@mui/icons-material/SupportAgent'; 
import BalanceIcon from '@mui/icons-material/Balance';

interface AiSupportPaneProps {
  instruction: string;
  onInstructionChange: (value: string) => void;
  isLoading: boolean; 
  error: string | null;
  onClearError: () => void;
  
  onExecuteDefault: () => void; 
  onExecuteCustom: () => void;  
  
  isAnalysisLoading: boolean; 
  analysisResult: string | null;
  analysisError: string | null;
  onClearAnalysis: () => void;
  onExecuteAnalysis: () => void;

  onFillRental: () => void;
  onForceAdjustHolidays: () => void;
  
  isOverallDisabled: boolean; 
}

export default function AiSupportPane({
  instruction, onInstructionChange, isLoading, error, onClearError,
  onExecuteDefault, 
  onExecuteCustom,  
  isAnalysisLoading, analysisResult, analysisError, onClearAnalysis, onExecuteAnalysis,
  onFillRental, onForceAdjustHolidays,
  isOverallDisabled
}: AiSupportPaneProps) {

  // ★ 修正: ローカルストレージから初期値を読み込む
  const [isAiSupportOpen, setIsAiSupportOpen] = useState(() => {
    const saved = localStorage.getItem('isAiSupportPaneOpen');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // ★ 追加: 状態変更時にローカルストレージへ保存
  useEffect(() => {
    localStorage.setItem('isAiSupportPaneOpen', JSON.stringify(isAiSupportOpen));
  }, [isAiSupportOpen]);

  const handleExecute = () => {
    onExecuteCustom(); 
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
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1.5, display: 'block', fontWeight: 'bold' }}>
                [生成グループ (1→2→3の順に実行推奨)]
              </Typography>
              <Stack spacing={2}>
                <Button 
                  variant="contained" 
                  color="primary"
                  startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
                  onClick={onExecuteDefault} 
                  disabled={isOverallDisabled} 
                  fullWidth
                >
                  (1) {isLoading ? '作成中...' : 'AIで草案を作成'}
                </Button>
                
                <Button 
                  variant="outlined" 
                  color="primary"    
                  startIcon={<BalanceIcon color="primary" />} 
                  onClick={onForceAdjustHolidays}
                  disabled={isOverallDisabled} 
                  fullWidth
                >
                  (2) 公休数強制補正
                </Button>

                <Button 
                  variant="outlined" 
                  color="primary"    
                  startIcon={<SupportAgentIcon color="primary" />} 
                  onClick={onFillRental}
                  disabled={isOverallDisabled} 
                  fullWidth
                >
                  (3) 応援スタッフで埋める (ロジック)
                </Button>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1.5, display: 'block', fontWeight: 'bold' }}>
                [調整グループ (任意)]
              </Typography>
              <Stack spacing={3}>
                <Button 
                  variant="outlined" 
                  color="secondary"
                  startIcon={isAnalysisLoading ? <CircularProgress size={20} color="inherit" /> : <FindInPageIcon />}
                  onClick={() => onExecuteAnalysis()} 
                  disabled={isOverallDisabled} 
                  fullWidth
                >
                  {isAnalysisLoading ? '分析中...' : 'AI現況分析'}
                </Button>

                <Box>
                  <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                    [カスタム指示]
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="例: Aさんの夜勤を減らして..."
                      value={instruction}
                      onChange={(e) => onInstructionChange(e.target.value)}
                      disabled={isOverallDisabled}
                    />
                    <Button 
                      variant="contained" 
                      color="info"
                      onClick={() => handleExecute()} 
                      disabled={isOverallDisabled} 
                      sx={{ minWidth: '120px' }}
                    >
                      AI調整
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </Box>

          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}