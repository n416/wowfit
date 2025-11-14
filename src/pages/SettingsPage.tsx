import { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, Button, TextField, Divider, Select, MenuItem, InputLabel, CircularProgress, FormControl } from '@mui/material';
import { GeminiApiClient } from '../api/geminiApiClient';

function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<any[]>([]); // 型定義
  const [selectedModel, setSelectedModel] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  const handleTestAndLoadModels = useCallback(async (key: string) => {
    if (!key) return []; 
    setIsTesting(true);
    setTestSuccess(null);
    setModels([]);
    try {
      const availableModels = await GeminiApiClient.listAvailableModels(key);
      const supportedModels = availableModels.filter((m: any) =>
        m.supportedGenerationMethods.includes('generateContent') &&
        m.name.includes('pro') && 
        !m.name.includes('vision') 
      );
      setModels(supportedModels);
      setTestSuccess(true);
      return supportedModels;
    } catch (error: any) {
      console.error('API connection test failed:', error);
      setTestSuccess(false);
      alert(`APIキーの検証に失敗しました: ${error.message}`);
      return [];
    } finally {
      setIsTesting(false);
    }
  }, []); 

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedApiKey = localStorage.getItem('geminiApiKey') || '';
        const savedModel = localStorage.getItem('geminiModelId') || '';
        setApiKey(savedApiKey);

        if (savedApiKey) {
          const supportedModels = await handleTestAndLoadModels(savedApiKey);
          
          const modelExists = supportedModels.some((m: any) => m.name === savedModel);
          
          if (modelExists) {
            setSelectedModel(savedModel);
          } else {
            setSelectedModel('');
          }
        }
      // ★★★ ここが修正点です ★★★
      } catch (error: any) { 
        console.error("localStorageからの設定読み込みに失敗しました:", error);
      }
    };
    
    loadSettings();
  }, [handleTestAndLoadModels]); 

  const handleSaveSettings = () => {
    localStorage.setItem('geminiApiKey', apiKey);
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
          <Typography variant="h6" gutterBottom>API連携</Typography>
          <TextField label="Gemini API Key" variant="outlined" fullWidth value={apiKey} onChange={(e) => setApiKey(e.target.value)} sx={{ mb: 1 }} type="password" placeholder="お使いのAPIキーを入力してください" />
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Button variant="outlined" onClick={() => handleTestAndLoadModels(apiKey)} disabled={isTesting}>
              {isTesting ? <CircularProgress size={24} /> : '接続テスト & モデル読込'}
            </Button>
            {testSuccess === true && <Typography color="green">✅ 接続成功</Typography>}
            {testSuccess === false && <Typography color="error">❌ 接続失敗</Typography>}
          </Box>

          <FormControl fullWidth>
            <InputLabel id="model-select-label">使用するAIモデル</InputLabel>
            <Select
              labelId="model-select-label"
              value={selectedModel}
              label="使用するAIモデル"
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((model: any) => (
                <MenuItem key={model.name} value={model.name}>
                  {model.displayName} ({model.name.replace('models/', '')})
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