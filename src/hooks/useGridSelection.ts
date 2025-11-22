import { useState, useCallback, useEffect, useRef } from 'react';

export interface GridCoord {
  r: number;
  c: number;
}

export interface GridSelection {
  start: GridCoord;
  end: GridCoord;
}

export interface GridBounds {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
}

type GetDataForClipboard = (selection: GridSelection) => string | null;

export const useGridSelection = (
  getDataForClipboard?: GetDataForClipboard,
  scrollerRef?: React.RefObject<HTMLElement | null>,
  bounds?: GridBounds
) => {
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const pointerPosRef = useRef<{ x: number, y: number } | null>(null);

  const normalizedSelection = selection ? {
    minR: Math.min(selection.start.r, selection.end.r),
    maxR: Math.max(selection.start.r, selection.end.r),
    minC: Math.min(selection.start.c, selection.end.c),
    maxC: Math.max(selection.start.c, selection.end.c),
  } : null;

  const handleMouseDown = useCallback((r: number, c: number) => {
    setIsDragging(true);
    setSelection({ start: { r, c }, end: { r, c } });
  }, []);

  const handleMouseEnter = useCallback((r: number, c: number) => {
    if (isDragging && selection) {
      setSelection(prev => prev ? { ...prev, end: { r, c } } : null);
    }
  }, [isDragging, selection]);

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      pointerPosRef.current = null;
    };
    const handleGlobalMouseMove = (e: MouseEvent) => {
      pointerPosRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        pointerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
    };
  }, [isDragging]);

  // オートスクロール
  useEffect(() => {
    if (!isDragging || !scrollerRef) return;
    let animationFrameId: number;
    const scrollLoop = () => {
      const container = scrollerRef.current;
      const pointer = pointerPosRef.current;
      if (container && pointer) {
        const rect = container.getBoundingClientRect();
        const threshold = 50; 
        const maxSpeed = 20;  
        let scrollX = 0, scrollY = 0;

        if (pointer.y < rect.top + threshold) scrollY = -maxSpeed * Math.min(1, (rect.top + threshold - pointer.y) / threshold);
        else if (pointer.y > rect.bottom - threshold) scrollY = maxSpeed * Math.min(1, (pointer.y - (rect.bottom - threshold)) / threshold);

        if (pointer.x < rect.left + threshold) scrollX = -maxSpeed * Math.min(1, (rect.left + threshold - pointer.x) / threshold);
        else if (pointer.x > rect.right - threshold) scrollX = maxSpeed * Math.min(1, (pointer.x - (rect.right - threshold)) / threshold);

        if (scrollX !== 0 || scrollY !== 0) {
          container.scrollLeft += scrollX;
          container.scrollTop += scrollY;
        }
      }
      animationFrameId = requestAnimationFrame(scrollLoop);
    };
    scrollLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isDragging, scrollerRef]);

  // --- ★ 修正: 共通の座標特定ロジック (Touch用) ---
  const getCoordsFromTouch = (e: React.TouchEvent): GridCoord | null => {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    // 親要素に data-r 属性があるか探す
    const cell = target?.closest('[data-r]');
    
    if (!cell) return null;

    const r = parseInt(cell.getAttribute('data-r') || '', 10);
    const c = parseInt(cell.getAttribute('data-c') || '', 10);
    
    if (isNaN(r) || isNaN(c)) return null;
    return { r, c };
  };

  // --- ★ 修正: コンテナで受ける TouchStart ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // コンテナ全体で発火するため、タッチ位置からセルを特定する
    const coords = getCoordsFromTouch(e);
    if (coords) {
      setIsDragging(true);
      setSelection({ start: coords, end: coords });
    }
  }, []);

  // --- ★ 修正: コンテナで受ける TouchMove ---
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const coords = getCoordsFromTouch(e);
    if (coords && selection) {
      // 変化があった場合のみ更新
      if (selection.end.r !== coords.r || selection.end.c !== coords.c) {
         setSelection(prev => prev ? { ...prev, end: coords } : null);
      }
    }
  }, [isDragging, selection]);

  const copySelection = useCallback(async () => {
    if (selection && getDataForClipboard) {
      const text = getDataForClipboard(selection);
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }
    }
  }, [selection, getDataForClipboard]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl && e.key === 'c') {
        e.preventDefault();
        await copySelection();
        return;
      }

      if (e.key.startsWith('Arrow') && selection && bounds) {
        e.preventDefault();
        let { r, c } = selection.end;
        let newR = r;
        let newC = c;

        switch (e.key) {
          case 'ArrowUp': newR--; break;
          case 'ArrowDown': newR++; break;
          case 'ArrowLeft': newC--; break;
          case 'ArrowRight': newC++; break;
        }

        newR = Math.max(bounds.minR, Math.min(bounds.maxR, newR));
        newC = Math.max(bounds.minC, Math.min(bounds.maxC, newC));
        const newCoord = { r: newR, c: newC };

        if (e.shiftKey) {
          setSelection(prev => prev ? { ...prev, end: newCoord } : null);
        } else {
          setSelection({ start: newCoord, end: newCoord });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, bounds, copySelection]);

  return {
    selection,
    normalizedSelection,
    isDragging,
    handleMouseDown,
    handleMouseEnter,
    handleTouchStart, // 引数がEventに変わりました
    handleTouchMove,
    copySelection,
    clearSelection: () => setSelection(null)
  };
};