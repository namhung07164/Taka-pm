import React, { memo, useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { UnitShape, MapVersion } from '../types';
import { getUnitEffectiveSizeM2 } from '../../../../../lib/unitSizeResolver';
import { useAppStore } from '../../../../../store/useAppStore';

export interface UnitSizeCsvToolbarProps {
  units: UnitShape[];
  activeVersion: MapVersion | undefined;
  activeVersionId: string | null;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  effectiveYear: string;
  summaryMap: Map<string, any>;
  handleSetUnitsWithHistory: (newUnits: UnitShape[]) => void;
  syncUnitSizeToMatchedProjects: (params: any) => void;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(headerLine: string): string {
  if (headerLine.includes('\t')) return '\t';
  const semiCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

function parseNumericSize(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/^["']+|["']+$/g, '').replace(/\s*m2|\s*m²|\s*sqm/gi, '').trim();
  if (!cleaned) return undefined;
  const normalized = cleaned.replace(/,/g, '.');
  const num = parseFloat(normalized);
  return !isNaN(num) && num >= 0 ? Math.round(num * 100) / 100 : undefined;
}

export const UnitSizeCsvToolbar = memo(function UnitSizeCsvToolbar({
  units,
  activeVersion,
  activeVersionId,
  versions,
  setVersions,
  effectiveYear,
  summaryMap,
  handleSetUnitsWithHistory,
  syncUnitSizeToMatchedProjects,
}: UnitSizeCsvToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportCsv = () => {
    if (units.length === 0) {
      useAppStore.getState().setToast({
        title: 'Export CSV',
        message: 'No units available in the current floor to export.',
        type: 'warning',
      });
      return;
    }

    const storeCode = activeVersion?.store || units[0]?.store || 'HCM';
    const locationCode = activeVersion?.location || units[0]?.location || 'L1';
    const yearStr = activeVersion?.year || effectiveYear;

    const rows: string[] = ['Unit Name,Size (m2),Location,Store'];
    const sortedUnits = [...units].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true })
    );

    for (const u of sortedUnits) {
      const uName = String(u.name || '').trim();
      const effSize = getUnitEffectiveSizeM2(
        u,
        activeVersion,
        uName ? summaryMap.get(uName)?.size : undefined
      );
      const sizeStr = effSize > 0 ? String(effSize) : '';
      const locStr = String(u.location || locationCode).trim();
      const stStr = String(u.store || storeCode).trim();
      const escapedName = uName.includes(',') || uName.includes('"') ? `"${uName.replace(/"/g, '""')}"` : uName;
      rows.push(`${escapedName},${sizeStr},${locStr},${stStr}`);
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unit_sizes_${storeCode}_${locationCode}_${yearStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    useAppStore.getState().setToast({
      title: 'Export CSV Complete',
      message: `Exported ${sortedUnits.length} units (${storeCode} • ${locationCode}) to CSV.`,
      type: 'success',
    });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '').replace(/^\uFEFF/, '');
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length === 0) {
          useAppStore.getState().setToast({
            title: 'Import CSV Failed',
            message: 'The selected CSV file is empty.',
            type: 'error',
          });
          return;
        }

        const delimiter = detectDelimiter(lines[0]);
        const firstCols = parseCsvLine(lines[0], delimiter).map((c) => c.toLowerCase());

        let nameIdx = 0;
        let sizeIdx = 1;
        let startRow = 0;

        const detectedNameIdx = firstCols.findIndex((c) =>
          c.includes('unit') || c.includes('name') || c.includes('mã') || c.includes('code')
        );
        const detectedSizeIdx = firstCols.findIndex((c) =>
          c.includes('size') || c.includes('m2') || c.includes('m²') || c.includes('sqm') || c.includes('diện tích') || c.includes('area')
        );

        if (detectedNameIdx !== -1 || detectedSizeIdx !== -1) {
          if (detectedNameIdx !== -1) nameIdx = detectedNameIdx;
          if (detectedSizeIdx !== -1) sizeIdx = detectedSizeIdx;
          startRow = 1;
        } else if (parseNumericSize(firstCols[1]) === undefined && lines.length > 1) {
          startRow = 1;
        }

        const sizeMapByUnitName = new Map<string, number>();
        for (let i = startRow; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i], delimiter);
          const rawUnitName = String(cols[nameIdx] || '').trim();
          if (!rawUnitName) continue;

          // If delimiter was comma and user wrote unquoted "L2-211,68,8", handle 2-part decimal fallback
          let rawSizeStr = cols[sizeIdx];
          if (
            delimiter === ',' &&
            cols.length === 3 &&
            sizeIdx === 1 &&
            /^\d+$/.test(String(cols[1] || '').trim()) &&
            /^\d+$/.test(String(cols[2] || '').trim())
          ) {
            rawSizeStr = `${cols[1].trim()}.${cols[2].trim()}`;
          }

          const parsedSize = parseNumericSize(rawSizeStr);
          if (parsedSize !== undefined) {
            sizeMapByUnitName.set(rawUnitName.toUpperCase(), parsedSize);
          }
        }

        if (sizeMapByUnitName.size === 0) {
          useAppStore.getState().setToast({
            title: 'Import CSV Notice',
            message: 'No valid Unit Name and Size (m²) rows found in CSV.',
            type: 'warning',
          });
          return;
        }

        let updatedCount = 0;
        const touchedUnits: Array<{ id: string; name: string; size: number }> = [];

        const updatedUnits = units.map((u) => {
          const key = String(u.name || '').trim().toUpperCase();
          if (!key || !sizeMapByUnitName.has(key)) return u;
          const nextSize = sizeMapByUnitName.get(key)!;
          updatedCount++;
          touchedUnits.push({ id: u.id, name: u.name, size: nextSize });
          return {
            ...u,
            sizeM2: nextSize,
            size: nextSize,
          };
        });

        if (updatedCount === 0) {
          useAppStore.getState().setToast({
            title: 'Import CSV Notice',
            message: `Parsed ${sizeMapByUnitName.size} rows from CSV, but none matched unit names on this floor.`,
            type: 'warning',
          });
          return;
        }

        handleSetUnitsWithHistory(updatedUnits);

        let updatedVersions = versions;
        if (activeVersionId) {
          updatedVersions = versions.map((v) => {
            if (v.id !== activeVersionId) return v;
            const nextUnitSizes = { ...(v.unitSizes || {}) };
            for (const item of touchedUnits) {
              const uNameKey = item.name.trim().toUpperCase();
              if (item.size > 0) {
                nextUnitSizes[item.id] = item.size;
                if (uNameKey) nextUnitSizes[uNameKey] = item.size;
              } else {
                delete nextUnitSizes[item.id];
                if (uNameKey) delete nextUnitSizes[uNameKey];
              }
            }
            return {
              ...v,
              unitSizes: nextUnitSizes,
              ...(Array.isArray(v.mapUnits) && v.mapUnits.length > 0
                ? {
                    mapUnits: v.mapUnits.map((vu) => {
                      const vuKey = String(vu.name || '').trim().toUpperCase();
                      if (vuKey && sizeMapByUnitName.has(vuKey)) {
                        const sz = sizeMapByUnitName.get(vuKey)!;
                        return { ...vu, sizeM2: sz, size: sz };
                      }
                      return vu;
                    }),
                  }
                : {}),
            };
          });
          setVersions(updatedVersions);
        }

        for (const item of touchedUnits) {
          syncUnitSizeToMatchedProjects({
            unitId: item.id,
            unitName: item.name,
            store: activeVersion?.store,
            location: activeVersion?.location,
            year: activeVersion?.year || effectiveYear,
            updatedUnits,
            updatedVersions,
            activeVersionId,
          });
        }

        useAppStore.getState().setToast({
          title: 'Import CSV Success',
          message: `Updated Size (m²) for ${updatedCount} units! Click "Save Cloud" to persist.`,
          type: 'success',
        });
      } catch (err: any) {
        useAppStore.getState().setToast({
          title: 'Import CSV Error',
          message: err?.message || 'Failed to parse CSV file.',
          type: 'error',
        });
      }
    };

    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-1 pt-0.5">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 touch-manipulation cursor-pointer"
        title="Import CSV (Unit Name, Size m²) to batch-fill unit sizes"
      >
        <Upload size={10} className="shrink-0" />
        <span>Import CSV</span>
      </button>
      <button
        type="button"
        onClick={handleExportCsv}
        className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-300 text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 touch-manipulation cursor-pointer"
        title="Export unit names and sizes (m²) to CSV template"
      >
        <Download size={10} className="shrink-0" />
        <span>Export CSV</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportCsv}
      />
    </div>
  );
});
