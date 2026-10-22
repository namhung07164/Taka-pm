export const formatToCSVDate = (isoString: string | undefined): string => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hour}:${minute}`;
};

export const parseCSVDate = (csvDate: any): string => {
  if (!csvDate) return '';
  const str = String(csvDate).trim();
  if (str.includes('T')) return str;
  const parts = str.split(' ');
  if (parts.length >= 2) {
    const dateParts = parts[0].split(/[\/\-]/);
    const timeParts = parts[1].split(':');
    if (dateParts.length === 3 && timeParts.length >= 2) {
      if (dateParts[0].length === 4) {
        const year = dateParts[0];
        const month = dateParts[1].padStart(2, '0');
        const day = dateParts[2].padStart(2, '0');
        const hour = timeParts[0].padStart(2, '0');
        const minute = timeParts[1].padStart(2, '0');
        return `${year}-${month}-${day}T${hour}:${minute}`;
      }
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      const year = dateParts[2];
      const hour = timeParts[0].padStart(2, '0');
      const minute = timeParts[1].padStart(2, '0');
      return `${year}-${month}-${day}T${hour}:${minute}`;
    }
  }
  return str;
};

export const formatPredecessorForExport = (predString: string | undefined | null, projCode?: string): string => {
  if (!predString || !String(predString).trim()) return '';
  const strPred = String(predString).trim();

  return strPred
    .split(/([,;]\s*)/)
    .map(part => {
      if (part === ',' || part === ';' || /^\s*$/.test(part)) return part;
      const cleanToken = part.trim();
      if (!cleanToken) return part;

      // Replace dash '-' between project code/prefix and task index with '#' e.g. "A01-1" -> "A01#1", "A01-1SS" -> "A01#1SS"
      let formatted = cleanToken.replace(/^([A-Za-z0-9_]+)-(\d+)(.*)$/, '$1#$2$3');

      // If token does not have '#' and projCode is provided, and token starts with purely digits (e.g. "1" or "1SS")
      if (projCode && !formatted.includes('#') && !formatted.toLowerCase().startsWith(projCode.toLowerCase())) {
        if (/^\d+/.test(formatted)) {
          formatted = `${projCode}#${formatted}`;
        }
      }

      return formatted;
    })
    .join('');
};
