export interface UnitSuggestionItem {
  unit: string;
  location?: string;
  brand?: string;
  project?: string;
  code?: string;
  description?: string;
}

export const extractFloorFromCodeOrName = (str?: string | null): string | null => {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/(?:^|[^a-zA-Z0-9])(B\d|L\d|\d+F|\d+L|GF|MF|RF|BASEMENT\s*\d?|LEVEL\s*\d?|FLOOR\s*\d?)(?:[^a-zA-Z0-9]|$)/i);
  if (m) {
    let token = m[1].toUpperCase().replace(/\s+/g, '');
    if (token.startsWith('BASEMENT')) token = token.replace('BASEMENT', 'B') || 'B1';
    if (token.startsWith('LEVEL')) token = token.replace('LEVEL', 'L') || 'L1';
    if (token.startsWith('FLOOR')) token = token.replace('FLOOR', 'L') || 'L1';
    if (/^\d+F$/.test(token)) token = 'L' + token.replace('F', '');
    if (/^\d+L$/.test(token)) token = 'L' + token.replace('L', '');
    return token;
  }
  return null;
};

export const isValidUrl = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (str === '' || str === '0' || str === '_' || str.toLowerCase() === 'null') return false;
  return true;
};

export function buildUnitSuggestions(
  storeUnits: any[],
  projects: any[],
  activeStore: string,
  availableLocations: string[],
  isAdmin: boolean
): UnitSuggestionItem[] {
  const map = new globalThis.Map<string, UnitSuggestionItem>();
  const allowedLocsSet = new Set(availableLocations.map(l => String(l).toLowerCase().trim()));

  storeUnits.forEach((u: any) => {
    if (u?.name) {
      let loc = u.location || '';
      if (!loc) {
        const m = String(u.name).match(/^(L\d|B\d|\d+F|\d+L|GF|MF|RF)/i);
        if (m) loc = m[1].toUpperCase();
      }
      if (isAdmin || !loc || allowedLocsSet.has(loc.toLowerCase().trim())) {
        const uName = String(u.name).trim();
        const key = `${uName.toLowerCase()}_${loc.toLowerCase().trim()}`;
        map.set(key, {
          unit: uName,
          location: loc,
          brand: '',
          project: '',
          code: uName
        });
      }
    }
  });

  projects.forEach((p: any) => {
    if (!p.store || p.store === activeStore || activeStore === 'all') {
      let loc = p.location || '';
      if (!loc) {
        const m = String(p.code || p.unit || '').match(/^(L\d|B\d|\d+F|\d+L|GF|MF|RF)/i);
        if (m) loc = m[1].toUpperCase();
      }
      if (isAdmin || !loc || allowedLocsSet.has(loc.toLowerCase().trim())) {
        const primaryCode = String(p.unit || p.code || p.name || '').trim();
        if (primaryCode) {
          const key = `${primaryCode.toLowerCase()}_${(p.code || '').toLowerCase().trim()}_${loc.toLowerCase().trim()}`;
          const existing = map.get(key) || { unit: primaryCode, location: loc, brand: '', project: '', code: '', description: '' };
          const desc = p.detail || (p as any).description || p.note || '';
          map.set(key, {
            unit: primaryCode,
            location: loc || existing.location || '',
            brand: p.brandName || existing.brand || '',
            project: p.name || existing.project || '',
            code: p.code || existing.code || primaryCode,
            description: desc || existing.description || ''
          });
        }
      }
    }
  });

  return Array.from(map.values());
}

