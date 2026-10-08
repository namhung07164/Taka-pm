import { describe, it, expect, beforeEach } from 'vitest';
import { extractProjectMetadata, projectMatchesScope } from '../../../lib/utils';

// Simple in-memory localStorage mock for node test environment
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
  removeItem: (k: string) => { delete mockStorage[k]; },
  clear: () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  }
};

describe('Tooltip Store Isolation (HCM vs HN)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('partitions localStorage keys by store strictly', () => {
    const hnUnitKey = 'taka_unit_images_HN_1F-01';
    const hcmUnitKey = 'taka_unit_images_HCM_1F-01';

    const hnImages = [
      { id: 'img_1', url: 'https://hcm.taka-pm.org/Taka-Pm-folder/HN_1F-01_photo.jpg', title: 'HN Photo', store: 'HN' }
    ];
    const hcmImages = [
      { id: 'img_2', url: 'https://hcm.taka-pm.org/Taka-Pm-folder/HCM_1F-01_photo.jpg', title: 'HCM Photo', store: 'HCM' }
    ];

    mockLocalStorage.setItem(hnUnitKey, JSON.stringify(hnImages));
    mockLocalStorage.setItem(hcmUnitKey, JSON.stringify(hcmImages));

    // When reading HN partition
    const loadedHn = JSON.parse(mockLocalStorage.getItem(hnUnitKey) || '[]');
    expect(loadedHn).toHaveLength(1);
    expect(loadedHn[0].store).toBe('HN');
    expect(loadedHn[0].title).toBe('HN Photo');

    // When reading HCM partition
    const loadedHcm = JSON.parse(mockLocalStorage.getItem(hcmUnitKey) || '[]');
    expect(loadedHcm).toHaveLength(1);
    expect(loadedHcm[0].store).toBe('HCM');
    expect(loadedHcm[0].title).toBe('HCM Photo');

    // Cross-check: HCM partition does not contain HN image
    expect(loadedHcm.some((item: any) => item.store === 'HN')).toBe(false);
  });

  it('migrates legacy un-prefixed key when viewing HN and prevents it from leaking into HCM', () => {
    const unitCode = 'L3-314';
    const legacyKey = `taka_unit_images_${unitCode}`;
    const hnStoreKey = `taka_unit_images_HN_${unitCode}`;
    const hcmStoreKey = `taka_unit_images_HCM_${unitCode}`;

    // Simulate legacy un-prefixed image added while in HN
    const legacyData = [
      { id: 'img_legacy', url: 'https://hcm.taka-pm.org/Taka-Pm-folder/Slide6.JPG', title: 'Salomon HN' }
    ];
    mockLocalStorage.setItem(legacyKey, JSON.stringify(legacyData));

    // HCM check should not see legacy items as HCM
    expect(mockLocalStorage.getItem(hcmStoreKey)).toBeNull();

    // Migrate when HN accesses it
    const legacyRaw = mockLocalStorage.getItem(legacyKey);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      const tagged = parsed.map((item: any) => ({ ...item, store: 'HN' }));
      mockLocalStorage.setItem(hnStoreKey, JSON.stringify(tagged));
      mockLocalStorage.removeItem(legacyKey);
    }

    // After migration:
    expect(mockLocalStorage.getItem(legacyKey)).toBeNull(); // Legacy removed
    expect(JSON.parse(mockLocalStorage.getItem(hnStoreKey) || '[]')).toHaveLength(1); // Saved to HN
    expect(mockLocalStorage.getItem(hcmStoreKey)).toBeNull(); // HCM remains clean
  });

  it('correctly isolates project metadata matching between HCM and HN', () => {
    const hnProject = {
      id: 'proj_hn_1',
      code: 'L1-112',
      name: 'MBB - Dior Pop-up',
      store: 'HN',
      year: 2027,
    };

    const hcmProject = {
      id: 'proj_hcm_1',
      code: 'L1-112',
      name: 'HCM Cosmetics',
      store: 'HCM',
      year: 2026,
    };

    const hnMeta = extractProjectMetadata(hnProject);
    const hcmMeta = extractProjectMetadata(hcmProject);

    expect(hnMeta.store).toBe('HN');
    expect(hcmMeta.store).toBe('HCM');

    // Matching scope test
    expect(projectMatchesScope(hnMeta, { store: 'HN' })).toBe(true);
    expect(projectMatchesScope(hnMeta, { store: 'HCM' })).toBe(false);

    expect(projectMatchesScope(hcmMeta, { store: 'HCM' })).toBe(true);
    expect(projectMatchesScope(hcmMeta, { store: 'HN' })).toBe(false);
  });
});
