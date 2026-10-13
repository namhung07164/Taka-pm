import React, { FC, useState } from 'react';
import { useLanguage } from "../../lib/LanguageContext";
import { Plus, Trash2 } from "lucide-react";
import { AppUser, AppRole } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from "../../lib/firebase";
import { bumpConfigVersion } from "../../lib/configCacheService";

interface AccControlUserTableProps {
  displayUsers: AppUser[];
  isAdmin: boolean;
  locations: string[];
  parties: string[];
  locationVisibility: Record<string, boolean>;
  onEditUser: (u: AppUser) => void;
  onDeleteUser: (id: string) => void;
  toggleLocationVisibility: (loc: string, currentVisible: boolean) => Promise<void>;
  removeLocation: (loc: string) => Promise<void>;
  handleAddLocation: (loc: string) => Promise<void>;
  removeParty: (party: string) => Promise<void>;
  handleAddParty: (party: string) => Promise<void>;
  updateUserInStore: (userId: string, updateFn: (u: AppUser) => AppUser) => void;
}

export const AccControlUserTable: React.FC<AccControlUserTableProps> = ({
  displayUsers,
  isAdmin,
  locations,
  parties,
  locationVisibility,
  onEditUser,
  onDeleteUser,
  toggleLocationVisibility,
  removeLocation,
  handleAddLocation,
  removeParty,
  handleAddParty,
  updateUserInStore,
}) => {
  const { t } = useLanguage();
  const [newLocation, setNewLocation] = useState('');
  const [newParty, setNewParty] = useState('');

  const changeRole = async (userId: string, role: string) => {
    try {
      const canWrite = role === 'Manager' || role === 'Staff' || role === 'CP' || role === 'admin';
      const canSee = true;
      updateUserInStore(userId, u => ({ ...u, role: role as AppRole, canWrite, canSee }));
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), { role, canWrite, canSee }, { merge: true });
      await bumpConfigVersion('app_users');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleUserPermission = async (userId: string, category: 'storePermissions' | 'locationPermissions', field: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      updateUserInStore(userId, u => ({
        ...u,
        [category]: {
          ...(u[category] || {}),
          [field]: newValue
        }
      }));
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        [category]: {
          [field]: newValue
        }
      }, { merge: true });
      await bumpConfigVersion('app_users');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleNotificationPermission = async (userId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      updateUserInStore(userId, u => ({ ...u, notification: newValue }));
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        notification: newValue
      }, { merge: true });
      await bumpConfigVersion('app_users');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleUserPartyTag = async (userId: string, party: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      updateUserInStore(userId, u => ({
        ...u,
        partyPermissions: {
          ...(u.partyPermissions || {}),
          [party]: newValue
        }
      }));
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        partyPermissions: {
          [party]: newValue
        }
      }, { merge: true });
      await bumpConfigVersion('app_users');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleByPartyPermission = async (userId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      updateUserInStore(userId, u => ({ ...u, byPartyAccess: newValue }));
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        byPartyAccess: newValue
      }, { merge: true });
      await bumpConfigVersion('app_users');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleAllPermissions = async (userId: string, isCurrentlyAll: boolean) => {
    const newValue = !isCurrentlyAll;
    const locPerms: Record<string, boolean> = { all: newValue };
    locations.forEach(loc => {
      locPerms[loc.toLowerCase()] = newValue;
    });

    updateUserInStore(userId, u => ({
      ...u,
      notification: newValue,
      storePermissions: {
        hcm: newValue,
        hn: newValue
      },
      locationPermissions: locPerms,
      partyPermissions: {
        all: newValue
      }
    }));

    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        notification: newValue,
        storePermissions: {
          hcm: newValue,
          hn: newValue
        },
        locationPermissions: locPerms,
        partyPermissions: {
          all: newValue
        }
      }, { merge: true });
      await bumpConfigVersion('app_users');
    } catch (e) {
      console.error(e);
    }
  };

  const onAddLocationSubmit = async () => {
    if (!newLocation.trim()) return;
    await handleAddLocation(newLocation.trim());
    setNewLocation('');
  };

  const onAddPartySubmit = async () => {
    if (!newParty.trim()) return;
    await handleAddParty(newParty.trim());
    setNewParty('');
  };

  return (
    <div>
      <h3 className="text-md font-bold text-slate-700 dark:text-[#c3c3c3] mb-3 text-center">
        {isAdmin ? 'Ma trận phân quyền' : 'Tài khoản của tôi'}
      </h3>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm text-center text-slate-600 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] rounded-lg overflow-hidden ${isAdmin ? 'min-w-[1200px]' : ''}`}>
          <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-100 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]">
            <tr>
              <th rowSpan={isAdmin ? 2 : 1} className="px-6 py-4 font-bold border-r border-slate-200 dark:border-[#444446] text-left whitespace-normal break-words">User</th>
              <th rowSpan={isAdmin ? 2 : 1} className="px-6 py-4 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Password</th>
              {isAdmin && (
                <>
                  <th rowSpan={2} className="px-6 py-4 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Ma trận phân quyền</th>
                  <th rowSpan={2} className="px-6 py-4 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">All</th>
                  <th rowSpan={2} className="px-6 py-4 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">By Party</th>
                  <th rowSpan={2} className="px-6 py-4 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">Notification</th>
                  <th colSpan={2} className="px-6 py-2 font-bold border-r border-slate-200 dark:border-[#444446] border-b border-slate-200 dark:border-[#444446] whitespace-normal break-words">{t("Store")}</th>
                  <th rowSpan={2} className="px-4 py-2 font-bold border-r border-slate-200 dark:border-[#444446] align-top min-w-[200px]">
                    <div className="flex flex-col gap-2">
                      <span>{t("Location")}</span>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {Array.from(new Set(locations)).map(loc => {
                          const isVisible = locationVisibility[loc] ?? true;
                          return (
                            <span key={loc} className="flex items-center gap-1 bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] px-1 py-0.5 rounded text-[10px]">
                              <input 
                                type="checkbox" 
                                checked={isVisible} 
                                onChange={() => toggleLocationVisibility(loc, isVisible)}
                                className="w-2.5 h-2.5 cursor-pointer accent-blue-500 rounded-sm"
                                title="Toggle visibility"
                              />
                              {loc}
                              <button onClick={() => removeLocation(loc)} className="text-red-500 hover:text-red-700">
                                <Trash2 className="w-2 h-2" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1 mt-1 justify-center">
                        <input 
                          type="text" 
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          placeholder="Add..."
                          className="px-2 py-0.5 text-[10px] border border-slate-300 dark:border-[#555558] rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-20 normal-case font-normal bg-transparent text-slate-900 dark:text-[#e3e3e3]"
                          onKeyDown={(e) => e.key === 'Enter' && onAddLocationSubmit()}
                        />
                        <button onClick={onAddLocationSubmit}
                          className="p-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-500 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </th>
                  <th rowSpan={2} className="px-4 py-2 font-bold border-r border-slate-200 dark:border-[#444446] align-top min-w-[200px]">
                    <div className="flex flex-col gap-2">
                      <span>{t("Party")}</span>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {Array.from(new Set(parties)).map(party => (
                          <span key={party} className="flex items-center gap-1 bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] px-1 py-0.5 rounded text-[10px] whitespace-nowrap">
                            {party}
                            <button onClick={() => removeParty(party)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="w-2 h-2" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 mt-1 justify-center">
                        <input 
                          type="text" 
                          value={newParty}
                          onChange={(e) => setNewParty(e.target.value)}
                          placeholder="Add..."
                          className="px-2 py-0.5 text-[10px] border border-slate-300 dark:border-[#555558] rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-20 normal-case font-normal bg-transparent text-slate-900 dark:text-[#e3e3e3]"
                          onKeyDown={(e) => e.key === 'Enter' && onAddPartySubmit()}
                        />
                        <button onClick={onAddPartySubmit}
                          className="p-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-500 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </th>
                </>
              )}
              <th rowSpan={isAdmin ? 2 : 1} className="px-6 py-4 font-bold">{t("Action")}</th>
            </tr>
            {isAdmin && (
              <tr>
                <th className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">HCM</th>
                <th className="px-2 py-2 font-bold border-r border-slate-200 dark:border-[#444446] whitespace-normal break-words">HN</th>
              </tr>
            )}
          </thead>
          <tbody>
            {displayUsers.map(u => (
              <tr key={u.id} className="border-b border-slate-100 dark:border-[#333336] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-800 dark:text-[#e3e3e3] border-r border-slate-100 dark:border-[#333336] text-left">{u.username}</td>
                <td className="px-6 py-4 text-slate-500 dark:text-[#a3a3a3] font-mono tracking-widest border-r border-slate-100 dark:border-[#333336]">{u.password?.length === 64 ? '••••••••' : u.password}</td>
                {isAdmin && (
                  <>
                    <td className="px-4 py-2 border-r border-slate-100 dark:border-[#333336]">
                      <div className="flex justify-center">
                        <select 
                          value={u.role || 'External'}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className="px-2 py-1 text-sm border border-slate-300 dark:border-[#555558] rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#1e1e20] text-slate-900 dark:text-[#e3e3e3] cursor-pointer"
                        >
                          <option value="Manager">Manager</option>
                          <option value="Staff">Staff</option>
                          <option value="CP">CP</option>
                          <option value="External">External</option>
                          {u.role === 'admin' && <option value="admin">Admin</option>}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50">
                      <div className="flex justify-center">
                        <input 
                          type="checkbox" 
                          checked={!!(u.notification !== false && u.storePermissions?.hcm && u.storePermissions?.hn && (u.locationPermissions?.['all'] || locations.every(loc => u.locationPermissions?.[loc.toLowerCase()])) && u.partyPermissions?.['all'])} 
                          onChange={() => toggleAllPermissions(u.id, !!(u.notification !== false && u.storePermissions?.hcm && u.storePermissions?.hn && (u.locationPermissions?.['all'] || locations.every(loc => u.locationPermissions?.[loc.toLowerCase()])) && u.partyPermissions?.['all']))} 
                          className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8] border-gray-300 rounded focus:ring-blue-500 cursor-pointer" 
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336]">
                      <div className="flex justify-center">
                        <input 
                          type="checkbox" 
                          checked={u.byPartyAccess || false} 
                          onChange={() => toggleByPartyPermission(u.id, u.byPartyAccess || false)} 
                          className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8] border-gray-300 rounded focus:ring-blue-500 cursor-pointer" 
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336]">
                      <div className="flex justify-center">
                        <input 
                          type="checkbox" 
                          checked={u.notification !== false} 
                          onChange={() => toggleNotificationPermission(u.id, u.notification !== false)} 
                          className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8] border-gray-300 rounded focus:ring-blue-500 cursor-pointer" 
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336]">
                      <div className="flex justify-center">
                        <input type="checkbox" checked={u.storePermissions?.hcm || false} onChange={() => toggleUserPermission(u.id, 'storePermissions', 'hcm', u.storePermissions?.hcm || false)} className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8] border-gray-300 rounded focus:ring-blue-500 cursor-pointer" />
                      </div>
                    </td>
                    <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336]">
                      <div className="flex justify-center">
                        <input type="checkbox" checked={u.storePermissions?.hn || false} onChange={() => toggleUserPermission(u.id, 'storePermissions', 'hn', u.storePermissions?.hn || false)} className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8] border-gray-300 rounded focus:ring-blue-500 cursor-pointer" />
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-100 dark:border-[#333336] align-top max-w-[200px]">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(['all', ...locations])).filter(loc => u.locationPermissions?.[loc.toLowerCase()]).map(loc => (
                            <div key={loc} className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded text-xs">
                              <span className="truncate max-w-[100px]" title={loc}>{loc}</span>
                              <button onClick={() => toggleUserPermission(u.id, 'locationPermissions', loc.toLowerCase(), true)} className="text-green-500 hover:text-red-500 font-bold p-0.5">
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <select 
                            className="px-2 py-1 text-xs border border-slate-300 dark:border-[#555558] rounded focus:outline-none focus:ring-1 focus:ring-green-500 flex-grow w-full max-w-full bg-slate-50 dark:bg-[#1e1e20] text-slate-900 dark:text-[#e3e3e3]"
                            onChange={(e) => {
                               if (e.target.value) {
                                  toggleUserPermission(u.id, 'locationPermissions', e.target.value.toLowerCase(), false);
                                  e.target.value = '';
                               }
                            }}
                            defaultValue=""
                          >
                            <option value="">Add Location...</option>
                            {Array.from(new Set(['all', ...locations])).filter(loc => !u.locationPermissions?.[loc.toLowerCase()]).map(loc => (
                               <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 border-r border-slate-100 dark:border-[#333336] align-top max-w-[200px]">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1">
                          {['all', ...Array.from(new Set(parties))].filter(party => u.partyPermissions?.[party.toLowerCase()]).map(party => (
                            <div key={party} className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs">
                              <span className="truncate max-w-[100px]" title={party}>{party}</span>
                              <button onClick={() => toggleUserPartyTag(u.id, party.toLowerCase(), true)} className="text-purple-500 hover:text-red-500 font-bold p-0.5">
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <select 
                            className="px-2 py-1 text-xs border border-slate-300 dark:border-[#555558] rounded focus:outline-none focus:ring-1 focus:ring-purple-500 flex-grow w-full max-w-full bg-slate-50 dark:bg-[#1e1e20] text-slate-900 dark:text-[#e3e3e3]"
                            onChange={(e) => {
                               if (e.target.value) {
                                  toggleUserPartyTag(u.id, e.target.value.toLowerCase(), false);
                                  e.target.value = '';
                               }
                            }}
                            defaultValue=""
                          >
                            <option value="">Add Party...</option>
                            {['all', ...Array.from(new Set(parties))].filter(party => !u.partyPermissions?.[party.toLowerCase()]).map(party => (
                               <option key={party} value={party}>{party}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                  </>
                )}
                <td className="px-6 py-4 flex justify-center gap-2">
                  <button onClick={() => onEditUser(u)}
                    className="px-3 py-1 bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] hover:bg-blue-100 dark:hover:bg-[#444446] rounded text-xs font-bold transition-colors"
                  >{t("Edit")}</button>
                  {isAdmin && (
                    <button onClick={() => onDeleteUser(u.id)}
                      className="p-1 bg-red-50 text-red-600 dark:text-red-400 hover:bg-red-100 rounded transition-colors"
                    >
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
  );
};
