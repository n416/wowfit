// src/components/calendar/WeeklyShareModal.tsx
import React, { useState, useMemo, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, LinearProgress
} from '@mui/material';
import html2canvas from 'html2canvas';
import { IStaff, IAssignment, IShiftPattern } from '../../db/dexie';
// ★ 修正: getFullWeeksForMonth をインポート
import { MonthDay, getFullWeeksForMonth } from '../../utils/dateUtils';

interface WeeklyShareModalProps {
  open: boolean;
  onClose: () => void;
  monthDays: MonthDay[];
  staffList: IStaff[];
  assignments: IAssignment[];
  shiftPatterns: IShiftPattern[];
}

const printStyles: React.CSSProperties = {
  backgroundColor: '#fff',
  padding: '20px',
  width: '1200px', 
  fontFamily: 'sans-serif',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
};

const thStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '8px',
  backgroundColor: '#f0f0f0',
  textAlign: 'center',
  fontWeight: 'bold',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '6px',
  textAlign: 'center',
  height: '40px',
  verticalAlign: 'middle',
};

const cellContentStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
  height: '100%',
};

export default function WeeklyShareModal({
  open, onClose, monthDays, staffList, assignments, shiftPatterns
}: WeeklyShareModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  const patternMap = useMemo(() => new Map(shiftPatterns.map(p => [p.patternId, p])), [shiftPatterns]);
  
  const assignmentsMap = useMemo(() => {
    const map = new Map<string, IAssignment>();
    assignments.forEach(a => {
      map.set(`${a.staffId}_${a.date}`, a);
    });
    return map;
  }, [assignments]);

  // ★ 修正: 単純なスライスではなく、カレンダーロジックで週を生成
  const weeks = useMemo(() => {
    if (monthDays.length === 0) return [];
    
    // monthDays[0] から年と月を取得
    const firstDayParts = monthDays[0].dateStr.split('-').map(Number);
    const year = firstDayParts[0];
    const month = firstDayParts[1];

    return getFullWeeksForMonth(year, month);
  }, [monthDays]);

  const handleDownload = async () => {
    if (!hiddenContainerRef.current) return;
    setIsGenerating(true);
    setProgress(0);

    try {
      const weekElements = hiddenContainerRef.current.querySelectorAll('.week-container');
      
      for (let i = 0; i < weekElements.length; i++) {
        const element = weekElements[i] as HTMLElement;
        
        const canvas = await html2canvas(element, {
          scale: 2, 
          backgroundColor: '#ffffff',
        } as any); 

        const link = document.createElement('a');
        link.download = `shift_week_${i + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        await new Promise(r => setTimeout(r, 800));
        setProgress(Math.round(((i + 1) / weekElements.length) * 100));
      }
      
      alert('画像の生成とダウンロードが完了しました。');
      onClose();
    } catch (e) {
      console.error(e);
      alert('画像の生成に失敗しました。');
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onClose={!isGenerating ? onClose : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>週間シフト画像の保存</DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          現在表示中の月（{monthDays[0]?.dateStr.slice(0, 7)}）を、週ごとの画像（PNG）として保存します。
        </Typography>
        <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
          ※ ポップアップブロックが表示された場合は、「許可」してください。
        </Typography>

        {isGenerating && (
          <Box sx={{ width: '100%', mt: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="caption" align="center" display="block">
              生成中... {progress}%
            </Typography>
          </Box>
        )}

        <div style={{ position: 'absolute', left: '-9999px', top: 0 }} ref={hiddenContainerRef}>
          {weeks.map((weekDays, index) => (
            <div key={index} className="week-container" style={printStyles}>
              <Typography variant="h5" style={{ marginBottom: '10px', textAlign: 'center', color: '#333' }}>
                週間シフト表 (第{index + 1}週: {weekDays[0].dateStr} ～)
              </Typography>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '150px' }}>スタッフ</th>
                    {weekDays.map(day => {
                      const isSat = day.dayOfWeek === 6;
                      const isSun = day.dayOfWeek === 0;
                      const isHol = !!day.holidayName;
                      let bg = '#fff';
                      if (isHol || isSun) bg = '#ffebee';
                      else if (isSat) bg = '#e3f2fd';

                      return (
                        <th key={day.dateStr} style={{ ...thStyle, backgroundColor: bg }}>
                          {day.dateStr.split('-')[2]} ({day.weekday})
                          {day.holidayName && <div style={{ fontSize: '10px', fontWeight: 'normal' }}>{day.holidayName}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staffList.map(staff => (
                    <tr key={staff.staffId}>
                      <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '10px' }}>
                        {staff.name}
                      </td>
                      {weekDays.map(day => {
                        const key = `${staff.staffId}_${day.dateStr}`;
                        const assignment = assignmentsMap.get(key);
                        const pattern = assignment ? patternMap.get(assignment.patternId) : null;
                        
                        let content = '-';
                        let bgColor = 'transparent';
                        let color = '#000';

                        if (pattern) {
                          content = pattern.symbol || pattern.name;
                          if (pattern.isFlex && assignment?.overrideStartTime) {
                             content += `\n${assignment.overrideStartTime.replace(':','')}-${assignment.overrideEndTime?.replace(':','')}`;
                          }

                          if (pattern.workType === 'StatutoryHoliday') { bgColor = '#ef9a9a'; }
                          else if (pattern.workType === 'PaidLeave') { bgColor = '#90caf9'; }
                          else if (pattern.isNightShift) { bgColor = '#bdbdbd'; }
                          else if (pattern.workType === 'Work') { bgColor = '#e0e0e0'; }
                        }

                        return (
                          <td key={day.dateStr} style={{ ...tdStyle, backgroundColor: bgColor, color }}>
                            <div style={{ ...cellContentStyle, whiteSpace: 'pre-line', fontSize: '12px' }}>
                              {content}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isGenerating}>キャンセル</Button>
        <Button onClick={handleDownload} variant="contained" disabled={isGenerating}>
          画像を生成してダウンロード
        </Button>
      </DialogActions>
    </Dialog>
  );
}