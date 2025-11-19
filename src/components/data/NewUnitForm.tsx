import React, { useState } from 'react';
import {
  Paper, TextField, Button,
  Box
} from '@mui/material';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { addNewUnit } from '../../store/unitSlice';
import { getDefaultDemand } from '../../db/dexie';

export default function NewUnitForm() {
  const dispatch: AppDispatch = useDispatch();
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // 新規作成時はデフォルトのデマンド(全て0)で作成
    dispatch(addNewUnit({
      name: name.trim(),
      demand: getDefaultDemand()
    }));
    setName('');
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ p: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
      <TextField
        label="新規ユニット名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        size="small"
        sx={{ width: 300 }}
        placeholder="例: 部屋A, 部屋B"
      />
      <Button type="submit" variant="contained">ユニットを追加</Button>
    </Box>
  );
};