import React, { memo, useState, useEffect, useRef } from 'react';
import { GroupRule } from '../types';
import { X } from 'lucide-react';

export const normalizeRuleField = (f: string) => {
  if (f === "appStatus" || f === "app: status") return "appProjectStatus";
  if (f === "appTask" || f === "app: task" || f === "app: task summarize" || f === "app: task summaries" || f === "app: tasks" || f === "taskSummaries" || f === "taskSummarize") return "appTask";
  if (f === "appYear" || f === "app: year") return "appProjectYear";
  if (f === "appCode" || f === "app: project code") return "appProjectCode";
  if (f === "appFloor" || f === "app: floor") return "appProjectFloor";
  if (f === "appMdStatus" || f === "app: md status" || f === "app:md status") return "appProjectMdStatus";
  if (f === "appActStatus" || f === "app: act status" || f === "app:act status") return "appProjectActStatus";
  if (f === "appDetail" || f === "app: detail (project)") return "appProjectDetail";
  if (f === "appDescription" || f === "app: description (project)" || f === "description (project)") return "appProjectDescription";
  if (f === "appParty" || f === "app: party") return "appProjectParty";
  if (f === "appBudget" || f === "app: budget") return "appProjectBudget";
  if (f === "appActual" || f === "app: actual" || f === "app: act") return "appProjectActual";
  if (f === "appSize" || f === "app: size" || f === "app: size (m2)" || f === "app: size (m²)") return "appProjectSizeM2";
  if (f === "appShopType" || f === "app: shop type") return "appProjectShopType";
  return f;
};

interface DynamicRuleRowProps {
  groupId: string;
  ruleIndex: number;
  rule: GroupRule;
  onUpdateRule: (groupId: string, ruleIndex: number, attr: keyof GroupRule, value: string) => void;
  onDeleteRule: (groupId: string, ruleIndex: number) => void;
}

export const DynamicRuleRow = memo(function DynamicRuleRow({
  groupId,
  ruleIndex,
  rule,
  onUpdateRule,
  onDeleteRule,
}: DynamicRuleRowProps) {
  const [localField, setLocalField] = useState(normalizeRuleField(rule.field));
  const [localOp, setLocalOp] = useState(rule.operator);
  const [localVal, setLocalVal] = useState(rule.value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalField(normalizeRuleField(rule.field));
  }, [rule.field]);

  useEffect(() => {
    setLocalOp(rule.operator);
  }, [rule.operator]);

  useEffect(() => {
    setLocalVal(rule.value);
  }, [rule.value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalField(val);
    onUpdateRule(groupId, ruleIndex, 'field', val);
  };

  const handleOpChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalOp(val);
    onUpdateRule(groupId, ruleIndex, 'operator', val);
  };

  const handleValChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalVal(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onUpdateRule(groupId, ruleIndex, 'value', val);
    }, 250);
  };

  const handleValBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onUpdateRule(groupId, ruleIndex, 'value', localVal);
  };

  const handleValKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-md border border-slate-800">
      <select
        className="bg-slate-900 text-slate-300 text-xs outline-none w-2/5 flex-shrink-0 px-1.5 py-0.5 rounded border border-slate-700 font-medium"
        value={localField}
        onChange={handleFieldChange}
      >
        <optgroup label="Metrics">
          <option value="sales">Sales</option>
          <option value="salesByCp">Sales by CP</option>
          <option value="salesByHcmcate">Sales by HCMcate</option>
          <option value="margin">Margin</option>
          <option value="marginByCp">Margin by CP</option>
          <option value="profit">Profit</option>
          <option value="profitByCp">Profit by CP</option>
          <option value="profitByHcmcate">Profit by HCMcate</option>
          <option value="hcmSalesEffi">HCM Sales Effi</option>
          <option value="hcmMargin">HCM Margin</option>
        </optgroup>
        <optgroup label="Attributes">
          <option value="unit">Unit</option>
          <option value="year">Year</option>
          <option value="size">Size (m²)</option>
          <option value="floor">Floor</option>
          <option value="classCode">Class Code</option>
          <option value="vendorCode">Vendor Code</option>
          <option value="brandCode">Brand Code</option>
          <option value="brandName">Brand Name</option>
          <option value="mdStatus">MD Status</option>
          <option value="mdNotes">MD Notes</option>
          <option value="task">Task</option>
          <option value="projectStatus">Project Status</option>
          <option value="actStatus">Act: Status</option>
          <option value="startDate">Start Date</option>
          <option value="endDate">End Date</option>
          <option value="status">Status</option>
          <option value="shopType">Shop Type</option>
        </optgroup>
        <optgroup label="App Data (Real-time)">
          <option value="appTask">App: Task Summarize (Real-time)</option>
          <option value="appProjectStatus">App: Status</option>
          <option value="appProjectMdStatus">App: MD Status</option>
          <option value="appProjectActStatus">App: Act Status</option>
          <option value="appProjectDetail">App: Detail (Project)</option>
          <option value="appProjectDescription">App: Description (Project)</option>
          <option value="appProjectParty">App: Party</option>
          <option value="appProjectBudget">App: Budget</option>
          <option value="appProjectActual">App: Actual</option>
          <option value="appProjectSizeM2">App: Size (m²)</option>
          <option value="appProjectShopType">App: Shop Type</option>
          <option value="appProjectCode">App: Project Code</option>
          <option value="appProjectYear">App: Year</option>
        </optgroup>
      </select>

      <select
        className="bg-slate-900 text-slate-300 text-xs px-1.5 py-0.5 rounded border border-slate-700 outline-none shrink-0"
        value={localOp}
        onChange={handleOpChange}
      >
        <option value=">">&gt;</option>
        <option value="<">&lt;</option>
        <option value=">=">&gt;=</option>
        <option value="<=">&lt;=</option>
        <option value="=">=</option>
        <option value="contains">Contains</option>
        <option value="or">OR</option>
        <option value="exclude">Exclude</option>
      </select>

      <input
        type="text"
        className="bg-transparent text-slate-200 text-xs flex-1 min-w-0 outline-none border-b border-slate-700 focus:border-brand-500 px-1 py-0.5"
        value={localVal}
        onChange={handleValChange}
        onBlur={handleValBlur}
        onKeyDown={handleValKeyDown}
        placeholder="Value..."
      />

      <button
        onClick={() => onDeleteRule(groupId, ruleIndex)}
        className="text-slate-500 hover:text-red-400 p-0.5 shrink-0 transition-colors"
        title="Delete Rule"
      >
        <X size={12} />
      </button>
    </div>
  );
});
