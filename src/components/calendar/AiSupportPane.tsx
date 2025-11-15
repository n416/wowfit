import { useState } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, 
  CircularProgress, Alert, AlertTitle,
  Collapse,
  IconButton,
  Stack,
  Divider
} from '@mui/material';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
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
  
  // ★★★ 修正: onExecute を2つに分離 ★★★
  onExecuteDefault: () => void; // 「AIで草案を作成」用
  onExecuteCustom: () => void;  // 「AI調整」(カスタム指示)用
  
  isAnalysisLoading: boolean;
  analysisResult: string | null;
  analysisError: string | null;
  onClearAnalysis: () => void;
  onExecuteAnalysis: () => void;

  onFillRental: () => void;
  onForceAdjustHolidays: () => void;
}

export default function AiSupportPane({
  instruction, onInstructionChange, isLoading, error, onClearError,
  onExecuteDefault, // ★ 修正
  onExecuteCustom,  // ★ 修正
  isAnalysisLoading, analysisResult, analysisError, onClearAnalysis, onExecuteAnalysis,
  onFillRental, onForceAdjustHolidays
}: AiSupportPaneProps) {

  const [isAiSupportOpen, setIsAiSupportOpen] = useState(true);

  // ★★★ 修正: handleExecute は onExecuteCustom のみ呼ぶようにする ★★★
  const handleExecute = () => {
    // (fixedInstruction は使われていなかったので削除)
    onExecuteCustom(); 
  };
  
  const isAnyLoading = isLoading || isAnalysisLoading;
  const displayResult = analysisResult;

  return (
    <Paper 
      variant="outlined" 
      sx={{ 
        width: '100%', 
        flexShrink: 0, 
        borderColor: isAnyLoading ? 'primary.main' : 'divider',
        borderWidth: isAnyLoading ? 2 : 1,
        overflow: 'hidden' 
      }}
    >
      <Box 
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', p: 2 }}
        onClick={() => setIsAiSupportOpen(!isAiSupportOpen)}
      >
        <Typography variant="h6">AIサポート & 自動調整</Typography>
        <IconButton size="small">
          {isAiSupportOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={isAiSupportOpen}>
        <Box sx={{ p: 2, pt: 0 }}>
          
          {(error || analysisError) && (
            // (エラー表示部分は変更なし)
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
            // (分析結果表示部分は変更なし)
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
            
            {/* グループ1: 基本作成 */}
            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 'bold' }}>
                [作成・埋める]
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button 
                  variant="contained" 
                  color="primary"
                  startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
                  // ★★★ 修正: onExecuteDefault を呼ぶ ★★★
                  onClick={onExecuteDefault} 
                  disabled={isAnyLoading} 
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  {isLoading ? '作成中...' : 'AIで草案を作成'}
                </Button>
                <Button 
                  variant="contained" 
                  color="success"
                  startIcon={<SupportAgentIcon />}
                  onClick={onFillRental}
                  disabled={isAnyLoading} 
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  応援スタッフで埋める (ロジック)
                </Button>
              </Stack>
            </Box>

            <Divider />

            {/* グループ2: 調整・分析 (変更なし) */}
            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 'bold' }}>
                [調整・分析]
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button 
                  variant="outlined" 
                  color="warning"
                  startIcon={<BalanceIcon />}
                  onClick={onForceAdjustHolidays}
                  disabled={isAnyLoading} 
                  fullWidth
                >
                  公休数強制補正 (ロジック)
                </Button>
                <Button 
                  variant="outlined" 
                  color="secondary"
                  startIcon={isAnalysisLoading ? <CircularProgress size={20} color="inherit" /> : <FindInPageIcon />}
                  onClick={() => onExecuteAnalysis()} 
                  disabled={isAnyLoading} 
                  fullWidth
                >
                  {isAnalysisLoading ? '分析中...' : 'AI現況分析'}
                </Button>
              </Stack>
            </Box>

            <Divider />

            {/* グループ3: カスタム指示 */}
            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 'bold' }}>
                [カスタム指示]
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="例: Aさんの夜勤を減らして..."
                  value={instruction}
                  onChange={(e) => onInstructionChange(e.target.value)}
                  disabled={isAnyLoading}
                />
                <Button 
                  variant="contained" 
                  color="info"
                  // ★★★ 修正: 内部の handleExecute を呼ぶ (これが onExecuteCustom を呼ぶ) ★★★
                  onClick={() => handleExecute()} 
                  disabled={isAnyLoading} 
                  sx={{ minWidth: '120px' }}
                >
                  AI調整
                </Button>
              </Stack>
            </Box>

          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}