// src/hooks/useUndoRedoKeyboard.ts
import { useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { ActionCreators } from 'redux-undo';

/**
 * UNDO (Ctrl+Z) / REDO (Ctrl+Y) のキーボードショートカットをグローバルに設定するフック
 */
export const useUndoRedoKeyboard = (invalidateSyncLock: () => void) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 入力フォーム内では無効化
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // ★ 追加: 処理中（ローディング中）かどうかをチェック
      const state = store.getState();
      const {
        isSyncing,
        adjustmentLoading,
        patchLoading,
        analysisLoading,
        adviceLoading
      } = state.assignment.present;
      const { isMonthLoading } = state.calendar;

      const isOverallLoading = isSyncing ||
        adjustmentLoading ||
        patchLoading ||
        isMonthLoading ||
        analysisLoading ||
        adviceLoading;

      // 処理中ならショートカットを無視する
      if (isOverallLoading) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (ctrlKey && event.key === 'z') {
        event.preventDefault();
        // Shiftキーが押されていればRedo (Mac標準など)
        if (isMac && event.shiftKey) {
          dispatch(ActionCreators.redo());
        } else {
          dispatch(ActionCreators.undo());
        }

      } else if (ctrlKey && event.key === 'y') {
        event.preventDefault();
        dispatch(ActionCreators.redo());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch, invalidateSyncLock, store]);
};