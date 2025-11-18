import { CSSProperties, useState, useMemo, useRef, MouseEvent, useCallback, useEffect } from 'react'; 
import { IStaff, IShiftPattern, IUnit, IAssignment, db } from '../../db/dexie'; 
import { useDispatch, useSelector } from 'react-redux'; 
// ★★★ 変更点: _syncOptimisticAssignment をインポートから削除 ★★★
import { setAssignments } from '../../store/assignmentSlice'; 
import type { AppDispatch, RootState } from '../../store'; 
// import { getPrevDateStr, MONTH_DAYS } from '../../utils/dateUtils'; // ★★★ 削除 ★★★

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
  isNew?: boolean; // ★★★ 修正: 新規追加フラグ ★★★
};

// ★★★ ドラッグプレビュー用の型 ★★★
type DragPreview = {
  left: number;
  width: number;
  pattern: IShiftPattern;
  backgroundColor: string;
  text: string;
};

// ★★★ (新規追加) インラインフォーム用のスタイル ★★★
const inlineFormStyles: { [key: string]: CSSProperties } = {
  container: {
    display: 'flex',
    gap: '8px',
    padding: '8px 0 12px 0', // ★ 修正: 150pxパディングを削除
    backgroundColor: '#f9f9f9',
    borderBottom: '1px solid #ddd',
  },
  select: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    flex: 1,
  },
  // ★ (新規追加) 1番目のselect（スタッフ選択）にインデントを適用
  selectStaff: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    flex: 1,
    marginLeft: '150px',
  },
  button: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#1976d2', // primary.main
    color: '#fff',
    cursor: 'pointer',
  },
  buttonDisabled: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#ccc',
    color: '#777',
    cursor: 'not-allowed',
  },
  buttonCancel: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
  },
  // ★★★ (新規追加) 「+」ボタン用のコンテナスタイル ★★★
  addButtonContainer: {
    padding: '8px 0 8px 50px', // 50pxインデント
    borderBottom: '1px solid #eee',
  },
  addButton: { // 「スタッフを追加」ボタン
    padding: '4px 8px',
    fontSize: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #1976d2',
    backgroundColor: '#fff',
    color: '#1976d2',
    cursor: 'pointer',
    // marginLeft: 'auto', // ★ 削除
  },
};
// ★★★ (新規追加) ここまで ★★★


interface DailyUnitGanttModalProps {
  target: { date: string; unitId: string } | null;
  onClose: () => void;
  
