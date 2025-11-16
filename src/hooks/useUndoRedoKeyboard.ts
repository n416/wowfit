import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store';
// ★ 1. redux-undo の ActionCreators をインポート
import { ActionCreators } from 'redux-undo';

/**
 * UNDO (Ctrl+Z) / REDO (Ctrl+Y) のキーボードショートカットをグローバルに設定するフック
 * ★★★ 変更点 1: invalidateSyncLock を引数で受け取る ★★★
 */
export const useUndoRedoKeyboard = (invalidateSyncLock: () => void) => {
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // テキスト入力中はキーボードショートカットを無効にする
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (ctrlKey && event.key === 'z') {
        event.preventDefault();
        // ★ 2. undoAssignments() の代わりに ActionCreators.undo() を dispatch
        dispatch(ActionCreators.undo());
        // ★★★ 変更点 2: ロックを無効化 ★★★
        invalidateSyncLock();
      } else if (ctrlKey && event.key === 'y') {
        event.preventDefault();
        // ★ 3. redoAssignments() の代わりに ActionCreators.redo() を dispatch
        dispatch(ActionCreators.redo());
        // ★★★ 変更点 3: ロックを無効化 ★★★
        invalidateSyncLock();
      } else if (isMac && ctrlKey && event.shiftKey && event.key === 'z') {
        // Mac の REDO (Cmd+Shift+Z)
        event.preventDefault();
        // ★ 4. ActionCreators.redo() を dispatch
        dispatch(ActionCreators.redo());
        // ★★★ 変更点 4: ロックを無効化 ★★★
        invalidateSyncLock();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // ★★★ 変更点 5: 依存配列に invalidateSyncLock を追加 ★★★
  }, [dispatch, invalidateSyncLock]); 

  // このフックはUIを持たないため、何も返さない
};