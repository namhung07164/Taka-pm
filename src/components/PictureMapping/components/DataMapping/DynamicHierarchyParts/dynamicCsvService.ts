import { v4 as uuidv4 } from 'uuid';
import { Group, GroupRule, HatchPatternType, MapVersion } from '../types';
import { HATCH_PATTERNS } from '../../../../LayoutTabParts/layoutPatternUtils';
import { DynamicUnitSummaryItem } from '../../../lib/dynamicRuleMatcher';
import {
  buildSheet2FieldGuideAOA,
  DYNAMIC_OPERATOR_DICTIONARY,
  DYNAMIC_RULE_FIELD_DICTIONARY,
  getRuleFieldDisplayLabel,
  resolveCanonicalRuleField,
  RuleFieldDefinition,
} from './dynamicFieldDictionary';

export {
  DYNAMIC_RULE_FIELD_DICTIONARY,
  DYNAMIC_OPERATOR_DICTIONARY,
  resolveCanonicalRuleField,
  getRuleFieldDisplayLabel,
  buildSheet2FieldGuideAOA,
};
export type { RuleFieldDefinition };

/**
 * Builds Sheet 1 rows (Dynamic Rules) from the active version (or sample starter rows for templates).
 */
export function buildDynamicRulesSheetRows(params: {
  version?: MapVersion;
  store: string;
  location: string;
  year: string;
  groupMatchDetailsMap?: Map<string, { unitNames: string[]; totalAreaM2: number }>;
}): Record<string, any>[] {
  const { version, store, location, year, groupMatchDetailsMap } = params;
  const vName = version?.name || `PM-${location}-${store}`;
  const vStore = version?.store || store;
  const vLoc = version?.location || location;
  const vYear = String(version?.year || year);
  const groups = version?.groups || [];

  if (groups.length === 0) {
    return [
      {
        Store: vStore,
        Location: vLoc,
        Year: vYear,
        Version_Name: vName,
        Group_Name: 'Approached',
        Color: '#3b82f6',
        Opacity: 0.6,
        Hatch_Pattern: 'none',
        Symbol: '',
        Rule_Order: 1,
        Rule_Field: 'floor',
        Rule_Field_Label: 'Floor',
        Rule_Operator: '=',
        Rule_Value: vLoc,
        Matched_Units_Count: 0,
        Matched_Area_M2: 0,
      },
      {
        Store: vStore,
        Location: vLoc,
        Year: vYear,
        Version_Name: vName,
        Group_Name: 'Approached',
        Color: '#3b82f6',
        Opacity: 0.6,
        Hatch_Pattern: 'none',
        Symbol: '',
        Rule_Order: 2,
        Rule_Field: 'appProjectMdStatus',
        Rule_Field_Label: 'App: MD Status',
        Rule_Operator: '=',
        Rule_Value: 'Approached',
        Matched_Units_Count: 0,
        Matched_Area_M2: 0,
      },
      {
        Store: vStore,
        Location: vLoc,
        Year: vYear,
        Version_Name: vName,
        Group_Name: 'Negotiation',
        Color: '#22c55e',
        Opacity: 0.6,
        Hatch_Pattern: 'none',
        Symbol: '',
        Rule_Order: 1,
        Rule_Field: 'floor',
        Rule_Field_Label: 'Floor',
        Rule_Operator: '=',
        Rule_Value: vLoc,
        Matched_Units_Count: 0,
        Matched_Area_M2: 0,
      },
      {
        Store: vStore,
        Location: vLoc,
        Year: vYear,
        Version_Name: vName,
        Group_Name: 'Negotiation',
        Color: '#22c55e',
        Opacity: 0.6,
        Hatch_Pattern: 'none',
        Symbol: '',
        Rule_Order: 2,
        Rule_Field: 'appProjectMdStatus',
        Rule_Field_Label: 'App: MD Status',
        Rule_Operator: '=',
        Rule_Value: 'Negotiation',
        Matched_Units_Count: 0,
        Matched_Area_M2: 0,
      },
    ];
  }

  const rows: Record<string, any>[] = [];
  groups.forEach((grp) => {
    const matchInfo = groupMatchDetailsMap?.get(grp.id);
    const matchedCount = matchInfo?.unitNames.length ?? 0;
    const matchedArea = Number((matchInfo?.totalAreaM2 ?? 0).toFixed(2));
    const rules = grp.rules && grp.rules.length > 0 ? grp.rules : [{ field: '', operator: '=', value: '' }];

    rules.forEach((r, idx) => {
      const canonicalField = r.field ? resolveCanonicalRuleField(r.field) : '';
      rows.push({
        Store: vStore,
        Location: vLoc,
        Year: vYear,
        Version_Name: vName,
        Group_Name: grp.name,
        Color: grp.color || '#3b82f6',
        Opacity: grp.opacity ?? 0.6,
        Hatch_Pattern: grp.hatchPattern || 'none',
        Symbol: grp.symbol || '',
        Rule_Order: idx + 1,
        Rule_Field: canonicalField,
        Rule_Field_Label: canonicalField ? getRuleFieldDisplayLabel(canonicalField) : '',
        Rule_Operator: r.operator || '=',
        Rule_Value: r.value ?? '',
        Matched_Units_Count: matchedCount,
        Matched_Area_M2: matchedArea,
      });
    });
  });

  return rows;
}