export function scoreAndFilterUnitSuggestions(
  unitSuggestions: UnitSuggestionItem[],
  unitSearchInput: string,
  currentLocationFilter: string
): UnitSuggestionItem[] {
  if (!unitSearchInput.trim()) return [];
  
  const norm = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const qRaw = unitSearchInput.toLowerCase().trim();
  const q = norm(unitSearchInput);
  const currentLoc = norm(currentLocationFilter || '');

  const scoredList: Array<{ item: UnitSuggestionItem; score: number }> = [];

  unitSuggestions.forEach((item) => {
    const uRaw = (item.unit || '').toLowerCase().trim();
    const bRaw = (item.brand || '').toLowerCase().trim();
    const pRaw = (item.project || '').toLowerCase().trim();
    const cRaw = (item.code || '').toLowerCase().trim();
    const lRaw = (item.location || '').toLowerCase().trim();
    const dRaw = (item.description || '').toLowerCase().trim();

    const uNorm = norm(item.unit);
    const bNorm = norm(item.brand || '');
    const pNorm = norm(item.project || '');
    const cNorm = norm(item.code || '');
    const lNorm = norm(item.location || '');
    const dNorm = norm(item.description || '');

    let score = 0;

    if (bNorm === q || bRaw === qRaw) score = 12000;
    else if (uNorm === q || uRaw === qRaw) score = 11000;
    else if (cNorm === q || cRaw === qRaw) score = 10000;
    else if (pNorm === q || pRaw === qRaw) score = 9000;
    else if (bNorm.startsWith(q) || bRaw.startsWith(qRaw)) score = 8000;
    else if (uNorm.startsWith(q) || uRaw.startsWith(qRaw)) score = 7000;
    else if (cNorm.startsWith(q) || cRaw.startsWith(qRaw)) score = 6000;
    else if (pNorm.startsWith(q) || pRaw.startsWith(qRaw)) score = 5000;
    else {
      const bWords = bNorm.split(/[\s\-_\/.,;]+/);
      const uWords = uNorm.split(/[\s\-_\/.,;]+/);
      const cWords = cNorm.split(/[\s\-_\/.,;]+/);
      const pWords = pNorm.split(/[\s\-_\/.,;]+/);
      const dWords = dNorm.split(/[\s\-_\/.,;]+/);

      if (bWords.some(w => w.startsWith(q))) score = 4000;
      else if (uWords.some(w => w.startsWith(q))) score = 3500;
      else if (cWords.some(w => w.startsWith(q))) score = 3000;
      else if (pWords.some(w => w.startsWith(q))) score = 2500;
      else if (dWords.some(w => w.startsWith(q))) score = 2200;
      else if (bNorm.includes(q) || bRaw.includes(qRaw)) score = 2000;
      else if (uNorm.includes(q) || uRaw.includes(qRaw)) score = 1700;
      else if (cNorm.includes(q) || cRaw.includes(qRaw)) score = 1400;
      else if (pNorm.includes(q) || pRaw.includes(qRaw)) score = 1100;
      else if (dNorm.includes(q) || dRaw.includes(qRaw)) score = 900;
      else if (lNorm.includes(q) || lRaw.includes(qRaw)) score = 600;
    }

    if (score > 0) {
      const matchLen = (bNorm.includes(q) ? bNorm.length : (uNorm.includes(q) ? uNorm.length : (cNorm.includes(q) ? cNorm.length : pNorm.length))) || 50;
      score += Math.max(0, 100 - Math.min(matchLen, 100));

      if (currentLoc && lNorm === currentLoc) {
        score += 50;
      }

      scoredList.push({ item, score });
    }
  });

  scoredList.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.item.unit || '').localeCompare(b.item.unit || '');
  });

  return scoredList.map(s => s.item);
}

export function resolveTargetFloorForUnit(
  unitItem: { unit: string; location?: string; brand?: string; project?: string; code?: string },
  projects: any[]
): string {
  if (unitItem.location && unitItem.location.toLowerCase() !== 'all') {
    return String(unitItem.location).trim().toUpperCase();
  }
  const qCode = String(unitItem.unit).trim().toLowerCase();
  const matchedP = projects.find(p => 
    ((p as any).unit && String((p as any).unit).trim().toLowerCase() === qCode) ||
    (p.code && String(p.code).trim().toLowerCase() === qCode) ||
    (p.name && String(p.name).trim().toLowerCase() === String(unitItem.project || '').trim().toLowerCase())
  );
  if (matchedP?.location && matchedP.location.toLowerCase() !== 'all') {
    return String(matchedP.location).trim().toUpperCase();
  }
  const extracted = extractFloorFromCodeOrName(unitItem.unit) ||
    extractFloorFromCodeOrName(matchedP?.code) ||
    extractFloorFromCodeOrName(matchedP?.name);
  return extracted || '';
}

