import { describe, it, expect } from 'vitest';
import { LightboxZoomDock } from './LightboxZoomDock';

describe('LightboxZoomDock Component', () => {
  it('should export LightboxZoomDock function correctly', () => {
    expect(LightboxZoomDock).toBeDefined();
    expect(typeof LightboxZoomDock).toBe('function');
  });
});
