import { IShiftPattern, IUnit, IStaff, IStaffConstraints } from './dexie';

// ★★★ v5版: 勤務パターンの初期データ ★★★
export const MOCK_PATTERNS_V5: IShiftPattern[] = [
  { patternId: 'SA', name: '早出勤務', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '06:30', endTime: '15:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'A', name: '早出勤務1', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'AA', name: '早出勤務1’', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '有', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'A2', name: '早出勤務2', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '07:30', endTime: '16:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: '半', name: '半勤', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '07:00', endTime: '11:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半半', name: '半勤’', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '有', startTime: '07:00', endTime: '11:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半1', name: '半勤1', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '08:00', endTime: '12:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半2', name: '半勤2', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '08:30', endTime: '12:30', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半3', name: '半勤3', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '09:00', endTime: '13:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半4', name: '半勤4', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '12:00', endTime: '16:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半5', name: '半勤5', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '13:00', endTime: '17:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半6', name: '半勤6', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '13:00', endTime: '17:30', breakDurationMinutes: 0, durationHours: 4.5, isNightShift: false, crossesMidnight: false },
  { patternId: '半7', name: '半勤7', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '16:00', endTime: '20:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半8', name: '半勤8', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '17:00', endTime: '21:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: '半88', name: '半勤8’', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '有', startTime: '17:00', endTime: '21:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false, crossesMidnight: false },
  { patternId: 'C2', name: '日勤1', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'CC2', name: '日勤1’', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '有', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'C', name: '日勤2', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '08:30', endTime: '17:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'CC', name: '日勤2’', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '有', startTime: '08:30', endTime: '17:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'C3', name: '日勤3', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '09:30', endTime: '18:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'C4', name: '日勤4', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '10:00', endTime: '19:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E', name: '遅出', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '12:00', endTime: '21:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'EE', name: '遅出’', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '有', startTime: '12:00', endTime: '21:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E2', name: '遅出1', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '10:30', endTime: '19:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E3', name: '遅出2', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '11:00', endTime: '20:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E4', name: '遅出3', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '11:30', endTime: '20:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'E5', name: '遅出4', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '12:30', endTime: '21:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false, crossesMidnight: false },
  { patternId: 'N', name: '夜勤1', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '16:00', endTime: '09:30', breakDurationMinutes: 90, durationHours: 16, isNightShift: true, crossesMidnight: true },
  { patternId: 'N3', name: '夜勤2', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'NN3', name: '夜勤2’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '有', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'SN3', name: '夜勤2’’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'N2', name: '夜勤3', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '21:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 8, isNightShift: true, crossesMidnight: true },
  { patternId: 'SN2', name: '夜勤3’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '21:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 8, isNightShift: true, crossesMidnight: true },
  { patternId: 'N4', name: '夜勤4', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '18:00', endTime: '08:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: 'SN4', name: '夜勤4’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '18:00', endTime: '08:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true, crossesMidnight: true },
  { patternId: '公休', name: '公休', mainCategory: '休み', workType: 'StatutoryHoliday', crossUnitWorkType: '-', startTime: '00:00', endTime: '00:00', breakDurationMinutes: 0, durationHours: 0, isNightShift: false, crossesMidnight: false },
  { patternId: '有給', name: '有給休暇', mainCategory: '休み', workType: 'PaidLeave', crossUnitWorkType: '-', startTime: '00:00', endTime: '00:00', breakDurationMinutes: 0, durationHours: 0, isNightShift: false, crossesMidnight: false },
  { patternId: '会議', name: '外部会議', mainCategory: 'その他', workType: 'Meeting', crossUnitWorkType: '-', startTime: '09:00', endTime: '17:00', breakDurationMinutes: 0, durationHours: 8, isNightShift: false, crossesMidnight: false },
];

// ★★★ v5版: ユニットの初期データ (24hデマンド配列を持つ) ★★★
export const MOCK_UNITS_V5: IUnit[] = [
  { unitId: 'U01', name: 'ユニットA', demand: [
    1, 1, 1, 1, 1, 1, 2, 2, // 0-7時 (深夜1, 早出1)
    3, 3, 3, 3, 2, 2, 2, 2, // 8-15時 (日勤3)
    2, 2, 2, 1, 1, 1, 1, 1  // 16-23時 (夜勤1, 遅出1)
  ]},
  { unitId: 'U02', name: 'ユニットB', demand: [
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, // 0-7時 (0.5人)
    2, 2, 2, 2, 2, 2, 1, 1, // 8-15時 (日勤2)
    1, 1, 1, 1, 1, 1, 0.5, 0.5 // 16-23時 (夜勤0.5, 遅出0.5)
  ]},
];

// (v4の簡略化された制約のデフォルト)
export const getDefaultConstraints = (): IStaffConstraints => ({
  maxConsecutiveDays: 5,
  minIntervalHours: 12,
});

// v4版: スタッフの初期データ (v5.4修正: 「公休」「有給」を除外)
export const MOCK_STAFF_V4: IStaff[] = [
  { staffId: 's001', name: '夜勤さんX', employmentType: 'FullTime', skills: ['Leader'], unitId: 'U01', 
    availablePatternIds: ['N', 'NN3', 'N2', 'N4', 'SN3', 'SN2', 'SN4'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤専門' },
  { staffId: 's002', name: '夜勤さんY', employmentType: 'FullTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['N', 'NN3', 'N2', 'N4', 'SN3', 'SN2', 'SN4'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤専門' },
  { staffId: 's003', name: '日勤Aさん', employmentType: 'FullTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE', 'C2', 'C3', 'C4', 'E2', 'E3', 'E4', 'E5', 'SA'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's004', name: '日勤Bさん', employmentType: 'FullTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's005', name: '日勤Cさん', employmentType: 'FullTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's006', name: '日勤Dさん', employmentType: 'FullTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['A', 'AA', 'C', 'CC', 'E', 'EE'], 
    constraints: { maxConsecutiveDays: 5, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's007', name: 'パートNさん', employmentType: 'PartTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's008', name: 'パートOさん', employmentType: 'PartTime', skills: [], unitId: 'U01', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's009', name: 'パートPさん', employmentType: 'PartTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
  { staffId: 's010', name: 'パートQさん', employmentType: 'PartTime', skills: [], unitId: 'U02', 
    availablePatternIds: ['半1', '半2', '半3', '半4', '半5'], 
    constraints: { maxConsecutiveDays: 3, minIntervalHours: 12 }, memo: '夜勤不可' },
];