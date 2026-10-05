export interface CsvTabConfigItem {
  id: string;
  label: string;
  columns: string[];
  fileNamePrefix: string;
  icon: string;
  exportType: 'csv' | 'excel';
}

export const TAB_CONFIG: Record<string, CsvTabConfigItem> = {
  project: {
    id: 'project',
    label: 'Xuất Project',
    columns: ['store', 'location', 'year', 'code', 'name'],
    fileNamePrefix: 'taka_projects_exported',
    icon: 'ph-file-csv',
    exportType: 'csv',
  },
  task: {
    id: 'task',
    label: 'Xuất Task detail',
    columns: [
      'store',
      'location',
      'projectYear',
      'projectCode',
      'Task name',
      'start',
      'finish',
      'duration',
      'party',
      'predecessor',
      'delegation',
      'comments',
    ],
    fileNamePrefix: 'taka_tasks_exported',
    icon: 'ph-list-dashes',
    exportType: 'csv',
  },
  budget: {
    id: 'budget',
    label: 'Xuất Task budget',
    columns: [
      'location',
      'code',
      'name',
      'budget',
      'actual/forecast',
      'variance',
      'type',
      'note',
    ],
    fileNamePrefix: 'taka_projects_budget_exported',
    icon: 'ph-calculator',
    exportType: 'csv',
  },
  cost: {
    id: 'cost',
    label: 'Xuất Cost',
    columns: [
      'projectCode',
      'budget',
      'actual',
      'firstPaid',
      'firstPaidAt',
      'secondPaid',
      'secondPaidAt',
      'thirdPaid',
      'thirdPaidAt',
      'supportingFee',
      'description',
      'vendor',
    ],
    fileNamePrefix: 'taka_costs_exported',
    icon: 'ph-receipt',
    exportType: 'csv',
  },
  investment: {
    id: 'investment',
    label: 'Xuất Investment',
    columns: [
      'No',
      'Level',
      'New Brand',
      'Old Brand',
      'Estimation time',
      'Size area - m2',
      'Estimation construction (A works / B works)',
      'Suggested by',
      'Budget',
      'Actual',
      'Unit price/sqm (thousand VND)',
      'On detail',
    ],
    fileNamePrefix: 'taka_investment_plan',
    icon: 'ph-chart-line-up',
    exportType: 'excel',
  },
  mass_task: {
    id: 'mass_task',
    label: 'Mass-import Task',
    columns: [
      'store',
      'location',
      'projectYear',
      'projectCode',
      'Task code phụ',
      'Task name',
      'start',
      'finish',
      'duration',
      'party',
      'predecessor',
      'delegation',
      'comments',
    ],
    fileNamePrefix: 'taka_mass_tasks_exported',
    icon: 'ph-copy',
    exportType: 'csv',
  },
  brand: {
    id: 'brand',
    label: 'Xuất Brand',
    columns: [
      'CLASS CODE',
      'DEPARTMENT',
      'FLOOR',
      'AREA/DIV',
      'NAME',
      'TYPE',
      'Vendor Code',
      'BRAND CODE',
      'BRAND NAME',
    ],
    fileNamePrefix: 'taka_brand_class_info',
    icon: 'ph-tag',
    exportType: 'csv',
  },
  sales: {
    id: 'sales',
    label: 'Xuất Sales',
    columns: ['date', 'class code', 'brand code', 'brand name', 'sales'],
    fileNamePrefix: 'taka_sales_exported',
    icon: 'ph-currency-dollar',
    exportType: 'csv',
  },
  profit: {
    id: 'profit',
    label: 'Xuất Profit',
    columns: ['date', 'class code', 'brand code', 'profit', 'Margin'],
    fileNamePrefix: 'taka_profit_exported',
    icon: 'ph-trend-up',
    exportType: 'csv',
  },
  size_unit: {
    id: 'size_unit',
    label: 'Xuất Size Unit',
    columns: [
      'floor',
      'unit',
      'size',
      'start month',
      'brand code',
      'brand name',
    ],
    fileNamePrefix: 'taka_size_unit_exported',
    icon: 'ph-arrows-out',
    exportType: 'csv',
  },
};

export const safeJSONParse = (data: string | null) => {
  try {
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

export const safeGetStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('Browser blocked localStorage reading offline', e);
    return null;
  }
};

export const safeSetStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('Browser blocked localStorage write', e);
  }
};
