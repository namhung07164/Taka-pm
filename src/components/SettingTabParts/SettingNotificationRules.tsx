import React, { FC, useState } from 'react';
import { useLanguage } from "../../lib/LanguageContext";
import { Trash2 } from "lucide-react";
import { NotificationRule } from "../../types";
import { generateId } from "../../lib/utils";
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, APP_ID } from "../../lib/firebase";
import { bumpConfigVersion } from "../../lib/configCacheService";

const EMOJI_OPTIONS = ['🔔', '⚠️', '📅', '🚀', '💡', '📌', '⏳', '✅', '❌', '🔥', '🎉'];

const fieldLabels: Record<string, string> = {
  'start': 'Pj Start',
  'handover': 'Pj Compl',
  'opening': 'Opening',
  'finish': 'Finish',
  'flow_status': 'Flow Status'
};

interface SettingNotificationRulesProps {
  rules: NotificationRule[];
  canWrite: boolean;
  onConfirmDelete: (title: string, message: string, onConfirm: () => Promise<void>) => void;
}

export const SettingNotificationRules: React.FC<SettingNotificationRulesProps> = ({
  rules,
  canWrite,
  onConfirmDelete,
}) => {
  const { t } = useLanguage();
  const [target, setTarget] = useState<'project' | 'task' | 'task_delegation'>('project');
  const [field, setField] = useState('start');
  const [days, setDays] = useState(3);
  const [hours, setHours] = useState(0);
  const [customMessage, setCustomMessage] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('🔔');

  const handleAddRule = async () => {
    if (!canWrite) return;
    const newRule: NotificationRule = {
      id: generateId(),
      target,
      field,
      daysBefore: days,
      hoursBefore: hours,
      customMessage: customMessage.trim() || "",
      color,
      icon
    };
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_rules', newRule.id), newRule);
      await bumpConfigVersion('rules');
      setCustomMessage('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRule = (id: string) => {
    onConfirmDelete('Delete Rule', 'Delete this notification rule?', async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_rules', id));
        await bumpConfigVersion('rules');
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex justify-between items-center shrink-0">
        <h2 className="text-md font-bold text-slate-800 dark:text-[#e3e3e3]">Notification Rules</h2>
      </div>

      <div className="p-4 md:p-5 flex flex-col bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] gap-4">
        <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end w-full">
          <div className="w-full md:w-auto">
            <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Target</label>
            <select
              value={target}
              onChange={(e) => {
                const val = e.target.value as 'project' | 'task' | 'task_delegation';
                setTarget(val);
                setField(val === 'project' ? 'start' : (val === 'task_delegation' ? 'flow_status' : 'start'));
              }}
              className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-40 bg-white dark:bg-[#1e1e20]"
            >
              <option value="project">{t("Project")}</option>
              <option value="task">{t("Task")}</option>
              <option value="task_delegation">Task Delegation</option>
            </select>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Date Field / Trigger</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-40 bg-white dark:bg-[#1e1e20]"
            >
              {target === 'project' ? (
                <>
                  <option value="start">Pj Start</option>
                  <option value="handover">Pj Compl</option>
                  <option value="opening">Opening</option>
                </>
              ) : target === 'task_delegation' ? (
                <>
                  <option value="flow_status">Flow: Status Update</option>
                  <option value="mention">@mention</option>
                  <option value="delegation_party">@delegation party</option>
                </>
              ) : (
                <>
                  <option value="start">{t("Start")}</option>
                  <option value="finish">{t("Finish")}</option>
                </>
              )}
            </select>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Remind before</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 0)}
                className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm flex-1 md:w-20 focus:ring-2 focus:ring-blue-500 outline-none text-center"
              />
              <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-bold">d</span>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 0)}
                className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm flex-1 md:w-20 focus:ring-2 focus:ring-blue-500 outline-none text-center"
              />
              <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-bold">h</span>
            </div>
          </div>

          <div className="w-full md:w-auto flex-grow flex gap-2">
            <div className="flex-grow">
              <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Content (Optional)</label>
              <input
                type="text"
                placeholder="Custom notification message..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-[38px] w-12 p-1 rounded-lg border border-slate-300 dark:border-[#555558] cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Icon</label>
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-[38px] p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-[#1e1e20]"
              >
                {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <button
            title="Add Rule"
            onClick={handleAddRule}
            disabled={!canWrite}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors h-[38px] disabled:opacity-50 w-full md:w-auto mt-2 md:mt-0 ml-auto"
          >
            Add Rule
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-grow p-4 bg-slate-50 dark:bg-[#1e1e20]/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] rounded-lg overflow-hidden bg-white dark:bg-[#1e1e20] shadow-sm min-w-[800px]">
            <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-100 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]">
              <tr>
                <th className="px-6 py-4 font-bold">Target</th>
                <th className="px-6 py-4 font-bold">Trigger Field</th>
                <th className="px-6 py-4 font-bold">Condition</th>
                <th className="px-6 py-4 font-bold">Content</th>
                <th className="px-6 py-4 font-bold w-24 text-center">{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-slate-100 dark:border-[#333336] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-700 dark:text-[#c3c3c3] capitalize">{rule.target}</td>
                  <td className="px-6 py-4 font-medium text-blue-700 dark:text-[#8ab4f8]">{fieldLabels[rule.field] || rule.field}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-[#a3a3a3]">Remind <span className="font-bold">{rule.daysBefore}</span> days, <span className="font-bold">{rule.hoursBefore || 0}</span> hours before</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg" style={{ color: rule.color || '#3b82f6' }}>{rule.icon || '🔔'}</span>
                      <span className="text-slate-700 dark:text-[#c3c3c3] font-medium">{rule.customMessage || <span className="text-slate-400 dark:text-[#838383] italic">Default message</span>}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {canWrite && (
                      <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 bg-red-50 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-md transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
