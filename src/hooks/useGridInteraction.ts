import { useState, useCallback, useEffect, useRef } from 'react';

export interface GridCoord {
  r: number;
  c: number;
}

export interface GridSelection {
  start: GridCoord;
  end: GridCoord;
}

export type PointToGridConverter = (x: number, y: number) => GridCoord | null;

interface UseGridInteractionProps {
  scrollerRef: React.RefObject<HTMLElement | null>;
  converter: PointToGridConverter;
  maxRow?: number;
  maxCol?: number;
  onSelectionChange?: (selection: GridSelection | null) => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  isEnabled?: boolean;
}

export const useGridInteraction = ({
  scrollerRef,
  converter,
  maxRow = 0,
  maxCol = 0,
  onSelectionChange,
  onCopy,
  onPaste,
  onCut,
  isEnabled = true
}: UseGridInteractionProps) => {
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const selectionRef = useRef<GridSelection | null>(null);
  
  // 内部的なドラッグ状態（即時反映用）
  const isDraggingRef = useRef(false);
  // マウスが物理的に押されているか
  const isMouseDownRef = useRef(false);
  const startCoordRef = useRef<GridCoord | null>(null);

  const callbacksRef = useRef({ onSelectionChange, onCopy, onPaste, onCut });
  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onCopy, onPaste, onCut };
  }, [onSelectionChange, onCopy, onPaste, onCut]);

  const pointerPosRef = useRef<{ x: number, y: number } | null>(null);
  const autoScrollIntervalRef = useRef<number | null>(null);

  const updateSelection = useCallback((newSelection: GridSelection | null) => {
    selectionRef.current = newSelection;
    setSelection(newSelection);
    if (callbacksRef.current.onSelectionChange) {
      callbacksRef.current.onSelectionChange(newSelection);
    }
  }, []);

  const getGridCoord = useCallback((clientX: number, clientY: number): GridCoord | null => {
    if (!scrollerRef.current) return null;
    const rect = scrollerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return converter(x, y);
  }, [converter, scrollerRef]);

  // --- キーボード操作 ---
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
      const currentSel = selectionRef.current;

      // コピー・カット・ペースト
      if (ctrlKey) {
        if (e.key === 'c' && callbacksRef.current.onCopy) { e.preventDefault(); callbacksRef.current.onCopy(); return; }
        if (e.key === 'x' && callbacksRef.current.onCut) { e.preventDefault(); callbacksRef.current.onCut(); return; }
        if (e.key === 'v' && callbacksRef.current.onPaste) { e.preventDefault(); callbacksRef.current.onPaste(); return; }
        return;
      }

      // 矢印キー移動
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        
        let { r, c } = currentSel ? currentSel.end : { r: 0, c: 0 };
        if (!currentSel) {
          const initial = { r: 0, c: 0 };
          updateSelection({ start: initial, end: initial });
          return;
        }

        switch (e.key) {
          case 'ArrowUp': r = Math.max(0, r - 1); break;
          case 'ArrowDown': r = Math.min(maxRow, r + 1); break;
          case 'ArrowLeft': c = Math.max(0, c - 1); break;
          case 'ArrowRight': c = Math.min(maxCol, c + 1); break;
        }

        const newEnd = { r, c };
        
        if (e.shiftKey) {
          updateSelection({ start: currentSel.start, end: newEnd });
        } else {
          updateSelection({ start: newEnd, end: newEnd });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled, maxRow, maxCol, updateSelection]);

  // --- マウス・タッチ操作 ---

  const handleStart = useCallback((clientX: number, clientY: number, isShiftKey: boolean) => {
    if (!isEnabled) return;
    const coord = getGridCoord(clientX, clientY);
    
    if (coord) {
      isMouseDownRef.current = true;
      // ここではまだ isDraggingRef = true にしない（移動したらtrueにする）
      
      if (isShiftKey && selectionRef.current) {
        const anchor = selectionRef.current.start;
        startCoordRef.current = anchor;
        updateSelection({ start: anchor, end: coord });
      } else {
        startCoordRef.current = coord;
        updateSelection({ start: coord, end: coord });
      }
      
      pointerPosRef.current = { x: clientX, y: clientY };
    }
  }, [isEnabled, getGridCoord, updateSelection]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isMouseDownRef.current || !startCoordRef.current) return;
    
    // 移動を検知した時点でドラッグ状態にする
    if (!isDraggingRef.current) {
      setIsDragging(true);
      isDraggingRef.current = true;
    }

    pointerPosRef.current = { x: clientX, y: clientY };
    const coord = getGridCoord(clientX, clientY);

    if (coord) {
      const currentSel = selectionRef.current;
      if (!currentSel || currentSel.end.r !== coord.r || currentSel.end.c !== coord.c) {
        updateSelection({ start: startCoordRef.current, end: coord });
      }
    }
  }, [getGridCoord, updateSelection]);

  const handleEnd = useCallback(() => {
    isMouseDownRef.current = false;
    startCoordRef.current = null;
    pointerPosRef.current = null;

    if (isDraggingRef.current) {
      // ★重要: クリックイベントハンドラ(onMouseUp等)が先に実行されるのを防ぐため、
      // ドラッグフラグのクリアを少し遅らせる
      setTimeout(() => {
        setIsDragging(false);
        isDraggingRef.current = false;
      }, 0);
    }
  }, []);

  const containerProps = {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      handleStart(e.clientX, e.clientY, e.shiftKey);
    },
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY, e.shiftKey);
    }
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isMouseDownRef.current) {
        handleMove(e.clientX, e.clientY);
      }
    };
    
    const handleWindowTouchMove = (e: TouchEvent) => {
      if (isMouseDownRef.current) {
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
      }
    };
    
    const handleWindowUp = () => handleEnd();

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowUp);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleWindowUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowUp);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowUp);
    };
  }, [handleMove, handleEnd]);

  // --- オートスクロール ---
  useEffect(() => {
    if (!isMouseDownRef.current || !scrollerRef.current) {
      if (autoScrollIntervalRef.current) {
        cancelAnimationFrame(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      return;
    }

    const scrollLoop = () => {
      if (!pointerPosRef.current || !scrollerRef.current) return;
      const { x, y } = pointerPosRef.current;
      const rect = scrollerRef.current.getBoundingClientRect();
      
      const threshold = 50;
      const maxSpeed = 20;
      let vx = 0, vy = 0;

      if (y < rect.top + threshold) vy = -maxSpeed * ((rect.top + threshold - y) / threshold);
      else if (y > rect.bottom - threshold) vy = maxSpeed * ((y - (rect.bottom - threshold)) / threshold);

      if (x < rect.left + threshold) vx = -maxSpeed * ((rect.left + threshold - x) / threshold);
      else if (x > rect.right - threshold) vx = maxSpeed * ((x - (rect.right - threshold)) / threshold);

      if (vx !== 0 || vy !== 0) {
        scrollerRef.current.scrollLeft += vx;
        scrollerRef.current.scrollTop += vy;
        handleMove(x, y);
        autoScrollIntervalRef.current = requestAnimationFrame(scrollLoop);
      } else {
        autoScrollIntervalRef.current = requestAnimationFrame(scrollLoop);
      }
    };
    autoScrollIntervalRef.current = requestAnimationFrame(scrollLoop);
    return () => {
      if (autoScrollIntervalRef.current) cancelAnimationFrame(autoScrollIntervalRef.current);
    };
  }, [isDragging, scrollerRef, handleMove]);

  return {
    selection,
    isDragging,
    isDraggingRef, // View側での判定用にRefも返す
    containerProps,
    clearSelection: () => updateSelection(null),
    setSelection: updateSelection
  };
};