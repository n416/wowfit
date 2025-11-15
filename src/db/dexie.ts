import Dexie, { type Table } from 'dexie';

// --- 1. ユニット定義 (v5: 24時間デマンド配列を追加) ---
export interface IUnit {
  unitId: string; // (例: "U01")
  name: string;   // (例: "ユニットA")
  // ★★★ v5: 24時間デマンド (0時台, 1時台, ..., 23時台) ★★★
  // (例: [0.5, 0.5, ..., 1, 2, 2, ...])
  demand: number[];
}

// --- (v5: ITimeSlotRule は廃止) ---

// --- 3. 勤務パターン定義 (v4から変更なし) ---
export type CrossUnitWorkType = '-' | '有' | 'サポート';
export type WorkType = 'Work' | 'StatutoryHoliday' | 'PaidLeave' | 'Meeting' | 'Other';

export interface IShiftPattern {
  patternId: string; // 表内名称 (例: "SA", "A", "N")
  name: string;      // 勤務種別 (例: "早出勤務", "早出勤務1")
  mainCategory: string; // 大勤務種別 (例: "早出", "日勤")
  workType: WorkType;
  crossUnitWorkType: CrossUnitWorkType; // 他ユニット出張
  startTime: string;
  endTime: string;
  breakDurationMinutes: number; // 休憩時間 (分)
  durationHours: number;
  isNightShift: boolean;
  crossesMidnight: boolean;
}

// ★★★ IStaffConstraints を個別に定義してエクスポート ★★★
export interface IStaffConstraints {
  maxConsecutiveDays: number;
  minIntervalHours: number;
}

// --- 4. スタッフ定義 (v4から変更なし) ---
export interface IStaff {
  staffId: string;
  name: string;
  // ★★★ v5.11 修正: 'Rental' を追加 ★★★
  employmentType: 'FullTime' | 'PartTime' | 'Rental';
  skills: string[];
  unitId: string | null; // 所属ユニット (レンタルなら「応援元」の意味合いでも可)
  availablePatternIds: string[]; // 勤務可能パターン (レンタルなら可能なシフト)
  constraints: IStaffConstraints; // ★ 型を参照するように変更
  memo?: string;
}

// ★★★ v5.9 修正: locked フラグを追加 ★★★
// --- 5. アサイン結果 (v4から変更なし) ---
export interface IAssignment {
  id?: number;
  date: string;
  staffId: string;
  patternId: string; // "SA", "N", "公休", "有給" など
  unitId: string | null; // 勤務したユニット
  locked?: boolean; // ★ AIが変更不可なアサインは true
}


// ★★★ v5.9 修正: 24時間分のデフォルトDemand（すべて0人）を生成するヘルパー ★★★
// (※NewUnitForm.tsx から移動)
export const getDefaultDemand = (): number[] => {
  return Array(24).fill(0);
};


// --- Dexie データベース定義 (v5) ---
export class ShiftWorkDB extends Dexie {
  units!: Table<IUnit>;
  // ★★★ (v5) timeSlotRules を削除 ★★★
  // timeSlotRules!: Table<ITimeSlotRule>; 
  shiftPatterns!: Table<IShiftPattern>;
  staffList!: Table<IStaff>;
  assignments!: Table<IAssignment>;

  constructor() {
    super('ShiftWorkAppDB');

    // ★★★ スキーマを v5 にバージョンアップ ★★★
    this.version(5).stores({
      units: '&unitId, name', // (demand 配列はインデックス化しない)
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      // ★★★ v5.9 修正: assignments に locked インデックスを追加 ★★★
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
      // (※ timeSlotRules は削除)
    }).upgrade(tx => {
      // v4 -> v5 へのアップグレード
      console.log("Upgrading database to version 5...");
      // (旧v4の timeSlotRules テーブルを削除)
      return tx.table('timeSlotRules').clear().then(() => {
        console.log("Old 'timeSlotRules' table cleared.");
      }).catch(err => {
        console.warn("Could not clear 'timeSlotRules' (might not exist):", err);
      });
    });

    // (v4 スキーマ定義)
    this.version(4).stores({
      units: '&unitId, name',
      timeSlotRules: '++id, timeStart, timeEnd',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId',
    });

    // (v3 スキーマ定義)
    this.version(3).stores({
      units: '&unitId, name',
      timeSlotRules: '++id, timeStart, timeEnd',
      shiftPatterns: '&patternId, name, mainCategory, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignmentSlots: '&slotId, date, unitId, assignedStaffId, patternId, [date+unitId]',
    });

    // (v2 スキーマ定義)
    this.version(2).stores({
      staffList: '&staffId, employmentType, name, *skills',
      shiftPatterns: '&patternId, name',
      requiredStaffing: '++id, date, patternId, [date+patternId], *requiredSkills',
      assignments: '++id, [date+staffId], [date+patternId], staffId, patternId'
    });

    // (v1 スキーマ定義)
    this.version(1).stores({
      staffList: '&staffId, employmentType, name, *skills',
      shiftPatterns: '&patternId, name',
      requiredStaffing: '++id, date, patternId, [date+patternId]',
      assignments: '++id, [date+staffId], [date+patternId], staffId, patternId'
    });
  }
}

export const db = new ShiftWorkDB();