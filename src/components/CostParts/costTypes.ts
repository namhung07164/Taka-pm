import { Project, Cost, AppUser } from '../../types';

export interface CostTabProps {
  onGoToBudget?: (code: string) => void;
  initialSearchTerm?: string;
}

export interface CostColumn {
  id: string;
  label: string;
}

export const AVAILABLE_COLUMNS: CostColumn[] = [
  { id: 'no', label: 'No.' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'actual', label: 'Act/Forecast' },
  { id: 'firstPaid', label: '1st Paid' },
  { id: 'secondPaid', label: '2nd Paid' },
  { id: 'thirdPaid', label: '3rd Paid' },
  { id: 'balance', label: 'Balance' },
  { id: 'supportingFee', label: 'Supporting Fee' },
  { id: 'description', label: 'Description' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'action', label: 'Action' }
];

export interface CostColWidths {
  no: number;
  year: number;
  store: number;
  code: number;
  projectName: number;
  actual: number;
  firstPaid: number;
  secondPaid: number;
  thirdPaid: number;
  balance: number;
  supportingFee: number;
  description: number;
  vendor: number;
  action: number;
}

export interface PaidDateMatches {
  matches: boolean;
  firstMatch: boolean;
  secondMatch: boolean;
  thirdMatch: boolean;
}
