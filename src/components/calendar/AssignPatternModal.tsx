import { useState, useEffect, useMemo } from 'react';
import { 
  Box, Paper, Typography, Button, 
  CircularProgress, Alert, List, ListItemText, Avatar, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, ListItemButton,
  // ★ Divider を削除
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment, IUnit } from '../../db/dexie'; 
import { db } from '../../db/dexie';
import { setAssignments, clearAdvice, fetchAssignmentAdvice } from '../../store/assignmentSlice'; 

// (ShiftCalendarPage.tsx から手動アサインモーダルのコードを移動)

interface AssignPatternModalProps {
  // ★ v5.9 モーダルに必要な props を定義
  target: { date: string; staff: IStaff; } | null; // (editingTarget)
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[];
  burdenData: any[]; // (staffBurdenData.values() の配列)
  onClose: () => void;
}

// export default を追加
export default function AssignPatternModal({ 
  target, allStaff, allPatterns, allUnits, allAssignments, burdenData, onClose 
}: AssignPatternModalProps) {
  
  const dispatch: AppDispatch = useDispatch(); 
  
  // ★ v5.9 AI助言の state はこのコンポーネントが直接ストアから取得
  const { adviceLoading, adviceError, adviceResult } = useSelector((state: RootState) => state.assignment);
  
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);

  // ★ v5.9 patternMap をこのコンポーネント内で計算
  const patternMap = useMemo(() => new Map(allPatterns.map((p: IShiftPattern) => [p.patternId, p])), [allPatterns]);

  // ★ v5.9 モーダルが開く/対象が変わるたびに state をリセット
  useEffect(() => {
    if (target) {
      // ★★★ タイポ修正: target.staff.Id -> target.staff.staffId ★★★
      const existing = allAssignments.find(a => a.date === target.date && a.staffId === target.staff.staffId);
      setSelectedPatternId(existing?.patternId || null);
      dispatch(clearAdvice());
    }
  }, [target, allAssignments, dispatch]);


  // ★ v5.9 担当者決定ロジック (ShiftCalendarPageから移動)
  // ★ v5.9 修正: locked: true を追加
  const handleAssignPattern = async () => {
    if (!target) return;
    const { date, staff } = target;
    try {
      const existing = await db.assignments
        .where('[date+staffId]')
        .equals([date, staff.staffId])
        .toArray();
      if (existing.length > 0) {
        await db.assignments.bulkDelete(existing.map(a => a.id!));
      }
      if (selectedPatternId) {
        const pattern = patternMap.get(selectedPatternId);
        if (pattern) {
          const newAssignment: Omit<IAssignment, 'id'> = {
            date: date,
            staffId: staff.staffId,
            patternId: selectedPatternId,
            unitId: (pattern.workType === 'Work') ? staff.unitId : null,
            locked: true // ★★★ 手動アサインはロックする ★★★
          };
          await db.assignments.add(newAssignment);
        }
      }
      const allAssignments = await db.assignments.toArray();
      dispatch(setAssignments(allAssignments)); // ★ ストアを更新
    } catch (e) {
      console.error("アサインの更新に失敗:", e);
    }
    onClose(); // ★ 親コンポーネントにクローズを通知
  };

  // ★ v5.9 AI助言ボタンのハンドラ (ShiftCalendarPageから移動)
  const handleFetchAdvice = () => {
    if (!target) return;
    dispatch(fetchAssignmentAdvice({
      targetDate: target.date,
      targetStaff: target.staff,
      allStaff: allStaff,
      allPatterns: allPatterns,
      allUnits: allUnits, 
      burdenData: burdenData,
      allAssignments: allAssignments,
    }));
  };

  // ★★★ v5.100 修正: リストを2つに分離 ★★★

  // ★ リスト1: 「公休」「有給」のみのリスト
  const holidayLeavePatterns = useMemo(() => {
    return allPatterns
      .filter(p => p.workType === 'StatutoryHoliday' || p.workType === 'PaidLeave')
      .sort((a, b) => a.workType.localeCompare(b.workType)); // 公休を先に
  }, [allPatterns]);

  // ★ リスト2: 「勤務可能パターン」 + 「会議」「その他」のリスト
  const availableWorkAndOtherPatterns = useMemo(() => {
    if (!target?.staff) return [];

    const staffSpecificPatternIds = target.staff.availablePatternIds || [];
    // ★ 会議(Meeting)とその他(Other)のみを抽出
    const otherPatternIds = allPatterns
      .filter(p => p.workType === 'Meeting' || p.workType === 'Other') 
      .map(p => p.patternId);
      
    // ★ 勤務可能パターン + 会議/その他 を結合
    const combinedIds = [...new Set([...staffSpecificPatternIds, ...otherPatternIds])];

    return combinedIds
      .map(pid => patternMap.get(pid))
      .filter((p): p is IShiftPattern => !!p) 
      .sort((a, b) => { 
        // (勤務を一番上、会議/その他をその下)
        if (a.workType === 'Work' && b.workType !== 'Work') return -1;
        if (a.workType !== 'Work' && b.workType === 'Work') return 1;
        return a.patternId.localeCompare(b.patternId);
      });
      
  }, [target?.staff, allPatterns, patternMap]);
  // ★★★ v5.100 修正ここまで ★★★


  return (
    <Dialog open={!!target} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        手動アサイン ({target?.staff.name} / {target?.date})
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2 }}>
        
        {/* 左側: パターン選択リスト */}
        <Box sx={{ flex: 1, maxHeight: 500, overflowY: 'auto' }}>
          
          {/* ★★★ リスト1: 休み・解除 ★★★ */}
          <Typography variant="caption">1. 休み・解除</Typography>
          <List dense component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <ListItemButton onClick={() => setSelectedPatternId(null)} selected={selectedPatternId === null}>
              <Avatar sx={{ width: 32, height: 32, mr: 2, fontSize: '0.8rem', bgcolor: 'grey.300', color: 'text.primary' }}>?</Avatar>
              <ListItemText primary="--- アサインなし ---" />
            </ListItemButton>
            
            {holidayLeavePatterns.map(pattern => (
              <ListItemButton 
                key={pattern.patternId}
                onClick={() => setSelectedPatternId(pattern.patternId)} 
                selected={selectedPatternId === pattern.patternId}
              >
                <Avatar sx={{ width: 32, height: 32, mr: 2, fontSize: '0.8rem', bgcolor: 'error.light', color: 'common.white' }}>
                  {pattern.mainCategory.charAt(0)}
                </Avatar>
                <ListItemText 
                  primary={pattern.name} 
                  secondary={pattern.patternId}
                />
              </ListItemButton>
            ))}
          </List>

          {/* ★★★ リスト2: 勤務・その他 ★★★ */}
          <Typography variant="caption">2. 勤務・その他</Typography>
          <List dense component={Paper} variant="outlined" sx={{maxHeight: 300, overflow: 'auto'}}>
            {/* (※スタッフの「勤務可能パターン」 + 「会議/その他」を表示) */}
            {availableWorkAndOtherPatterns.map(pattern => (
              <ListItemButton 
                key={pattern.patternId}
                onClick={() => setSelectedPatternId(pattern.patternId)} 
                selected={selectedPatternId === pattern.patternId}
              >
                <Avatar sx={{ 
                  width: 32, height: 32, mr: 2, fontSize: '0.8rem', 
                  bgcolor: pattern.workType === 'Work' ? 'primary.light' : 'warning.light',
                  color: 'common.white'
                }}>
                  {pattern.mainCategory.charAt(0)}
                </Avatar>
                <ListItemText 
                  primary={pattern.name} 
                  secondary={pattern.patternId}
                />
                <Chip 
                  label={pattern.workType} 
                  size="small" 
                  color={pattern.workType !== 'Work' ? 'secondary' : 'default'}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* 右側: AI助言エリア */}
        <Box sx={{ flex: 1, borderLeft: '1px solid', borderColor: 'divider', pl: 2 }}>
          <Typography variant="h6" gutterBottom>AI助言</Typography>
          <Button 
            variant="outlined" 
            onClick={handleFetchAdvice} 
            disabled={adviceLoading}
            startIcon={adviceLoading ? <CircularProgress size={16} /> : null}
          >
            {adviceLoading ? '分析中...' : '最適な候補を分析'}
          </Button>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1, minHeight: 150, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
            {adviceError && <Alert severity="error">{adviceError}</Alert>}
            {adviceResult ? (
              <Typography variant="body2">{adviceResult}</Typography>
            ) : (
              !adviceLoading && <Typography variant="body2" color="text.secondary">ボタンを押して助言を求めてください。</Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button 
          onClick={handleAssignPattern} 
          variant="contained"
        >
          決定
        </Button>
      </DialogActions>
    </Dialog>
  );
}