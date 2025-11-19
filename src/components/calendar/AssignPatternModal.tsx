import { useState, useEffect, useMemo } from 'react';
import { 
  Box, Paper, Typography, Button, 
  CircularProgress, Alert, List, ListItemText, Avatar, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, ListItemButton,
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { IStaff, IShiftPattern, IAssignment, IUnit } from '../../db/dexie'; 
import { db } from '../../db/dexie';
import { setAssignments, clearAdvice, fetchAssignmentAdvice } from '../../store/assignmentSlice'; 

// Helper: 時間文字列 "HH:MM" を分単位の数値に変換
const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Helper: 契約時間帯のチェック
const isWithinContract = (staff: IStaff, start: string, end: string): boolean => {
  if (staff.employmentType !== 'PartTime') return true;
  
  // 未設定または空の場合はデフォルト(8:00-20:00)とみなす
  const ranges = (staff.workableTimeRanges && staff.workableTimeRanges.length > 0) 
    ? staff.workableTimeRanges 
    : [{ start: '08:00', end: '20:00' }];

  const sMin = timeToMin(start);
  const eMin = timeToMin(end);

  // いずれかのレンジに完全に含まれていればOK
  return ranges.some(range => {
    const rStart = timeToMin(range.start);
    const rEnd = timeToMin(range.end);
    return sMin >= rStart && eMin <= rEnd;
  });
};

interface AssignPatternModalProps {
  target: { date: string; staff: IStaff; } | null; 
  allStaff: IStaff[];
  allPatterns: IShiftPattern[];
  allUnits: IUnit[];
  allAssignments: IAssignment[];
  burdenData: any[]; 
  onClose: () => void;
}

export default function AssignPatternModal({ 
  target, allStaff, allPatterns, allUnits, allAssignments, burdenData, onClose 
}: AssignPatternModalProps) {
  
  const dispatch: AppDispatch = useDispatch(); 
  
  const { adviceLoading, adviceError, adviceResult } = useSelector((state: RootState) => state.assignment.present);
  
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);

  const patternMap = useMemo(() => new Map(allPatterns.map((p: IShiftPattern) => [p.patternId, p])), [allPatterns]);

  useEffect(() => {
    if (target) {
      const existing = allAssignments.find(a => a.date === target.date && a.staffId === target.staff.staffId);
      setSelectedPatternId(existing?.patternId || null);
      dispatch(clearAdvice());
    }
  }, [target, allAssignments, dispatch]);


  // 担当者決定ロジック
  const handleAssignPattern = async () => {
    if (!target) return;
    const { date, staff } = target;

    // ★★★ バリデーション: 契約時間帯チェック ★★★
    if (selectedPatternId) {
      const pattern = patternMap.get(selectedPatternId);
      if (pattern && pattern.workType === 'Work') {
        // Flexの場合はデフォルト枠(startTime/endTime)でチェック
        // (※Flexの場合、実際はドラッグで縮めれば入るかもしれないが、アサイン時点では枠でチェックして警告する)
        if (!isWithinContract(staff, pattern.startTime, pattern.endTime)) {
          const ranges = staff.workableTimeRanges?.map(r => `${r.start}-${r.end}`).join(', ') || "08:00-20:00";
          if (!window.confirm(`警告: ${staff.name} さんの契約時間帯(${ranges})外の可能性があります。\n(${pattern.name}: ${pattern.startTime}-${pattern.endTime})\n\nそれでも割り当てますか？`)) {
            return; // キャンセル
          }
        }
      }
    }

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
            locked: true, // 手動アサインはロックする
            // ★ Flexならデフォルト時間を入れておく (v7)
            overrideStartTime: pattern.isFlex ? pattern.startTime : undefined,
            overrideEndTime: pattern.isFlex ? pattern.endTime : undefined
          };
          await db.assignments.add(newAssignment);
        }
      }
      const allAssignments = await db.assignments.toArray();
      dispatch(setAssignments(allAssignments)); // ストアを更新
    } catch (e) {
      console.error("アサインの更新に失敗:", e);
    }
    onClose(); // 親コンポーネントにクローズを通知
  };

  // AI助言ボタンのハンドラ
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

  // リスト1: 「公休」「有給」のみのリスト
  const holidayLeavePatterns = useMemo(() => {
    return allPatterns
      .filter(p => p.workType === 'StatutoryHoliday' || p.workType === 'PaidLeave')
      .sort((a, b) => a.workType.localeCompare(b.workType)); // 公休を先に
  }, [allPatterns]);

  // リスト2: 「勤務可能パターン」 + 「会議」「その他」のリスト
  const availableWorkAndOtherPatterns = useMemo(() => {
    if (!target?.staff) return [];

    const staffSpecificPatternIds = target.staff.availablePatternIds || [];
    const otherPatternIds = allPatterns
      .filter(p => p.workType === 'Meeting' || p.workType === 'Other') 
      .map(p => p.patternId);
      
    const combinedIds = [...new Set([...staffSpecificPatternIds, ...otherPatternIds])];

    return combinedIds
      .map(pid => patternMap.get(pid))
      .filter((p): p is IShiftPattern => !!p) 
      .sort((a, b) => { 
        if (a.workType === 'Work' && b.workType !== 'Work') return -1;
        if (a.workType !== 'Work' && b.workType === 'Work') return 1;
        return a.patternId.localeCompare(b.patternId);
      });
      
  }, [target?.staff, allPatterns, patternMap]);


  return (
    <Dialog open={!!target} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        手動アサイン ({target?.staff.name} / {target?.date})
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2 }}>
        
        {/* 左側: パターン選択リスト */}
        <Box sx={{ flex: 1, maxHeight: 500, overflowY: 'auto' }}>
          
          {/* リスト1: 休み・解除 */}
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

          {/* リスト2: 勤務・その他 */}
          <Typography variant="caption">2. 勤務・その他</Typography>
          <List dense component={Paper} variant="outlined" sx={{maxHeight: 300, overflow: 'auto'}}>
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