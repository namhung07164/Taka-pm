import { safeGetItemLocal, safeSetItemLocal } from "../storage";

const MAX_SEARCH_NORM_CACHE = 4000;
const _accentNormCache = new Map<string, string>();
const _compactNormCache = new Map<string, string>();

const RECENT_SEARCHES_STORAGE_KEY = "taka_recent_searches_v1";
const MAX_RECENT_SEARCHES = 7;

export function normalizeSearchDashes(str: string | undefined | null): string {
  if (!str) return "";
  return String(str).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

/**
 * Strips Vietnamese & Unicode diacritics and lowercases the string.
 * Cached in memory for O(1) repeated lookups during table/Gantt filtering.
 */
export function stripSearchAccents(input: string | number | boolean | undefined | null): string {
  if (input === undefined || input === null) return "";
  const raw = String(input);
  if (!raw) return "";

  const cached = _accentNormCache.get(raw);
  if (cached !== undefined) return cached;

  const normalized = normalizeSearchDashes(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

  if (_accentNormCache.size >= MAX_SEARCH_NORM_CACHE) {
    _accentNormCache.clear();
  }
  _accentNormCache.set(raw, normalized);
  return normalized;
}

/**
 * Strips punctuation/delimiters (#, _, -, ., /, spaces) and accents for code matching
 * (e.g. "l1104" matches "L1-104", "smz21" matches "SMZ2#1").
 */
export function normalizeCompactSearchCode(input: string | undefined | null): string {
  if (!input) return "";
  const cached = _compactNormCache.get(input);
  if (cached !== undefined) return cached;

  const compact = stripSearchAccents(input).replace(/[#_\-./\s]/g, "");
  if (_compactNormCache.size >= MAX_SEARCH_NORM_CACHE) {
    _compactNormCache.clear();
  }
  _compactNormCache.set(input, compact);
  return compact;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Evaluates whether a single atomic search token matches a candidate field value.
 */
export function matchesSingleSearchTokenInValue(
  fieldVal: string | number | boolean | undefined | null,
  rawTermLower: string,
  accentFreeTerm: string,
  compactTerm: string,
  isExact: boolean
): boolean {
  if (fieldVal === undefined || fieldVal === null) return false;
  const valStr = String(fieldVal);
  if (!valStr) return false;

  const valLower = normalizeSearchDashes(valStr).toLowerCase().trim();
  if (!valLower) return false;

  if (isExact) {
    if (valLower === rawTermLower) return true;
    const valAccentFree = stripSearchAccents(valStr);
    if (valAccentFree === accentFreeTerm) return true;
    // Also check standalone token boundary (e.g. "L1" matches "Floor L1" but not "L10")
    const boundaryRegex = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(accentFreeTerm)}(?:$|[^a-z0-9])`, "i");
    return boundaryRegex.test(valAccentFree);
  }

  // 1. Direct case-insensitive substring match
  if (valLower.includes(rawTermLower)) return true;

  // 2. Vietnamese accent-insensitive substring match
  if (accentFreeTerm) {
    const valAccentFree = stripSearchAccents(valStr);
    if (valAccentFree.includes(accentFreeTerm)) return true;
  }

  // 3. Compact code match (ignores dashes/dots/hashes/spaces when token has >= 2 chars)
  if (compactTerm.length >= 2) {
    const valCompact = normalizeCompactSearchCode(valStr);
    if (valCompact.includes(compactTerm)) return true;
  }

  return false;
}

interface ParsedSearchToken {
  raw: string;
  rawLower: string;
  accentFree: string;
  compact: string;
  isExact: boolean;
  isNegated: boolean;
}

function parseAtomicToken(tokenStr: string): ParsedSearchToken | null {
  let working = tokenStr.trim();
  if (!working) return null;

  let isNegated = false;
  if ((working.startsWith("-") || working.startsWith("!")) && working.length > 1) {
    isNegated = true;
    working = working.slice(1).trim();
  }
  if (!working) return null;

  let isExact = false;
  if (
    ((working.startsWith('"') && working.endsWith('"')) ||
      (working.startsWith("'") && working.endsWith("'"))) &&
    working.length >= 2
  ) {
    isExact = true;
    working = working.slice(1, -1).trim();
  } else if (working.startsWith("=") && working.length > 1) {
    isExact = true;
    working = working.slice(1).trim();
  }
  if (!working) return null;

  const rawLower = working.toLowerCase();
  const accentFree = stripSearchAccents(working);
  // Avoid compact code matching when the token itself had spaces unless it's a code-like token
  const hasSpaces = /\s/.test(working);
  const compact = hasSpaces ? "" : normalizeCompactSearchCode(working);

  return {
    raw: working,
    rawLower,
    accentFree,
    compact,
    isExact,
    isNegated,
  };
}

/**
 * Splits a search clause by spaces while keeping quoted phrases ("...") intact.
 */
function splitSpaceTokensPreservingQuotes(clause: string): string[] {
  const tokens: string[] = [];
  const regex = /(-?"[^"]+"|-'[^']+'|"[^"]+"|'[^']+'|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clause)) !== null) {
    if (match[1]) tokens.push(match[1]);
  }
  return tokens;
}

/**
 * Universal Enterprise Search Matcher:
 * - Supports `,` or `;` for OR groups (e.g., `L1, L2`)
 * - Supports `+` for explicit AND terms (e.g., `HCM + L1`)
 * - Supports space-separated multi-keyword AND matching across fields (e.g., `HCM L1 Completed`)
 * - Supports Vietnamese accent-insensitive matching (e.g., `xay dung` matches `XÂY DỰNG`)
 * - Supports `"exact"` or `=exact` token matching (e.g., `"L1"` won't match `L10`)
 * - Supports `-exclude` or `!exclude` negation terms (e.g., `-canceled`)
 */
export function matchesAdvancedSearch(
  searchTerm: string,
  mainFields: (string | number | boolean | undefined | null)[],
  subFields: (string | number | boolean | undefined | null)[] = [],
  evaluateSubItems?: (term: string, andTerms: string[]) => boolean
): boolean {
  if (!searchTerm) return true;
  const normalizedSearch = normalizeSearchDashes(searchTerm).trim();
  if (!normalizedSearch) return true;

  const orGroups = normalizedSearch
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (orGroups.length === 0) return true;

  const checkParsedTokenAgainstFields = (
    parsed: ParsedSearchToken,
    allAndStrings: string[]
  ): boolean => {
    const inMain = mainFields.some((v) =>
      matchesSingleSearchTokenInValue(
        v,
        parsed.rawLower,
        parsed.accentFree,
        parsed.compact,
        parsed.isExact
      )
    );

    if (parsed.isNegated) {
      // Negated token: must NOT match mainFields (or subFields if mainFields empty)
      if (inMain) return false;
      if (mainFields.length === 0 && subFields.length > 0) {
        const inSub = subFields.some((v) =>
          matchesSingleSearchTokenInValue(
            v,
            parsed.rawLower,
            parsed.accentFree,
            parsed.compact,
            parsed.isExact
          )
        );
        if (inSub) return false;
      }
      return true;
    }

    if (inMain) return true;

    if (subFields.length > 0) {
      const inSub = subFields.some((v) =>
        matchesSingleSearchTokenInValue(
          v,
          parsed.rawLower,
          parsed.accentFree,
          parsed.compact,
          parsed.isExact
        )
      );
      if (inSub) return true;
    }

    if (evaluateSubItems) {
      if (evaluateSubItems(parsed.rawLower, allAndStrings)) return true;
      if (parsed.accentFree && parsed.accentFree !== parsed.rawLower) {
        if (evaluateSubItems(parsed.accentFree, allAndStrings)) return true;
      }
    }

    return false;
  };

  return orGroups.some((orGroup) => {
    const rawPlusTerms = orGroup
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
    if (rawPlusTerms.length === 0) return false;

    const allAndStrings = rawPlusTerms.map((t) => t.toLowerCase());

    return rawPlusTerms.every((plusClause) => {
      // 1. Try matching the entire clause as a single phrase first (e.g. "On process", "Malcom brown", "1.2. 1FL")
      const wholeParsed = parseAtomicToken(plusClause);
      if (!wholeParsed) return true;

      const hasNegationOrInnerQuotes =
        /\s[-!]\S/.test(plusClause) || /^[-!]\S+\s+\S+/.test(plusClause);

      if (!hasNegationOrInnerQuotes) {
        if (checkParsedTokenAgainstFields(wholeParsed, allAndStrings)) {
          return true;
        }
      }

      // 2. If the clause contains multiple space-separated tokens (e.g. "HCM L1" or "Shimizu -Canceled"),
      // split into tokens and require EVERY token to match across mainFields (or single subField).
      if (!wholeParsed.isExact && /\s/.test(plusClause)) {
        const spaceParts = splitSpaceTokensPreservingQuotes(plusClause)
          .map(parseAtomicToken)
          .filter((p): p is ParsedSearchToken => p !== null);

        if (spaceParts.length > 1) {
          const subAndStrings = spaceParts.map((p) => p.rawLower);
          // Check if all tokens match within mainFields (e.g. Store="HCM" + Location="L1")
          const allMatchInMain = spaceParts.every((sp) => {
            const matchedMain = mainFields.some((v) =>
              matchesSingleSearchTokenInValue(
                v,
                sp.rawLower,
                sp.accentFree,
                sp.compact,
                sp.isExact
              )
            );
            return sp.isNegated ? !matchedMain : matchedMain;
          });
          if (allMatchInMain && mainFields.length > 0) return true;

          // Or check if all tokens match across the combined record
          return spaceParts.every((sp) => checkParsedTokenAgainstFields(sp, subAndStrings));
        }
      }

      return false;
    });
  });
}

/**
 * Recent Searches Persistence Helpers
 */
export function getRecentSearches(): string[] {
  try {
    const raw = safeGetItemLocal(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || "").trim())
      .filter((s) => s.length >= 2)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): string[] {
  const clean = String(query || "").trim();
  if (clean.length < 2) return getRecentSearches();
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter((s) => s.toLowerCase() !== clean.toLowerCase());
    const next = [clean, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    safeSetItemLocal(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function removeRecentSearch(query: string): string[] {
  const clean = String(query || "").trim().toLowerCase();
  try {
    const existing = getRecentSearches();
    const next = existing.filter((s) => s.toLowerCase() !== clean);
    safeSetItemLocal(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function clearRecentSearches(): string[] {
  try {
    safeSetItemLocal(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify([]));
  } catch {
    // ignore
  }
  return [];
}
