import React, { useState, useEffect } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, IconButton,
  Alert,
  Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { IUnit } from '../../db/dexie';
import { getDefaultDemand } from '../../db/dexie';

interface EditUnitModalProps {
  unit: IUnit | null;
  onClose: () => void;
  onSave: (updatedUnit: IUnit) => void;
}

type DemandBlock = { id: number; start: string; end: string; req: number; };

export default function EditUnitModal({ unit, onClose, onSave }: EditUnitModalProps) {
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<DemandBlock[]>([]);

  const demandToBlocks = (demand: number[]): DemandBlock[] => {
    if (!demand || demand.length !== 24) return [];
    const newBlocks: DemandBlock[] = [];
    let startHour = 0;
    let currentReq = demand[0];
    for (let hour = 1; hour < 24; hour++) {
      if (demand[hour] !== currentReq) {
        newBlocks.push({
          id: startHour,
          start: `${startHour.toString().padStart(2, '0')}:00`,
          end: `${hour.toString().padStart(2, '0')}:00`,
          req: currentReq
        });
        startHour = hour;
        currentReq = demand[hour];
      }
    }
    newBlocks.push({
      id: startHour,
      start: `${startHour.toString().padStart(2, '0')}:00`,
      end: '00:00', 
      req: currentReq
    });
    
    if (newBlocks.length === 1 && newBlocks[0].start === '00:00' && newBlocks[0].end === '00:00' && newBlocks[0].req === 0) {
      return [];
    }
    return newBlocks;
  };

  const blocksToDemand = (blocks: DemandBlock[]): number[] => {
    const newDemand = getDefaultDemand();
    for (const block of blocks) {
      const startHour = parseInt(block.start.split(':')[0]);
      const endHour = parseInt(block.end.split(':')[0]);
      
      if (startHour < endHour) {
        for (let h = startHour; h < endHour; h++) {
          newDemand[h] = block.req;
        }
      } else if (endHour === 0 && startHour < 24) {
        for (let h = startHour; h < 24; h++) {
          newDemand[h] = block.req;
        }
      }
    }
    return newDemand;
  };

  useEffect(() => { 
    if (unit) {
      setName(unit.name);
      setBlocks(demandToBlocks(unit.demand));
    }
  }, [unit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unit) return;
    const newDemand = blocksToDemand(blocks);
    onSave({ ...unit, name: name.trim(), demand: newDemand });
  };

  const handleBlockChange = (id: number, field: keyof DemandBlock, value: any) => {
    setBlocks(currentBlocks => 
      currentBlocks.map(b => 
        b.id === id ? { ...b, [field]: value } : b
      )
    );
  };
  const handleAddBlock = () => {
    let newStart = '00:00';
    if (blocks.length > 0) {
      const lastBlockEnd = blocks[blocks.length - 1].end;
      if (lastBlockEnd === '00:00') {
        alert("既に24時(00:00)に達するブロックが設定されています。\n既存のブロックを変更するか、最後のブロックを削除してから追加してください。");
        return;
      }
      newStart = lastBlockEnd; 
    }
    setBlocks([...blocks, {
      id: Date.now(),
      start: newStart,
      end: '00:00', 
      req: 0
    }]);
  };
  const handleDeleteBlock = (id: number) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  return (
    <Dialog open={!!unit} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>ユニットの編集: {unit?.name}</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="ユニット名" value={name} onChange={(e) => setName(e.target.value)} required size="small" fullWidth sx={{mt: 1}} />
          
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>24時間デマンド (「X時からY時がN人」)</Typography>
          <Alert severity="info">
            「終了」時刻は、その時間の直前までを意味します（例：07:00〜16:00 は 7:00〜15:59 まで）。
            「00:00」は24:00（営業終了）を意味します。
            日付またぎ（例: 16:00〜07:00）は、「16:00〜00:00」と「00:00〜07:00」の2つのブロックに分けて入力してください。
          </Alert>
          
          {blocks.map((block) => (
            <Paper key={block.id} sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'center' }} variant="outlined">
              <TextField 
                label="開始 (HH:MM)" 
                value={block.start}
                onChange={(e) => handleBlockChange(block.id, 'start', e.target.value)}
                size="small" sx={{width: 120}}
              />
              <TextField 
                label="終了 (HH:MM)" 
                value={block.end}
                onChange={(e) => handleBlockChange(block.id, 'end', e.target.value)}
                size="small" sx={{width: 120}}
              />
              <TextField 
                label="必要人数/ユニット" 
                value={block.req}
                onChange={(e) => handleBlockChange(block.id, 'req', Number(e.target.value))}
                size="small" type="number" inputProps={{ step: 0.5 }} sx={{width: 150}}
              />
              <IconButton onClick={() => handleDeleteBlock(block.id)} color="error" sx={{ml: 'auto'}}>
                <DeleteIcon />
              </IconButton>
            </Paper>
          ))}
          <Button onClick={handleAddBlock} startIcon={<AddIcon />}>時間ブロックを追加</Button>
          
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        {/* ★ 修正: 保存 -> 変更を確定 */}
        <Button onClick={handleSubmit} variant="contained" disableElevation>変更を確定</Button>
      </DialogActions>
    </Dialog>
  );
};