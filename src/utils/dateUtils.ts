// src/utils/dateUtils.ts
import JapaneseHolidays from 'japanese-holidays';

export type MonthDay = {
  dateStr: string;
  weekday: string;
  dayOfWeek: number;
  holidayName?: string;
};

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

// 内部ヘルパー: DateオブジェクトからMonthDayを生成
const createMonthDay = (date: Date): MonthDay => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayOfWeek = date.getDay();
  const holidayName = JapaneseHolidays.isHoliday(date);
  
  return {
    dateStr,
    weekday: weekdays[dayOfWeek],
    dayOfWeek,
    holidayName: holidayName || undefined,
  };
};

export const getMonthDays = (year: number, month: number): MonthDay[] => {
  const date = new Date(year, month - 1, 1);
  const days: MonthDay[] = [];
  
  while (date.getMonth() === month - 1) {
    days.push(createMonthDay(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

// ★ 追加: 月を含む「完全な週（日曜始まり〜土曜終わり）」の配列を生成
export const getFullWeeksForMonth = (year: number, month: number): MonthDay[][] => {
  const weeks: MonthDay[][] = [];
  
  // 月初 (1日)
  const firstDateOfMonth = new Date(year, month - 1, 1);
  // その週の日曜日まで戻る
  const startDate = new Date(firstDateOfMonth);
  startDate.setDate(firstDateOfMonth.getDate() - firstDateOfMonth.getDay());

  // 月末
  const lastDateOfMonth = new Date(year, month, 0);
  // その週の土曜日まで進む
  const endDate = new Date(lastDateOfMonth);
  endDate.setDate(lastDateOfMonth.getDate() + (6 - lastDateOfMonth.getDay()));

  let currentWeek: MonthDay[] = [];
  let currentDate = new Date(startDate);

  // startDate から endDate までループ
  while (currentDate <= endDate) {
    currentWeek.push(createMonthDay(currentDate));

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return weeks;
};

export const getDefaultRequiredHolidays = (monthDays: MonthDay[]): number => {
  return monthDays.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6 || d.holidayName).length;
};

export const getPrevDateStr = (dateStr: string) => {
  const d = new Date(dateStr.replace(/-/g, '/')); 
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};