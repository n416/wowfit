import React, { CSSProperties, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableRow, Box, Tooltip, Chip
} from '@mui/material';
import { TableVirtuoso, TableComponents } from 'react-virtuoso';
import { IStaff } from '../../db/dexie';
import { useGridInteraction, GridSelection } from '../../hooks/useGridInteraction';
import { useGridOverlayPosition, OverlayCalculator } from '../../hooks/useGridOverlayPosition';
import { SelectionOverlay } from '../common/SelectionOverlay';
import FloatingActionMenu from '../calendar/FloatingActionMenu';

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
  scrollerRef: React.MutableRefObject<HTMLElement | null>;
  onCellClick?: (r: number, c: number, row: AnnualRowData) => void;
  // clickMode: 'normal' | 'select'; // 前回のコードで追加しましたが、Props定義から漏れていましたら追加してください
  clickMode: 'normal' | 'select';
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

export default function AnnualSummaryView({ 
  rows, months, title, scrollerRef, onCellClick, clickMode
}: AnnualSummaryViewProps) {
  
  const [headerHeight, setHeaderHeight] = useState(ROW_HEIGHT);
  const [colWidth, setColWidth] = useState(MIN_COL_WIDTH);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const setHeaderRowRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) {
      const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
          const height = entry.target.getBoundingClientRect().height;
          setHeaderHeight(prev => Math.abs(prev - height) > 0.5 ? height : prev);
        }
      });
      observer.observe(node);
      return () => observer.disconnect();
    }
  }, []);

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

  const pointToGrid = useCallback((x: number, y: number) => {
    const scrollLeft = scrollerRef.current?.scrollLeft || 0;
    const scrollTop = scrollerRef.current?.scrollTop || 0;
    const contentX = x + scrollLeft;
    const contentY = y + scrollTop;

    if (contentX < LEFT_COL_WIDTH && contentY < headerHeight) return null;

    let r = -1;
    let c = -1;

    if (contentY < headerHeight) {
      r = -1; 
    } else {
      r = Math.floor((contentY - headerHeight) / ROW_HEIGHT);
    }

    if (contentX < LEFT_COL_WIDTH) {
      c = -1; 
    } else {
      c = Math.floor((contentX - LEFT_COL_WIDTH) / colWidth);
    }
    
    if (r >= rows.length) return null;
    if (c >= 12 + 1) return null;

    return { r, c };
  }, [headerHeight, colWidth, rows.length, scrollerRef]);

  const handleCopyRef = useRef<() => void>(() => {});

  // clearSelectionを受け取る
  const { containerProps, selection, isDraggingRef, clearSelection } = useGridInteraction({
    scrollerRef: scrollerRef as React.RefObject<HTMLElement | null>,
    converter: pointToGrid,
    maxRow: rows.length - 1,
    maxCol: 12,
    isEnabled: clickMode === 'select',
    onCopy: () => handleCopyRef.current(), 
  });

  useEffect(() => {
    if (clickMode === 'normal') {
      clearSelection();
    }
  }, [clickMode, clearSelection]);

  const handleCopy = useCallback(async () => {
    if (!selection || rows.length === 0) return;
    const minR = Math.min(selection.start.r, selection.end.r);
    const maxR = Math.max(selection.start.r, selection.end.r);
    const minC = Math.min(selection.start.c, selection.end.c);
    const maxC = Math.max(selection.start.c, selection.end.c);
    const tsvRows: string[] = [];
    
    if (minR === -1) { 
      const headerCells: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        if (c === -1) headerCells.push(title);
        else if (c === 12) headerCells.push("合計");
        else { const pm = months[c]; headerCells.push(`${pm}月`); }
      }
      tsvRows.push(headerCells.join('\t'));
    }
    const startR = Math.max(0, minR);
    for (let r = startR; r <= maxR; r++) {
      const rowData = rows[r];
      const rowCells: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        if (c === -1) {
          if (rowData.type === 'header') rowCells.push(`${rowData.staff?.name || ''} (${rowData.staff?.unitId || ''})`);
          else rowCells.push(rowData.label);
        } else if (c === 12) {
          rowCells.push(rowData.type === 'header' ? "" : String(rowData.totalValue));
        } else {
          if (rowData.type === 'header') rowCells.push("");
          else {
            const val = rowData.monthlyValues[c];
            rowCells.push(val > 0 ? String(val) : "0");
          }
        }
      }
      tsvRows.push(rowCells.join('\t'));
    }
    const text = tsvRows.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [selection, rows, months, title]);

  useEffect(() => { handleCopyRef.current = handleCopy; }, [handleCopy]);

  const calculateOverlay: OverlayCalculator = useCallback(({ minR, maxR, minC, maxC }) => {
    const top = (minR === -1) ? 0 : headerHeight + (minR * ROW_HEIGHT);
    let height = 0;
    if (minR === -1) {
        height += headerHeight;
        if (maxR >= 0) height += (maxR + 1) * ROW_HEIGHT;
    } else {
        height = (maxR - minR + 1) * ROW_HEIGHT;
    }

    const getLeftPos = (c: number) => {
      if (c === -1) return 0;
      if (c <= 11) return LEFT_COL_WIDTH + (c * colWidth);
      return LEFT_COL_WIDTH + (12 * colWidth); 
    };
    const startLeft = getLeftPos(minC);
    let width = 0;
    for (let c = minC; c <= maxC; c++) {
        if (c === -1) width += LEFT_COL_WIDTH;
        else if (c === 12) width += TOTAL_COL_WIDTH;
        else width += colWidth;
    }
    return { top, left: startLeft, width, height };
  }, [headerHeight, colWidth]);

  useGridOverlayPosition(overlayRef, selection, calculateOverlay);

  const getCellProps = (r: number, c: number, style: CSSProperties = {}) => ({
    'data-r': r,
    'data-c': c,
    onMouseUp: () => {
      if (!isDraggingRef.current && onCellClick && r >= 0) {
        if (rows[r]) onCellClick(r, c, rows[r]);
      }
    },
    style: { ...style, cursor: clickMode === 'normal' ? 'pointer' : 'cell' }
  });

  const fixedHeaderContent = () => (
    <TableRow id="annual-header-row" style={{ height: 'auto' }} ref={setHeaderRowRef}>
      <TableCell {...getCellProps(HEADER_ROW_INDEX, LEFT_COL_INDEX, { ...styles.th, ...styles.stickyCell, zIndex: 50 })}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1, whiteSpace: 'normal', lineHeight: 1.2 }}>
          <span>{title}</span>
        </Box>
      </TableCell>
      {months.map((m, i) => (
        <TableCell 
          key={`${i}-${m}`} 
          {...getCellProps(HEADER_ROW_INDEX, i, { ...styles.th, width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: `${colWidth}px` })}
        >
          {m}月
        </TableCell>
      ))}
      <TableCell {...getCellProps(HEADER_ROW_INDEX, TOTAL_COL_INDEX, { ...styles.th, ...styles.totalCell })}>
        合計
      </TableCell>
    </TableRow>
  );

  const itemContent = useCallback((index: number, row: AnnualRowData) => {
    const borderTopStyle = row.isFirstOfUnit ? '3px double #666' : CELL_BORDER;
    const rowStyle: CSSProperties = { height: `${ROW_HEIGHT}px` };

    if (row.type === 'header') {
      return (
        <>
          <TableCell {...getCellProps(index, LEFT_COL_INDEX, { ...styles.td, ...styles.stickyCell, ...styles.staffHeaderRow, ...rowStyle, borderTop: borderTopStyle })}>
             {row.staff?.name} <span style={{ fontSize:'0.75rem', fontWeight:'normal', color:'#666' }}>({row.staff?.unitId || '-'})</span>
          </TableCell>
          {Array.from({ length: 12 }).map((_, i) => (
             <TableCell key={i} {...getCellProps(index, i, { ...styles.td, backgroundColor: '#f5f5f5', borderTop: borderTopStyle })} />
          ))}
          <TableCell {...getCellProps(index, TOTAL_COL_INDEX, { ...styles.td, backgroundColor: '#f5f5f5', borderLeft: '2px solid #ccc', borderTop: borderTopStyle })} />
        </>
      );
    }

    return (
      <>
        <TableCell {...getCellProps(index, LEFT_COL_INDEX, { ...styles.td, ...styles.stickyCell, ...styles.dataLabel, ...rowStyle, borderTop: borderTopStyle })}>
          {row.label}
        </TableCell>

        {row.monthlyValues.map((val, mIdx) => {
          const event = row.monthlyEvents ? row.monthlyEvents[mIdx] : null;
          return (
            <TableCell 
              key={mIdx} 
              {...getCellProps(index, mIdx, { 
                ...styles.td, ...styles.cellSelectable, ...rowStyle, borderTop: borderTopStyle,
                backgroundColor: row.isInteractive ? '#f8fbff' : 'inherit',
                cursor: (clickMode === 'normal' && row.isInteractive) ? 'pointer' : 'cell'
              })}
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

        <TableCell {...getCellProps(index, TOTAL_COL_INDEX, { ...styles.td, ...styles.totalCell, ...rowStyle, borderTop: borderTopStyle })}>
          {row.totalValue}
        </TableCell>
      </>
    );
  }, [colWidth, clickMode]); 

  // ★ ここで tableWidth を定義
  const tableWidth = LEFT_COL_WIDTH + (12 * colWidth) + TOTAL_COL_WIDTH;

  const VirtuosoComponents = useMemo<TableComponents<any>>(() => ({
    Scroller: React.forwardRef<HTMLDivElement, any>((props, ref) => (
      <div {...props} ref={ref} style={{ ...props.style, position: 'relative' }}>
        {props.children}
        <SelectionOverlay overlayRef={overlayRef} />
      </div>
    )),
    Table: (props) => <Table {...props} style={{ ...styles.table, width: `${tableWidth}px` }} />,
    TableHead: React.forwardRef((props, ref) => <TableHead {...props} ref={ref} style={{ position: 'sticky', top: 0, zIndex: 40 }} />),
    TableRow: TableRow,
    TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
  }), [tableWidth]);

  return (
    <>
      <Box 
        ref={containerRef}
        sx={{ flex: 1, minHeight: 0, height: '100%', touchAction: 'none' }}
        {...(clickMode === 'select' ? containerProps : {})}
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
          components={VirtuosoComponents}
          overscan={20} 
        />
      </Box>
      <FloatingActionMenu visible={clickMode === 'select' && !!selection} onCopy={handleCopy} />
    </>
  );
}