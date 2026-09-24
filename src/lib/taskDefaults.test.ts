import { describe, it, expect } from 'vitest';
import { getDefaultDatetimeLocal } from './utils';

describe('Task Creation Smart Defaults', () => {
  it('provides today datetime local for default start and finish', () => {
    const defaultDate = getDefaultDatetimeLocal();
    expect(defaultDate).toBeDefined();
    expect(typeof defaultDate).toBe('string');
    // Check format YYYY-MM-DDTHH:mm
    expect(defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    
    // Check date corresponds to today
    const now = new Date();
    const year = now.getFullYear();
    expect(defaultDate.startsWith(String(year))).toBe(true);
  });

  it('correctly defaults empty fields when building task payload', () => {
    const defaultDate = getDefaultDatetimeLocal();
    const currentProject = { code: 'P001', year: 2026, store: 'HCM', party: 'Takashimaya' };
    
    const rawInput: any = {
      projectCode: 'P001',
      name: 'Test Task'
      // start, finish, baselineStart, baselineFinish, duration, party are omitted
    };

    const finalFormData = { ...rawInput };
    if (!finalFormData.start) finalFormData.start = defaultDate;
    if (!finalFormData.finish) finalFormData.finish = finalFormData.start || defaultDate;
    if (!finalFormData.baselineStart) finalFormData.baselineStart = finalFormData.start || defaultDate;
    if (!finalFormData.baselineFinish) finalFormData.baselineFinish = finalFormData.finish || defaultDate;
    if (finalFormData.duration === undefined || finalFormData.duration === null || String(finalFormData.duration).trim() === '') {
      finalFormData.duration = "0";
    }
    if (!finalFormData.party && currentProject?.party) {
      finalFormData.party = currentProject.party;
    }

    expect(finalFormData.start).toBe(defaultDate);
    expect(finalFormData.finish).toBe(defaultDate);
    expect(finalFormData.baselineStart).toBe(defaultDate);
    expect(finalFormData.baselineFinish).toBe(defaultDate);
    expect(finalFormData.duration).toBe("0");
    expect(finalFormData.party).toBe("Takashimaya");
  });
});
