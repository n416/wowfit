import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store';
import { undoAssignments, redoAssignments } from '../store/assignmentSlice';

/**
 * UNDO (Ctrl+Z) / REDO (Ctrl+Y) のキーボードショートカットをグローバルに設定するフック
 */
export const useUndoRedoKeyboard = () => {
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
        dispatch(undoAssignments());
      } else if (ctrlKey && event.key === 'y') {
        event.preventDefault();
        dispatch(redoAssignments());
      } else if (isMac && ctrlKey && event.shiftKey && event.key === 'z') {
        // Mac の REDO (Cmd+Shift+Z)
        event.preventDefault();
        dispatch(redoAssignments());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch]); // dispatch は通常変わらないが、依存配列に入れておく

  // このフックはUIを持たないため、何も返さない
};