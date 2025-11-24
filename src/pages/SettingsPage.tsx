import { useState, useEffect } from 'react';
import { 
  Box, Paper, Typography, Button, Divider, Select, MenuItem, InputLabel, FormControl, Alert, 
  Switch, FormControlLabel, Fade, Chip, Stack
} from '@mui/material';
import { GeminiApiClient } from '../api/geminiApiClient';
import BugReportIcon from '@mui/icons-material/BugReport';

function SettingsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(false);

  // --- ★ バックドア用 State ---
  const [versionClickCount, setVersionClickCount] = useState(0);
  const [isDevMode, setIsDevMode] = useState(() => localStorage.getItem('isDevMode') === 'true');
  const [noApiMode, setNoApiMode] = useState(() => localStorage.getItem('noApiMode') === 'true');

  useEffect(() => {
    const initSettings = async () => {
      setLoading(true);
      try {
        const availableModels = await GeminiApiClient.listAvailableModels();
        setModels(availableModels);
        const savedModel = localStorage.getItem('geminiModelId');
        if (savedModel && availableModels.some(m => m.name === savedModel)) {
          setSelectedModel(savedModel);
        } else {
          setSelectedModel('gemini-1.5-flash');
        }
      } catch (error) {
        console.error('設定の読み込みに失敗:', error);
      } finally {
        setLoading(false);
      }
    };
    initSettings();
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('geminiModelId', selectedModel);
    // バックドア設定も保存
    localStorage.setItem('isDevMode', String(isDevMode));
    localStorage.setItem('noApiMode', String(noApiMode));
    alert('設定を保存しました。');
  };

  // ★ バージョン連打ハンドラ
  const handleVersionClick = () => {
    if (isDevMode) return; // 既に解放済みなら何もしない
    
    const newCount = versionClickCount + 1;
    setVersionClickCount(newCount);
    
    if (newCount >= 10) {
      setIsDevMode(true);
      localStorage.setItem('isDevMode', 'true');
      alert("開発者モードが有効になりました。\n(You are now a Developer!)");
    }
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3, height: '100%', overflowY: 'auto' }}>
      <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          ユーザー設定
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Box sx={{ my: 3 }}>
          <Typography variant="h6" gutterBottom>AIモデル設定</Typography>
          
          <Alert severity="info" sx={{ mb: 3 }}>
            現在は Firebase Vertex AI を使用しています。
          </Alert>

          <FormControl fullWidth disabled={loading}>
            <InputLabel id="model-select-label">使用するAIモデル</InputLabel>
            <Select
              labelId="model-select-label"
              value={selectedModel}
              label="使用するAIモデル"
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((model: any) => (
                <MenuItem key={model.name} value={model.name}>
                  {model.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* ★ 開発者モード（バックドア）エリア */}
        {isDevMode && (
          <Fade in={isDevMode}>
            <Box sx={{ mt: 4, p: 2, border: '1px dashed #ff9800', borderRadius: 2, bgcolor: '#fff3e0' }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <BugReportIcon color="warning" />
                <Typography variant="subtitle1" fontWeight="bold" color="warning.dark">
                  Developer Options (Debug Mode)
                </Typography>
              </Stack>
              <Typography variant="caption" display="block" mb={2}>
                ※これらは開発・デバッグ用の機能です。通常利用ではOFFにしてください。
              </Typography>
              
              <FormControlLabel
                control={
                  <Switch 
                    checked={noApiMode} 
                    onChange={(e) => setNoApiMode(e.target.checked)} 
                    color="warning"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight="bold">APIなしモード (Manual Prompt Injection)</Typography>
                    <Typography variant="caption" color="textSecondary">
                      APIを呼び出さず、プロンプトをクリップボードにコピーします。<br/>
                      手動でWeb版Gemini等に入力し、結果のJSONを貼り付けることで動作確認が可能です。
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </Fade>
        )}

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* ★ バージョン情報 (トリガー) */}
          <Box 
            onClick={handleVersionClick}
            sx={{ 
              userSelect: 'none', 
              cursor: 'default', 
              opacity: 0.5,
              '&:active': { transform: 'scale(0.98)' } 
            }}
          >
            <Typography variant="caption" display="block">
              wowfit v1.0.0
            </Typography>
            <Typography variant="caption" color="textSecondary">
              © 2025 Kisaragi System
            </Typography>
          </Box>

          <Button variant="contained" color="primary" onClick={handleSaveSettings}>
            設定を保存
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default SettingsPage;