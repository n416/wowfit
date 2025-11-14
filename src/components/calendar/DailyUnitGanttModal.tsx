import { CSSProperties } from 'react'; // ★ v5.44 修正: React, useMemo 削除
// ★★★ v5.35 修正: MUIの import をすべて削除 ★★★
import { IStaff, IShiftPattern, IUnit } from '../../db/dexie';

// ★★★ v5.36 追加: ShiftCalendarPage から渡される unitGroups の型定義 ★★★
type UnitGroupData = {
  unit: IUnit;
  rows: { 
    staff: IStaff; 
    pattern: IShiftPattern; 
    isSupport: boolean; 
    startHour: number;
    duration: number; 
  }[];
};

interface DailyUnitGanttModalProps {
  target: { date: string; unitId: string } | null;
  onClose: () => void;
  
  // ★★★ v5.44 修正: v5.36の修正漏れ。unitGroups を受け取るため、以下は不要
  // allStaff: IStaff[];
  // allPatterns: IShiftPattern[];
  // allUnits: IUnit[];
  // allAssignments: IAssignment[];
  
  // ★★★ v5.35 追加: demandMap を prop で受け取る ★★★
  demandMap: Map<string, { required: number; actual: number }>;
  // ★★★ v5.36 追加: unitGroups を prop で受け取る ★★★
  unitGroups: UnitGroupData[];
}

// ★★★ v5.35 追加: 標準HTML用のスタイル定義 ★★★
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
    padding: '0 24px 24px 24px', // DailyUnitGanttModalの元の sx={{ overflowX: 'auto', pb: 2 }} に合わせる
  },
  contentInnerScroll: {
    overflowX: 'auto',
    paddingBottom: '16px', // pb: 2
  },
  actions: {
    padding: '16px 24px',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  button: {
    padding: '6px 16px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#1976d2', // primary.main
    textTransform: 'uppercase',
  },

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
    boxSizing: 'border-box', // ★ v5.33 (v5.34) のバグ修正
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
    width: '100%', // CHART_WIDTHはminWidthで指定
    height: '16px',
    border: '1px solid #e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  statusBarBlock: {
    flexShrink: 0,
    boxSizing: 'border-box', // ★ v5.33 (v5.34) のバグ修正
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
    // width: 1 (v5.34バグ) は削除
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


export default function DailyUnitGanttModal({ 
  target, onClose, 
  // ★★★ v5.44 修正: 未使用のprops (allStaff等) を削除 ★★★
  // allStaff, allPatterns, allUnits, allAssignments,
  demandMap,
  unitGroups
}: DailyUnitGanttModalProps) {

  // ガントチャートの定数
  const HOUR_WIDTH = 30; 
  const CHART_WIDTH = HOUR_WIDTH * 24; 
  const ROW_HEIGHT = 40; // style.staffRow.height にも適用

  // ★★★ v5.35 修正: demandStatusMap の計算ロジック (v5.27) を削除 ★★★
  /*
  const demandStatusMap = useMemo(() => {
    // ... (v5.27の3パスロジック) ...
  }, [target, allUnits, allAssignments, allPatterns]);
  */

  // ★★★ v5.36 修正: unitGroups の計算ロジック (v5.28) を削除 ★★★
  /*
  const unitGroups = useMemo(() => {
    // ... (v5.28のロジック) ...
  }, [target, allAssignments, allPatterns, allStaff, allUnits]);
  */


  if (!target) return null;

  // ★★★ v5.35 修正: MUI Dialog を標準HTML/CSSに置換 ★★★
  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          {target.date} 詳細タイムライン
        </div>
        
        {/* Content */}
        <div style={styles.content}>
          <div style={styles.contentInnerScroll}>
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

              {/* ユニットごとのブロック */}
              {unitGroups.map((group, groupIndex) => (
                <div key={group.unit.unitId} style={groupIndex > 0 ? styles.unitBlock : styles.firstUnitBlock}>
                  
                  {/* ステータスバー行 */}
                  <div style={styles.statusBarRow}>
                    <div style={styles.unitNameCell}>
                      {group.unit.name}
                    </div>
                    <div style={{ ...styles.statusBarContainer, width: CHART_WIDTH }}>
                      {Array.from({ length: 24 }).map((_, h) => {
                        // ★★★ v5.35 修正: demandStatusMap を demandMap に変更 ★★★
                        // const key = `${group.unit.unitId}_${h}`;
                        // ★★★ v5.36 修正: demandMap から target.date を使ってキーを再構築 ★★★
                        // (demandMapは全日分、targetは特定日のみ)
                        const dailyKey = `${target.date}_${group.unit.unitId}_${h}`;
                        const status = demandMap.get(dailyKey);
                        
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
                    group.rows.map((row, i) => (
                      <div key={i} style={{
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

                        <div style={{ ...styles.chartArea, width: CHART_WIDTH }}>
                          {/* グリッド線 (v5.34バグ修正適用) */}
                          {Array.from({ length: 24 }).map((_, h) => (
                            <div key={h} style={{ 
                              ...styles.gridLine,
                              left: h * HOUR_WIDTH,
                            }} />
                          ))}

                          {/* シフトバー (v5.28バグ修正適用) */}
                          <div style={{
                            ...styles.shiftBar,
                            left: row.startHour * HOUR_WIDTH,
                            width: row.duration * HOUR_WIDTH,
                            backgroundColor: row.isSupport ? '#42a5f5' : (row.pattern.isNightShift ? '#757575' : '#81c784'), // (primary.light, grey[600], success.light)
                            opacity: row.isSupport ? 0.8 : 1
                          }}>
                            {row.pattern.name}
                          </div>
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
          <button onClick={onClose} style={styles.button}>閉じる</button>
        </div>
      </div>
    </div>
  );
}