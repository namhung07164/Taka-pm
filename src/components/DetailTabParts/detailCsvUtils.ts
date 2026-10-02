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
