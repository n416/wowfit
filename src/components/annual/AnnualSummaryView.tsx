import React, { CSSProperties, useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableRow, Box, Tooltip, Chip
} from '@mui/material';
import { TableVirtuoso, TableComponents } from 'react-virtuoso';
import { IStaff } from '../../db/dexie';
import { GridSelection } from '../../hooks/useGridSelection';

// ... (型定義、定数、stylesは変更なし)
export type AnnualRowType = 'header' | 'data';

export interface AnnualEvent {
  type: 'Grant' | 'Expire' | 'Adjustment';
  days: number;
}

export interface AnnualRowData {
  id: string;
  type: AnnualRowType;
  staff?: IStaff;
  label: string;
  monthlyValues: number[];
  monthlyEvents?: (AnnualEvent | null)[];
  totalValue: number;
  isFirstOfUnit?: boolean;
  isInteractive?: boolean;
}

interface AnnualSummaryViewProps {
  rows: AnnualRowData[];
  months: number[];
  title: string;
  normalizedSelection: { minR: number, maxR: number, minC: number, maxC: number } | null;
  selection: GridSelection | null;
  onMouseDown: (r: number, c: number) => void;
  onMouseEnter: (r: number, c: number) => void;
  onTouchStart: (e: React.TouchEvent) => void; // ★ 変更: 引数をEventに
  onTouchMove: (e: React.TouchEvent) => void;
  onCellClick?: (r: number, c: number, row: AnnualRowData) => void;
  scrollerRef: React.MutableRefObject<HTMLElement | null>;
}

const MIN_COL_WIDTH = 70;
const LEFT_COL_WIDTH = 220;
const TOTAL_COL_WIDTH = 80;
const ROW_HEIGHT = 36;
const BORDER_COLOR = '#e0e0e0';
const CELL_BORDER = `1px solid ${BORDER_COLOR}`;

const HEADER_ROW_INDEX = -1;
const LEFT_COL_INDEX = -1;
const TOTAL_COL_INDEX = 12;

const styles: { [key: string]: CSSProperties } = {
  table: {
    borderCollapse: 'separate',
    borderSpacing: 0,
    tableLayout: 'fixed',
    borderTop: CELL_BORDER,
    borderLeft: CELL_BORDER
  },
  th: {
    padding: 0,
    borderBottom: CELL_BORDER,
    borderRight: CELL_BORDER,
    backgroundColor: '#fff',
    position: 'sticky',
    top: 0,
    zIndex: 40,
    textAlign: 'center',
    fontWeight: 'bold',
    height: 'auto',
    boxSizing: 'border-box',
    display: 'table-cell',
    verticalAlign: 'middle',
    userSelect: 'none',
  },
  td: {
    padding: 0,
    borderBottom: CELL_BORDER,
    borderRight: CELL_BORDER,
    verticalAlign: 'middle',
    height: `${ROW_HEIGHT}px`,
    textAlign: 'center',
    boxSizing: 'border-box',
    display: 'table-cell',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    userSelect: 'none', 
    position: 'relative',
  },
  stickyCell: {
    position: 'sticky',
    left: 0,
    backgroundColor: '#fff',
    zIndex: 30,
    textAlign: 'left',
    borderRight: '2px solid #ccc',
    width: `${LEFT_COL_WIDTH}px`,
    minWidth: `${LEFT_COL_WIDTH}px`,
    maxWidth: `${LEFT_COL_WIDTH}px`,
    userSelect: 'none',
  },
  staffHeaderRow: {
    backgroundColor: '#f5f5f5',
    fontWeight: 'bold',
    paddingLeft: '8px',
    color: '#333',
  },
  dataLabel: {
    paddingLeft: '24px',
    color: '#666',
  },
  cellSelectable: {
    cursor: 'cell',
  },
  totalCell: {
    fontWeight: 'bold',
    backgroundColor: '#fafafa',
    color: '#1976d2',
    borderLeft: '2px solid #ccc',
    width: `${TOTAL_COL_WIDTH}px`,
    minWidth: `${TOTAL_COL_WIDTH}px`,
    maxWidth: `${TOTAL_COL_WIDTH}px`,
    userSelect: 'none',
  }
};

