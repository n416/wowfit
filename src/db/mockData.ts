// src/db/mockData.ts
import { IShiftPattern, IUnit, IStaff, IStaffConstraints } from './dexie';

// ★★★ v5版: 勤務パターンの初期データ (crossesMidnight 削除) ★★★
const originalPatterns: IShiftPattern[] = [
  { patternId: 'SA', symbol: '早', name: '早出勤務', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '06:30', endTime: '15:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'A', symbol: 'A', name: '早出勤務1', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'AA', symbol: 'A\'', name: '早出勤務1’', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '有', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'A2', symbol: 'A2', name: '早出勤務2', mainCategory: '早出', workType: 'Work', crossUnitWorkType: '-', startTime: '07:30', endTime: '16:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  
  // 半日系
  { patternId: '半', symbol: '半', name: '半勤', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '07:00', endTime: '11:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半半', symbol: '半\'', name: '半勤’', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '有', startTime: '07:00', endTime: '11:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半1', symbol: '半1', name: '半勤1', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '08:00', endTime: '12:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半2', symbol: '半2', name: '半勤2', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '08:30', endTime: '12:30', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半3', symbol: '半3', name: '半勤3', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '09:00', endTime: '13:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半4', symbol: '半4', name: '半勤4', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '12:00', endTime: '16:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半5', symbol: '半5', name: '半勤5', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '13:00', endTime: '17:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半6', symbol: '半6', name: '半勤6', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '13:00', endTime: '17:30', breakDurationMinutes: 0, durationHours: 4.5, isNightShift: false },
  { patternId: '半7', symbol: '半7', name: '半勤7', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '16:00', endTime: '20:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半8', symbol: '半8', name: '半勤8', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '-', startTime: '17:00', endTime: '21:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },
  { patternId: '半88', symbol: '半8\'', name: '半勤8’', mainCategory: '半日', workType: 'Work', crossUnitWorkType: '有', startTime: '17:00', endTime: '21:00', breakDurationMinutes: 0, durationHours: 4, isNightShift: false },

  // 日勤系
  { patternId: 'C2', symbol: 'C2', name: '日勤1', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'CC2', symbol: 'C2\'', name: '日勤1’', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '有', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'C', symbol: 'C', name: '日勤2', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '08:30', endTime: '17:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'CC', symbol: 'C\'', name: '日勤2’', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '有', startTime: '08:30', endTime: '17:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'C3', symbol: 'C3', name: '日勤3', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '09:30', endTime: '18:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'C4', symbol: 'C4', name: '日勤4', mainCategory: '日勤', workType: 'Work', crossUnitWorkType: '-', startTime: '10:00', endTime: '19:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },

  // 遅出系
  { patternId: 'E', symbol: 'E', name: '遅出', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '12:00', endTime: '21:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'EE', symbol: 'E\'', name: '遅出’', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '有', startTime: '12:00', endTime: '21:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'E2', symbol: 'E2', name: '遅出1', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '10:30', endTime: '19:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'E3', symbol: 'E3', name: '遅出2', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '11:00', endTime: '20:00', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'E4', symbol: 'E4', name: '遅出3', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '11:30', endTime: '20:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },
  { patternId: 'E5', symbol: 'E5', name: '遅出4', mainCategory: '遅出', workType: 'Work', crossUnitWorkType: '-', startTime: '12:30', endTime: '21:30', breakDurationMinutes: 60, durationHours: 8, isNightShift: false },

  // 夜勤系
  { patternId: 'N', symbol: '夜', name: '夜勤1', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '16:00', endTime: '09:30', breakDurationMinutes: 90, durationHours: 16, isNightShift: true },
  { patternId: 'N3', symbol: 'N3', name: '夜勤2', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true },
  { patternId: 'NN3', symbol: 'N3\'', name: '夜勤2’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '有', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true },
  { patternId: 'SN3', symbol: 'N3S', name: '夜勤2’’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '17:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true },
  { patternId: 'N2', symbol: 'N2', name: '夜勤3', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '21:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 8, isNightShift: true },
  { patternId: 'SN2', symbol: 'N2S', name: '夜勤3’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '21:00', endTime: '07:00', breakDurationMinutes: 120, durationHours: 8, isNightShift: true },
  { patternId: 'N4', symbol: 'N4', name: '夜勤4', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: '-', startTime: '18:00', endTime: '08:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true },
  { patternId: 'SN4', symbol: 'N4S', name: '夜勤4’', mainCategory: '夜勤', workType: 'Work', crossUnitWorkType: 'サポート', startTime: '18:00', endTime: '08:00', breakDurationMinutes: 120, durationHours: 12, isNightShift: true },

  // その他
  // ★ 修正: 公休の記号を '*' に変更
  { patternId: '公休', symbol: '*', name: '公休', mainCategory: '休み', workType: 'StatutoryHoliday', crossUnitWorkType: '-', startTime: '00:00', endTime: '00:00', breakDurationMinutes: 0, durationHours: 0, isNightShift: false },
  { patternId: '有給', symbol: '有', name: '有給休暇', mainCategory: '休み', workType: 'PaidLeave', crossUnitWorkType: '-', startTime: '00:00', endTime: '00:00', breakDurationMinutes: 0, durationHours: 0, isNightShift: false },
  { patternId: '会議', symbol: '会', name: '外部会議', mainCategory: 'その他', workType: 'Meeting', crossUnitWorkType: '-', startTime: '09:00', endTime: '17:00', breakDurationMinutes: 0, durationHours: 8, isNightShift: false },
];

// ★★★ 追加: Flex対応パートパターン (8:00-20:00, 1h-7h, 0.5h刻み) ★★★
const contractPatterns: IShiftPattern[] = [];
for (let i = 1.0; i <= 7.0; i += 0.5) {
  const id = `P${i}`;
  const name = `パート${i}`;
  contractPatterns.push({ 
    patternId: id, 
    symbol: `P${i}`, 
    name: name, 
    mainCategory: '契約', 
    workType: 'Work', // 労働として扱う
    crossUnitWorkType: '-', 
    startTime: '08:00', // 枠開始
    endTime: '20:00',   // 枠終了
    breakDurationMinutes: 0, 
    durationHours: i,   // 実働時間
    isNightShift: false, 
    isFlex: true        // ★ FlexフラグON
  });
}

// ★ 結合したパターンリストをエクスポート
export const MOCK_PATTERNS_V5: IShiftPattern[] = [
  ...originalPatterns,
  ...contractPatterns
];

// ★ 全パターンIDのリスト (スタッフ作成用)
const allAvailablePatternIds = MOCK_PATTERNS_V5.map(p => p.patternId);

// ★★★ v5版: ユニットの初期データ (変更なし) ★★★
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

export const getDefaultConstraints = (): IStaffConstraints => ({
  maxConsecutiveDays: 5,
  minIntervalHours: 12,
});

export const MOCK_STAFF_V4: IStaff[] = [
  // スタッフA～H (8名)
  { staffId: 's001', name: 'スタッフA', employmentType: 'FullTime', status: 'Active', skills: ['Leader'], unitId: 'U01', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's002', name: 'スタッフB', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U01', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's003', name: 'スタッフC', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U01', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's004', name: 'スタッフD', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U01', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's005', name: 'スタッフE', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U02', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's006', name: 'スタッフF', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U02', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's007', name: 'スタッフG', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U02', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },
  { staffId: 's008', name: 'スタッフH', employmentType: 'FullTime', status: 'Active', skills: [], unitId: 'U02', 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '全パターン対応' },

  // 応援スタッフ (2名)
  { staffId: 's009', name: '応援スタッフ1', employmentType: 'Rental', status: 'Active', skills: [], unitId: null, 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '応援スタッフ (全パターン対応)' },
  { staffId: 's010', name: '応援スタッフ2', employmentType: 'Rental', status: 'Active', skills: [], unitId: null, 
    availablePatternIds: allAvailablePatternIds, 
    constraints: getDefaultConstraints(), memo: '応援スタッフ (全パターン対応)' },
];