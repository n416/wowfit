// src/components/calendar/DailyUnitGanttModal.tsx
import { CSSProperties, useState, useRef, MouseEvent, TouchEvent, useEffect } from 'react'; 
import { Popover, Button } from '@mui/material'; 
import { IShiftPattern, IAssignment, IStaff } from '../../db/dexie'; 
import { 
  useDailyGanttLogic, 
  GanttRowData, 
  MonthDay 
} from '../../hooks/useDailyGanttLogic'; 

// --- Constants (Moved to top level for calculation) ---
// ★ 修正: スタイル計算用に定数を外に出しました
const HOUR_WIDTH = 50; 
const CHART_WIDTH = HOUR_WIDTH * 24; // 1200px
const ROW_HEIGHT = 50; 
const SIDEBAR_WIDTH = 150;
const MODAL_PADDING_X = 48; // 左右のパディング(24px * 2)の概算
// ★ 計算された理想的な幅 (約1400px)
const IDEAL_MODAL_WIDTH = CHART_WIDTH + SIDEBAR_WIDTH + MODAL_PADDING_X + 20; // +20はスクロールバー等の余裕

// --- Helper Functions ---

const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const isWithinContract = (staff: IStaff, start: string, end: string): boolean => {
  if (staff.employmentType !== 'PartTime') return true;

  const ranges = (staff.workableTimeRanges && staff.workableTimeRanges.length > 0)
    ? staff.workableTimeRanges
    : [{ start: '08:00', end: '20:00' }];

  const sMin = timeToMin(start);
  const eMin = timeToMin(end);

  return ranges.some(range => {
    const rStart = timeToMin(range.start);
    const rEnd = timeToMin(range.end);
    return sMin >= rStart && eMin <= rEnd;
  });
};

type DragPreview = {
  left: number;
  width: number;
  pattern: IShiftPattern;
  backgroundColor: string;
  text: string;
};

const getBarColor = (pattern: IShiftPattern, isSupport: boolean) => {
  if (pattern.isFlex) return '#ffb74d'; 
  return isSupport ? '#42a5f5' : (pattern.isNightShift ? '#757575' : '#81c784');
};

// --- Styles ---

