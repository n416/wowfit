import { useEffect } from 'react';
// ★ 1. useStore と RootState をインポート
import { useDispatch, useStore } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { ActionCreators } from 'redux-undo';

// ★ 2. バージョンログ (削除)
// console.log("[VERSION] useUndoRedoKeyboard.ts (Plan E + Logging) loaded. invalidateSyncLock calls removed.");

/**
 * UNDO (Ctrl+Z) / REDO (Ctrl+Y) のキーボードショートカットをグローバルに設定するフック
 */
export const useUndoRedoKeyboard = (invalidateSyncLock: () => void) => {
  const dispatch: AppDispatch = useDispatch();
  // ★ 3. store への参照を取得
  const store = useStore<RootState>();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
        
        // ★★★ (Plan E) UNDO ログ (削除) ★★★
        // console.log("===== (Plan E) [UNDO] KeyDown: Ctrl+Z pressed. =====");
        // try { ... } catch (e) { ... }
        
        dispatch(ActionCreators.undo());
        
        // console.log("[UNDO] Dispatched ActionCreators.undo(). State will update shortly.");
        // ★★★ ログ削除ここまで ★★★
        
      } else if (ctrlKey && event.key === 'y') {
        event.preventDefault();

        // ★★★ (Plan E) REDO ログ (削除) ★★★
        // console.log("===== (Plan E) [REDO] KeyDown: Ctrl+Y pressed. =====");
        // try { ... } catch (e) { ... }
        
        dispatch(ActionCreators.redo());

        // console.log("[REDO] Dispatched ActionCreators.redo(). State will update shortly.");
        // ★★★ ログ削除ここまで ★★★
        
      } else if (isMac && ctrlKey && event.shiftKey && event.key === 'z') {
        event.preventDefault();
        // (Mac の REDO も同様)
        // console.log("===== (Plan E) [REDO-Mac] KeyDown: Cmd+Shift+Z pressed. =====");
        dispatch(ActionCreators.redo());
        // console.log("[REDO-Mac] Dispatched ActionCreators.redo(). State will update shortly.");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch, invalidateSyncLock, store]); // ★ 4. store を依存配列に追加
};