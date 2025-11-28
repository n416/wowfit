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
export type WorkType = 'Work' | 'StatutoryHoliday' | 'PaidLeave' | 'Holiday' | 'Meeting' | 'Other';

export interface IShiftPattern {
  patternId: string; // 表内名称 (例: "SA", "A", "N")
  name: string;      // 勤務種別 (例: "早出勤務", "早出勤務1")
  symbol?: string;   // 勤務表表示用の略称
  mainCategory: string; // 大勤務種別 (例: "早出", "日勤")
  workType: WorkType;
  crossUnitWorkType: CrossUnitWorkType; // 他ユニット出張
  startTime: string;
  endTime: string;
  breakDurationMinutes: number; // 休憩時間 (分)
  durationHours: number;
  isNightShift: boolean;
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
  workableTimeRanges?: ITimeRange[]; // ★ v8追加
  displayOrder?: number; // ★ v10追加
}

// --- 5. アサイン結果 ---
export interface IAssignment {
  id?: number;
  date: string;
  staffId: string;
  patternId: string; // "SA", "N", "公休", "有給" など
  unitId: string | null; // 勤務したユニット
  locked?: boolean; // AIが変更不可なアサインは true
  overrideStartTime?: string; // ★ v7追加
  overrideEndTime?: string;   // ★ v7追加
}

// ★ 追加: 有給調整履歴
export interface IPaidLeaveAdjustment {
  id?: number;
  staffId: string;
  date: string; // 調整日 (YYYY-MM-DD)
  type: 'Grant' | 'Expire' | 'Adjustment'; // 付与 | 消滅 | 手動調整
  days: number; // 日数
  memo?: string;
  createdAt?: string; // 操作日時 (ISO string)
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
  paidLeaveAdjustments!: Table<IPaidLeaveAdjustment>; // ★ 追加

  constructor() {
    super('ShiftWorkAppDB');

    // ★ v10: displayOrder 追加 (paidLeaveAdjustmentsも維持)
    this.version(10).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, displayOrder, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
      paidLeaveAdjustments: '++id, staffId, date, type'
    });

    // ★ v9: paidLeaveAdjustments 追加
    this.version(9).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
      paidLeaveAdjustments: '++id, staffId, date, type'
    });

    // v8以下省略... (既存定義の維持)
    this.version(8).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    });
    this.version(7).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    });
    this.version(6).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, status, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    });
    this.version(5).stores({
      units: '&unitId, name',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId, locked',
    }).upgrade(tx => {
      return tx.table('timeSlotRules').clear().catch(() => { });
    });
    this.version(4).stores({
      units: '&unitId, name',
      timeSlotRules: '++id, timeStart, timeEnd',
      shiftPatterns: '&patternId, name, mainCategory, workType, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignments: '++id, [date+staffId], [date+patternId], [date+unitId], staffId, patternId, unitId',
    });
    this.version(3).stores({
      units: '&unitId, name',
      timeSlotRules: '++id, timeStart, timeEnd',
      shiftPatterns: '&patternId, name, mainCategory, crossUnitWorkType',
      staffList: '&staffId, name, employmentType, unitId, *availablePatternIds, *skills',
      assignmentSlots: '&slotId, date, unitId, assignedStaffId, patternId, [date+unitId]',
    });
    this.version(2).stores({
      staffList: '&staffId, employmentType, name, *skills',
      shiftPatterns: '&patternId, name',
      requiredStaffing: '++id, date, patternId, [date+patternId], *requiredSkills',
      assignments: '++id, [date+staffId], [date+patternId], staffId, patternId'
    });
    this.version(1).stores({
      staffList: '&staffId, employmentType, name, *skills',
      shiftPatterns: '&patternId, name',
      requiredStaffing: '++id, date, patternId, [date+patternId]',
      assignments: '++id, [date+staffId], [date+patternId], staffId, patternId'
    });
  }
}

export const db = new ShiftWorkDB();
