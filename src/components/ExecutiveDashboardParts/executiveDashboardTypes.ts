import { Project } from '../../types';

export interface ExecutiveDashboardProps {
  filteredProjects: Project[];
  globalYearFilter: string;
  effectiveStore: string;
}

export interface EVMProjectItem {
  code: string;
  name: string;
  store: string;
  bac: number;
  ac: number;
  ev: number;
  pv: number;
  cpi: number;
  spi: number;
  costVariance: number;
  scheduleVariance: number;
  percentComplete: number;
  status: string;
}

export interface EVMMetrics {
  totalBAC: number;
  totalEV: number;
  totalPV: number;
  totalAC: number;
  portfolioCPI: number;
  portfolioSPI: number;
  portfolioCostVariance: number;
  portfolioScheduleVariance: number;
  eac: number;
  vac: number;
  projectEVMList: EVMProjectItem[];
}

export interface CashflowMonthEntry {
  month: number;
  label: string;
  actualHCM: number;
  forecastHCM: number;
  actualHN: number;
  forecastHN: number;
  totalActual: number;
  totalForecast: number;
  totalDisbursement: number;
}

export interface CashflowQuarterEntry {
  quarter: string;
  label: string;
  totalActual: number;
  totalForecast: number;
  totalHCM: number;
  totalHN: number;
}

export interface CashflowData {
  monthlyList: CashflowMonthEntry[];
  quarterlyList: CashflowQuarterEntry[];
  totalYearDisbursement: number;
  totalYearActual: number;
  totalYearForecast: number;
}
