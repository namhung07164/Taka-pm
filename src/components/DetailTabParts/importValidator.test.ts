import { describe, it, expect } from 'vitest';
import { validateTasksImportData, generateTaskErrorReportCSV } from './importValidator';
import { Project } from '../../types';

describe('importValidator', () => {
  const mockProjects: Project[] = [
    {
      id: 'p1',
      code: 'B1-B110-1',
      name: 'Test Project',
      year: 2027,
      store: 'HN'
    } as any,
    {
      id: 'p2',
      code: 'A-01',
      name: 'Project A',
      year: 2026,
      store: 'HCM'
    } as any
  ];

  const headers = [
    'store',
    'location',
    'projectYear',
    'projectCode',
    'Sub-task code',
    'Task name',
    'start',
    'finish',
    'duration',
    'party',
    'predecessor'
  ];

  it('validates correct rows successfully', () => {
    const dataRows = [
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#1', 'Hoarding up', '2027-01-10', '2027-01-12', '2', 'Contractor A', ''],
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#2', 'Fit-out works', '2027-01-13', '2027-01-20', '7', 'Contractor B', 'B1-B110-1#1']
    ];

    const result = validateTasksImportData(headers, dataRows, mockProjects);
    expect(result.isValid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.validRowsCount).toBe(2);
  });

  it('treats FFD, FFD-1, 1 as distinct tasks and does NOT flag them as duplicate', () => {
    const dataRows = [
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#1', 'FFD', '2027-02-01', '2027-02-02', '1', 'Team', ''],
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#2', 'FFD-1', '2027-02-03', '2027-02-04', '1', 'Team', ''],
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#3', '1', '2027-02-05', '2027-02-06', '1', 'Team', '']
    ];

    const result = validateTasksImportData(headers, dataRows, mockProjects);
    expect(result.isValid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('blocks import and flags true duplicate task names in the same project', () => {
    const dataRows = [
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#1', 'Hoarding up', '2027-01-10', '2027-01-12', '2', 'Team', ''],
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#2', 'Hoarding up', '2027-01-15', '2027-01-18', '3', 'Team', '']
    ];

    const result = validateTasksImportData(headers, dataRows, mockProjects);
    expect(result.isValid).toBe(false);
    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.errors.some(e => e.errorType === 'DUPLICATE')).toBe(true);
    expect(result.errorRowNumbers.has(3)).toBe(true); // Row 3 conflicts with Row 2
  });

  it('blocks import when required fields are missing', () => {
    const dataRows = [
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#1', '', '2027-01-10', '2027-01-12', '2', '', ''], // Missing task name
      ['HN', 'B1', '2027', '', 'B1-B110-1#2', 'Testing', '2027-01-13', '2027-01-15', '2', '', ''], // Missing project code
      ['HN', 'B1', '', 'B1-B110-1', 'B1-B110-1#3', 'Testing 2', '2027-01-13', '2027-01-15', '2', '', ''], // Missing year
      ['', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#4', 'Testing 3', '2027-01-13', '2027-01-15', '2', '', ''] // Missing store
    ];

    const result = validateTasksImportData(headers, dataRows, mockProjects);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'Task Name')).toBe(true);
    expect(result.errors.some(e => e.field === 'Project Code')).toBe(true);
    expect(result.errors.some(e => e.field === 'Year')).toBe(true);
    expect(result.errors.some(e => e.field === 'Store')).toBe(true);
  });

  it('detects date logic errors where start date is after finish date', () => {
    const dataRows = [
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#1', 'Demolition', '2027-05-15', '2027-05-10', '5', 'Team', '']
    ];

    const result = validateTasksImportData(headers, dataRows, mockProjects);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.errorType === 'DATE_LOGIC')).toBe(true);
  });

  it('generates an enriched error report CSV with error details', () => {
    const dataRows = [
      ['HN', 'B1', '2027', 'B1-B110-1', 'B1-B110-1#1', '', '2027-05-15', '2027-05-10', '5', 'Team', '']
    ];

    const result = validateTasksImportData(headers, dataRows, mockProjects);
    const csv = generateTaskErrorReportCSV(headers, dataRows, result);
    expect(csv).toContain('Row In File');
    expect(csv).toContain('Status');
    expect(csv).toContain('FAILED / ERROR');
    expect(csv).toContain('Error Details (What To Fix)');
    expect(csv).toContain('Missing required field: Task Name');
    expect(csv).toContain('Date Logic Error');
  });
});
