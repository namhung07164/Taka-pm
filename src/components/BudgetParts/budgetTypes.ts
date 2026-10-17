import { Project, Cost } from '../../types';

export interface BudgetTabProps {
  onGoToCost: (code: string) => void;
  initialSearchTerm?: string;
}

export interface BudgetColumnDef {
  id: string;
  label: string;
}

export const AVAILABLE_COLUMNS: BudgetColumnDef[] = [
  { id: 'no', label: 'No.' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'location', label: 'Location' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'totalBudget', label: 'Budget' },
  { id: 'actual', label: 'Actual/Forc' },
  { id: 'supportingFee', label: 'Supporting Fee' },
  { id: 'variance', label: 'Remaining' },
  { id: 'type', label: 'Type' },
  { id: 'note', label: 'Note' },
  { id: 'actions', label: 'Actions' }
];

export interface BudgetTreeNode {
  id: string;
  isParentNode: boolean;
  isSelf: boolean;
  code: string;
  name: string;
  year?: string | number;
  store?: string;
  location?: string;
  type?: string;
  note?: string;
  budget?: number;
  totalBudget?: number;
  ownBudget?: number;
  ownActual?: number;
  totalActual?: number;
  ownSupportingFee?: number;
  totalSupportingFee?: number;
  hasForc?: boolean;
  remaining?: number;
  parentId?: string;
  project: Project;
  children: BudgetTreeNode[];
  filteredChildren?: BudgetTreeNode[];
  isSearchMatch?: boolean;
  [key: string]: any;
}

export interface BudgetSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface ProjectFinancials {
  budget: number;
  actual: number;
  supportingFee: number;
  hasForc: boolean;
  remaining: number;
}
