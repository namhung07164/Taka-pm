import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from './imageCompression';

describe('calculateTargetDimensions', () => {
  it('should scale down width while preserving aspect ratio', () => {
    const res = calculateTargetDimensions(4000, 2000, 1920, 1920);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(960);
  });

  it('should scale down height while preserving aspect ratio', () => {
    const res = calculateTargetDimensions(2000, 4000, 1920, 1920);
    expect(res.height).toBe(1920);
    expect(res.width).toBe(960);
  });

  it('should not upscale images smaller than maximum limits', () => {
    const res = calculateTargetDimensions(800, 600, 1920, 1920);
    expect(res.width).toBe(800);
    expect(res.height).toBe(600);
  });

  it('should handle zero or invalid dimensions gracefully', () => {
    const res = calculateTargetDimensions(0, 0, 1920, 1920);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1920);
  });
});
