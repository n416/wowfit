// src/hooks/useGridOverlayPosition.ts
import { useEffect, RefObject } from 'react';
import { GridSelection } from './useGridInteraction';

// 正規化後の選択範囲
export interface NormalizedSelection {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
}

export const normalizeSelection = (sel: GridSelection | null): NormalizedSelection | null => {
  if (!sel) return null;
  return {
    minR: Math.min(sel.start.r, sel.end.r),
    maxR: Math.max(sel.start.r, sel.end.r),
    minC: Math.min(sel.start.c, sel.end.c),
    maxC: Math.max(sel.start.c, sel.end.c),
  };
};

export type OverlayCalculator = (
  selection: NormalizedSelection
) => { top: number; left: number; width: number; height: number } | null;

export const useGridOverlayPosition = (
  overlayRef: RefObject<HTMLElement | null>,
  selection: GridSelection | null,
  calculator: OverlayCalculator
) => {
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const norm = normalizeSelection(selection);
    if (!norm) {
      overlay.style.display = 'none';
      return;
    }

    const style = calculator(norm);

    if (style) {
      overlay.style.display = 'block';
      overlay.style.top = `${style.top}px`;
      overlay.style.left = `${style.left}px`;
      overlay.style.width = `${style.width}px`;
      overlay.style.height = `${style.height}px`;
    } else {
      overlay.style.display = 'none';
    }
  }, [selection, calculator, overlayRef]);
};