import React, { FC, Fragment } from 'react';
import { useLanguage } from "../../lib/LanguageContext";
import { PermissionMatrix, AppRole, PermissionAction, PermissionModule } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from "../../lib/firebase";
import { bumpConfigVersion } from "../../lib/configCacheService";

interface AccControlRbacMatrixProps {
  permissionMatrix: PermissionMatrix;
}

const ROLES: AppRole[] = ['Manager', 'Staff', 'External', 'CP'];
const MODULES: PermissionModule[] = [
  'general',
  'detail',
  'calendar',
  'budget',
  'costDetail',
  'report',
  'layout',
  'taskDelegation',
  'pictureMapping',
  'importCsv',
];

export const AccControlRbacMatrix: React.FC<AccControlRbacMatrixProps> = ({
  permissionMatrix,
}) => {
  const { t } = useLanguage();

  const updatePermission = async (role: AppRole, action: PermissionAction, module: PermissionModule, value: boolean) => {
    try {
      const newMatrix = JSON.parse(JSON.stringify(permissionMatrix));
      if (!newMatrix[role]) newMatrix[role] = {};
      if (!newMatrix[role][action]) newMatrix[role][action] = {};
      newMatrix[role][action][module] = value;
      useAppStore.getState().setPermissionMatrix(newMatrix);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'permissions'), newMatrix);
      bumpConfigVersion("permissions");
    } catch (e) {
      console.error(e);
    }
  };

  const renderCell = (role: AppRole, action: PermissionAction, module: PermissionModule) => (
    <td key={`${role}-${action}-${module}`} className="px-2 py-2 border-r border-slate-100 dark:border-[#333336]">
      <div className="flex justify-center">
        <input 
          type="checkbox" 
          checked={permissionMatrix[role]?.[action]?.[module] || false}
          onChange={(e) => updatePermission(role, action, module, e.target.checked)}
          className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8] border-gray-300 rounded focus:ring-blue-500 cursor-pointer" 
        />
      </div>
    </td>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-center text-slate-600 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] rounded-lg overflow-hidden min-w-[800px]">
        <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] bg-slate-100 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]">
          <tr>
            <th rowSpan={2} colSpan={2} className="px-2 py-2 border-r border-slate-200 dark:border-[#444446]"></th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("General")}</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("Detail")}</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("Calendar")}</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("Budget")}</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Cost detail</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("Report")}</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Layout</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("Delegation")}</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Picture mapping</th>
            <th rowSpan={2} className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Import CSV</th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => (
            <React.Fragment key={role}>
              <tr className="border-b border-slate-100 dark:border-[#333336]">
                <td rowSpan={2} className="px-2 py-2 font-bold text-slate-800 dark:text-[#e3e3e3] border-r border-slate-100 dark:border-[#333336] align-middle">
                  {role}
                </td>
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">See</td>
                {MODULES.map((module) => renderCell(role, 'See', module))}
              </tr>
              <tr className="border-b border-slate-200 dark:border-[#444446]">
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">Write</td>
                {MODULES.map((module) => renderCell(role, 'Write', module))}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
