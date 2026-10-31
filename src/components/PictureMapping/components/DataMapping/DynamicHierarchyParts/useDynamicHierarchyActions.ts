import React, { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { GroupRule, MapVersion, UnitShape } from '../types';
import { useDataStore } from '../../../DataContext';
import {
  applyAllDynamicRulesForStore,
  triggerBackgroundR2Sync,
} from '../../../lib/dynamicExportService';
import { matchSingleRule } from '../../../lib/dynamicSummaryEngine';
import { HatchPatternType } from '../../../../LayoutTabParts/layoutPatternUtils';

export function computeGroupMatchDetailsMap(params: {
  activeVersion: MapVersion | undefined;
  summaryList: any[];
  summaryMap: Map<string, any>;
  unitLookupMap: Map<string, UnitShape>;
}): Map<string, { unitNames: string[]; totalAreaM2: number }> {
  const { activeVersion, summaryList, summaryMap, unitLookupMap } = params;
  const map = new Map<string, { unitNames: string[]; totalAreaM2: number }>();
  const groups = activeVersion?.groups || [];

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const grp = groups[gIdx];
    const names: string[] = [];
    const seen = new Set<string>();
    let area = 0;

    if (grp.rules && grp.rules.length > 0) {
      for (let i = 0; i < summaryList.length; i++) {
        const item = summaryList[i];
        if (item.isRestricted) continue;
        const isMatched =
          item.matchedGroupId === grp.id || grp.rules.every((r) => matchSingleRule(r, item));
        if (isMatched) {
          const displayName =
            item.unitName || unitLookupMap.get(item.unitId)?.name || item.unitId;
          if (displayName && !seen.has(displayName)) {
            seen.add(displayName);
            names.push(displayName);
            area += Number(item.sizeM2 || item.size || 0);
          }
        }
      }
    } else {
      const rawIds = activeVersion?.groupMappings?.[grp.id] || [];
      for (let i = 0; i < rawIds.length; i++) {
        const rawId = rawIds[i];
        const resolvedUnit =
          unitLookupMap.get(rawId) || unitLookupMap.get(String(rawId).toLowerCase());
        const summaryItem =
          summaryMap.get(rawId) || summaryMap.get(String(rawId).toLowerCase());
        const displayName = resolvedUnit?.name || summaryItem?.unitName || rawId;
        if (displayName && !seen.has(displayName)) {
          seen.add(displayName);
          names.push(displayName);
          area += Number(
            summaryItem?.sizeM2 ||
              summaryItem?.size ||
              resolvedUnit?.sizeM2 ||
              resolvedUnit?.size ||
              0
          );
        }
      }
    }

    map.set(grp.id, { unitNames: names, totalAreaM2: area });
  }
  return map;
}

interface UseDynamicHierarchyActionsParams {
  store: 'HCM' | 'HN';
  location: string;
  effectiveYear: string;
  versions: MapVersion[];
  activeVersion: MapVersion | undefined;
  viewVersionId: string | null;
  updateVersions: (newVersions: MapVersion[]) => void;
  setVersions: (v: MapVersion[]) => void;
  setUnits: (u: UnitShape[]) => void;
  setActiveVersionId: (id: string | null) => void;
}

