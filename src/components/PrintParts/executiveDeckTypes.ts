import { Project, Task } from '../../types';
import { UnitShape } from '../PictureMapping/components/DataMapping/types';

export type ExecutiveDeckMode = 'project' | 'floor';

export interface ExecutiveMilestoneItem {
  id: string;
  code?: string;
  name: string;
  start: string;
  finish: string;
  status: 'Completed' | 'On process' | 'Delayed' | 'Upcoming' | string;
  party?: string;
  progress: number;
  isPrimaryMilestone?: boolean;
}

export interface ExecutiveRiskItem {
  id: string;
  source: 'Project Note' | 'Project Comment' | 'Delayed Task' | 'Task Note';
  author?: string;
  timestamp?: string;
  content: string;
  severity: 'high' | 'medium' | 'info';
}

export interface ExecutiveFinancialBreakdown {
  budget: number;
  approvedCost: number;
  actualPaid: number;
  forecastPaid: number;
  supportingFee: number;
  remainingBalance: number;
  utilizationPercent: number;
  healthStatus: 'normal' | 'warning' | 'danger';
  formattedBudget: string;
  formattedActual: string;
  formattedForecast: string;
  formattedSupportingFee: string;
  formattedRemaining: string;
  currencyLabel: string;
}

export interface MatchedUnitHighlight {
  unit: UnitShape;
  projectCode: string;
  projectName: string;
  status: string;
  color: string;
  sizeM2: number;
}

export interface ExecutiveProjectSlideData {
  project: Project;
  store: string;
  year: string;
  location: string;
  effectiveSizeM2: number;
  overallStatus: string;
  actStatus: string;
  planProgress: number;
  actProgress: number;
  takStart: string;
  takCompl: string;
  openingDate: string;
  floorBgUrl: string | null;
  floorVersionName: string;
  floorBgScale: number;
  floorBgPos: { x: number; y: number };
  allFloorUnits: UnitShape[];
  matchedUnits: MatchedUnitHighlight[];
  financials: ExecutiveFinancialBreakdown;
  milestones: ExecutiveMilestoneItem[];
  risks: ExecutiveRiskItem[];
  tasks: Task[];
  totalTaskCount: number;
  completedTaskCount: number;
  delayedTaskCount: number;
}

export interface ExecutiveFloorSlideData {
  floorKey: string;
  store: string;
  location: string;
  year: string;
  floorBgUrl: string | null;
  floorVersionName: string;
  floorBgScale: number;
  floorBgPos: { x: number; y: number };
  allFloorUnits: UnitShape[];
  matchedUnits: MatchedUnitHighlight[];
  projects: ExecutiveProjectSlideData[];
  totalProjects: number;
  totalAreaM2: number;
  avgPlanProgress: number;
  avgActProgress: number;
  completedCount: number;
  onProcessCount: number;
  delayedCount: number;
  upcomingCount: number;
  financials: ExecutiveFinancialBreakdown;
  topRisks: ExecutiveRiskItem[];
}
