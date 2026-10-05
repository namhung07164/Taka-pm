import { Project } from '../../types';

export interface SummaryTabProps {}

export interface StatusCountItem {
  name: string;
  value: number;
}

export interface SummaryBarItem {
  name: string;
  budget: number;
  actual: number;
}

export const STATUS_COLORS: Record<string, string> = {
  'On process': '#ea580c', // Orange
  'Upcoming': '#94a3b8',   // Slate
  'Completed': '#16a34a',  // Green
  'Handover': '#3b82f6',   // Blue
  'Canceled': '#ef4444',   // Red
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
