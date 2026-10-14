import { Cost } from "../types";

export interface CostInstallment {
  amount: number;
  status: 'Actual' | 'Forecast' | string;
}

// Thuật toán bóc tách số tiền Thực tế (Actual) và Dự kiến (Forecast)
export function calculatePaidBreakdown(cost: Partial<Cost>): { actualPaid: number; forecastPaid: number; totalApproved: number } {
  const installments = [
    { amount: Number(cost.advanceAmount || cost.advancePaid || cost.firstPaid || 0), status: cost.advanceStatus || cost.firstStatus || 'Actual' },
    { amount: Number(cost.interimAmount || cost.interimPaid || cost.secondPaid || 0), status: cost.interimStatus || cost.secondStatus || 'Forecast' },
    { amount: Number(cost.balanceAmount || cost.balancePaid || cost.thirdPaid || 0), status: cost.balanceStatus || cost.thirdStatus || 'Forecast' },
  ];

  let actualPaid = 0;
  let forecastPaid = 0;

  for (const inst of installments) {
    if (inst.status === 'Actual') {
      actualPaid += inst.amount;
    } else {
      forecastPaid += inst.amount;
    }
  }

  const totalApproved = Number(cost.approvedAmount || cost.amount || (actualPaid + forecastPaid));
  return { actualPaid, forecastPaid, totalApproved };
}

// 1.1. Công thức tính Số Dư Khoản Chi (Cost Balance sau 3 đợt thanh toán)
export function calculateCostBalance(
  actual: number,
  firstPaid: number = 0,
  secondPaid: number = 0,
  thirdPaid: number = 0
): number {
  return (Number(actual) || 0) - ((Number(firstPaid) || 0) + (Number(secondPaid) || 0) + (Number(thirdPaid) || 0));
}

// 1.2. Công thức tính Số Dư Ngân Sách Còn Lại (Budget Remaining)
export function calculateBudgetRemaining(
  budget: number,
  actual: number,
  supportingFee: number = 0
): number {
  return (Number(budget) || 0) - (Number(actual) || 0) + (Number(supportingFee) || 0);
}

// 1.3. Xác định trạng thái cảnh báo sức khỏe Ngân sách
export function getBudgetHealthStatus(
  remaining: number,
  budget: number
): 'normal' | 'warning' | 'danger' {
  if (remaining < 0) return 'danger';
  if (budget > 0 && remaining <= 0.2 * budget) return 'warning';
  return 'normal';
}

// 1.4. Công thức tính Thuế VAT & Tổng tiền hợp đồng
export function calculateVATAmount(amount: number, vatRate: number): { vatAmount: number; totalAmount: number } {
  const cleanAmount = Number(amount) || 0;
  const cleanRate = Number(vatRate) || 0;
  const vatAmount = Math.round(cleanAmount * cleanRate);
  const totalAmount = cleanAmount + vatAmount;
  return { vatAmount, totalAmount };
}

// 1.5. Cấu trúc và hàm Rollup Ngân Sách Cha - Con (Budget Parent-Child Rollup)
export interface BudgetRollupChild {
  budget?: number;
  totalActual?: number;
  totalSupportingFee?: number;
  hasForc?: boolean;
}

export interface BudgetRollupResult {
  totalBudget: number;
  totalActual: number;
  totalSupportingFee: number;
  hasForc: boolean;
  remaining: number;
}

// 1.6. Tính toán chênh lệch (Deltas) khi thêm/sửa chi phí
export function calculateCostDeltas(newCostData: Partial<Cost>, oldCostData: Partial<Cost> | null) {
  const oldCalc = oldCostData ? calculatePaidBreakdown(oldCostData) : { actualPaid: 0, forecastPaid: 0, totalApproved: 0 };
  const newCalc = calculatePaidBreakdown(newCostData);

  const deltaActual = newCalc.actualPaid - oldCalc.actualPaid;
  const deltaForecast = newCalc.forecastPaid - oldCalc.forecastPaid;
  const deltaApproved = newCalc.totalApproved - oldCalc.totalApproved;
  const deltaBalance = deltaApproved - (deltaActual + deltaForecast);

  return {
    oldCalc,
    newCalc,
    deltaActual,
    deltaForecast,
    deltaApproved,
    deltaBalance
  };
}

// 1.7. Tổng hợp chi phí theo danh sách khoản chi của Dự án
export function calculateCostsSummaryForProject(costs: Array<Partial<Cost>>) {
  const totalActual = costs.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
  const totalForc = costs.filter(c => c.costType === 'forc').reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
  const totalSupportingFee = costs.reduce((sum, c) => sum + (Number(c.supportingFee) || 0), 0);
  const totalFirstPaid = costs.reduce((sum, c) => sum + (Number(c.firstPaid) || 0), 0);
  const totalSecondPaid = costs.reduce((sum, c) => sum + (Number(c.secondPaid) || 0), 0);
  const totalThirdPaid = costs.reduce((sum, c) => sum + (Number(c.thirdPaid) || 0), 0);
  const totalBalance = costs.reduce((sum, c) => sum + calculateCostBalance(c.actual, c.firstPaid, c.secondPaid, c.thirdPaid), 0);
  const hasForc = costs.some(c => c.costType === 'forc');

  return {
    totalActual,
    totalForc,
    totalSupportingFee,
    totalFirstPaid,
    totalSecondPaid,
    totalThirdPaid,
    totalBalance,
    hasForc
  };
}

// Re-exports for backward compatibility
export { calculateParentBudgetRollup, buildBudgetTree, filterBudgetRoots, calculateBudgetGlobalTotals } from './budgetTreeService';
export { saveCostWithAtomicSummary, deleteCostWithAtomicSummary } from './financialAtomicService';
