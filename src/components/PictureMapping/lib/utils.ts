import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function autoFormatRow(row: any): any {
  if (!row || typeof row !== 'object') return row;

  const newRow = { ...row };
  for (const key in newRow) {
    if (Object.prototype.hasOwnProperty.call(newRow, key)) {
      const val = newRow[key];
      if (typeof val === 'string') {
        const lowerKey = key.toLowerCase();
        
        // Auto-format dates
        if (lowerKey.includes('date') || lowerKey.includes('ngày') || lowerKey.includes('ngay') || lowerKey.includes('time') || lowerKey.includes('update')) {
          newRow[key] = standardizeDateToMMDDYYYY(val);
        }
        
        // Auto-format phone numbers
        if (lowerKey.includes('phone') || lowerKey.includes('điện thoại') || lowerKey.includes('sđt') || lowerKey.includes('sdt') || lowerKey.includes('tel')) {
          let cleaned = val.replace(/\D/g, '');
          if (cleaned.startsWith('84') && cleaned.length >= 10) {
            cleaned = '0' + cleaned.substring(2);
          } else if (cleaned.length >= 9 && !cleaned.startsWith('0')) {
             if (cleaned.length === 9) cleaned = '0' + cleaned;
          }
          if (cleaned) {
             newRow[key] = cleaned;
          }
        }
      }
    }
  }
  return newRow;
}

export function standardizeDateToMMDDYYYY(dateStr: string): string {

  if (!dateStr) return '';
  const str = String(dateStr).trim();

  // YYYY-MM-DD matches
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = str.split('-');
    return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
  }

  // Slash or dash combinations
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      let m, d, y;

      if (parts[2].length === 4) {
        // Always enforce incoming as MM/DD/YYYY if year is last
        m = parts[0];
        d = parts[1];
        y = parts[2];
      } else if (parts[0].length === 4) {
        // YYYY/MM/DD
        y = parts[0];
        m = parts[1];
        d = parts[2];
      }
      
      if (m && d && y) {
        return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
      }
    }
  }

  return str;
}