  // allPatterns: IShiftPattern[]; // ★★★ 削除 (useSelectorで取得) ★★★
  allAssignments: IAssignment[]; // ★★★ allAssignments を受け取る
  demandMap: Map<string, { required: number; actual: number }>; // ★★★ v5.101 の変更を元に戻す ★★★
  unitGroups: UnitGroupData[]; // ★★★ v5.101 の変更を元に戻す ★★★
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
  demandMap, // ★★★ v5.101 の変更を元に戻す ★★★
  unitGroups // ★★★ v5.101 の変更を元に戻す ★★★
}: DailyUnitGanttModalProps) {

  const dispatch: AppDispatch = useDispatch(); 
  
  // ★★★ 変更点 1: `useSelector` で `new Map` を作らない ★★★
  const allStaff = useSelector((state: RootState) => state.staff.staff);
  const allStaffMap = useMemo(() => 
    new Map(allStaff.map(s => [s.staffId, s])), 
    [allStaff]
  );
  
  // ★★★ 変更点 2: `useSelector` で `new Map` を作らない ★★★
  const allPatterns = useSelector((state: RootState) => state.pattern.patterns);
  const patternMap = useMemo(() => 
    new Map(allPatterns.map(p => [p.patternId, p])), 
    [allPatterns]
  );
  // ★★★ v5.101 で追加した unitList の useSelector を削除 ★★★
  
  const HOUR_WIDTH = 30; 
  const CHART_WIDTH = HOUR_WIDTH * 24; 
  const ROW_HEIGHT = 40; 

  const [isDragging, setIsDragging] = useState(false);
  const [draggingRow, setDraggingRow] = useState<GanttRowData | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null); 
  const modalContentRef = useRef<HTMLDivElement>(null); 

  // ★★★ 修正: 既存の「変更」を管理する State ★★★
  const [pendingChanges, setPendingChanges] = useState<Map<number, IAssignment>>(new Map());
  
  // ★★★ 新規追加: 「新規追加」を管理する State ★★★
  const [pendingAdditions, setPendingAdditions] = useState<Omit<IAssignment, 'id'>[]>([]);
  const [addingToUnitId, setAddingToUnitId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  // ★★★ 新規追加ここまで ★★★

  const workPatterns = useMemo(() => {
    // ★★★ 変更点 3: allPatterns (配列) を使う ★★★
    return allPatterns.filter(p => p.workType === 'Work');
  }, [allPatterns]);

  const allAssignmentsMap = useMemo(() => {
    const map = new Map<number, IAssignment>();
    // ★ allAssignments (present) を使用
    allAssignments.forEach(a => {
      if (a.id) map.set(a.id, a);
    });
    return map;
  }, [allAssignments]);

  // ★★★ v5.101 で追加した unitGroups の useMemo を削除 ★★★

  // ★★★ localUnitGroups (pendingChanges と pendingAdditions をマージ) ★★★
  const localUnitGroups = useMemo(() => {
    if (!target) return [];
    
    // 1. props からの unitGroups (DBベース) に pendingChanges (変更) をマージ
    const updatedGroups = unitGroups.map(group => ({
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
               displayStart = 0; 
               displayDuration = endH;
             }
          }
          
          return {
            ...row,
            pattern: newPattern,
            startHour: displayStart,
            duration: displayDuration,
            unitId: change.unitId, 
            isNew: false, // ★★★ 修正: 既存の行 ★★★
          };
        }
        return { ...row, isNew: false }; // ★★★ 修正: 既存の行 ★★★
      })
    }));

    // 2. pendingAdditions (新規追加) をマージ
    // ★★★ 修正: forEach から map に変更し、一時IDとしてインデックスを使用 ★★★
    pendingAdditions.forEach((newAssignment, index) => {
      const group = updatedGroups.find(g => g.unit.unitId === newAssignment.unitId);
      const staff = allStaffMap.get(newAssignment.staffId);
      const pattern = patternMap.get(newAssignment.patternId);
      
      if (group && staff && pattern) {
        const startH = parseInt(pattern.startTime.split(':')[0]);
        const [endH_raw, endM] = pattern.endTime.split(':').map(Number);
        let endH = (endM > 0) ? endH_raw + 1 : endH_raw;
        
        let displayStart = startH;
        let displayDuration = endH - startH;

        if (pattern.crossesMidnight) {
            displayDuration = 24 - startH;
        }

        group.rows.push({
          staff: staff,
          pattern: pattern,
          isSupport: false, 
          startHour: displayStart,
          duration: displayDuration,
          assignmentId: 9000 + index, // ★★★ 修正: 衝突しない一時ID (インデックス) ★★★
          unitId: newAssignment.unitId,
          isNew: true, // ★★★ 修正: 新規の行 ★★★
        });
      }
    });
    
    return updatedGroups;

  }, [unitGroups, pendingChanges, pendingAdditions, patternMap, target, allStaffMap]); // ★ 依存配列に pendingAdditions, allStaffMap を追加

  // ★★★ v5.101 で追加した demandMap の useMemo を削除 ★★★

  // ★★★ ローカルのデマンドマップ (pendingChanges と pendingAdditions を反映) ★★★
  const localDemandMap = useMemo(() => {
    if (!target) return demandMap; 
    
    // 1. props の demandMap (DBベース) をディープコピー
    const newDemandMap = new Map<string, { required: number; actual: number }>();
    demandMap.forEach((value, key) => {
      newDemandMap.set(key, { ...value });
    });

    // 2. pendingChanges (変更) を反映 (減算 -> 加算)
    pendingChanges.forEach((newAssignment) => {
      const staff = allStaffMap.get(newAssignment.staffId);
      if (staff && staff.status === 'OnLeave') return; 

      const newPattern = patternMap.get(newAssignment.patternId);
      if (!newPattern || newPattern.workType !== 'Work' || !newAssignment.unitId) return;

      const originalAssignment = allAssignmentsMap.get(newAssignment.id!);
      if (!originalAssignment) return; 
      
      const oldPattern = patternMap.get(originalAssignment.patternId);
      
      // 減算ロジック (変更なし)
      if (originalAssignment.unitId && oldPattern && oldPattern.workType === 'Work') {
        const startTime = parseInt(oldPattern.startTime.split(':')[0]);
        const [endH, endM] = oldPattern.endTime.split(':').map(Number);
        const endTime = (endM > 0) ? endH + 1 : endH;

        if (!oldPattern.crossesMidnight) {
          for (let hour = startTime; hour < endTime; hour++) { 
            const key = `${originalAssignment.date}_${originalAssignment.unitId}_${hour}`;
            const entry = newDemandMap.get(key);
            if (entry) entry.actual = Math.max(0, entry.actual - 1); 
          }
        } else {
          for (let hour = startTime; hour < 24; hour++) {
            const key = `${originalAssignment.date}_${originalAssignment.unitId}_${hour}`;
            const entry = newDemandMap.get(key);
            if (entry) entry.actual = Math.max(0, entry.actual - 1);
          }
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
      
      // 加算ロジック (変更なし)
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
        for (let hour = startTime; hour < 24; hour++) {
          const key = `${newAssignment.date}_${newAssignment.unitId}_${hour}`;
          const entry = newDemandMap.get(key);
          if (entry) entry.actual += 1;
        }
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

    // 3. pendingAdditions (新規追加) を反映 (加算のみ)
    pendingAdditions.forEach((newAssignment) => {
      const staff = allStaffMap.get(newAssignment.staffId);
      if (staff && staff.status === 'OnLeave') return; 

      const newPattern = patternMap.get(newAssignment.patternId);
      if (!newPattern || newPattern.workType !== 'Work' || !newAssignment.unitId) return;
      
      // 加算ロジック (上記と同じ)
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
        for (let hour = startTime; hour < 24; hour++) {
          const key = `${newAssignment.date}_${newAssignment.unitId}_${hour}`;
          const entry = newDemandMap.get(key);
          if (entry) entry.actual += 1;
        }
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
    
    return newDemandMap;

  }, [demandMap, pendingChanges, pendingAdditions, allAssignmentsMap, patternMap, allStaffMap, target]); // ★ 依存配列に pendingAdditions を追加


  // ★★★ 新規追加: アサイン可能なスタッフリスト (その日にまだ勤務アサインがない) ★★★
  const availableStaffForAdding = useMemo(() => {
    // ★★★ 修正: addingToUnitId が null（フォーム非表示）なら計算しない ★★★
    if (!target || !addingToUnitId) return [];
    
    // その日に勤務(Work)アサインが既にあるスタッフのIDセット
    const assignedStaffIds = new Set<string>();
    allAssignments.forEach(a => {
      if (a.date === target.date) {
        const p = patternMap.get(a.patternId);
        if (p && p.workType === 'Work') {
          assignedStaffIds.add(a.staffId);
        }
      }
    });

    // 既にローカルで追加(pending)されたスタッフも除外
    pendingAdditions.forEach(a => {
        assignedStaffIds.add(a.staffId);
    });

    return allStaff
      .filter(s => {
        // 条件1: アサイン済みでなく、アクティブであること
        const isAvailable = s.status === 'Active' && !assignedStaffIds.has(s.staffId);
        if (!isAvailable) return false;
        
        // ★★★ 修正: 条件2: 現在のユニット所属か、所属無しか ★★★
        const isMatchingUnit = (s.unitId === addingToUnitId) || (s.unitId === null);
        return isMatchingUnit;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

  // ★★★ 修正: 依存配列に addingToUnitId を追加 ★★★
  }, [allStaff, allAssignments, pendingAdditions, target, patternMap, addingToUnitId]);

  // ★★★ 新規追加: 選択中のスタッフが可能な勤務パターンリスト ★★★
  const availablePatternsForSelectedStaff = useMemo(() => {
    if (!selectedStaffId) return [];
    const staff = allStaffMap.get(selectedStaffId);
    if (!staff) return [];
    
    return workPatterns.filter(p => staff.availablePatternIds.includes(p.patternId));

  }, [selectedStaffId, allStaffMap, workPatterns]);


  // ★★★ 修正: モーダルが閉じる/対象が変わる時に State をすべてリセット ★★★
  useEffect(() => {
    setPendingChanges(new Map());
    setPendingAdditions([]); // ★ 追加
    setAddingToUnitId(null); // ★ 追加
    setSelectedStaffId(""); // ★ 追加
    setSelectedPatternId(""); // ★ 追加
    setIsDragging(false);
    setDraggingRow(null);
    setDragPreview(null);
  }, [target]);

  // (updatePendingChanges - 変更なし)
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

  
  // ★★★ 新規追加: `pendingAdditions` を変更するためのハンドラ ★★★
  const modifyPendingAddition = useCallback((index: number, newPattern: IShiftPattern) => {
    setPendingAdditions(prevAdditions => {
      // 不変性(immutability)を保つために配列をコピー
      const newAdditions = [...prevAdditions];
      const itemToModify = newAdditions[index];

      if (itemToModify) {
        // アイテムを更新
        newAdditions[index] = {
          ...itemToModify,
          patternId: newPattern.patternId,
          // unitId と date, staffId は変更しない
        };
      }
      return newAdditions;
    });
  }, []); // 依存配列なし


  // ★★★ 修正: handleBarClick が `isNew` フラグを見るように変更 ★★★
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

    const currentPatternId = clickedRow.pattern.patternId; // ★ 修正: ローカルstateではなく描画されている行のパターンIDを見る
    const currentIndex = availablePatternsAtTime.findIndex(p => p.patternId === currentPatternId);
    
    const nextIndex = (currentIndex + 1) % availablePatternsAtTime.length;
    const nextPattern = availablePatternsAtTime[nextIndex];
    
    if (nextPattern.patternId === currentPatternId && availablePatternsAtTime.length === 1) return;

    // ★★★ 修正: isNew フラグで分岐 ★★★
    if (clickedRow.isNew) {
      const index = clickedRow.assignmentId - 9000; // 一時IDからインデックスを復元
      modifyPendingAddition(index, nextPattern);
    } else {
      updatePendingChanges(clickedRow.assignmentId, staff, nextPattern);
    }
  };

  // (handleDragStart - 変更なし)
  const handleDragStart = (e: MouseEvent, row: GanttRowData) => {
    if (e.button !== 0) return; 
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDraggingRow(row);
    document.body.style.cursor = 'grabbing'; 
  };
  
  // (handleDragMove - 変更なし)
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
  
  // ★★★ 修正: handleDragEnd が `isNew` フラグを見るように変更 ★★★
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
      // ★★★ 修正: isNew フラグで分岐 ★★★
      if (draggingRow.isNew) {
        const index = draggingRow.assignmentId - 9000; // 一時IDからインデックスを復元
        modifyPendingAddition(index, dragPreview.pattern);
      } else {
        updatePendingChanges(
          draggingRow.assignmentId, 
          draggingRow.staff, 
          dragPreview.pattern
        );
      }
    }

    setIsDragging(false);
    setDraggingRow(null);
    setDragPreview(null);
    document.body.style.cursor = 'default';
  };
  
  // ★★★ 新規追加: インラインフォームの表示ハンドラ ★★★
  const handleShowAddForm = (unitId: string) => {
    setAddingToUnitId(unitId);
    setSelectedStaffId("");
    setSelectedPatternId("");
  };

  // ★★★ 新規追加: インラインフォームの「追加」実行ハンドラ ★★★
  const handleAddAssignment = () => {
    if (!target || !addingToUnitId || !selectedStaffId || !selectedPatternId) return;
    
    const newAssignment: Omit<IAssignment, 'id'> = {
      date: target.date,
      staffId: selectedStaffId,
      patternId: selectedPatternId,
      unitId: addingToUnitId, // ★ フォームを開いたユニットのID
      locked: true, // ★ 手動追加はロック
    };
    
    setPendingAdditions(prev => [...prev, newAssignment]);
    
    // フォームを閉じる
    setAddingToUnitId(null);
    setSelectedStaffId("");
    setSelectedPatternId("");
  };

  // ★★★ 修正: DB保存ロジック (pendingAdditions も保存) ★★★
  const handleConfirmChanges = async () => {
    if (pendingChanges.size === 0 && pendingAdditions.length === 0) {
      onClose(); 
      return;
    }
    
    try {
      // 1. 変更分 (Update)
      if (pendingChanges.size > 0) {
        const changesToSave = Array.from(pendingChanges.values());
        await db.assignments.bulkPut(changesToSave);
      }
      
      // 2. 新規追加分 (Create)
      if (pendingAdditions.length > 0) {
        await db.assignments.bulkAdd(pendingAdditions);
      }
      
      const allAssignmentsFromDB = await db.assignments.toArray();
      // ★ `setAssignments` は履歴に積まれる
      dispatch(setAssignments(allAssignmentsFromDB));
      
      onClose(); 
      
    } catch (e) {
      console.error("アサインの一括更新/追加に失敗:", e);
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
                      {/* ★★★ 修正: ボタンを削除 ★★★ */}
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

                  {/* ★★★ 修正: インラインフォームを削除 ★★★ */}


                  {/* スタッフ行 */}
                  {group.rows.length === 0 ? (
                    <p style={styles.italicPlaceholder}>
                      アサインなし
                    </p>
                  ) : (
                    // ★★★ 修正: row.assignmentId をキーに設定 ★★★
                    group.rows.map((row) => ( 
                      <div key={row.assignmentId} style={{ // ★★★ 修正 ★★★
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

                  {/* ★★★ 修正: 「+」ボタンとフォームをこの位置（スタッフ行の後）に移動 ★★★ */}
                  {addingToUnitId === group.unit.unitId ? (
                    // (フォーム表示)
                    <div style={inlineFormStyles.container}>
                      <select 
                        style={inlineFormStyles.selectStaff} // ★ 修正: インデント付きスタイル
                        value={selectedStaffId}
                        onChange={(e) => {
                          setSelectedStaffId(e.target.value);
                          setSelectedPatternId(""); 
                        }}
                      >
                        <option value="">(1. スタッフを選択)</option>
                        {availableStaffForAdding.map(staff => (
                          <option key={staff.staffId} value={staff.staffId}>
                            {staff.name}
                          </option>
                        ))}
                      </select>
                      
                      <select
                        style={inlineFormStyles.select}
                        value={selectedPatternId}
                        onChange={(e) => setSelectedPatternId(e.target.value)}
                        disabled={!selectedStaffId} 
                      >
                        <option value="">(2. 勤務パターンを選択)</option>
                        {availablePatternsForSelectedStaff.map(pattern => (
                          <option key={pattern.patternId} value={pattern.patternId}>
                            {pattern.name} ({pattern.startTime}-{pattern.endTime})
                          </option>
                        ))}
                      </select>
                      
                      <button
                        style={(!selectedStaffId || !selectedPatternId) ? inlineFormStyles.buttonDisabled : inlineFormStyles.button}
                        onClick={handleAddAssignment}
                        disabled={!selectedStaffId || !selectedPatternId}
                      >
                        追加
                      </button>
                      <button
                        style={inlineFormStyles.buttonCancel}
                        onClick={() => setAddingToUnitId(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    // (「+」ボタン表示)
                    <div style={inlineFormStyles.addButtonContainer}>
                      <button
                        style={inlineFormStyles.addButton}
                        onClick={() => handleShowAddForm(group.unit.unitId)}
                      >
                        +
                      </button>
                    </div>
                  )}
                  {/* ★★★ 修正ここまで ★★★ */}

                </div>
              ))}

            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div style={styles.actions}>
          {/* ★★★ 修正: pendingAdditions のチェックも追加 ★★★ */}
          {pendingChanges.size === 0 && pendingAdditions.length === 0 ? (
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