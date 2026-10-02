import { describe, it, expect } from 'vitest';
import {
  calculatePaidBreakdown,
  calculateCostBalance,
  calculateBudgetRemaining,
  getBudgetHealthStatus,
  calculateVATAmount,
  calculateParentBudgetRollup,
  calculateCostDeltas,
  calculateCostsSummaryForProject,
  buildBudgetTree,
  calculateBudgetGlobalTotals,
  BudgetRollupChild
} from './financialService';
import { Cost } from '../types';

describe('1. Phân kỳ thanh toán Cost 3 đợt & Bóc tách Thực tế/Dự kiến (calculatePaidBreakdown)', () => {
  it('tính chính xác khi cả 3 đợt đều đã thanh toán thực tế (Actual)', () => {
    const cost: Partial<Cost> = {
      advanceAmount: 30000000,
      advanceStatus: 'Actual',
      interimAmount: 50000000,
      interimStatus: 'Actual',
      balanceAmount: 20000000,
      balanceStatus: 'Actual',
      approvedAmount: 100000000
    };

    const result = calculatePaidBreakdown(cost);
    expect(result.actualPaid).toBe(100000000);
    expect(result.forecastPaid).toBe(0);
    expect(result.totalApproved).toBe(100000000);
  });

  it('bóc tách đúng khi Đợt 1 là Actual, Đợt 2 và Đợt 3 là Forecast', () => {
    const cost: Partial<Cost> = {
      firstPaid: 40000000,
      firstStatus: 'Actual',
      secondPaid: 35000000,
      secondStatus: 'Forecast',
      thirdPaid: 25000000,
      thirdStatus: 'Forecast',
      amount: 100000000
    };

    const result = calculatePaidBreakdown(cost);
    expect(result.actualPaid).toBe(40000000);
    expect(result.forecastPaid).toBe(60000000);
    expect(result.totalApproved).toBe(100000000);
  });

  it('xử lý an toàn khi các trường rỗng hoặc undefined', () => {
    const emptyCost: Partial<Cost> = {};
    const result = calculatePaidBreakdown(emptyCost);
    expect(result.actualPaid).toBe(0);
    expect(result.forecastPaid).toBe(0);
    expect(result.totalApproved).toBe(0);
  });
});

describe('2. Tính số dư còn lại của khoản chi (calculateCostBalance)', () => {
  it('tính đúng số dư khi chưa thanh toán đủ 3 đợt', () => {
    const actual = 120000000;
    const firstPaid = 30000000;
    const secondPaid = 50000000;
    const thirdPaid = 20000000;

    const balance = calculateCostBalance(actual, firstPaid, secondPaid, thirdPaid);
    expect(balance).toBe(20000000); // 120tr - 100tr = 20tr
  });

  it('trả về 0 khi đã hoàn tất thanh toán đủ 3 đợt', () => {
    const actual = 85000000;
    const firstPaid = 25000000;
    const secondPaid = 35000000;
    const thirdPaid = 25000000;

    const balance = calculateCostBalance(actual, firstPaid, secondPaid, thirdPaid);
    expect(balance).toBe(0);
  });
});

describe('3. Tính số dư Ngân Sách còn lại & Cảnh báo màu (calculateBudgetRemaining & getBudgetHealthStatus)', () => {
  it('tính đúng Remaining = Budget - Actual + SupportingFee', () => {
    const budget = 200000000;
    const actual = 140000000;
    const supportingFee = 15000000;

    const remaining = calculateBudgetRemaining(budget, actual, supportingFee);
    // 200tr - 140tr + 15tr = 75tr
    expect(remaining).toBe(75000000);
  });

  it('xác định đúng ngưỡng an toàn (Normal - Xanh) khi Remaining > 20% Budget', () => {
    const budget = 100000000;
    const remaining = 25000000; // 25% > 20%
    expect(getBudgetHealthStatus(remaining, budget)).toBe('normal');
  });

  it('xác định đúng ngưỡng cảnh báo sắp hết (Warning - Vàng) khi 0 <= Remaining <= 20% Budget', () => {
    const budget = 100000000;
    const remaining = 15000000; // 15% <= 20%
    expect(getBudgetHealthStatus(remaining, budget)).toBe('warning');

    const exact20 = 20000000; // 20%
    expect(getBudgetHealthStatus(exact20, budget)).toBe('warning');
  });

  it('xác định đúng ngưỡng thâm hụt (Danger - Đỏ) khi Remaining < 0', () => {
    const budget = 100000000;
    const remaining = -5000000; // Thâm hụt 5 triệu
    expect(getBudgetHealthStatus(remaining, budget)).toBe('danger');
  });
});

