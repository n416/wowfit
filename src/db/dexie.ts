import Dexie, { type Table } from 'dexie';

// --- 1. ユニット定義 ---
export interface IUnit {
  unitId: string; // (例: "U01")
  name: string;   // (例: "ユニットA")
  // 24時間デマンド (0時台, 1時台, ..., 23時台)
  demand: number[];
}

// --- 3. 勤務パターン定義 ---
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
  // ★ v7追加: 時間枠指定（フレックス）かどうか
  isFlex?: boolean; 
}

// --- IStaffConstraints ---
export interface IStaffConstraints {
  maxConsecutiveDays: number;
  minIntervalHours: number;
}

// ★ v8追加: 勤務可能時間帯の定義
export interface ITimeRange {
  start: string; // "08:00"
  end: string;   // "12:00"
}

// --- 4. スタッフ定義 ---
export interface IStaff {
  staffId: string;
  name: string;
  employmentType: 'FullTime' | 'PartTime' | 'Rental';
  status?: 'Active' | 'OnLeave';
  skills: string[];
  unitId: string | null; // 所属ユニット
  availablePatternIds: string[]; // 勤務可能パターン
  constraints: IStaffConstraints;
  memo?: string;
  // ★ v8追加: 勤務可能時間帯 (パート用)
  workableTimeRanges?: ITimeRange[]; 
}

// --- 5. アサイン結果 ---
export interface IAssignment {
  id?: number;
  date: string;
  staffId: string;
  patternId: string; // "SA", "N", "公休", "有給" など
  unitId: string | null; // 勤務したユニット
  locked?: boolean; // AIが変更不可なアサインは true
  // ★ v7追加: フレックス時の確定時間
  overrideStartTime?: string; 
  overrideEndTime?: string;   
}

// ヘルパー: デフォルトデマンド生成
export const getDefaultDemand = (): number[] => {
  return Array(24).fill(0);
};

// --- Dexie データベース定義 ---
export class ShiftWorkDB extends Dexie {
  units!: Table<IUnit>;
  shiftPatterns!: Table<IShiftPattern>;
  staffList!: Table<IStaff>;
  assignments!: Table<IAssignment>;

  constructor() {
    super('ShiftWorkAppDB');

    // ★★★ スキーマを v8 にバージョンアップ (TimeRanges対応) ★★★
    this.version(8).stores({
      units: '&unitId, name', 
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills', 
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    });

    // (v7: Flex対応)
    this.version(7).stores({
      units: '&unitId, name', 
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills', 
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    });

    // (v6: Statusインデックス追加)
    this.version(6).stores({
      units: '&unitId, name', 
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    });

    // (v5: Lockedインデックス追加, timeSlotRules削除)
    this.version(5).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    }).upgrade(tx => {
      return tx.table('timeSlotRules').clear().catch(() => {});
    });

    // (v4: 旧バージョン)
    this.version(4).stores({
      units: '&unitId, name',
      timeSlotRules: '++id, timeStart, timeEnd',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId',
    });

    // (v3)
    this.version(3).stores({
      units: '&unitId, name',
      timeSlotRules: '++id, timeStart, timeEnd',
      shiftPatterns: '&patternId, name, mainCategory, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignmentSlots: '&slotId, date, unitId, assignedStaffId, patternId, [date+unitId]',
    });

    // (v2)
    this.version(2).stores({
      staffList: '&staffId, employmentType, name, *skills',
      shiftPatterns: '&patternId, name',
      requiredStaffing: '++id, date, patternId, [date+patternId], *requiredSkills',
      assignments: '++id, [date+staffId], [date+patternId], staffId, patternId'
    });

    // (v1)
    this.version(1).stores({
      staffList: '&staffId, employmentType, name, *skills',
      shiftPatterns: '&patternId, name',
      requiredStaffing: '++id, date, patternId, [date+patternId]',
      assignments: '++id, [date+staffId], [date+patternId], staffId, patternId'
    });
  }
}

export const db = new ShiftWorkDB();