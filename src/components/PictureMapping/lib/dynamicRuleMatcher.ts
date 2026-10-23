import { GroupRule } from '../components/DataMapping/types';

export interface DynamicUnitSummaryItem {
  unitId: string;
  unitName: string;
  store: string;
  location: string;
  year: string;
  // Real-time App Project Data (Strictly from Zustand tasks & projects)
  hasAppProject: boolean;
  appProjectCode: string;
  projectName: string;
  appProjectStatus: string; // 'On process' | 'Upcoming' | 'Completed' | 'Delay' | ''
  appProjectYear: string;
  appProjectMdStatus: string;
  appProjectActStatus: string;
  appProjectDetail: string;
  appProjectDescription: string;
  appProjectParty: string;
  appProjectBudget: number;
  appProjectActual: number;
  appProjectSizeM2?: number;
  planProgress: number;
  actProgress: number;
  matchedTasksCount: number;
  task: string;
  activeTasks?: string[];
  // Excel / Master Business Data
  size: number;
  sizeM2?: number;
  sales: number;
  salesByCp: number;
  profit: number;
  profitByCp: number;
  margin: number;
  marginByCp: number;
  hcmSalesEffi: number;
  hcmMargin: number;
  mdStatus: string;
  mdNotes: string;
  excelProjectStatus: string;
  vendorCode: string;
  brandCode: string;
  brandName: string;
  classCode: string;
  // Dynamic Evaluation Result
  matchedGroupId: string | null;
  matchedGroupName: string | null;
  color: string; // Hex color
  opacity: number;
  matchedRuleReason: string;
  isRestricted?: boolean;
}

/**
 * Pure function to evaluate if a rule matches a unit's aggregated data
 */
export function matchSingleRule(rule: GroupRule, data: DynamicUnitSummaryItem): boolean {
  let val: any = (data as any)[rule.field];

  if (val === undefined || val === null || String(val).trim() === '') {
    const f = String(rule.field || '').toLowerCase().trim();
    if (f === 'floor' || f === 'location') {
      val = data.location || '';
    } else if (f === 'app: floor' || f === 'appfloor' || f === 'appprojectfloor') {
      val = data.hasAppProject ? (data.location || '') : '';
    } else if (f === 'year') {
      val = data.year || '';
    } else if (f === 'appprojectyear' || f === 'app: year' || f === 'appyear') {
      val = data.hasAppProject ? (data.appProjectYear || '') : '';
    } else if (f === 'status' || f === 'projectstatus' || f === 'appprojectstatus' || f === 'app: status' || f === 'appstatus') {
      val = (data.hasAppProject && data.appProjectStatus) ? data.appProjectStatus : '';
    } else if (f === 'unit' || f === 'code') {
      val = data.unitName || '';
    } else if (f === 'appprojectcode' || f === 'app: project code' || f === 'appcode') {
      val = data.hasAppProject ? (data.appProjectCode || '') : '';
    } else if (f === 'mdstatus') {
      val = data.hasAppProject ? (data.appProjectMdStatus || '') : (data.mdStatus || '');
    } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
      val = data.hasAppProject ? (data.appProjectMdStatus || '') : '';
    } else if (f === 'actstatus' || f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status') {
      val = data.hasAppProject ? (data.appProjectActStatus || '') : '';
    } else if (f === 'detail' || f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)') {
      val = data.hasAppProject ? (data.appProjectDetail || '') : '';
    } else if (f === 'description (project)' || f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)') {
      val = data.hasAppProject ? (data.appProjectDescription || '') : '';
    } else if (f === 'party' || f === 'appprojectparty' || f === 'appparty' || f === 'app: party') {
      val = data.hasAppProject ? (data.appProjectParty || '') : '';
    } else if (f === 'budget' || f === 'appbudget' || f === 'appprojectbudget' || f === 'app: budget') {
      val = data.hasAppProject ? (data.appProjectBudget ?? 0) : 0;
    } else if (f === 'actual' || f === 'appactual' || f === 'appprojectactual' || f === 'app: actual') {
      val = data.hasAppProject ? (data.appProjectActual ?? 0) : 0;
    } else if (f === 'apptask' || f === 'app: task' || f === 'app: task summarize' || f === 'app: task summaries' || f === 'app: tasks' || f === 'task' || f === 'tasks' || f === 'tasksummaries' || f === 'task summarize' || f === 'task summary' || f === 'task name') {
      val = (data.hasAppProject && data.task) ? data.task : '';
    } else if (f === 'actprogress' || f === 'act progress') {
      val = data.hasAppProject ? (data.actProgress ?? 0) : 0;
    } else if (f === 'planprogress' || f === 'plan progress') {
      val = data.hasAppProject ? (data.planProgress ?? 0) : 0;
    } else if (f === 'appprojectsizem2' || f === 'appsizem2' || f === 'app: size (m²)' || f === 'app: size m2' || f === 'app: sizem2') {
      val = data.hasAppProject ? (data.appProjectSizeM2 ?? data.sizeM2 ?? 0) : 0;
    } else if (f === 'sizem2' || f === 'size m2' || f === 'size' || f === 'area' || f === 'area (m2)' || f === 'm2') {
      val = data.sizeM2 ?? data.appProjectSizeM2 ?? data.size ?? 0;
    }
  }

  if (rule.field === 'margin' || rule.field === 'marginByCp' || rule.field === 'hcmMargin') {
    val = Number(val || 0) * 100;
  }

  const numVal = Number(rule.value);
  const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== '';

  let compareValStr = String(val ?? '').toLowerCase().trim();
  let compareRuleStr = String(rule.value ?? '').toLowerCase().trim();

  // Normalize synonym status strings
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
