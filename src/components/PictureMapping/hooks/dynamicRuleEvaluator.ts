import { UnitShape, GroupRule } from '../components/DataMapping/types';

export function matchRuleAgainstData(rule: GroupRule, data: Record<string, any>): boolean {
  let val = data[rule.field];
  const f = String(rule.field || '').toLowerCase().trim();

  // 1. Explicit App Data / Real-time Project checks (Strictly from App Projects & Live Task Summaries - ZERO Excel)
  if (f === 'appprojectstatus' || f === 'appstatus' || f === 'app: status' || f === 'status' || f === 'projectstatus') {
    val = data.hasAppProject ? (data.appProjectStatus || '') : '';
  } else if (f === 'apptask' || f === 'app: task' || f === 'app: task summarize' || f === 'app: task summaries' || f === 'app: tasks' || f === 'task' || f === 'tasks' || f === 'tasksummaries' || f === 'task summarize' || f === 'task summary' || f === 'task name') {
    val = data.hasAppProject ? (data.task || '') : '';
  } else if (f === 'appprojectyear' || f === 'appyear' || f === 'app: year') {
    val = data.hasAppProject ? (data.appProjectYear || '') : '';
  } else if (f === 'appprojectcode' || f === 'appcode' || f === 'app: project code') {
    val = data.hasAppProject ? (data.appProjectCode || '') : '';
  } else if (f === 'appprojectfloor' || f === 'appfloor' || f === 'app: floor') {
    val = data.hasAppProject ? (data.location || data.floor || '') : '';
  } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
    val = data.hasAppProject ? (data.appProjectMdStatus || '') : '';
  } else if (f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status' || f === 'actstatus') {
    val = data.hasAppProject ? (data.appProjectActStatus || '') : '';
  } else if (f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)' || f === 'detail') {
    val = data.hasAppProject ? (data.appProjectDetail || '') : '';
  } else if (f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)' || f === 'description (project)') {
    val = data.hasAppProject ? (data.appProjectDescription || '') : '';
  } else if (f === 'appprojectparty' || f === 'appparty' || f === 'app: party' || f === 'party') {
    val = data.hasAppProject ? (data.appProjectParty || '') : '';
  } else if (f === 'appprojectbudget' || f === 'appbudget' || f === 'app: budget' || f === 'budget') {
    val = data.hasAppProject ? (data.appProjectBudget ?? 0) : 0;
  } else if (f === 'appprojectactual' || f === 'appactual' || f === 'app: actual' || f === 'actual') {
    val = data.hasAppProject ? (data.appProjectActual ?? 0) : 0;
  } else if (f === 'appprojectshoptype' || f === 'appshoptype' || f === 'app: shop type' || f === 'app: shoptype' || f === 'shoptype' || f === 'shop_type' || f === 'shop type') {
    val = data.hasAppProject ? (data.appProjectShopType || data.shopType || '') : (data.shopType || '');
  } else if (val === undefined || val === null || String(val).trim() === '') {
    // 2. General attribute fallbacks
    if (f === 'floor' || f === 'location') {
      val = data.floor || data.location || '';
    } else if (f === 'year') {
      val = data.year || '';
    } else if (f === 'mdstatus') {
      val = data.hasAppProject ? (data.appProjectMdStatus || data.mdStatus || '') : (data.mdStatus || '');
    } else if (f === 'unit' || f === 'code') {
      val = data.unit || data.appProjectCode || '';
    } else if (f === 'shoptype' || f === 'shop_type' || f === 'shop type') {
      val = data.shopType || data.appProjectShopType || '';
    }
  }

  if (rule.field === 'margin' || rule.field === 'marginByCp' || rule.field === 'hcmMargin') {
    val = Number(val) * 100; // evaluate margin as percentage, e.g. 25 instead of 0.25
  }

  const numVal = Number(rule.value);
  const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== '';

  let compareValStr = String(val ?? '').toLowerCase().trim();
  let compareRuleStr = String(rule.value ?? '').toLowerCase().trim();
  if (compareRuleStr === 'in progress') compareRuleStr = 'on process';
  if (compareValStr === 'in progress') compareValStr = 'on process';

  switch (rule.operator) {
    case '>':
      return isNum ? Number(val) > numVal : false;
    case '<':
      return isNum ? Number(val) < numVal : false;
    case '>=':
      return isNum ? Number(val) >= numVal : false;
    case '<=':
      return isNum ? Number(val) <= numVal : false;
    case '=':
      return compareValStr === compareRuleStr;
    case 'contains': {
      const searchTerms = compareRuleStr.split(/\s+/).filter(Boolean);
      return searchTerms.every((term) => compareValStr.includes(term));
    }
    case 'or':
    case 'OR': {
      const orTerms = compareRuleStr
        .split(/[\r\n\t,;+/&|]+|\s{2,}/)
        .map((t) => {
          let tr = t.trim();
          if (tr === 'in progress') tr = 'on process';
          return tr;
        })
        .filter(Boolean);
      if (orTerms.length === 0) {
        const spaceTerms = compareRuleStr.split(/\s+/).filter(Boolean);
        return spaceTerms.some((term) => compareValStr === term || compareValStr.includes(term));
      }
      return orTerms.some((term) => {
        if (compareValStr === term) return true;
        if (compareValStr.includes(term)) return true;
        if (isNum && !isNaN(Number(term)) && Number(val) === Number(term)) return true;
        return false;
      });
    }
    case 'exclude': {
      const searchTerms = compareRuleStr.split(/\s+/).filter(Boolean);
      return !searchTerms.some((term) => compareValStr.includes(term));
    }
    default:
      return false;
  }
}

export function evaluateRulesOnUnits(
  units: UnitShape[],
  rules: GroupRule[] | undefined,
  dataMap: Record<string, any>
): string[] {
  if (!rules || rules.length === 0) return [];
  const matchedIds: string[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const uName = (u.name || '').toLowerCase();
    const data = uName ? dataMap[uName] : null;
    if (data && rules.every((r) => matchRuleAgainstData(r, data))) {
      matchedIds.push(u.id);
    }
  }
  return matchedIds;
}
