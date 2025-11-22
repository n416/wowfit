import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { db } from '../db/dexie';
import { setStaffList } from '../store/staffSlice';
import { setPatterns } from '../store/patternSlice';
import { setUnits } from '../store/unitSlice';
import { MOCK_PATTERNS_V5, MOCK_UNITS_V5, MOCK_STAFF_V4 } from '../db/mockData';

export const useMasterData = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [units, patterns, staff] = await Promise.all([
          db.units.toArray(),
          db.shiftPatterns.toArray(),
          db.staffList.toArray()
        ]);

        // パターンが空なら初期データ(Mock)を投入
        if (patterns.length === 0) {
          await db.shiftPatterns.bulkPut(MOCK_PATTERNS_V5);
          dispatch(setPatterns(MOCK_PATTERNS_V5));
        } else {
          dispatch(setPatterns(patterns));
        }

        // ユニットが空なら初期データを投入
        if (units.length === 0) {
          await db.units.bulkPut(MOCK_UNITS_V5);
          dispatch(setUnits(MOCK_UNITS_V5));
        } else {
          dispatch(setUnits(units));
        }

        // スタッフが空なら初期データを投入
        if (staff.length === 0) {
          await db.staffList.bulkPut(MOCK_STAFF_V4);
          dispatch(setStaffList(MOCK_STAFF_V4));
        } else {
          dispatch(setStaffList(staff));
        }

      } catch (e) {
        console.error("マスタデータ読み込みエラー:", e);
      }
    };

    loadMasterData();
  }, [dispatch]);
};