import { useState } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, 
  CircularProgress, Alert, AlertTitle,
  Collapse,
  IconButton,
  Stack,
  Divider
} from '@mui/material';

// ★★★ 修正: エラーの出るアイコンを代替アイコンに変更 ★★★
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; // KeyboardArrowDown の代替
import ExpandLessIcon from '@mui/icons-material/ExpandLess'; // KeyboardArrowUp の代替

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FindInPageIcon from '@mui/icons-material/FindInPage'; 
import CloseIcon from '@mui/icons-material/Close';
import SupportAgentIcon from '@mui/icons-material/SupportAgent'; 
import BalanceIcon from '@mui/icons-material/Balance';

interface AiSupportPaneProps {
  instruction: string;
  onInstructionChange: (value: string) => void;
  isLoading: boolean; // ★ 草案作成(adjustment) / パッチ(patch) がローディング中か
  error: string | null;
  onClearError: () => void;
  
  onExecuteDefault: () => void; 
  onExecuteCustom: () => void;  
  
  isAnalysisLoading: boolean; // ★ 分析(analysis) がローディング中か
  analysisResult: string | null;
  analysisError: string | null;
  onClearAnalysis: () => void;
  onExecuteAnalysis: () => void;

  onFillRental: () => void;
  onForceAdjustHolidays: () => void;
  
  // ★★★ 修正: 全体を無効化するためのフラグを追加 ★★★
  isOverallDisabled: boolean; 
}

export default function AiSupportPane({
  instruction, onInstructionChange, isLoading, error, onClearError,
  onExecuteDefault, 
  onExecuteCustom,  
  isAnalysisLoading, analysisResult, analysisError, onClearAnalysis, onExecuteAnalysis,
  onFillRental, onForceAdjustHolidays,
  isOverallDisabled // ★★★ 修正: prop を受け取る ★★★
}: AiSupportPaneProps) {

  const [isAiSupportOpen, setIsAiSupportOpen] = useState(true);

  const handleExecute = () => {
    onExecuteCustom(); 
  };
  
  // ★★★ 修正: isAiLoading は「AI作業中」のみを監視する (アウトライン表示用) ★★★
  const isAiLoading = isLoading || isAnalysisLoading;
  
  const displayResult = analysisResult;

  return (
    <Paper 
      // ★★★ 修正: variant="outlined" とボーダー関連を削除 ★★★
      // variant="outlined" 
      elevation={2} // ★ 他のPaperと合わせる (ShiftCalendarPageのPaperはデフォルトelevation=1)
      sx={{ 
        width: '100%', 
        flexShrink: 0, 
        // borderColor: isAiLoading ? 'primary.main' : 'divider', // 削除
        // borderWidth: isAiLoading ? 2 : 1, // 削除
        
        // ★★★ 修正: レイアウトシフトしない outline を使用 ★★★
        outline: isAiLoading ? '2px solid #1976d2' : 'none', // primary.main の色
        outlineOffset: '-2px', // 内側に表示
        
        overflow: 'hidden' 
      }}
    >
      <Box 
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', p: 2 }}
        onClick={() => setIsAiSupportOpen(!isAiSupportOpen)}
      >
        <Typography variant="h6">AIサポート & 自動調整</Typography>
        <IconButton size="small">
          {/* ★★★ 修正: 代替アイコンを使用 ★★★ */}
          {isAiSupportOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
                  // ★★★ 修正: isLoading は草案作成中フラグ ★★★
                  startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
                  onClick={onExecuteDefault} 
                  // ★★★ 修正: isOverallDisabled を使用 ★★★
                  disabled={isOverallDisabled} 
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  {/* ★★★ 修正: isLoading は草案作成中フラグ ★★★ */}
                  {isLoading ? '作成中...' : 'AIで草案を作成'}
                </Button>
                <Button 
                  variant="contained" 
                  color="success"
                  startIcon={<SupportAgentIcon />}
                  onClick={onFillRental}
                  // ★★★ 修正: isOverallDisabled を使用 ★★★
                  disabled={isOverallDisabled} 
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
                  // ★★★ 修正: isOverallDisabled を使用 ★★★
                  disabled={isOverallDisabled} 
                  fullWidth
                >
                  公休数強制補正
                </Button>
                <Button 
                  variant="outlined" 
                  color="secondary"
                  // ★★★ 修正: isAnalysisLoading は分析中フラグ ★★★
                  startIcon={isAnalysisLoading ? <CircularProgress size={20} color="inherit" /> : <FindInPageIcon />}
                  onClick={() => onExecuteAnalysis()} 
                  // ★★★ 修正: isOverallDisabled を使用 ★★★
                  disabled={isOverallDisabled} 
                  fullWidth
                >
                  {/* ★★★ 修正: isAnalysisLoading は分析中フラグ ★★★ */}
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
                  // ★★★ 修正: isOverallDisabled を使用 ★★★
                  disabled={isOverallDisabled}
                />
                <Button 
                  variant="contained" 
                  color="info"
                  // ★★★ 修正: 内部の handleExecute を呼ぶ (これが onExecuteCustom を呼ぶ) ★★★
                  onClick={() => handleExecute()} 
                  // ★★★ 修正: isOverallDisabled を使用 ★★★
                  disabled={isOverallDisabled} 
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