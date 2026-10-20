import { describe, it, expect } from 'vitest';
import { resolveStoreAndYearForQuery } from './deepLinkStoreResolver';

describe('resolveStoreAndYearForQuery', () => {
  it('detects store from HN- prefix', async () => {
    const res = await resolveStoreAndYearForQuery('HN-TKV-BWW', []);
    expect(res.store).toBe('HN');
  });

  it('detects store from HCM- prefix', async () => {
    const res = await resolveStoreAndYearForQuery('HCM-TKV-BWW', []);
    expect(res.store).toBe('HCM');
  });

  it('resolves store and year from matching in-memory project', async () => {
    const mockProjects = [
      {
        id: 'p1',
        code: 'TKV-BWW',
        name: 'Backward facility related work',
        store: 'HN',
        year: '2026',
      },
    ];

    const res = await resolveStoreAndYearForQuery('HN-TKV-BWW', mockProjects);
    expect(res.store).toBe('HN');
    expect(res.year).toBe('2026');
  });

  it('resolves store and year when query is code without store prefix', async () => {
    const mockProjects = [
      {
        id: 'p2',
        code: 'TKV-BWW',
        name: 'Backward facility related work',
        store: 'HN',
        year: '2026',
      },
    ];

    const res = await resolveStoreAndYearForQuery('TKV-BWW', mockProjects);
    expect(res.store).toBe('HN');
    expect(res.year).toBe('2026');
  });

  it('returns empty object for empty query', async () => {
    const res = await resolveStoreAndYearForQuery('', []);
    expect(res.store).toBeUndefined();
    expect(res.year).toBeUndefined();
  });
});
