import React, { useState } from 'react';
import { Paper, TextField, Button } from '@mui/material';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { addNewUnit } from '../../store/unitSlice';
import { getDefaultDemand } from '../../db/dexie'; // ★ 変更: getDefaultDemand を db からインポート

// (DataManagementPage.tsx から NewUnitForm のコードをそのまま移動)
// ★ 変更: getDefaultDemand を引数から削除 (dexie.ts からインポートするため)
export default function NewUnitForm() {
  const dispatch: AppDispatch = useDispatch();
  const [name, setName] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    dispatch(addNewUnit({ name: name.trim(), demand: getDefaultDemand() })); 
    setName('');
  };

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
      <TextField label="ユニット名" value={name} onChange={(e) => setName(e.target.value)} required size="small" />
      <Button type="submit" variant="contained">ユニット追加</Button>
    </Paper>
  );
};