const ScrollerWithOverlay = React.forwardRef<HTMLDivElement, any>((props, ref) => (
  <div {...props} ref={ref} style={{ ...props.style, position: 'relative' }}>
    {props.children}
    <div id="annual-selection-overlay" style={{
      position: 'absolute',
      pointerEvents: 'none',
      backgroundColor: 'rgba(25, 118, 210, 0.2)',
      border: '2px solid #1976d2',
      zIndex: 50,
      display: 'none',
      transition: 'none',
      boxSizing: 'border-box'
    }} />
  </div>
));

const VirtuosoTableComponents: TableComponents<any> = {
  Scroller: ScrollerWithOverlay,
  Table: (props) => <Table {...props} style={styles.table} />,
  TableHead: React.forwardRef((props, ref) => <TableHead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 40 }} />),
  TableRow: TableRow,
  TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
};

export default function AnnualSummaryView({ 
  rows, months, title, 
  normalizedSelection, selection, 
  onMouseDown, onMouseEnter, onTouchStart, onTouchMove,
  onCellClick, 
  scrollerRef
}: AnnualSummaryViewProps) {
  
  const [headerHeight, setHeaderHeight] = useState(ROW_HEIGHT);
  const [colWidth, setColWidth] = useState(MIN_COL_WIDTH);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const onMouseDownRef = useRef(onMouseDown);
  const onMouseEnterRef = useRef(onMouseEnter);
  // ★ 削除: onTouchStartRef は不要になりました
  const onCellClickRef = useRef(onCellClick);
  const mouseDownCoordsRef = useRef<{r: number, c: number} | null>(null);

  useEffect(() => {
    onMouseDownRef.current = onMouseDown;
    onMouseEnterRef.current = onMouseEnter;
    onCellClickRef.current = onCellClick;
  }, [onMouseDown, onMouseEnter, onCellClick]);

  // ... (ResizeObserver, 自動スクロール, コンテナ幅監視, オーバーレイ描画 は変更なし)
  const setHeaderRowRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) {
      if (observerRef.current) observerRef.current.disconnect();
      const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
          const height = entry.target.getBoundingClientRect().height;
          setHeaderHeight(prev => Math.abs(prev - height) > 0.5 ? height : prev);
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    } else {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!selection || !scrollerRef.current) return;
    const { r, c } = selection.end;
    const container = scrollerRef.current;
    const targetTop = (r === -1) ? 0 : headerHeight + (r * ROW_HEIGHT);
    const targetBottom = (r === -1) ? headerHeight : targetTop + ROW_HEIGHT;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const stickyHeaderHeight = headerHeight;
    if (targetTop < scrollTop + stickyHeaderHeight) {
      container.scrollTop = targetTop - stickyHeaderHeight;
    } else if (targetBottom > scrollTop + clientHeight) {
      container.scrollTop = targetBottom - clientHeight;
    }
    const getLeft = (idx: number) => {
      if (idx === -1) return 0;
      if (idx <= 11) return LEFT_COL_WIDTH + (idx * colWidth);
      return LEFT_COL_WIDTH + (12 * colWidth);
    };
    const getWidth = (idx: number) => {
      if (idx === -1) return LEFT_COL_WIDTH;
      if (idx <= 11) return colWidth;
      return TOTAL_COL_WIDTH;
    };
    const targetLeft = getLeft(c);
    const targetRight = targetLeft + getWidth(c);
    const scrollLeft = container.scrollLeft;
    const clientWidth = container.clientWidth;
    const stickyLeftWidth = LEFT_COL_WIDTH;
    if (c !== -1) {
      if (targetLeft < scrollLeft + stickyLeftWidth) {
        container.scrollLeft = targetLeft - stickyLeftWidth;
      } else if (targetRight > scrollLeft + clientWidth) {
        container.scrollLeft = targetRight - clientWidth;
      }
    }
  }, [selection, colWidth, headerHeight, scrollerRef]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateColWidth = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth; 
      const availableWidth = containerWidth - LEFT_COL_WIDTH - TOTAL_COL_WIDTH;
      const newColWidth = Math.max(MIN_COL_WIDTH, Math.floor(availableWidth / 12));
      setColWidth(newColWidth);
    };
    const observer = new ResizeObserver(updateColWidth);
    observer.observe(containerRef.current);
    updateColWidth();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const overlay = document.getElementById('annual-selection-overlay');
    if (!overlay) return;
    if (!normalizedSelection) {
      overlay.style.display = 'none';
      return;
    }
    const { minR, maxR, minC, maxC } = normalizedSelection;
    const top = (minR === HEADER_ROW_INDEX) ? 0 : headerHeight + (minR * ROW_HEIGHT);
    let height = 0;
    if (minR === HEADER_ROW_INDEX) {
        height += headerHeight;
        if (maxR >= 0) {
            height += (maxR + 1) * ROW_HEIGHT;
        }
    } else {
        height = (maxR - minR + 1) * ROW_HEIGHT;
    }
    const getLeftPos = (colIndex: number) => {
      if (colIndex === LEFT_COL_INDEX) return 0;
      if (colIndex <= 11) return LEFT_COL_WIDTH + (colIndex * colWidth);
      return LEFT_COL_WIDTH + (12 * colWidth); 
    };
    const startLeft = getLeftPos(minC);
    let width = 0;
    for (let c = minC; c <= maxC; c++) {
        if (c === LEFT_COL_INDEX) width += LEFT_COL_WIDTH;
        else if (c === TOTAL_COL_INDEX) width += TOTAL_COL_WIDTH;
        else width += colWidth;
    }
    overlay.style.display = 'block';
    overlay.style.top = `${top}px`;
    overlay.style.left = `${startLeft}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
  }, [normalizedSelection, headerHeight, colWidth]);

  const bindHeaderEvents = (c: number) => ({
    onMouseDown: () => {
      mouseDownCoordsRef.current = { r: HEADER_ROW_INDEX, c };
      onMouseDownRef.current(HEADER_ROW_INDEX, c);
    },
    onMouseEnter: () => onMouseEnterRef.current(HEADER_ROW_INDEX, c),
    // ★ 削除: onTouchStart
    'data-r': HEADER_ROW_INDEX,
    'data-c': c
  });

  const fixedHeaderContent = () => (
    <TableRow 
      id="annual-header-row" 
      style={{ height: 'auto' }}
      ref={setHeaderRowRef} 
    >
      <TableCell 
        style={{ ...styles.th, ...styles.stickyCell, zIndex: 50, cursor: 'cell', height: 'auto' }}
        {...bindHeaderEvents(LEFT_COL_INDEX)}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1, whiteSpace: 'normal', lineHeight: 1.2 }}>
          <span>{title}</span>
        </Box>
      </TableCell>
      {months.map((m, i) => (
        <TableCell 
          key={`${i}-${m}`} 
          style={{ ...styles.th, width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: `${colWidth}px`, cursor: 'cell', height: 'auto' }}
          {...bindHeaderEvents(i)}
        >
          {m}月
        </TableCell>
      ))}
      <TableCell 
        style={{ ...styles.th, ...styles.totalCell, cursor: 'cell', height: 'auto' }}
        {...bindHeaderEvents(TOTAL_COL_INDEX)}
      >
        合計
      </TableCell>
    </TableRow>
  );

  const itemContent = useCallback((index: number, row: AnnualRowData) => {
    const borderTopStyle = row.isFirstOfUnit ? '3px double #666' : CELL_BORDER;
    const rowStyle: CSSProperties = { height: `${ROW_HEIGHT}px` };

    const bindCellEvents = (c: number) => ({
      onMouseDown: () => {
        mouseDownCoordsRef.current = { r: index, c };
        onMouseDownRef.current(index, c);
      },
      onMouseEnter: () => onMouseEnterRef.current(index, c),
      // ★ 削除: onTouchStart
      onMouseUp: (e: React.MouseEvent) => {
        if (mouseDownCoordsRef.current?.r === index && mouseDownCoordsRef.current?.c === c) {
          if (row.isInteractive && c >= 0 && c <= 11 && onCellClickRef.current) {
            e.stopPropagation();
            onCellClickRef.current(index, c, row);
          }
        }
        mouseDownCoordsRef.current = null;
      },
      'data-r': index,
      'data-c': c
    });

    if (row.type === 'header') {
      return (
        <>
          <TableCell 
            style={{ 
              ...styles.td, ...styles.stickyCell, ...styles.staffHeaderRow, 
              ...rowStyle, borderTop: borderTopStyle, cursor: 'cell'
            }}
            {...bindCellEvents(LEFT_COL_INDEX)}
          >
             {row.staff?.name} <span style={{ fontSize:'0.75rem', fontWeight:'normal', color:'#666' }}>({row.staff?.unitId || '-'})</span>
          </TableCell>
          {Array.from({ length: 12 }).map((_, i) => (
             <TableCell 
               key={i} 
               style={{ ...styles.td, backgroundColor: '#f5f5f5', borderTop: borderTopStyle, cursor: 'cell' }}
               {...bindCellEvents(i)}
             />
          ))}
          <TableCell 
            style={{ ...styles.td, backgroundColor: '#f5f5f5', borderLeft: '2px solid #ccc', borderTop: borderTopStyle, cursor: 'cell' }} 
            {...bindCellEvents(TOTAL_COL_INDEX)}
          />
        </>
      );
    }

    return (
      <>
        <TableCell 
          style={{ 
            ...styles.td, ...styles.stickyCell, ...styles.dataLabel, 
            ...rowStyle, borderTop: borderTopStyle, cursor: 'cell'
          }}
          {...bindCellEvents(LEFT_COL_INDEX)}
        >
          {row.label}
        </TableCell>

        {row.monthlyValues.map((val, mIdx) => {
          const event = row.monthlyEvents ? row.monthlyEvents[mIdx] : null;
          return (
            <TableCell 
              key={mIdx} 
              style={{ 
                ...styles.td, ...styles.cellSelectable, 
                ...rowStyle, borderTop: borderTopStyle,
                backgroundColor: row.isInteractive ? '#f8fbff' : 'inherit',
                cursor: row.isInteractive ? 'pointer' : 'cell'
              }}
              {...bindCellEvents(mIdx)}
            >
              {val > 0 || row.isInteractive ? val : <span style={{color: '#eee'}}>-</span>}
              
              {event && (
                <Tooltip title={event.type === 'Grant' ? `+${event.days} (付与)` : `${event.days} (消滅)`}>
                  <Chip 
                    label={event.type === 'Grant' ? `+${event.days}` : event.days} 
                    size="small"
                    color={event.type === 'Grant' ? 'success' : 'error'}
                    sx={{ 
                      position: 'absolute', top: 1, right: 1, 
                      height: 14, fontSize: '0.6rem',
                      '& .MuiChip-label': { px: 0.5 }
                    }}
                  />
                </Tooltip>
              )}
            </TableCell>
          );
        })}

        <TableCell 
          style={{ 
            ...styles.td, ...styles.totalCell, 
            ...rowStyle, borderTop: borderTopStyle, cursor: 'cell'
          }}
          {...bindCellEvents(TOTAL_COL_INDEX)}
        >
          {row.totalValue}
        </TableCell>
      </>
    );
  }, []); 

  const tableWidth = LEFT_COL_WIDTH + (12 * colWidth) + TOTAL_COL_WIDTH;

  return (
    <Box 
      ref={containerRef}
      sx={{ flex: 1, minHeight: 0, height: '100%', touchAction: 'none' }}
      onTouchMove={onTouchMove}
      onTouchStart={onTouchStart} // ★ 追加: コンテナで受け取る
    >
      <TableVirtuoso
        scrollerRef={(ref) => {
          if (ref instanceof HTMLElement) {
            scrollerRef.current = ref;
          }
        }}
        style={{ height: '100%', border: '1px solid #e0e0e0', borderRadius: '4px' }}
        data={rows}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={itemContent}
        components={{
          ...VirtuosoTableComponents,
          Table: (props) => <Table {...props} style={{ ...styles.table, width: `${tableWidth}px` }} />,
        }}
        overscan={20} 
      />
    </Box>
  );
}