import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Button, Divider, Select, MenuItem, InputLabel, FormControl, Alert } from '@mui/material';
import { GeminiApiClient } from '../api/geminiApiClient';

function SettingsPage() {
  // APIキーのStateは削除
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(false);

  // 初期化：モデルリストの取得と保存済み設定の読み込み
  useEffect(() => {
    const initSettings = async () => {
      setLoading(true);
      try {
        // APIキー不要でモデルリストを取得
        const availableModels = await GeminiApiClient.listAvailableModels();
        setModels(availableModels);

        // 保存されたモデルがあれば復元、なければデフォルト
        const savedModel = localStorage.getItem('geminiModelId');
        if (savedModel && availableModels.some(m => m.name === savedModel)) {
          setSelectedModel(savedModel);
        } else {
          // デフォルトを gemini-1.5-flash に設定
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
    // モデルIDだけ保存すればOK（APIキーは保存しない）
    localStorage.setItem('geminiModelId', selectedModel);
    alert('設定を保存しました。');
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          ユーザー設定
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Box sx={{ my: 3 }}>
          <Typography variant="h6" gutterBottom>AIモデル設定</Typography>
          
          <Alert severity="info" sx={{ mb: 3 }}>
            現在は Firebase Vertex AI を使用しているため、APIキーの設定は不要です。
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

        <Box sx={{ mt: 4, textAlign: 'right' }}>
          <Button variant="contained" color="primary" onClick={handleSaveSettings}>
            設定を保存
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default SettingsPage;