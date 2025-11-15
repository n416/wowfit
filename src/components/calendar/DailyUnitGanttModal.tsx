import { CSSProperties, useState, useMemo, useRef, MouseEvent, useCallback, useEffect } from 'react'; 
import { IStaff, IShiftPattern, IUnit, IAssignment, db } from '../../db/dexie'; 
import { useDispatch, useSelector } from 'react-redux'; 
import { setAssignments } from '../../store/assignmentSlice'; 
import type { AppDispatch, RootState } from '../../store'; 
// import { getPrevDateStr } from '../../utils/dateUtils'; // ★★★ 未使用のため削除 ★★★

// ★★★ v5.36 追加: ShiftCalendarPage から渡される unitGroups の型定義 ★★★
type UnitGroupData = {
  unit: IUnit;
  rows: GanttRowData[]; // ★ 型名を GanttRowData に変更
};

// ★★★ ドラッグする対象の行の型 ★★★
type GanttRowData = { 
  staff: IStaff; 
  pattern: IShiftPattern; 
  isSupport: boolean; 
  startHour: number;
  duration: number; 
  // ★★★ アサインIDを追加 (DB更新に必須) ★★★
  assignmentId: number;
  // ★★★ 元の unitId を追加 (DB更新に必須) ★★★
  unitId: string | null;
};

// ★★★ ドラッグプレビュー用の型 ★★★
type DragPreview = {
  left: number;
  width: number;
  pattern: IShiftPattern;
  backgroundColor: string;
  text: string;
};

interface DailyUnitGanttModalProps {
  target: { date: string; unitId: string } | null;
  onClose: () => void;
  
  // allPatterns: IShiftPattern[]; // ★★★ 削除 (useSelectorで取得) ★★★
  allAssignments: IAssignment[]; // ★★★ allAssignments を受け取る ★★★
  demandMap: Map<string, { required: number; actual: number }>; // ★ これはDBベースのMap
  unitGroups: UnitGroupData[];
}

// (styles 定義は変更なし)
const styles: { [key: string]: CSSProperties } = {
  // モーダル
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1300,
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '90%',
    maxWidth: '960px', // MUIの maxWidth="lg" に相当
    maxHeight: '90vh',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1301,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #e0e0e0',
    flexShrink: 0,
    fontSize: '1.25rem',
    fontWeight: 500,
  },
  content: {
    overflowY: 'auto',
    flexGrow: 1,
    padding: '0 24px 24px 24px', 
  },
  contentInnerScroll: {
    overflowX: 'auto',
    paddingBottom: '16px', 
  },
  actions: {
    padding: '16px 24px',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'flex-end',
    flexShrink: 0,
    gap: '8px', // ★ ボタン間のギャップ
  },
  button: {
    padding: '6px 16px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '4px',
    border: '1px solid #1976d2', // ★ 枠線を追加
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#1976d2', // primary.main
    textTransform: 'uppercase',
  },
  buttonConfirm: { // ★ 確定ボタン用のスタイル
    padding: '6px 16px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#1976d2', // primary.main
    color: '#fff',
    textTransform: 'uppercase',
  },

  // ( ... 他のスタイルは変更なし ... )
  // ガントチャート
  timeHeaderContainer: {
    display: 'flex',
    marginLeft: '150px',
    borderBottom: '1px solid #ddd',
    position: 'sticky',
    top: 0,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  timeHeaderCell: {
    flexShrink: 0,
    textAlign: 'center',
    fontSize: '0.7rem',
    borderRight: '1px solid #eee',
    color: '#666',
    backgroundColor: '#f5f5f5', 
    padding: '4px 0',
    boxSizing: 'border-box', 
  },
  unitBlock: {
    borderTop: '3px double #000',
    marginTop: '16px',
    paddingTop: '8px',
  },
  firstUnitBlock: {
    borderTop: 'none',
    marginTop: 0,
    paddingTop: '8px',
  },
  statusBarRow: {
    display: 'flex',
    marginBottom: '8px',
  },
  unitNameCell: {
    width: '150px',
    flexShrink: 0,
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 'bold',
  },
  statusBarContainer: {
    display: 'flex',
    width: '100%', 
    height: '16px',
    border: '1px solid #e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  statusBarBlock: {
    flexShrink: 0,
    boxSizing: 'border-box', 
  },
  staffRow: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #eee',
  },
  staffNameCell: {
    width: '150px',
    flexShrink: 0,
    padding: '0 8px',
    borderRight: '1px solid #ddd',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    height: '100%',
    boxSizing: 'border-box',
  },
  staffName: {
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  supportChip: {
    display: 'inline-block',
    height: '18px',
    padding: '0 8px',
    fontSize: '0.6rem',
    borderRadius: '9px',
    border: '1px solid #1976d2',
    color: '#1976d2',
    backgroundColor: '#fff',
  },
  chartArea: {
    position: 'relative',
    height: '100%',
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#f0f0f0',
    borderRight: '1px solid #fff',
  },
  shiftBar: {
    position: 'absolute',
    top: '8px',
    bottom: '8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '0.7rem',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '8px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    cursor: 'grab', 
    userSelect: 'none', 
  },
  dragPreviewBar: {
    position: 'absolute',
    top: '8px',
    bottom: '8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '0.7rem',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '8px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    zIndex: 20,
    opacity: 0.7,
    pointerEvents: 'none', 
  },
  italicPlaceholder: {
    paddingLeft: '160px',
    paddingTop: '8px',
    paddingBottom: '8px',
    color: '#666',
    fontStyle: 'italic',
    fontSize: '0.8rem',
  }
};