export function resolveInitialTargetLocation(
  initialLocation: string,
  initialProjectCode: string,
  projects: any[],
  tasks: any[],
  allStoreVersions: any[],
  unitInfo: any[]
): string {
  let targetLoc = (initialLocation && initialLocation !== 'all') ? String(initialLocation).trim().toUpperCase() : '';
  if (!initialProjectCode || targetLoc) return targetLoc;

  const qCode = String(initialProjectCode).trim().toLowerCase();

  // 1. Search in projects
  const matched = projects.find(p => 
    (p.code && String(p.code).trim().toLowerCase() === qCode) ||
    ((p as any).unit && String((p as any).unit).trim().toLowerCase() === qCode) ||
    (p.name && String(p.name).trim().toLowerCase() === qCode) ||
    (p.id && String(p.id).trim().toLowerCase() === qCode)
  );
  if (matched?.location && matched.location.toLowerCase() !== 'all') {
    return String(matched.location).trim().toUpperCase();
  }

  // 2. Search in project tasks
  const matchedTask = tasks.find(t => 
    (t.projectCode && String(t.projectCode).trim().toLowerCase() === qCode) ||
    (matched?.id && (t as any).projectId === matched.id)
  );
  if ((matchedTask as any)?.location && (matchedTask as any).location.toLowerCase() !== 'all') {
    return String((matchedTask as any).location).trim().toUpperCase();
  }

  // 3. Search in unitInfo
  const matchedUInfo = unitInfo.find((u: any) => 
    (u.unit && String(u.unit).trim().toLowerCase() === qCode) ||
    (u.name && String(u.name).trim().toLowerCase() === qCode) ||
    (u.unitId && String(u.unitId).trim().toLowerCase() === qCode)
  );
  if (matchedUInfo?.floor || matchedUInfo?.location) {
    return String(matchedUInfo.floor || matchedUInfo.location).trim().toUpperCase();
  }

  // 4. Search in store versions
  for (const v of allStoreVersions) {
    if (!v.location) continue;
    if (v.groupMappings) {
      const hasUnit = Object.values(v.groupMappings).some((arr: any) => 
        Array.isArray(arr) && arr.some(id => String(id).trim().toLowerCase() === qCode)
      );
      if (hasUnit) {
        return String(v.location).trim().toUpperCase();
      }
    }
    if ((v as any).mapUnits && Array.isArray((v as any).mapUnits)) {
      const hasUnit = (v as any).mapUnits.some((u: any) => 
        (u.name && String(u.name).trim().toLowerCase() === qCode) ||
        (u.id && String(u.id).trim().toLowerCase() === qCode)
      );
      if (hasUnit) {
        return String(v.location).trim().toUpperCase();
      }
    }
  }

  // 5. Regex extraction
  const extracted = extractFloorFromCodeOrName(initialProjectCode) ||
    extractFloorFromCodeOrName(matched?.code) ||
    extractFloorFromCodeOrName(matched?.name) ||
    extractFloorFromCodeOrName((matched as any)?.unit);

  return extracted || '';
}

export function sortLocationsByFloorRank(locList: string[]): string[] {
  const floorRank = (name: string) => {
    const n = name.toUpperCase().trim();
    if (n.startsWith('B')) {
      const num = parseInt(n.replace('B', ''), 10) || 1;
      return -100 + num;
    }
    if (n === 'GF' || n === 'G') return 0;
    if (n === 'MF' || n === 'M') return 0.5;
    if (n.startsWith('L')) {
      const num = parseInt(n.replace('L', ''), 10) || 1;
      return num;
    }
    if (/^\d+F$/.test(n)) {
      return parseInt(n.replace('F', ''), 10) || 1;
    }
    return 100;
  };

  return [...locList].sort((a, b) => floorRank(a) - floorRank(b) || a.localeCompare(b));
}
