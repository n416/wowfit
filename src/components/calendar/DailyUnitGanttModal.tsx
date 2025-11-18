import { CSSProperties, useState, useMemo, useRef, MouseEvent, useCallback, useEffect } from 'react'; 
// ★★★ 修正: Popover と Button をインポート ★★★
import { Popover, Button } from '@mui/material'; 
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
  // ★★★ 修正: 型定義を string | null に変更 ★★★
  target: { date: string; unitId: string | null; } | null;
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
    cursor: 'pointer', // ★★★ 修正: カーソルを追加 ★★★
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
    cursor: 'grab', // ★★★ 修正: 'pointer' -> 'grab' ★★★
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

  // ★★★ 新規追加: 「削除」を管理する State ★★★
  const [pendingDeletions, setPendingDeletions] = useState<number[]>([]); // DBのID (number) を保持
  const [deletingRow, setDeletingRow] = useState<GanttRowData | null>(null);
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<HTMLElement | null>(null);


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

  // ★★★ 修正: localUnitGroups (pendingDeletions も反映) ★★★
  const localUnitGroups = useMemo(() => {
    if (!target) return [];
    
    // ★ 0. 削除対象のIDセットを作成 (DB IDのみ)
    const deletionIdSet = new Set(pendingDeletions);
    
    // 1. props からの unitGroups (DBベース) に pendingChanges (変更) をマージ
    const updatedGroups = unitGroups.map(group => ({
      ...group,
      rows: group.rows
        // ★ 1A. 削除対象(DB)を除外
        .filter(row => !deletionIdSet.has(row.assignmentId)) 
        .map(row => {
          const change = pendingChanges.get(row.assignmentId);
          if (change) {
            const newPattern = patternMap.get(change.patternId);
            if (!newPattern) return row; 
            
            // ... (変更ロジック - 変更なし) ...
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
              isNew: false, 
            };
          }
          return { ...row, isNew: false }; 
        })
    }));

    // 2. pendingAdditions (新規追加) をマージ
    pendingAdditions.forEach((newAssignment, index) => {
      // ★ 2A. 削除対象(一時ID)を除外
      const tempId = 9000 + index;
      if (deletionIdSet.has(tempId)) return; // ★ この一時IDが削除対象ならスキップ

      const group = updatedGroups.find(g => g.unit.unitId === newAssignment.unitId);
      const staff = allStaffMap.get(newAssignment.staffId);
      const pattern = patternMap.get(newAssignment.patternId);
      
      if (group && staff && pattern) {
        // ... (追加ロジック - 変更なし) ...
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
          assignmentId: tempId, // ★★★ 修正: 衝突しない一時ID (インデックス) ★★★
          unitId: newAssignment.unitId,
          isNew: true, // ★★★ 修正: 新規の行 ★★★
        });
      }
    });
    
    return updatedGroups;

  // ★★★ 修正: 依存配列に pendingDeletions を追加 ★★★
  }, [unitGroups, pendingChanges, pendingAdditions, pendingDeletions, patternMap, target, allStaffMap]); 

  // ★★★ 修正: localDemandMap (pendingDeletions も反映) ★★★
  const localDemandMap = useMemo(() => {
    if (!target) return demandMap; 
    
    // ★ 0. 削除対象のIDセットを作成 (DB IDのみ)
    const deletionIdSet = new Set(pendingDeletions);

    // 1. props の demandMap (DBベース) をディープコピー
    const newDemandMap = new Map<string, { required: number; actual: number }>();
    demandMap.forEach((value, key) => {
      newDemandMap.set(key, { ...value });
    });

    // ★★★ 修正: 1B. 削除対象のアサインを「減算」する ★★★
    pendingDeletions.forEach(deletedId => {
      const originalAssignment = allAssignmentsMap.get(deletedId);
      if (!originalAssignment) return; // (pendingAdditions から削除された場合はここに来ない)
      
      const oldPattern = patternMap.get(originalAssignment.patternId);

      // 減算ロジック (pendingChangesの減算と同じ)
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
          // (日付またぎの減算ロジック)
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
    });

    // 2. pendingChanges (変更) を反映 (減算 -> 加算)
    pendingChanges.forEach((newAssignment) => {
      // ★ 変更対象が削除リストに入っていたらスキップ (ありえないはずだが念のため)
      if (deletionIdSet.has(newAssignment.id!)) return;
      
      // ... (減算・加算ロジック - 変更なし) ...
      const staff = allStaffMap.get(newAssignment.staffId);
      if (staff && staff.status === 'OnLeave') return; 
      const newPattern = patternMap.get(newAssignment.patternId);
      if (!newPattern || newPattern.workType !== 'Work' || !newAssignment.unitId) return;
      const originalAssignment = allAssignmentsMap.get(newAssignment.id!);
      if (!originalAssignment) return; 
      const oldPattern = patternMap.get(originalAssignment.patternId);
      // (減算ロジック)
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
      // (加算ロジック)
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
    pendingAdditions.forEach((newAssignment, index) => {
      // ★ 新規追加が削除リストに入っていたらスキップ
      const tempId = 9000 + index;
      if (deletionIdSet.has(tempId)) return;
      
      // ... (加算ロジック - 変更なし) ...
      const staff = allStaffMap.get(newAssignment.staffId);
      if (staff && staff.status === 'OnLeave') return; 
      const newPattern = patternMap.get(newAssignment.patternId);
      if (!newPattern || newPattern.workType !== 'Work' || !newAssignment.unitId) return;
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

  // ★★★ 修正: 依存配列に pendingDeletions を追加 ★★★
  }, [demandMap, pendingChanges, pendingAdditions, pendingDeletions, allAssignmentsMap, patternMap, allStaffMap, target]); 


  // (availableStaffForAdding - 変更なし)
  const availableStaffForAdding = useMemo(() => {
    if (!target || !addingToUnitId) return [];
    
    const assignedStaffIds = new Set<string>();
    allAssignments.forEach(a => {
      if (a.date === target.date) {
        const p = patternMap.get(a.patternId);
        if (p && p.workType === 'Work') {
          assignedStaffIds.add(a.staffId);
        }
      }
    });
    pendingAdditions.forEach(a => {
        assignedStaffIds.add(a.staffId);
    });

    return allStaff
      .filter(s => {
        const isAvailable = s.status === 'Active' && !assignedStaffIds.has(s.staffId);
        if (!isAvailable) return false;
        const isMatchingUnit = (s.unitId === addingToUnitId) || (s.unitId === null);
        return isMatchingUnit;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStaff, allAssignments, pendingAdditions, target, patternMap, addingToUnitId]);

  // (availablePatternsForSelectedStaff - 変更なし)
  const availablePatternsForSelectedStaff = useMemo(() => {
    if (!selectedStaffId) return [];
    const staff = allStaffMap.get(selectedStaffId);
    if (!staff) return [];
    
    return workPatterns.filter(p => staff.availablePatternIds.includes(p.patternId));
  }, [selectedStaffId, allStaffMap, workPatterns]);


  // (useEffect - ★★★ 修正: pendingDeletions もリセット ★★★)
  useEffect(() => {
    setPendingChanges(new Map());
    setPendingAdditions([]); 
    setPendingDeletions([]); // ★★★ 修正: 追加 ★★★
    setAddingToUnitId(null); 
    setSelectedStaffId(""); 
    setSelectedPatternId(""); 
    setDeletingRow(null); // ★★★ 修正: 追加 ★★★
    setPopoverAnchorEl(null); // ★★★ 修正: 追加 ★★★
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
      date: originalAssignment.date, 
      staffId: staff.staffId,
      patternId: newPattern.patternId,
      unitId: staff.unitId, 
      locked: true 
    };
    setPendingChanges(prev => new Map(prev).set(assignmentId, newAssignment));
  }, [target, allAssignmentsMap]);

  
  // (modifyPendingAddition - 変更なし)
  const modifyPendingAddition = useCallback((index: number, newPattern: IShiftPattern) => {
    setPendingAdditions(prevAdditions => {
      const newAdditions = [...prevAdditions];
      const itemToModify = newAdditions[index];
      if (itemToModify) {
        newAdditions[index] = {
          ...itemToModify,
          patternId: newPattern.patternId,
        };
      }
      return newAdditions;
    });
  }, []); 


  // ★★★ 修正: handleBarClick を「パターン切り替え」に戻す ★★★
  const handleBarClick = (e: MouseEvent, clickedRow: GanttRowData) => {
    e.stopPropagation(); 
    if (isDragging) return; // ドラッグ中は実行しない
    
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

    const currentPatternId = clickedRow.pattern.patternId;
    const currentIndex = availablePatternsAtTime.findIndex(p => p.patternId === currentPatternId);
    
    const nextIndex = (currentIndex + 1) % availablePatternsAtTime.length;
    const nextPattern = availablePatternsAtTime[nextIndex];
    
    if (nextPattern.patternId === currentPatternId && availablePatternsAtTime.length === 1) return;

    if (clickedRow.isNew) {
      const index = clickedRow.assignmentId - 9000; 
      modifyPendingAddition(index, nextPattern);
    } else {
      updatePendingChanges(clickedRow.assignmentId, staff, nextPattern);
    }
  };
  
  // ★★★ 新規追加: スタッフ名クリックで削除ポップオーバー表示 ★★★
  const handleStaffNameClick = (e: MouseEvent<HTMLElement>, clickedRow: GanttRowData) => {
    e.stopPropagation();
    if (isDragging) return;
    
    setDeletingRow(clickedRow);
    setPopoverAnchorEl(e.currentTarget);
  };
  
  // ★★★ 新規追加: 削除ポップオーバーを閉じる ★★★
  const handleCloseDeletePopover = () => {
    setDeletingRow(null);
    setPopoverAnchorEl(null);
  };

  // ★★★ 新規追加: 削除を実行する ★★★
  const handleDeleteAssignment = () => {
    if (!deletingRow) return;

    if (deletingRow.isNew) {
      // (1) 新規追加 (pendingAdditions) だった場合
      const index = deletingRow.assignmentId - 9000; // 一時IDからインデックスを復元
      setPendingAdditions(prev => prev.filter((_, i) => i !== index));
      // ★ 削除対象が変更リスト(pendingChanges)に残骸を残さないようにする (念のため)
      setPendingChanges(prev => {
        if (prev.has(deletingRow.assignmentId)) {
          const newMap = new Map(prev);
          newMap.delete(deletingRow.assignmentId);
          return newMap;
        }
        return prev;
      });
    } else {
      // (2) 既存 (DB) のアサインだった場合
      setPendingDeletions(prev => [...prev, deletingRow.assignmentId]);
      // ★ もし変更中(pendingChanges)だったら、それもキャンセルする
      setPendingChanges(prev => {
        if (prev.has(deletingRow.assignmentId)) {
          const newMap = new Map(prev);
          newMap.delete(deletingRow.assignmentId);
          return newMap;
        }
        return prev;
      });
    }

    handleCloseDeletePopover(); // ポップオーバーを閉じる
  };

  // (handleDragStart - 変更なし)
  const handleDragStart = (e: MouseEvent, row: GanttRowData) => {
    if (e.button !== 0) return; 
    handleCloseDeletePopover(); // ★ ドラッグ開始したらポップオーバーは閉じる
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
  
  // (handleDragEnd - 変更なし)
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
      if (draggingRow.isNew) {
        const index = draggingRow.assignmentId - 9000; 
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
  
  // (handleShowAddForm - 変更なし)
  const handleShowAddForm = (unitId: string) => {
    setAddingToUnitId(unitId);
    setSelectedStaffId("");
    setSelectedPatternId("");
  };

  // (handleAddAssignment - 変更なし)
  const handleAddAssignment = () => {
    if (!target || !addingToUnitId || !selectedStaffId || !selectedPatternId) return;
    const newAssignment: Omit<IAssignment, 'id'> = {
      date: target.date,
      staffId: selectedStaffId,
      patternId: selectedPatternId,
      unitId: addingToUnitId, 
      locked: true, 
    };
    setPendingAdditions(prev => [...prev, newAssignment]);
    setAddingToUnitId(null);
    setSelectedStaffId("");
    setSelectedPatternId("");
  };

  // ★★★ 修正: DB保存ロジック (pendingDeletions も保存) ★★★
  const handleConfirmChanges = async () => {
    if (pendingChanges.size === 0 && pendingAdditions.length === 0 && pendingDeletions.length === 0) {
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

      // 3. 削除分 (Delete)
      if (pendingDeletions.length > 0) {
        await db.assignments.bulkDelete(pendingDeletions);
      }
      
      const allAssignmentsFromDB = await db.assignments.toArray();
      // ★ `setAssignments` は履歴に積まれる
      dispatch(setAssignments(allAssignmentsFromDB));
      
      onClose(); 
      
    } catch (e) {
      console.error("アサインの一括更新/追加/削除に失敗:", e);
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
                        <div 
                          style={{
                            ...styles.staffNameCell,
                            backgroundColor: row.isSupport ? '#f0f7ff' : '#fff',
                          }}
                          // ★★★ 修正: onClick で削除ポップオーバーを開く ★★★
                          onClick={(e) => handleStaffNameClick(e, row)}
                        >
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
                            onClick={(e) => handleBarClick(e, row)} // ★★★ 修正: パターン切り替え ★★★
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
          {/* ★★★ 修正: pendingAdditions/pendingDeletions のチェックも追加 ★★★ */}
          {pendingChanges.size === 0 && pendingAdditions.length === 0 && pendingDeletions.length === 0 ? (
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

      {/* ★★★ 新規追加: 削除確認ポップオーバー ★★★ */}
      <Popover
        open={Boolean(popoverAnchorEl)}
        anchorEl={popoverAnchorEl}
        onClose={handleCloseDeletePopover}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        // (念のためモーダルより手前に表示)
        sx={{ zIndex: 1302 }} 
      >
        <div style={{ padding: '8px', display: 'flex', gap: '8px' }}>
          <Button 
            variant="contained" 
            color="error" 
            size="small"
            onClick={handleDeleteAssignment}
          >
            シフトを削除
          </Button>
          <Button 
            variant="outlined" 
            size="small"
            onClick={handleCloseDeletePopover}
          >
            キャンセル
          </Button>
        </div>
      </Popover>
      {/* ★★★ 新規追加ここまで ★★★ */}

    </div>
  );
}