const getBarColor = (pattern: IShiftPattern, isSupport: boolean) => {
  return isSupport ? '#42a5f5' : (pattern.isNightShift ? '#757575' : '#81c784');
};


export default function DailyUnitGanttModal({ 
  target, onClose, 
  allAssignments, 
  demandMap, // ★ DBベースのMap
  unitGroups
}: DailyUnitGanttModalProps) {

  const dispatch: AppDispatch = useDispatch(); 
  
  const allStaffMap = useSelector((state: RootState) => 
    new Map(state.staff.staff.map(s => [s.staffId, s]))
  );
  // ★★★ useSelector を使って patternMap を取得 ★★★
  const patternMap = useSelector((state: RootState) => 
    new Map(state.pattern.patterns.map(p => [p.patternId, p]))
  );
  
  const HOUR_WIDTH = 30; 
  const CHART_WIDTH = HOUR_WIDTH * 24; 
  const ROW_HEIGHT = 40; 

  const [isDragging, setIsDragging] = useState(false);
  const [draggingRow, setDraggingRow] = useState<GanttRowData | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null); 
  const modalContentRef = useRef<HTMLDivElement>(null); 

  const [pendingChanges, setPendingChanges] = useState<Map<number, IAssignment>>(new Map());

  const workPatterns = useMemo(() => {
    return Array.from(patternMap.values()).filter(p => p.workType === 'Work');
  }, [patternMap]);

  const allAssignmentsMap = useMemo(() => {
    const map = new Map<number, IAssignment>();
    allAssignments.forEach(a => {
      if (a.id) map.set(a.id, a);
    });
    return map;
  }, [allAssignments]);

  const localUnitGroups = useMemo(() => {
    if (!target) return [];
    
    return unitGroups.map(group => ({
      ...group,
      rows: group.rows.map(row => {
        const change = pendingChanges.get(row.assignmentId);
        if (change) {
          const newPattern = patternMap.get(change.patternId);
          if (!newPattern) return row; 

          const startH = parseInt(newPattern.startTime.split(':')[0]);
          const [endH_raw, endM] = newPattern.endTime.split(':').map(Number);
          let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
          
          let displayStart = startH;
          let displayDuration = endH - startH;

          if (newPattern.crossesMidnight) {
             if (change.date === target.date) {
               displayDuration = 24 - startH;
             } else {
               displayStart = startH;
               displayDuration = newPattern.durationHours; 
             }
          }
          
          return {
            ...row,
            pattern: newPattern,
            startHour: displayStart,
            duration: displayDuration,
            unitId: change.unitId, 
          };
        }
        return row;
      })
    }));
  }, [unitGroups, pendingChanges, patternMap, target]);

  // ★★★ ローカルのデマンドマップ (pendingChanges を反映) ★★★
  const localDemandMap = useMemo(() => {
    if (!target) return demandMap; // ターゲットがなければ元のmapを返す
    
    // 1. props の demandMap (DBベース) をディープコピー
    const newDemandMap = new Map<string, { required: number; actual: number }>();
    demandMap.forEach((value, key) => {
      newDemandMap.set(key, { ...value });
    });

    // 2. pendingChanges にある変更（新しいアサイン）を適用
    pendingChanges.forEach((newAssignment) => {
      const staff = allStaffMap.get(newAssignment.staffId);
      if (staff && staff.status === 'OnLeave') return; // 休職者は除外

      const newPattern = patternMap.get(newAssignment.patternId);
      if (!newPattern || newPattern.workType !== 'Work' || !newAssignment.unitId) return;

      // 3. この変更の「元のアサイン」を探す
      const originalAssignment = allAssignmentsMap.get(newAssignment.id!);
      if (!originalAssignment) return; // 元がない (ありえない)
      
      const oldPattern = patternMap.get(originalAssignment.patternId);
      
      // 4. 元のアサインの影響を newDemandMap から「減算」する
      if (originalAssignment.unitId && oldPattern && oldPattern.workType === 'Work') {
        const startTime = parseInt(oldPattern.startTime.split(':')[0]);
        const [endH, endM] = oldPattern.endTime.split(':').map(Number);
        const endTime = (endM > 0) ? endH + 1 : endH;

        if (!oldPattern.crossesMidnight) {
          for (let hour = startTime; hour < endTime; hour++) { 
            const key = `${originalAssignment.date}_${originalAssignment.unitId}_${hour}`;
            const entry = newDemandMap.get(key);
            if (entry) entry.actual = Math.max(0, entry.actual - 1); // 0未満にならないように
          }
        } else {
          // (夜勤の減算ロジック - 当日)
          for (let hour = startTime; hour < 24; hour++) {
            const key = `${originalAssignment.date}_${originalAssignment.unitId}_${hour}`;
            const entry = newDemandMap.get(key);
            if (entry) entry.actual = Math.max(0, entry.actual - 1);
          }
          // (夜勤の減算ロジック - 翌日)
          // const nextDateStr = getPrevDateStr(originalAssignment.date); // ※これは間違い、翌日のはず
          const nextDateObj = new Date(originalAssignment.date.replace(/-/g, '/'));
          nextDateObj.setDate(nextDateObj.getDate() + 1);
          const correctNextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
          for (let hour = 0; hour < endTime; hour++) {
            const key = `${correctNextDateStr}_${originalAssignment.unitId}_${hour}`;
            const entry = newDemandMap.get(key);
            if (entry) entry.actual = Math.max(0, entry.actual - 1);
          }
        }
      }
      
      // 5. 新しいアサインの影響を newDemandMap に「加算」する
      const startTime = parseInt(newPattern.startTime.split(':')[0]);
      const [endH, endM] = newPattern.endTime.split(':').map(Number);
      const endTime = (endM > 0) ? endH + 1 : endH;
      
      if (!newPattern.crossesMidnight) {
        for (let hour = startTime; hour < endTime; hour++) { 
          const key = `${newAssignment.date}_${newAssignment.unitId}_${hour}`;
          const entry = newDemandMap.get(key);
          if (entry) entry.actual += 1;
        }
      } else {
        // (夜勤の加算ロジック - 当日)
        for (let hour = startTime; hour < 24; hour++) {
          const key = `${newAssignment.date}_${newAssignment.unitId}_${hour}`;
          const entry = newDemandMap.get(key);
          if (entry) entry.actual += 1;
        }
        // (夜勤の加算ロジック - 翌日)
        const nextDateObj = new Date(newAssignment.date.replace(/-/g, '/'));
        nextDateObj.setDate(nextDateObj.getDate() + 1);
        const correctNextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
        for (let hour = 0; hour < endTime; hour++) {
          const key = `${correctNextDateStr}_${newAssignment.unitId}_${hour}`;
          const entry = newDemandMap.get(key);
          if (entry) entry.actual += 1;
        }
      }
    });

    // 6. 0.5人デマンドの再計算 (Pass 3) は複雑すぎるため、
    //    このローカルマップでは「減算」と「加算」のみを反映する
    //    (※厳密なプレビューには Pass 3 のロジックもここに移植する必要があります)

    return newDemandMap;

  }, [demandMap, pendingChanges, allAssignmentsMap, patternMap, allStaffMap, target]);


  useEffect(() => {
    setPendingChanges(new Map());
    setIsDragging(false);
    setDraggingRow(null);
    setDragPreview(null);
  }, [target]);


  const updatePendingChanges = useCallback((
    assignmentId: number, 
    staff: IStaff,
    newPattern: IShiftPattern,
  ) => {
    if (!target) return;
    
    const originalAssignment = allAssignmentsMap.get(assignmentId);
    if (!originalAssignment) {
      console.error("元のアサインが見つかりません:", assignmentId);
      return;
    }

    const newAssignment: IAssignment = {
      id: assignmentId, 
      date: originalAssignment.date, // ★ 日付は維持
      staffId: staff.staffId,
      patternId: newPattern.patternId,
      unitId: staff.unitId, 
      locked: true 
    };
      
    setPendingChanges(prev => new Map(prev).set(assignmentId, newAssignment));

  }, [target, allAssignmentsMap]);

  
  const handleBarClick = (e: MouseEvent, clickedRow: GanttRowData) => {
    e.stopPropagation(); 
    
    const chartRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!chartRect) return;
    const xInChart = e.clientX - chartRect.left;
    const clickedHour = Math.floor(xInChart / HOUR_WIDTH);
    
    const staff = clickedRow.staff;

    const availablePatternsAtTime = workPatterns.filter(p => 
      parseInt(p.startTime.split(':')[0]) === clickedHour && 
      staff.availablePatternIds.includes(p.patternId)
    );
    
    if (availablePatternsAtTime.length === 0) return; 

    const currentPatternId = pendingChanges.get(clickedRow.assignmentId)?.patternId || clickedRow.pattern.patternId;
    const currentIndex = availablePatternsAtTime.findIndex(p => p.patternId === currentPatternId);
    
    const nextIndex = (currentIndex + 1) % availablePatternsAtTime.length;
    const nextPattern = availablePatternsAtTime[nextIndex];
    
    if (nextPattern.patternId === currentPatternId && availablePatternsAtTime.length === 1) return;

    updatePendingChanges(clickedRow.assignmentId, staff, nextPattern);
  };

  const handleDragStart = (e: MouseEvent, row: GanttRowData) => {
    if (e.button !== 0) return; 
    
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    setDraggingRow(row);
    document.body.style.cursor = 'grabbing'; 
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging || !draggingRow || !modalContentRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();

    const mouseX = e.clientX;
    const scrollContainer = modalContentRef.current;
    const scrollLeft = scrollContainer.scrollLeft;
    const containerRect = scrollContainer.getBoundingClientRect();
    const xInContainer = mouseX - containerRect.left + scrollLeft - 150;

    let hoverHour = Math.round(xInContainer / HOUR_WIDTH);
    hoverHour = Math.max(0, Math.min(23, hoverHour)); 

    const staff = draggingRow.staff;

    const availablePatternsAtHour = workPatterns.filter(p => 
      parseInt(p.startTime.split(':')[0]) === hoverHour &&
      staff.availablePatternIds.includes(p.patternId)
    );

    if (availablePatternsAtHour.length === 0) {
      setDragPreview(null); 
      return;
    }

    availablePatternsAtHour.sort((a, b) => b.durationHours - a.durationHours);
    const longestPattern = availablePatternsAtHour[0];

    const newLeft = hoverHour * HOUR_WIDTH;
    
    let newWidth = longestPattern.durationHours * HOUR_WIDTH;
    if (longestPattern.crossesMidnight) {
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

  const handleDragEnd = (e: MouseEvent) => {
    if (!isDragging || !draggingRow) {
      if (isDragging || draggingRow) {
        setIsDragging(false);
        setDraggingRow(null);
        setDragPreview(null);
        document.body.style.cursor = 'default';
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    
    if (dragPreview) {
      updatePendingChanges(
        draggingRow.assignmentId, 
        draggingRow.staff, 
        dragPreview.pattern
      );
    }

    setIsDragging(false);
    setDraggingRow(null);
    setDragPreview(null);
    document.body.style.cursor = 'default';
  };
  
  const handleConfirmChanges = async () => {
    if (pendingChanges.size === 0) {
      onClose(); 
      return;
    }
    
    try {
      const changesToSave = Array.from(pendingChanges.values());
      await db.assignments.bulkPut(changesToSave);
      
      const allAssignmentsFromDB = await db.assignments.toArray();
      dispatch(setAssignments(allAssignmentsFromDB));
      
      onClose(); 
      
    } catch (e) {
      console.error("アサインの一括更新に失敗:", e);
      alert("アサインの保存に失敗しました。");
    }
  };


  if (!target) return null;

  return (
    <div 
      style={styles.backdrop} 
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd} 
    >
      <div 
        style={styles.modal} 
      >
        {/* Header */}
        <div style={styles.header}>
          {target.date} 詳細タイムライン
        </div>
        
        {/* Content */}
        <div style={styles.content}>
          <div style={styles.contentInnerScroll} ref={modalContentRef}>
            <div style={{ minWidth: CHART_WIDTH + 150, position: 'relative' }}>
              
              {/* ヘッダー (時間軸) */}
              <div style={styles.timeHeaderContainer}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} style={{
                    ...styles.timeHeaderCell,
                    width: HOUR_WIDTH,
                  }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* ★★★ localUnitGroups (マージ済みstate) を使用 ★★★ */}
              {localUnitGroups.map((group, groupIndex) => (
                <div key={group.unit.unitId} style={groupIndex > 0 ? styles.unitBlock : styles.firstUnitBlock}>
                  
                  {/* ステータスバー行 */}
                  <div style={styles.statusBarRow}>
                    <div style={styles.unitNameCell}>
                      {group.unit.name}
                    </div>
                    <div style={{ ...styles.statusBarContainer, width: CHART_WIDTH }}>
                      {Array.from({ length: 24 }).map((_, h) => {
                        // ★★★ localDemandMap を参照 ★★★
                        const dailyKey = `${target.date}_${group.unit.unitId}_${h}`;
                        const status = localDemandMap.get(dailyKey); 
                        
                        let bgColor = 'transparent';
                        let title = `${h}:00 Need:0`;
                        if (status && status.required > 0) {
                          if (status.actual < status.required) {
                            bgColor = '#d32f2f'; // 不足 (error)
                            title = `不足 (${status.actual}/${status.required})`;
                          } else if (status.actual > status.required) {
                            bgColor = '#66bb6a'; // 過剰 (success)
                            title = `過剰 (${status.actual}/${status.required})`;
                          } else {
                            bgColor = '#1976d2'; // 充足 (primary)
                            title = `充足 (${status.actual}/${status.required})`;
                          }
                        }

                        return (
                          <div 
                            key={h}
                            title={`${h}時: ${title}`}
                            style={{ 
                              ...styles.statusBarBlock,
                              width: HOUR_WIDTH,
                              backgroundColor: bgColor,
                              borderRight: (h + 1) % 6 === 0 && h < 23 ? '1px solid #bdbdbd' : undefined,
                            }} 
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* スタッフ行 */}
                  {group.rows.length === 0 ? (
                    <p style={styles.italicPlaceholder}>
                      アサインなし
                    </p>
                  ) : (
                    // ★★★ 未使用のインデックス 'i' を '_' に変更 ★★★
                    group.rows.map((row, _) => ( 
                      <div key={row.assignmentId} style={{ 
                        ...styles.staffRow,
                        height: ROW_HEIGHT,
                        backgroundColor: row.isSupport ? '#f0f7ff' : 'transparent'
                      }}>
                        <div style={{
                          ...styles.staffNameCell,
                          backgroundColor: row.isSupport ? '#f0f7ff' : '#fff',
                        }}>
                          <span style={styles.staffName} title={row.staff.name}>
                            {row.staff.name}
                          </span>
                          {row.isSupport && <span style={styles.supportChip}>応援</span>}
                        </div>

                        <div 
                          style={{ ...styles.chartArea, width: CHART_WIDTH }}
                          ref={chartAreaRef} 
                        >
                          {/* グリッド線 */}
                          {Array.from({ length: 24 }).map((_, h) => (
                            <div key={h} style={{ 
                              ...styles.gridLine,
                              left: h * HOUR_WIDTH,
                            }} />
                          ))}

                          {/* シフトバー */}
                          <div 
                            style={{
                              ...styles.shiftBar,
                              left: row.startHour * HOUR_WIDTH,
                              width: row.duration * HOUR_WIDTH,
                              backgroundColor: getBarColor(row.pattern, row.isSupport),
                              opacity: (isDragging && draggingRow?.assignmentId === row.assignmentId) ? 0.3 : (row.isSupport ? 0.8 : 1), 
                            }}
                            onClick={(e) => handleBarClick(e, row)}
                            onMouseDown={(e) => handleDragStart(e, row)}
                          >
                            {row.pattern.name}
                          </div>

                          {/* ドラッグプレビュー */}
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
                </div>
              ))}

            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div style={styles.actions}>
          {/* ★★★ 変更履歴 (pendingChanges) のサイズに応じてボタンを出し分ける ★★★ */}
          {pendingChanges.size === 0 ? (
            // ★★★ style から width: '100%' と justifyContent を削除 ★★★
            <button onClick={onClose} style={styles.button}>
              閉じる
            </button>
          ) : (
            <>
              <button onClick={onClose} style={styles.button}>
                キャンセル
              </button>
              <button onClick={handleConfirmChanges} style={styles.buttonConfirm}>
                変更を確定
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}