describe('4. Rollup Ngân Sách Cha - Con (calculateParentBudgetRollup)', () => {
  it('tổng hợp chính xác từ Dự án Mẹ (Self) và các Dự án Con (Sub-Projects)', () => {
    const children: BudgetRollupChild[] = [
      // Dự án Mẹ (Self-node)
      {
        budget: 50000000,
        totalActual: 20000000,
        totalSupportingFee: 2000000,
        hasForc: false
      },
      // Dự án Con 1
      {
        budget: 80000000,
        totalActual: 45000000,
        totalSupportingFee: 5000000,
        hasForc: true
      },
      // Dự án Con 2
      {
        budget: 70000000,
        totalActual: 30000000,
        totalSupportingFee: 0,
        hasForc: false
      }
    ];

    const rollup = calculateParentBudgetRollup(children);

    // Total Budget: 50 + 80 + 70 = 200tr
    expect(rollup.totalBudget).toBe(200000000);
    // Total Actual: 20 + 45 + 30 = 95tr
    expect(rollup.totalActual).toBe(95000000);
    // Total Supporting Fee: 2 + 5 + 0 = 7tr
    expect(rollup.totalSupportingFee).toBe(7000000);
    // hasForc: True vì có Con 1 hasForc = true
    expect(rollup.hasForc).toBe(true);
    // Remaining = 200tr - 95tr + 7tr = 112tr
    expect(rollup.remaining).toBe(112000000);
  });
});

describe('5. Tính toán biến động Deltas khi Thêm/Sửa Chi Phí (calculateCostDeltas)', () => {
  it('tính đúng deltas khi tạo mới một chi phí (oldCost = null)', () => {
    const newCost: Partial<Cost> = {
      advanceAmount: 20000000,
      advanceStatus: 'Actual',
      interimAmount: 30000000,
      interimStatus: 'Forecast',
      approvedAmount: 50000000
    };

    const deltas = calculateCostDeltas(newCost, null);

    expect(deltas.deltaActual).toBe(20000000);
    expect(deltas.deltaForecast).toBe(30000000);
    expect(deltas.deltaApproved).toBe(50000000);
    expect(deltas.deltaBalance).toBe(0);
  });

  it('tính đúng deltas khi chuyển Đợt 2 từ Forecast sang Actual', () => {
    const oldCost: Partial<Cost> = {
      advanceAmount: 20000000,
      advanceStatus: 'Actual',
      interimAmount: 30000000,
      interimStatus: 'Forecast',
      approvedAmount: 50000000
    };

    const newCost: Partial<Cost> = {
      advanceAmount: 20000000,
      advanceStatus: 'Actual',
      interimAmount: 30000000,
      interimStatus: 'Actual', // Chuyển sang đã thanh toán thực tế
      approvedAmount: 50000000
    };

    const deltas = calculateCostDeltas(newCost, oldCost);

    expect(deltas.deltaActual).toBe(30000000); // Tăng thực chi thêm 30tr
    expect(deltas.deltaForecast).toBe(-30000000); // Giảm dự chi 30tr
    expect(deltas.deltaApproved).toBe(0); // Tổng duyệt không đổi
    expect(deltas.deltaBalance).toBe(0);
  });
});

describe('6. Tính Thuế VAT & Tổng tiền (calculateVATAmount)', () => {
  it('tính đúng thuế VAT 10%', () => {
    const { vatAmount, totalAmount } = calculateVATAmount(100000000, 0.1);
    expect(vatAmount).toBe(10000000);
    expect(totalAmount).toBe(110000000);
  });

  it('tính đúng thuế VAT 8%', () => {
    const { vatAmount, totalAmount } = calculateVATAmount(50000000, 0.08);
    expect(vatAmount).toBe(4000000);
    expect(totalAmount).toBe(54000000);
  });
});

describe('7. Tổng hợp danh sách chi phí của dự án (calculateCostsSummaryForProject)', () => {
  it('tổng hợp chính xác các chỉ số Actual, Forc, FirstPaid, SecondPaid, ThirdPaid, Balance', () => {
    const sampleCosts: Partial<Cost>[] = [
      {
        id: 'c1',
        projectCode: 'P01',
        actual: 40000000,
        costType: 'act',
        firstPaid: 20000000,
        secondPaid: 10000000,
        thirdPaid: 10000000,
        supportingFee: 2000000
      },
      {
        id: 'c2',
        projectCode: 'P01',
        actual: 60000000,
        costType: 'forc',
        firstPaid: 0,
        secondPaid: 0,
        thirdPaid: 0,
        supportingFee: 3000000
      }
    ];

    const summary = calculateCostsSummaryForProject(sampleCosts);

    expect(summary.totalActual).toBe(100000000);
    expect(summary.totalForc).toBe(60000000);
    expect(summary.totalSupportingFee).toBe(5000000);
    expect(summary.totalFirstPaid).toBe(20000000);
    expect(summary.totalSecondPaid).toBe(10000000);
    expect(summary.totalThirdPaid).toBe(10000000);
    expect(summary.totalBalance).toBe(60000000); // 0 từ c1 + 60tr từ c2
    expect(summary.hasForc).toBe(true);
  });
});

