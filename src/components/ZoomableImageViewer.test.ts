import { describe, it, expect } from 'vitest';
import { ZoomableImageViewer } from './ZoomableImageViewer';

describe('ZoomableImageViewer', () => {
  it('should export ZoomableImageViewer component', () => {
    expect(ZoomableImageViewer).toBeDefined();
    expect(typeof ZoomableImageViewer).toBe('function');
  });
});
