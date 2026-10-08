import { describe, it, expect } from 'vitest';
import { normalizeImageUrl } from './LayoutUnitLightboxModal';

describe('normalizeImageUrl', () => {
  it('converts Google Drive file/d/ view link to high-res thumbnail URL', () => {
    const raw = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing';
    const normalized = normalizeImageUrl(raw);
    expect(normalized).toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w1600');
  });

  it('converts Google Drive open?id= link to high-res thumbnail URL', () => {
    const raw = 'https://drive.google.com/open?id=1234567890abcdef';
    const normalized = normalizeImageUrl(raw);
    expect(normalized).toBe('https://drive.google.com/thumbnail?id=1234567890abcdef&sz=w1600');
  });

  it('converts Google Drive uc?id= link to high-res thumbnail URL', () => {
    const raw = 'https://drive.google.com/uc?id=myDriveFileId123';
    const normalized = normalizeImageUrl(raw);
    expect(normalized).toBe('https://drive.google.com/thumbnail?id=myDriveFileId123&sz=w1600');
  });

  it('converts Dropbox web link to direct content link', () => {
    const raw = 'https://www.dropbox.com/s/sample123/image.png?dl=0';
    const normalized = normalizeImageUrl(raw);
    expect(normalized).toBe('https://dl.dropboxusercontent.com/s/sample123/image.png');
  });

  it('preserves standard image URLs directly', () => {
    const raw = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff';
    const normalized = normalizeImageUrl(raw);
    expect(normalized).toBe(raw);
  });

  it('converts r2:// protocol URLs to public HTTP endpoints', () => {
    const raw = 'r2://Taka-Pm-folder/unit_123.webp';
    const normalized = normalizeImageUrl(raw);
    expect(normalized).toBe('https://hcm.taka-pm.org/Taka-Pm-folder/unit_123.webp');
  });

  it('returns empty string for null, undefined, or empty values', () => {
    expect(normalizeImageUrl(null)).toBe('');
    expect(normalizeImageUrl(undefined)).toBe('');
    expect(normalizeImageUrl('   ')).toBe('');
  });
});