describe('8. Khởi tạo Cây Ngân Sách & Tổng hợp Remaining Toàn cục (buildBudgetTree & calculateBudgetGlobalTotals)', () => {
  it('tính chính xác Total Remaining kết nối chuẩn từ cấu trúc Ngân Sách Cha - Con', () => {
    const sampleProjects: any[] = [
      {
        id: 'proj_parent',
        code: 'P-PARENT',
        name: 'Dự án Mẹ',
        year: '2026',
        store: 'HCM',
        budget: 500000000,
        actual: 100000000,
        supportingFee: 20000000
      },
      {
        id: 'proj_child',
        code: 'P-CHILD',
        name: 'Dự án Con Liên Kết',
        year: '2026',
        store: 'HCM',
        parentId: 'P-PARENT',
        budget: 200000000,
        actual: 50000000,
        supportingFee: 5000000
      }
    ];

    const sampleCosts: any[] = [
      {
        id: 'c_p1',
        projectCode: 'P-PARENT',
        projectYear: '2026',
        projectStore: 'HCM',
        actual: 80000000,
        supportingFee: 15000000,
        costType: 'act'
      },
      {
        id: 'c_c1',
        projectCode: 'P-CHILD',
        projectYear: '2026',
        projectStore: 'HCM',
        actual: 40000000,
        supportingFee: 5000000,
        costType: 'act'
      }
    ];

    const { roots } = buildBudgetTree(sampleProjects, sampleCosts);
    expect(roots.length).toBe(1); // Chỉ có 1 root (Parent)

    const parentNode = roots[0];
    expect(parentNode.totalBudget).toBe(700000000); // 500tr + 200tr
    expect(parentNode.totalActual).toBe(120000000); // 80tr + 40tr
    expect(parentNode.totalSupportingFee).toBe(20000000); // 15tr + 5tr
    // Remaining = 700tr - 120tr + 20tr = 600tr
    expect(parentNode.remaining).toBe(600000000);

    const totals = calculateBudgetGlobalTotals(roots);
    expect(totals.totalBudget).toBe(700000000);
    expect(totals.totalActual).toBe(120000000);
    expect(totals.totalSupportingFee).toBe(20000000);
    expect(totals.totalRemaining).toBe(600000000);
  });
});

describe('9. Kiểm thử Nghiêm ngặt Biên Độ Tài Chính & Chống Sai Lệch Số Thực (Financial Boundary & Precision)', () => {
  it('kiểm thử chính xác ranh giới tỷ lệ 20% của getBudgetHealthStatus (Normal vs Warning vs Danger)', () => {
    const budget = 100000000; // 100 triệu
    
    // Ngay trên 20% (20.0001% = 20,000,100) -> normal
    expect(getBudgetHealthStatus(20000100, budget)).toBe('normal');

    // Đúng chính xác 20% (20,000,000) -> warning (0 <= Remaining <= 20% Budget)
    expect(getBudgetHealthStatus(20000000, budget)).toBe('warning');

    // Dưới 20% (19.9999% = 19,999,900) -> warning
    expect(getBudgetHealthStatus(19999900, budget)).toBe('warning');

    // Đúng chính xác 0 đồng -> warning
    expect(getBudgetHealthStatus(0, budget)).toBe('warning');

    // Âm 1 đồng (-1) -> danger (Remaining < 0)
    expect(getBudgetHealthStatus(-1, budget)).toBe('danger');
  });

  it('xử lý an toàn khi Budget = 0 hoặc không xác định', () => {
    // Budget = 0, Remaining > 0 -> normal
    expect(getBudgetHealthStatus(5000000, 0)).toBe('normal');
    // Budget = 0, Remaining = 0 -> normal
    expect(getBudgetHealthStatus(0, 0)).toBe('normal');
    // Budget = 0, Remaining < 0 -> danger
    expect(getBudgetHealthStatus(-1000000, 0)).toBe('danger');
  });

  it('làm tròn số nguyên chuẩn Math.round khi tính VAT cho số tiền lẻ, chống trôi số thực (Floating-Point Drift)', () => {
    // 10,000,005 x 8% = 800,000.4 -> Math.round -> 800,000
    const res8 = calculateVATAmount(10000005, 0.08);
    expect(res8.vatAmount).toBe(800000);
    expect(res8.totalAmount).toBe(10800005);

    // 10,000,007 x 8% = 800,000.56 -> Math.round -> 800,001
    const res8RoundUp = calculateVATAmount(10000007, 0.08);
    expect(res8RoundUp.vatAmount).toBe(800001);
    expect(res8RoundUp.totalAmount).toBe(10800008);

    // Thuế 0%
    const res0 = calculateVATAmount(50000000, 0);
    expect(res0.vatAmount).toBe(0);
    expect(res0.totalAmount).toBe(50000000);
  });

  it('calculateCostBalance tính đúng giá trị Balance = Actual - (firstPaid + secondPaid + thirdPaid)', () => {
    const actual = 100000000;
    const firstPaid = 50000000;
    const secondPaid = 40000000;
    const thirdPaid = 20000000; // Tổng = 110tr > 100tr
    
    const balance = calculateCostBalance(actual, firstPaid, secondPaid, thirdPaid);
    // 100tr - 110tr = -10tr phản ánh số tiền đã thanh toán vượt định mức
    expect(balance).toBe(-10000000);
  });
});
