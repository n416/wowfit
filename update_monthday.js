import fs from 'fs';
import path from 'path';

// 置換対象のファイルリスト
const targetFiles = [
  'src/hooks/useStaffBurdenData.ts',
  'src/hooks/useCalendarInteractions.ts',
  'src/hooks/useDailyGanttLogic.ts',
  'src/hooks/useShiftCalendarLogic.ts',
  'src/hooks/useUnitGroups.ts',
  'src/hooks/useDemandMap.ts',
  'src/components/calendar/DailyUnitGanttModal.tsx',
  'src/components/calendar/WorkSlotCalendarView.tsx',
  'src/components/calendar/StaffStatusModal.tsx',
  'src/lib/placement/workAllocator.ts',
  'src/pages/ShiftCalendarPage.tsx'
];

// プロジェクトのルート（実行場所）
const projectRoot = process.cwd();

// MonthDayの型定義を削除する正規表現 (改行やスペースに対応)
const typeDefRegex = /type\s+MonthDay\s*=\s*\{[\s\S]*?\};?/g;

targetFiles.forEach(filePath => {
  const fullPath = path.join(projectRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[Skip] File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let isUpdated = false;

  // 1. 型定義の削除
  if (typeDefRegex.test(content)) {
    content = content.replace(typeDefRegex, '');
    // 余分な空行が残らないように少し調整
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    isUpdated = true;
    console.log(`[Remove Type] ${filePath}`);
  }

  // 2. Importの追加・更新
  const fileDir = path.dirname(filePath);
  let relativePath = path.relative(fileDir, 'src/utils/dateUtils');
  // Windows環境対策: バックスラッシュをスラッシュに置換
  relativePath = relativePath.replace(/\\/g, '/'); 
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  // 既存の dateUtils インポートを探す
  const importRegex = new RegExp(`import\\s+\\{(.*?)\\}\\s+from\\s+['"]${relativePath}['"];?`);
  const match = content.match(importRegex);

  if (match) {
    // 既にインポートがある場合 -> MonthDay がなければ追加
    const existingImports = match[1];
    if (!existingImports.includes('MonthDay')) {
      const newImportLine = match[0].replace('{', '{ MonthDay, ');
      content = content.replace(match[0], newImportLine);
      isUpdated = true;
      console.log(`[Update Import] ${filePath}`);
    }
  } else {
    // インポートがない場合 -> 新規追加
    const lastImportIndex = content.lastIndexOf('import ');
    const importStatement = `import { MonthDay } from '${relativePath}';\n`;
    
    if (lastImportIndex !== -1) {
      const endOfLineIndex = content.indexOf('\n', lastImportIndex) + 1;
      content = content.slice(0, endOfLineIndex) + importStatement + content.slice(endOfLineIndex);
    } else {
      content = importStatement + content;
    }
    isUpdated = true;
    console.log(`[Add Import] ${filePath}`);
  }

  // 3. ファイル書き込み
  if (isUpdated) {
    fs.writeFileSync(fullPath, content, 'utf8');
  } else {
    console.log(`[No Changes] ${filePath}`);
  }
});

console.log('Done.');