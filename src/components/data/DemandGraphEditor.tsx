import React, { useState, useRef, useEffect } from 'react'; // useEffectを追加(念のため)
import {
  Box, Paper, Typography, Button, ButtonGroup,
  IconButton, Tooltip, Divider, Stack
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface DemandGraphEditorProps {
  initialDemand: number[];
  onChange: (newDemand: number[]) => void;
}

const MAX_HISTORY = 50;
// ★ 定数定義: グラフの高さとラベル確保領域
const GRAPH_HEIGHT_PX = 150;
const LABEL_AREA_PX = 24; // ラベル表示に必要な高さ(px)

export const DemandGraphEditor: React.FC<DemandGraphEditorProps> = ({ initialDemand, onChange }) => {
  const [demand, setDemand] = useState<number[]>([...initialDemand]);

  const [history, setHistory] = useState<number[][]>([[...initialDemand]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number, end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const [presetBase, setPresetBase] = useState(0);
  const baseValues = { A: 0.5, B: 1.0, C: 2.0 };

  // --- History Logic ---
  const pushHistory = (newDemand: number[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newDemand);
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setDemand(newDemand);
    onChange(newDemand);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const prevDemand = history[newIndex];
      setDemand([...prevDemand]);
      onChange(prevDemand);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextDemand = history[newIndex];
      setDemand([...nextDemand]);
      onChange(nextDemand);
    }
  };

  // --- Action Logic ---
  const applyDelta = (delta: number) => {
    if (!selection) return;
    const nextDemand = [...demand];
    for (let i = selection.start; i <= selection.end; i++) {
      nextDemand[i] = Math.max(0, nextDemand[i] + delta);
    }
    pushHistory(nextDemand);
  };

  const applySet = (value: number) => {
    if (!selection) return;
    const nextDemand = [...demand];
    for (let i = selection.start; i <= selection.end; i++) {
      nextDemand[i] = Math.max(0, value);
    }
    pushHistory(nextDemand);
  };

  const shiftPresets = (direction: number) => {
    setPresetBase(prev => {
      const next = prev + direction;
      return next < 0 ? 0 : next;
    });
  };

  const getPresetValue = (key: 'A' | 'B' | 'C') => baseValues[key] + presetBase;

  // --- Mouse Interaction ---
  const getHourFromX = (x: number, rect: DOMRect) => {
    const widthPerSlot = rect.width / 24;
    const hour = Math.floor((x - rect.left) / widthPerSlot);
    return Math.max(0, Math.min(23, hour));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hour = getHourFromX(e.clientX, rect);
    setIsDragging(true);
    dragStartRef.current = hour;
    setSelection({ start: hour, end: hour });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartRef.current === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hour = getHourFromX(e.clientX, rect);
    const start = Math.min(dragStartRef.current, hour);
    const end = Math.max(dragStartRef.current, hour);
    if (!selection || selection.start !== start || selection.end !== end) {
      setSelection({ start, end });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // --- Rendering Calculation (修正箇所) ---
  const dataMax = Math.max(3, ...demand);

  // 論理上のY軸最大値を計算する
  // 「データ最大値(dataMax)」が、「グラフ全体の高さ(GRAPH_HEIGHT_PX)」から「ラベルエリア(LABEL_AREA_PX)」を引いた高さに収まるようにする
  // 式: (dataMax / maxVal) * GRAPH_HEIGHT_PX = GRAPH_HEIGHT_PX - LABEL_AREA_PX
  // 変形: maxVal = dataMax * (GRAPH_HEIGHT_PX / (GRAPH_HEIGHT_PX - LABEL_AREA_PX))
  const maxVal = dataMax * (GRAPH_HEIGHT_PX / (GRAPH_HEIGHT_PX - LABEL_AREA_PX));

  return (
    <Box sx={{ width: '100%', userSelect: 'none' }}>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <ButtonGroup size="small">
          <Tooltip title="元に戻す">
            <span><IconButton onClick={handleUndo} disabled={historyIndex === 0} size="small"><UndoIcon /></IconButton></span>
          </Tooltip>
          <Tooltip title="やり直す">
            <span><IconButton onClick={handleRedo} disabled={historyIndex === history.length - 1} size="small"><RedoIcon /></IconButton></span>
          </Tooltip>
        </ButtonGroup>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: selection ? 'primary.main' : 'text.secondary' }}>
          {selection ? `${selection.start}:00 〜 ${selection.end + 1}:00 を選択中` : 'グラフをドラッグして範囲を選択してください'}
        </Typography>
      </Box>

      {/* Graph Area */}
      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          height: GRAPH_HEIGHT_PX, // ★ 定数を使用
          display: 'flex',
          alignItems: 'flex-end',
          cursor: 'crosshair',
          overflow: 'hidden',
          bgcolor: '#fafafa',
          mb: 1
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid Lines */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', display: 'flex' }}>
          {[...Array(24)].map((_, i) => (
            <Box key={i} sx={{ flex: 1, borderRight: i % 6 === 5 ? '1px solid #ccc' : '1px dashed #eee', position: 'relative' }}>
              {i % 3 === 0 && <Typography variant="caption" sx={{ position: 'absolute', bottom: 2, left: 2, color: '#999', fontSize: '0.65rem' }}>{i}</Typography>}
            </Box>
          ))}
        </Box>

        {/* Bars */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', pointerEvents: 'none' }}>
          {demand.map((val, i) => {
            const isSelected = selection && i >= selection.start && i <= selection.end;
            // 高さ(%)の計算: 逆算した maxVal を分母にするため、必ず安全圏内に収まる
            const heightPercent = (val / maxVal) * 100;

            return (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'flex-end',
                  borderRight: '1px solid rgba(255,255,255,0.5)',
                  position: 'relative',
                  bgcolor: isSelected ? 'rgba(25, 118, 210, 0.1)' : 'transparent'
                }}
              >
                <Box sx={{
                  width: '100%',
                  height: `${heightPercent}%`,
                  bgcolor: isSelected ? 'primary.main' : 'primary.light',
                  opacity: isSelected ? 1 : 0.7,
                  transition: 'height 0.1s',
                  position: 'relative'
                }}>
                  {val > 0 && (
                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        // バーの上端(-18px)に配置しても、計算済みなので見切れない
                        top: -18,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontWeight: 'bold',
                        color: '#333',
                        fontSize: '0.65rem'
                      }}
                    >
                      {val}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Paper>

      {/* Action Panel */}
      <Paper sx={{ p: 1, bgcolor: '#f0f7ff', border: '1px solid #d0e4ff' }} elevation={0}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="center" flexWrap="wrap">

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary">増減</Typography>
            <Button variant="contained" size="small" onClick={() => applyDelta(1.0)} disabled={!selection} sx={{ minWidth: 50, py: 0.5 }}>+1.0</Button>
            <Button variant="contained" size="small" onClick={() => applyDelta(0.5)} disabled={!selection} sx={{ minWidth: 50, py: 0.5 }}>+0.5</Button>
            <Typography variant="caption" color="text.secondary"></Typography>
            <Button variant="outlined" size="small" onClick={() => applyDelta(-0.5)} disabled={!selection} sx={{ minWidth: 50, py: 0.5, bgcolor: 'white' }}>-0.5</Button>
            <Button variant="outlined" size="small" onClick={() => applyDelta(-1.0)} disabled={!selection} sx={{ minWidth: 50, py: 0.5, bgcolor: 'white' }}>-1.0</Button>
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary">代入</Typography>
            <Button variant="outlined" size="small" onClick={() => shiftPresets(-1)} disabled={presetBase <= 0} sx={{ minWidth: 30, px: 0, bgcolor: 'white' }}><ChevronLeftIcon fontSize="small" /></Button>
            <Button variant="outlined" size="small" onClick={() => applySet(getPresetValue('A'))} disabled={!selection} sx={{ minWidth: 50, bgcolor: 'white' }}>{getPresetValue('A')}</Button>
            <Button variant="outlined" size="small" onClick={() => applySet(getPresetValue('B'))} disabled={!selection} sx={{ minWidth: 50, bgcolor: 'white' }}>{getPresetValue('B')}</Button>
            <Button variant="outlined" size="small" onClick={() => applySet(getPresetValue('C'))} disabled={!selection} sx={{ minWidth: 50, bgcolor: 'white' }}>{getPresetValue('C')}</Button>
            <Button variant="outlined" size="small" onClick={() => shiftPresets(1)} sx={{ minWidth: 30, px: 0, bgcolor: 'white' }}><ChevronRightIcon fontSize="small" /></Button>
          </Stack>

          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />

          <Button variant="outlined" color="error" size="small" onClick={() => applySet(0)} disabled={!selection} startIcon={<DeleteIcon />} sx={{ bgcolor: 'white' }}>クリア</Button>
        </Stack>
      </Paper>
    </Box>
  );
};