/**
 * Exports a 2-Sheet Excel Workbook (.xlsx) or CSV containing Sheet 1 (Dynamic Rules) + Sheet 2 (Field Guide & Live Data).
 */
export async function exportDynamicHierarchyFile(params: {
  format: 'xlsx' | 'csv' | 'template_xlsx';
  activeVersion?: MapVersion;
  store: string;
  location: string;
  year: string;
  summaryList: DynamicUnitSummaryItem[];
  groupMatchDetailsMap?: Map<string, { unitNames: string[]; totalAreaM2: number }>;
}): Promise<void> {
  const { format, activeVersion, store, location, year, summaryList, groupMatchDetailsMap } = params;
  const XLSX = await import('xlsx');

  const sheet1Rows = buildDynamicRulesSheetRows({
    version: format === 'template_xlsx' ? undefined : activeVersion,
    store,
    location,
    year,
    groupMatchDetailsMap,
  });

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows);
  ws1['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 9 },
    { wch: 15 },
    { wch: 9 },
    { wch: 11 },
    { wch: 22 },
    { wch: 28 },
    { wch: 14 },
    { wch: 26 },
    { wch: 18 },
    { wch: 16 },
  ];

  const safeVerName = (activeVersion?.name || `PM_${location}_${store}`).replace(/[^a-zA-Z0-9_-]/g, '_');

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(ws1);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dynamic_Rules_${safeVerName}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Dynamic_Rules_Import');

  const sheet2AOA = buildSheet2FieldGuideAOA({ store, location, year, summaryList });
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2AOA);
  ws2['!cols'] = [
    { wch: 26 },
    { wch: 30 },
    { wch: 28 },
    { wch: 16 },
    { wch: 22 },
    { wch: 52 },
    { wch: 42 },
    { wch: 44 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2_Field_Guide_Data');

  const fileName =
    format === 'template_xlsx'
      ? `Dynamic_Rules_Template_With_Guide_${store}_${location}_${year}.xlsx`
      : `Dynamic_Rules_${safeVerName}_${year}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

const VALID_HATCH_SET = new Set<string>(HATCH_PATTERNS.map((p) => p.id));
const VALID_OPERATORS = new Set<string>(['=', '>', '<', '>=', '<=', 'contains', 'or', 'exclude']);

/**
 * Parses an uploaded .xlsx or .csv file into Dynamic Hierarchy Groups & Rules.
 */
export async function parseDynamicHierarchyImportFile(
  file: File,
  existingGroups: Group[] = [],
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ groups: Group[]; importedGroupsCount: number; importedRulesCount: number }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error('File does not contain any valid sheets.');

  const ws = wb.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('Sheet 1 contains no data rows to import.');
  }

  const getCol = (row: Record<string, any>, candidates: string[]): string => {
    const rowKeys = Object.keys(row);
    for (const c of candidates) {
      const exact = row[c];
      if (exact !== undefined && exact !== null && String(exact).trim() !== '') {
        return String(exact).trim();
      }
      const foundKey = rowKeys.find((k) => k.trim().toLowerCase() === c.toLowerCase());
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
        return String(row[foundKey]).trim();
      }
    }
    return '';
  };

  const importedGroupMap = new Map<string, Group>();
  let importedRulesCount = 0;

  rawRows.forEach((row) => {
    const groupName = getCol(row, ['Group_Name', 'Group Name', 'GroupName', 'Group', 'Tên Nhóm']);
    if (!groupName) return;

    const groupKey = groupName.toLowerCase();
    let group = importedGroupMap.get(groupKey);

    const rawColor = getCol(row, ['Color', 'Hex_Color', 'Màu']);
    const rawOpacity = getCol(row, ['Opacity', 'Độ mờ']);
    const rawPattern = getCol(row, ['Hatch_Pattern', 'Hatch Pattern', 'Pattern', 'Kiểu tô']).toLowerCase();
    const rawSymbol = getCol(row, ['Symbol', 'Marker', 'Ký hiệu']);

    if (!group) {
      const existingMatch = existingGroups.find((g) => g.name.trim().toLowerCase() === groupKey);
      const parsedOpacity = rawOpacity !== '' ? Number(rawOpacity) : undefined;
      const validOpacity =
        parsedOpacity !== undefined && Number.isFinite(parsedOpacity)
          ? Math.max(0, Math.min(1, parsedOpacity))
          : existingMatch?.opacity ?? 0.6;

      const validPattern: HatchPatternType = VALID_HATCH_SET.has(rawPattern)
        ? (rawPattern as HatchPatternType)
        : existingMatch?.hatchPattern || 'none';

      group = {
        id: existingMatch?.id || uuidv4(),
        name: groupName,
        color: rawColor || existingMatch?.color || '#3b82f6',
        opacity: validOpacity,
        hatchPattern: validPattern,
        symbol: rawSymbol !== '' ? rawSymbol.slice(0, 4) : existingMatch?.symbol || '',
        rules: [],
      };
      importedGroupMap.set(groupKey, group);
    }

    const rawField = getCol(row, ['Rule_Field', 'Rule Field', 'Field', 'Rule_Field_Label', 'Rule Field Label', 'Trường']);
    const rawOperator = getCol(row, ['Rule_Operator', 'Rule Operator', 'Operator', 'Toán tử']);
    const rawValue = getCol(row, ['Rule_Value', 'Rule Value', 'Value', 'Giá trị']);

    if (rawField && rawValue !== '') {
      const canonicalField = resolveCanonicalRuleField(rawField);
      const opLower = rawOperator.toLowerCase();
      const operator = VALID_OPERATORS.has(opLower)
        ? opLower
        : VALID_OPERATORS.has(rawOperator)
        ? rawOperator
        : '=';

      const nextRule: GroupRule = {
        field: canonicalField,
        operator,
        value: rawValue,
      };
      group.rules = [...(group.rules || []), nextRule];
      importedRulesCount++;
    }
  });

  if (importedGroupMap.size === 0) {
    throw new Error('No valid Group_Name rows found in the uploaded file.');
  }

  const importedGroups = Array.from(importedGroupMap.values());

  if (mode === 'replace') {
    return {
      groups: importedGroups,
      importedGroupsCount: importedGroups.length,
      importedRulesCount,
    };
  }

  const mergedGroups: Group[] = existingGroups.map((eg) => {
    const incoming = importedGroupMap.get(eg.name.trim().toLowerCase());
    if (!incoming) return eg;
    importedGroupMap.delete(eg.name.trim().toLowerCase());
    return {
      ...eg,
      ...incoming,
      id: eg.id,
    };
  });

  for (const remaining of importedGroupMap.values()) {
    mergedGroups.push(remaining);
  }

  return {
    groups: mergedGroups,
    importedGroupsCount: importedGroups.length,
    importedRulesCount,
  };
}