const inlineFormStyles: { [key: string]: CSSProperties } = {
  container: { display: 'flex', gap: '8px', padding: '8px 0 12px 0', backgroundColor: '#f9f9f9', borderBottom: '1px solid #ddd' },
  select: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', flex: 1 },
  selectStaff: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', flex: 1, marginLeft: `${SIDEBAR_WIDTH}px` }, // ★ 定数利用
  button: { padding: '8px 12px', borderRadius: '4px', border: 'none', backgroundColor: '#1976d2', color: '#fff', cursor: 'pointer' },
  buttonDisabled: { padding: '8px 12px', borderRadius: '4px', border: 'none', backgroundColor: '#ccc', color: '#777', cursor: 'not-allowed' },
  buttonCancel: { padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333', cursor: 'pointer' },
  addButtonContainer: { padding: '8px 0 8px 50px', borderBottom: '1px solid #eee' },
  addButton: { padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #1976d2', backgroundColor: '#fff', color: '#1976d2', cursor: 'pointer' },
};

const styles: { [key: string]: CSSProperties } = {
  backdrop: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1300 },
  modal: { 
    position: 'fixed', 
    top: '50%', 
    left: '50%', 
    transform: 'translate(-50%, -50%)', 
    // ★ 修正: 画面幅(98%) と 理想幅(IDEAL_MODAL_WIDTH) の小さい方採用する
    // これにより、PCでは理想幅で止まり、タブレットでは画面いっぱいになる
    width: `min(98%, ${IDEAL_MODAL_WIDTH}px)`,
    maxWidth: '100vw', 
    height: 'auto', 
    maxHeight: '95vh', 
    backgroundColor: '#ffffff', 
    borderRadius: '8px', 
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
    zIndex: 1301, 
    display: 'flex', 
    flexDirection: 'column' 
  },
  header: { padding: '16px 24px', borderBottom: '1px solid #e0e0e0', flexShrink: 0, fontSize: '1.25rem', fontWeight: 500 },
  content: { overflowY: 'auto', flexGrow: 1, padding: '0 24px 24px 24px' },
  contentInnerScroll: { overflowX: 'auto', paddingBottom: '16px' },
  actions: { padding: '16px 24px', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0, gap: '8px' },
  button: { padding: '6px 16px', fontSize: '0.875rem', fontWeight: 500, borderRadius: '4px', border: '1px solid #1976d2', cursor: 'pointer', backgroundColor: 'transparent', color: '#1976d2', textTransform: 'uppercase' },
  buttonConfirm: { padding: '6px 16px', fontSize: '0.875rem', fontWeight: 500, borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: '#1976d2', color: '#fff', textTransform: 'uppercase' },
  timeHeaderContainer: { display: 'flex', marginLeft: `${SIDEBAR_WIDTH}px`, borderBottom: '1px solid #ddd', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 10 }, // ★ 定数利用
  timeHeaderCell: { flexShrink: 0, textAlign: 'center', fontSize: '0.7rem', borderRight: '1px solid #eee', color: '#666', backgroundColor: '#f5f5f5', padding: '4px 0', boxSizing: 'border-box' },
  unitBlock: { borderTop: '3px double #000', marginTop: '16px', paddingTop: '8px' },
  firstUnitBlock: { borderTop: 'none', marginTop: 0, paddingTop: '8px' },
  statusBarRow: { display: 'flex', marginBottom: '8px' },
  unitNameCell: { width: `${SIDEBAR_WIDTH}px`, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', fontWeight: 'bold' }, // ★ 定数利用
  statusBarContainer: { display: 'flex', width: '100%', height: '16px', border: '1px solid #e0e0e0', backgroundColor: '#f5f5f5' },
  statusBarBlock: { flexShrink: 0, boxSizing: 'border-box' },
  staffRow: { display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee' },
  staffNameCell: { width: `${SIDEBAR_WIDTH}px`, flexShrink: 0, padding: '0 8px', borderRight: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', height: '100%', boxSizing: 'border-box', cursor: 'pointer' }, // ★ 定数利用
  staffName: { fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  supportChip: { display: 'inline-block', height: '18px', padding: '0 8px', fontSize: '0.6rem', borderRadius: '9px', border: '1px solid #1976d2', color: '#1976d2', backgroundColor: '#fff' },
  chartArea: { position: 'relative', height: '100%' },
  gridLine: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#f0f0f0', borderRight: '1px solid #fff' },
  shiftBar: { position: 'absolute', top: '8px', bottom: '8px', borderRadius: '4px', color: '#fff', fontSize: '0.7rem', display: 'flex', alignItems: 'center', paddingLeft: '8px', overflow: 'hidden', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', cursor: 'grab', userSelect: 'none', touchAction: 'none' },
  dragPreviewBar: { position: 'absolute', top: '8px', bottom: '8px', borderRadius: '4px', color: '#fff', fontSize: '0.7rem', display: 'flex', alignItems: 'center', paddingLeft: '8px', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 20, opacity: 0.7, pointerEvents: 'none' },
  italicPlaceholder: { paddingLeft: '160px', paddingTop: '8px', paddingBottom: '8px', color: '#666', fontStyle: 'italic', fontSize: '0.8rem' }
};

interface DailyUnitGanttModalProps {
  target: { date: string; unitId: string | null; } | null;
  onClose: () => void;
  allAssignments: IAssignment[]; 
  demandMap: Map<string, { required: number; actual: number }>; 
  monthDays: MonthDay[]; 
}

export default function DailyUnitGanttModal({ 
  target, onClose, allAssignments, demandMap, monthDays 
}: DailyUnitGanttModalProps) {

  const {
    localUnitGroups,
    localDemandMap,
    workPatterns,
    hasPendingChanges,
    updateRow,
    deleteRow,
    addAssignment,
    saveChanges,
    getAvailableStaffForUnit,
    getAvailablePatternsForStaff
  } = useDailyGanttLogic(
    target, 
    onClose, 
    allAssignments, 
    demandMap, 
    monthDays
  );

  // 定数は外に出したので削除

  const dragStartPosRef = useRef<{ x: number, y: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [draggingRow, setDraggingRow] = useState<GanttRowData | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null); 
  const modalContentRef = useRef<HTMLDivElement>(null); 

  const [addingToUnitId, setAddingToUnitId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");

  const [deletingRow, setDeletingRow] = useState<GanttRowData | null>(null);
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setAddingToUnitId(null); 
    setSelectedStaffId(""); 
    setSelectedPatternId(""); 
    setDeletingRow(null);
    setPopoverAnchorEl(null);
    setIsDragging(false);
    setDraggingRow(null);
    setDragPreview(null);
    dragStartPosRef.current = null;
  }, [target]);

  // --- Event Handlers ---

  const getClientX = (e: MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return (e as MouseEvent).clientX;
  };
  
  const getClientY = (e: MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return e.touches[0].clientY;
    }
    return (e as MouseEvent).clientY;
  };

  const handlePatternClick = (e: React.MouseEvent | React.TouchEvent, clickedRow: GanttRowData) => {
    if (isDragging) {
      e.stopPropagation();
      return;
    }
    
    e.stopPropagation(); 
    
    let clientX = 0;
    if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
    } else if ('touches' in e && e.touches.length > 0) {
      return;
    }

    const chartRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!chartRect) return;
    const xInChart = clientX - chartRect.left;
    const clickedHour = Math.floor(xInChart / HOUR_WIDTH);
    
    if (clickedRow.pattern.isFlex) return;

    const staff = clickedRow.staff;
    const availablePatterns = workPatterns.filter(p => 
      parseInt(p.startTime.split(':')[0]) === clickedHour && 
      staff.availablePatternIds.includes(p.patternId)
    );
    
    if (availablePatterns.length === 0) return; 
    const currentPatternId = clickedRow.pattern.patternId;
    const currentIndex = availablePatterns.findIndex(p => p.patternId === currentPatternId);
    const nextIndex = (currentIndex + 1) % availablePatterns.length;
    const nextPattern = availablePatterns[nextIndex];
    
    if (nextPattern.patternId === currentPatternId && availablePatterns.length === 1) return;

    updateRow(clickedRow, nextPattern);
  };

  const handleStaffNameClick = (e: MouseEvent<HTMLElement>, clickedRow: GanttRowData) => {
    e.stopPropagation();
    if (isDragging) return;
    setDeletingRow(clickedRow);
    setPopoverAnchorEl(e.currentTarget);
  };
  
  const handleCloseDeletePopover = () => {
    setDeletingRow(null);
    setPopoverAnchorEl(null);
  };

  const handleDeleteAssignment = () => {
    if (!deletingRow) return;
    deleteRow(deletingRow);
    handleCloseDeletePopover();
  };

  // --- Drag & Drop (Universal with Threshold) ---
  const startDrag = (e: MouseEvent | TouchEvent, row: GanttRowData) => {
    if ('button' in e && (e as MouseEvent).button !== 0) return; 
    
    handleCloseDeletePopover();
    e.stopPropagation();
    
    const startX = getClientX(e);
    const startY = getClientY(e);
    dragStartPosRef.current = { x: startX, y: startY };
    
    setDraggingRow(row);
  };
  
  const moveDrag = (e: MouseEvent | TouchEvent) => {
    if (!dragStartPosRef.current || !draggingRow || !modalContentRef.current) return;
    
    e.stopPropagation();
    
    const mouseX = getClientX(e);
    const mouseY = getClientY(e);

    if (!isDragging) {
      const diffX = Math.abs(mouseX - dragStartPosRef.current.x);
      const diffY = Math.abs(mouseY - dragStartPosRef.current.y);
      
      // ★ 修正: 閾値を 13px (約10pt相当) に設定
      if (diffX > 13 || diffY > 13) {
        setIsDragging(true);
        document.body.style.cursor = 'grabbing'; 
      } else {
        return;
      }
    }
    
    const scrollContainer = modalContentRef.current;
    const scrollLeft = scrollContainer.scrollLeft;
    const containerRect = scrollContainer.getBoundingClientRect();

    const xInContainer = mouseX - containerRect.left + scrollLeft - SIDEBAR_WIDTH; // ★ 定数利用
    let hoverHour = Math.round(xInContainer / HOUR_WIDTH);
    hoverHour = Math.max(0, Math.min(23, hoverHour)); 
    
    let candidateStartStr = "";
    let candidateEndStr = "";

    if (draggingRow.pattern.isFlex) {
      const pattern = draggingRow.pattern;
      const newLeft = hoverHour * HOUR_WIDTH;
      const currentDuration = draggingRow.duration; 
      const newWidth = currentDuration * HOUR_WIDTH;
      
      candidateStartStr = `${String(hoverHour).padStart(2, '0')}:00`;
      const endH_val = hoverHour + currentDuration;
      const endH_int = Math.floor(endH_val);
      const endM_int = Math.round((endH_val - endH_int) * 60);
      candidateEndStr = `${String(endH_int).padStart(2, '0')}:${String(endM_int).padStart(2, '0')}`;

      if (!isWithinContract(draggingRow.staff, candidateStartStr, candidateEndStr)) {
        return;
      }

      setDragPreview({
        left: newLeft,
        width: newWidth,
        pattern: pattern,
        backgroundColor: '#ffa726',
        text: `${pattern.name} (${hoverHour}:00~)`,
      });
      return;
    }

    const staff = draggingRow.staff;
    const availablePatterns = workPatterns.filter(p => 
      parseInt(p.startTime.split(':')[0]) === hoverHour &&
      staff.availablePatternIds.includes(p.patternId)
    );
    if (availablePatterns.length === 0) {
      setDragPreview(null); 
      return;
    }
    availablePatterns.sort((a, b) => b.durationHours - a.durationHours);
    const longestPattern = availablePatterns[0];

    candidateStartStr = longestPattern.startTime;
    candidateEndStr = longestPattern.endTime;

    if (!isWithinContract(draggingRow.staff, candidateStartStr, candidateEndStr)) {
       return;
    }

    const newLeft = hoverHour * HOUR_WIDTH;
    let newWidth = longestPattern.durationHours * HOUR_WIDTH;
    
    const crossesMidnight = longestPattern.startTime > longestPattern.endTime;
    
    if (crossesMidnight) {
        newWidth = (24 - hoverHour) * HOUR_WIDTH;
    }
    setDragPreview({
      left: newLeft,
      width: newWidth,
      pattern: longestPattern,
      backgroundColor: getBarColor(longestPattern, draggingRow.isSupport),
      text: longestPattern.name,
    });
  };
  
  const endDrag = (e: MouseEvent | TouchEvent) => {
    if (isDragging && draggingRow) {
      
      if (dragPreview) {
        if (draggingRow.pattern.isFlex) {
           const newStartHour = Math.round(dragPreview.left / HOUR_WIDTH);
           const duration = draggingRow.duration; 
           
           const newStartStr = `${String(newStartHour).padStart(2, '0')}:00`;
           const endH = newStartHour + duration;
           const endH_int = Math.floor(endH);
           const endM_int = (endH - endH_int) * 60;
           const newEndStr = `${String(endH_int).padStart(2, '0')}:${String(Math.round(endM_int)).padStart(2, '0')}`;
           
           updateRow(draggingRow, draggingRow.pattern, { start: newStartStr, end: newEndStr });
  
        } else {
           updateRow(draggingRow, dragPreview.pattern);
        }
      }
      
      if (e.cancelable) {
        e.preventDefault();
      }
      
      setIsDragging(false);
      setDraggingRow(null);
      setDragPreview(null);
      dragStartPosRef.current = null;
      document.body.style.cursor = 'default';
      
      e.stopPropagation();
      return;
    }

    setDraggingRow(null);
    setDragPreview(null);
    dragStartPosRef.current = null;
  };
  
  const handleShowAddForm = (unitId: string) => {
    setAddingToUnitId(unitId);
    setSelectedStaffId("");
    setSelectedPatternId("");
  };

  const handleAddAssignment = () => {
    if (!addingToUnitId || !selectedStaffId || !selectedPatternId) return;
    addAssignment(addingToUnitId, selectedStaffId, selectedPatternId);
    
    setAddingToUnitId(null);
    setSelectedStaffId("");
    setSelectedPatternId("");
  };

  const availableStaffForAdding = addingToUnitId ? getAvailableStaffForUnit(addingToUnitId, addingToUnitId) : [];
  const availablePatternsForSelectedStaff = selectedStaffId ? getAvailablePatternsForStaff(selectedStaffId) : [];

  if (!target) return null;

  return (
    <div 
      style={styles.backdrop} 
      onMouseMove={(e) => moveDrag(e)}
      onMouseUp={(e) => endDrag(e)}
      onMouseLeave={(e) => endDrag(e)}
      onTouchMove={(e) => moveDrag(e)}
      onTouchEnd={(e) => endDrag(e)}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={styles.modal}>
        <div style={styles.header}>
          {target.date} 詳細タイムライン
        </div>
        
        <div style={styles.content}>
          <div style={styles.contentInnerScroll} ref={modalContentRef}>
            <div style={{ minWidth: CHART_WIDTH + SIDEBAR_WIDTH, position: 'relative' }}> {/* ★ 定数利用 */}
              
              <div style={styles.timeHeaderContainer}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} style={{ ...styles.timeHeaderCell, width: HOUR_WIDTH }}>
                    {h}
                  </div>
                ))}
              </div>

              {localUnitGroups.map((group, groupIndex) => (
                <div key={group.unit.unitId} style={groupIndex > 0 ? styles.unitBlock : styles.firstUnitBlock}>
                  
                  <div style={styles.statusBarRow}>
                    <div style={styles.unitNameCell}>
                      {group.unit.name}
                    </div>
                    <div style={{ ...styles.statusBarContainer, width: CHART_WIDTH }}>
                      {Array.from({ length: 24 }).map((_, h) => {
                        const dailyKey = `${target.date}_${group.unit.unitId}_${h}`;
                        const status = localDemandMap.get(dailyKey); 
                        let bgColor = 'transparent';
                        let title = `${h}:00 Need:0`;
                        if (status && status.required > 0) {
                          if (status.actual < status.required) {
                            bgColor = '#d32f2f'; 
                            title = `不足 (${status.actual}/${status.required})`;
                          } else if (status.actual > status.required) {
                            bgColor = '#66bb6a'; 
                            title = `過剰 (${status.actual}/${status.required})`;
                          } else {
                            bgColor = '#1976d2'; 
                            title = `充足 (${status.actual}/${status.required})`;
                          }
                        }
                        return (
                          <div key={h} title={`${h}時: ${title}`}
                            style={{ ...styles.statusBarBlock, width: HOUR_WIDTH, backgroundColor: bgColor, borderRight: (h + 1) % 6 === 0 && h < 23 ? '1px solid #bdbdbd' : undefined }} 
                          />
                        );
                      })}
                    </div>
                  </div>

                  {group.rows.length === 0 ? (
                    <p style={styles.italicPlaceholder}>アサインなし</p>
                  ) : (
                    group.rows.map((row) => ( 
                      <div key={row.assignmentId} style={{ 
                        ...styles.staffRow, height: ROW_HEIGHT,
                        backgroundColor: row.isSupport ? '#f0f7ff' : 'transparent'
                      }}>
                        <div 
                          style={{ ...styles.staffNameCell, backgroundColor: row.isSupport ? '#f0f7ff' : '#fff' }}
                          onClick={(e) => handleStaffNameClick(e, row)}
                        >
                          <span style={styles.staffName} title={row.staff.name}>{row.staff.name}</span>
                          {row.isSupport && <span style={styles.supportChip}>応援</span>}
                        </div>

                        <div style={{ ...styles.chartArea, width: CHART_WIDTH }} ref={chartAreaRef}>
                          {Array.from({ length: 24 }).map((_, h) => (
                            <div key={h} style={{ ...styles.gridLine, left: h * HOUR_WIDTH }} />
                          ))}

                          <div 
                            style={{
                              ...styles.shiftBar,
                              left: row.startHour * HOUR_WIDTH,
                              width: row.duration * HOUR_WIDTH,
                              backgroundColor: getBarColor(row.pattern, row.isSupport),
                              opacity: (isDragging && draggingRow?.assignmentId === row.assignmentId) ? 0.3 : (row.isSupport ? 0.8 : 1), 
                            }}
                            onClick={(e) => handlePatternClick(e, row)}
                            onMouseDown={(e) => startDrag(e, row)}
                            onTouchStart={(e) => startDrag(e, row)}
                          >
                            {row.pattern.isFlex && row.displayStartTime ? `${row.pattern.name} (${row.displayStartTime})` : row.pattern.name}
                          </div>

                          {(isDragging && draggingRow?.assignmentId === row.assignmentId && dragPreview) && (
                            <div style={{
                              ...styles.dragPreviewBar,
                              left: dragPreview.left,
                              width: dragPreview.width,
                              backgroundColor: dragPreview.backgroundColor,
                            }}>
                              {dragPreview.text}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {addingToUnitId === group.unit.unitId ? (
                    <div style={inlineFormStyles.container}>
                      <select style={inlineFormStyles.selectStaff} value={selectedStaffId} onChange={(e) => { setSelectedStaffId(e.target.value); setSelectedPatternId(""); }}>
                        <option value="">(1. スタッフを選択)</option>
                        {availableStaffForAdding.map(staff => (
                          <option key={staff.staffId} value={staff.staffId}>{staff.name}</option>
                        ))}
                      </select>
                      
                      <select style={inlineFormStyles.select} value={selectedPatternId} onChange={(e) => setSelectedPatternId(e.target.value)} disabled={!selectedStaffId}>
                        <option value="">(2. 勤務パターンを選択)</option>
                        {availablePatternsForSelectedStaff.map(pattern => (
                          <option key={pattern.patternId} value={pattern.patternId}>{pattern.name} ({pattern.startTime}-{pattern.endTime})</option>
                        ))}
                      </select>
                      
                      <button style={(!selectedStaffId || !selectedPatternId) ? inlineFormStyles.buttonDisabled : inlineFormStyles.button} onClick={handleAddAssignment} disabled={!selectedStaffId || !selectedPatternId}>追加</button>
                      <button style={inlineFormStyles.buttonCancel} onClick={() => setAddingToUnitId(null)}>キャンセル</button>
                    </div>
                  ) : (
                    <div style={inlineFormStyles.addButtonContainer}>
                      <button style={inlineFormStyles.addButton} onClick={() => handleShowAddForm(group.unit.unitId)}>+</button>
                    </div>
                  )}

                </div>
              ))}

            </div>
          </div>
        </div>
        
        <div style={styles.actions}>
          {!hasPendingChanges ? (
            <button onClick={onClose} style={styles.button}>閉じる</button>
          ) : (
            <>
              <button onClick={onClose} style={styles.button}>キャンセル</button>
              <button onClick={saveChanges} style={styles.buttonConfirm}>変更を確定</button>
            </>
          )}
        </div>
      </div>

      <Popover
        open={Boolean(popoverAnchorEl)}
        anchorEl={popoverAnchorEl}
        onClose={handleCloseDeletePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ zIndex: 1302 }} 
      >
        <div style={{ padding: '8px', display: 'flex', gap: '8px' }}>
          <Button variant="contained" color="error" size="small" onClick={handleDeleteAssignment}>シフトを削除</Button>
          <Button variant="outlined" size="small" onClick={handleCloseDeletePopover}>キャンセル</Button>
        </div>
      </Popover>
    </div>
  );
}