// src/components/common/SelectionOverlay.tsx
import React from 'react';

interface SelectionOverlayProps {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  zIndex?: number;
  borderColor?: string;
  backgroundColor?: string;
}

export const SelectionOverlay = ({
  overlayRef,
  zIndex = 50,
  borderColor = '#1976d2',
  backgroundColor = 'rgba(25, 118, 210, 0.2)'
}: SelectionOverlayProps) => {
  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        backgroundColor,
        border: `2px solid ${borderColor}`,
        zIndex,
        display: 'none',
        transition: 'none',
        boxSizing: 'border-box'
      }}
    />
  );
};