export function useDynamicHierarchyActions({
  store,
  location,
  effectiveYear,
  versions,
  activeVersion,
  viewVersionId,
  updateVersions,
  setVersions,
  setUnits,
  setActiveVersionId,
}: UseDynamicHierarchyActionsParams) {
  const toggleVersionActive = useCallback(() => {
    if (!activeVersion) return;
    updateVersions(versions.map((v) => ({ ...v, isDynamicActive: true })));
  }, [activeVersion, updateVersions, versions]);

  const applyRules = useCallback(async () => {
    try {
      const { totalEvaluatedUnits } = applyAllDynamicRulesForStore(store);
      const allUpdatedVersions = useDataStore.getState().getAllStoreVersions(store);
      const allUpdatedUnits = useDataStore.getState().getAllStoreUnits(store);

      setVersions(allUpdatedVersions);
      setUnits(allUpdatedUnits);
      await triggerBackgroundR2Sync(store);

      alert(
        `Đã áp dụng điều kiện logic cho toàn bộ các version trên tất cả các tầng tại ${store} (${totalEvaluatedUnits} units). Dữ liệu đã được lưu lên Cloudflare R2.`
      );
    } catch (err: any) {
      console.error('Lỗi khi áp dụng rules:', err);
      alert(`Có lỗi xảy ra khi áp dụng rules: ${err?.message || err}`);
    }
  }, [store, setVersions, setUnits]);

  const addVersion = useCallback(() => {
    const name = prompt(`Tên version mới cho [${store} - ${location} - ${effectiveYear}]:`);
    if (name) {
      const existingVer = versions.find(
        (v) => (v.location === location || !v.location) && (v.groups || []).length > 0
      );
      const existingBg =
        versions.find((v) => (v.location === location || !v.location) && v.backgroundUrl)
          ?.backgroundUrl || null;

      const inheritedGroups = existingVer
        ? existingVer.groups.map((g) => ({
            ...g,
            id: uuidv4(),
            rules: g.rules ? g.rules.map((r) => ({ ...r })) : [],
          }))
        : [];

      const newVersion: MapVersion = {
        id: uuidv4(),
        name,
        backgroundUrl: existingBg,
        backgroundScale: 1,
        backgroundPos: { x: 0, y: 0 },
        groups: inheritedGroups,
        groupMappings: {},
        store,
        location,
        isDynamicActive: true,
        year: String(effectiveYear),
      };
      updateVersions([...versions, newVersion]);
      setActiveVersionId(newVersion.id);
    }
  }, [store, location, effectiveYear, versions, updateVersions, setActiveVersionId]);

  const duplicateVersion = useCallback(() => {
    if (!activeVersion) return;
    const name = prompt('Tên version mới (bản sao):', `${activeVersion.name} (Copy)`);
    if (name) {
      const newVersionId = uuidv4();
      const newGroups = (activeVersion.groups || []).map((g) => ({
        ...g,
        id: uuidv4(),
        rules: g.rules ? g.rules.map((r) => ({ ...r })) : [],
      }));
      const newGroupMappings: Record<string, string[]> = {};
      (activeVersion.groups || []).forEach((g, idx) => {
        const newGId = newGroups[idx]?.id;
        if (newGId) {
          newGroupMappings[newGId] = [...(activeVersion.groupMappings?.[g.id] || [])];
        }
      });

      const newVersion: MapVersion = {
        ...activeVersion,
        id: newVersionId,
        name,
        store: store || activeVersion.store || 'HCM',
        location: location || activeVersion.location || 'L1',
        year: String(effectiveYear),
        groups: newGroups,
        groupMappings: newGroupMappings,
        isDynamicActive: true,
      };
      updateVersions([...versions, newVersion]);
      setActiveVersionId(newVersion.id);
    }
  }, [activeVersion, store, location, effectiveYear, updateVersions, versions, setActiveVersionId]);

  const deleteVersion = useCallback(() => {
    if (!activeVersion) return;
    if (
      !confirm(
        `Bạn có chắc muốn xoá version "${activeVersion.name}" (${activeVersion.store || store} - ${activeVersion.location || location} - ${activeVersion.year || effectiveYear})?`
      )
    )
      return;
    const newVersions = versions.filter((v) => v.id !== activeVersion.id);
    updateVersions(newVersions);

    const remainingInPartition = newVersions.filter((v) => {
      const matchStore = !v.store || v.store === store;
      const matchLoc = !v.location || v.location === location;
      const matchYear = String(v.year || '').trim() === String(effectiveYear).trim();
      return matchStore && matchLoc && matchYear;
    });

    setActiveVersionId(remainingInPartition.length > 0 ? remainingInPartition[0].id : null);
  }, [activeVersion, store, location, effectiveYear, versions, updateVersions, setActiveVersionId]);

  const addGroup = useCallback(() => {
    if (!activeVersion) return alert('Hãy tạo hoặc chọn một Version trước.');
    const name = prompt('Tên group mới cho version này:');
    if (name) {
      const color =
        '#' +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, '0');
      const newGroup = { id: uuidv4(), name, color, rules: [] };

      updateVersions(
        versions.map((v) =>
          v.id === activeVersion.id
            ? {
                ...v,
                groups: [...(v.groups || []), newGroup],
                groupMappings: { ...v.groupMappings, [newGroup.id]: [] },
              }
            : v
        )
      );
    }
  }, [activeVersion, updateVersions, versions]);

  const deleteGroup = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!confirm('Xoá group này khỏi version hiện tại?')) return;
      updateVersions(
        versions.map((v) => {
          if (v.id === viewVersionId) {
            const newMappings = { ...v.groupMappings };
            delete newMappings[id];
            return {
              ...v,
              groups: v.groups.filter((g) => g.id !== id),
              groupMappings: newMappings,
            };
          }
          return v;
        })
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const renameGroup = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const group = activeVersion?.groups.find((g) => g.id === id);
      if (!group) return;
      const newName = prompt('Đổi tên group:', group.name);
      if (newName && newName !== group.name) {
        updateVersions(
          versions.map((v) =>
            v.id === viewVersionId
              ? { ...v, groups: v.groups.map((g) => (g.id === id ? { ...g, name: newName } : g)) }
              : v
          )
        );
      }
    },
    [activeVersion, updateVersions, versions, viewVersionId]
  );

  const updateGroupColor = useCallback(
    (groupId: string, color: string) => {
      updateVersions(
        versions.map((v) =>
          v.id === viewVersionId
            ? { ...v, groups: v.groups.map((g) => (g.id === groupId ? { ...g, color } : g)) }
            : v
        )
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const updateGroupOpacity = useCallback(
    (groupId: string, opacity: number) => {
      updateVersions(
        versions.map((v) =>
          v.id === viewVersionId
            ? { ...v, groups: v.groups.map((g) => (g.id === groupId ? { ...g, opacity } : g)) }
            : v
        )
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const updateGroupHatchPattern = useCallback(
    (groupId: string, hatchPattern: HatchPatternType) => {
      updateVersions(
        versions.map((v) =>
          v.id === viewVersionId
            ? { ...v, groups: v.groups.map((g) => (g.id === groupId ? { ...g, hatchPattern } : g)) }
            : v
        )
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const updateGroupSymbol = useCallback(
    (groupId: string, symbol: string) => {
      updateVersions(
        versions.map((v) =>
          v.id === viewVersionId
            ? { ...v, groups: v.groups.map((g) => (g.id === groupId ? { ...g, symbol } : g)) }
            : v
        )
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const addRuleToGroup = useCallback(
    (groupId: string) => {
      updateVersions(
        versions.map((v) =>
          v.id === viewVersionId
            ? {
                ...v,
                groups: v.groups.map((g) =>
                  g.id === groupId
                    ? { ...g, rules: [...(g.rules || []), { field: 'sales', operator: '>', value: '0' }] }
                    : g
                ),
              }
            : v
        )
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const updateRule = useCallback(
    (groupId: string, ruleIndex: number, attr: keyof GroupRule, value: string) => {
      updateVersions(
        versions.map((v) => {
          if (v.id === viewVersionId) {
            return {
              ...v,
              groups: v.groups.map((g) => {
                if (g.id === groupId && g.rules) {
                  const newRules = [...g.rules];
                  newRules[ruleIndex] = { ...newRules[ruleIndex], [attr]: value };
                  return { ...g, rules: newRules };
                }
                return g;
              }),
            };
          }
          return v;
        })
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const deleteRule = useCallback(
    (groupId: string, ruleIndex: number) => {
      updateVersions(
        versions.map((v) => {
          if (v.id === viewVersionId) {
            return {
              ...v,
              groups: v.groups.map((g) => {
                if (g.id === groupId && g.rules) {
                  const newRules = [...g.rules];
                  newRules.splice(ruleIndex, 1);
                  return { ...g, rules: newRules };
                }
                return g;
              }),
            };
          }
          return v;
        })
      );
    },
    [updateVersions, versions, viewVersionId]
  );

  const copyGroups = useCallback(
    (sourceVersionId: string) => {
      const sourceVersion = versions.find((v) => v.id === sourceVersionId);
      if (!sourceVersion || !activeVersion) return;

      if (
        !confirm(
          `Bạn có chắc muốn copy groups từ version "${sourceVersion.name}"?\n(Các group hiện tại trong version này sẽ bị thay thế)`
        )
      ) {
        return;
      }

      const newGroups = sourceVersion.groups.map((g) => ({ ...g, id: uuidv4() }));
      const newGroupMappings: Record<string, string[]> = {};

      sourceVersion.groups.forEach((g, idx) => {
        const newId = newGroups[idx].id;
        newGroupMappings[newId] = [...(sourceVersion.groupMappings[g.id] || [])];
      });

      updateVersions(
        versions.map((v) =>
          v.id === activeVersion.id
            ? { ...v, groups: newGroups, groupMappings: newGroupMappings }
            : v
        )
      );
    },
    [versions, activeVersion, updateVersions]
  );

  return {
    toggleVersionActive,
    applyRules,
    addVersion,
    duplicateVersion,
    deleteVersion,
    addGroup,
    deleteGroup,
    renameGroup,
    updateGroupColor,
    updateGroupOpacity,
    updateGroupHatchPattern,
    updateGroupSymbol,
    addRuleToGroup,
    updateRule,
    deleteRule,
    copyGroups,
  };
}
