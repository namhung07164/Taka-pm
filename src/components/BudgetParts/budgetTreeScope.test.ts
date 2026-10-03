import { describe, it, expect } from 'vitest';
import { buildBudgetTreeData } from './useBudgetTreeData';

describe('Budget Tree Scope & Cross-Year Guard', () => {
  it('does not attach children of year 2026 to a parent of year 2027 with identical code', () => {
    const mockProjects: any[] = [
      {
        id: 'p_2026_parent',
        code: 'L3-CORRIDOR',
        name: 'Corridor replacement',
        year: 2026,
        store: 'HCM',
        location: 'L3',
        budget: 3000000,
        actual: 2379610,
        no: 1,
      },
      {
        id: 'p_2027_parent',
        code: 'L3-CORRIDOR',
        name: 'Corridor replacement, Reserve',
        year: 2027,
        store: 'HCM',
        location: 'L3',
        budget: 200000,
        actual: 820500,
        no: 2,
      },
      {
        id: 'p_2026_child',
        code: 'L3-CORRIDOR-SUB1',
        name: 'Floor tiles',
        year: 2026,
        store: 'HCM',
        location: 'L3',
        parentId: 'L3-CORRIDOR',
        budget: 500000,
        actual: 400000,
        no: 3,
      },
    ];

    const tree = buildBudgetTreeData(mockProjects, []);
    expect(tree).toHaveLength(2);

    const node2026 = tree.find((n) => n.year === 2026);
    const node2027 = tree.find((n) => n.year === 2027);

    expect(node2026).toBeDefined();
    expect(node2027).toBeDefined();

    // 2026 parent should have 2 children: selfChild + p_2026_child
    expect(node2026?.children).toHaveLength(2);
    expect(node2026?.children?.some((c) => c.code === 'L3-CORRIDOR-SUB1')).toBe(true);

    // 2027 parent must NOT contain the 2026 child! It should only have its selfChild
    expect(node2027?.children).toHaveLength(1);
    expect(node2027?.children?.[0].isSelf).toBe(true);
    expect(node2027?.children?.some((c) => c.code === 'L3-CORRIDOR-SUB1')).toBe(false);
  });
});
