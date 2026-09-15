import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { AppUser, PermissionMatrix, AppRole, PermissionAction, PermissionModule, Task } from '../types';
import { useLanguage } from "../lib/LanguageContext";
import { Plus, Trash2, Check, Search, X } from 'lucide-react';
import { doc } from 'firebase/firestore';
import {   db, APP_ID , setDoc , deleteDoc } from "../lib/firebase";
import { ConfirmModal } from './ConfirmModal';
import { useState, useMemo } from 'react';
import { cn, matchesAdvancedSearch } from '../lib/utils';
import { DebouncedSearchInput } from './DebouncedSearchInput';

interface AccControlTabProps {
  users: AppUser[];
  locationVisibility?: Record<string, boolean>;
  onEditUser: (u: AppUser) => void;
  onAddUser: () => void;
}

export function AccControlTab({ users, locationVisibility = {}, onEditUser, onAddUser }: AccControlTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');

  const [newLocation, setNewLocation] = useState('');
  const [newParty, setNewParty] = useState('');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const changeRole = async (userId: string, role: string) => {
    try {
              const canWrite = role === 'Manager' || role === 'Staff' || role === 'CP' || role === 'admin';
              const canSee = true;
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), { role, canWrite, canSee }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const toggleUserPermission = async (userId: string, category: 'storePermissions' | 'locationPermissions', field: string, currentValue: boolean) => {
    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        [category]: {
          [field]: !currentValue
        }
      }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const toggleNotificationPermission = async (userId: string, currentValue: boolean) => {
    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        notification: !currentValue
      }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const toggleUserPartyTag = async (userId: string, party: string, currentValue: boolean) => {
    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        partyPermissions: {
          [party]: !currentValue
        }
      }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const handleAddParty = async () => {
    if (!newParty.trim()) return;
    const party = newParty.trim();
    if (parties.includes(party)) return;

    try {
      const newList = [...parties, party];
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'parties'), { list: newList }, { merge: true });
      setNewParty('');
    } catch (e) { console.error(e); }
  };

  const removeParty = async (party: string) => {
    try {
      const newList = parties.filter(p => p !== party);
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'parties'), { list: newList }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const toggleByPartyPermission = async (userId: string, currentValue: boolean) => {
    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
        byPartyAccess: !currentValue
      }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const toggleAllPermissions = async (userId: string, isCurrentlyAll: boolean) => {
    const newValue = !isCurrentlyAll;
    const locPerms: Record<string, boolean> = { all: newValue };
    locations.forEach(loc => {
      locPerms[loc.toLowerCase()] = newValue;
    });

    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
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
    } catch (e) { console.error(e); }
  };

  const handleAddLocation = async () => {
    if (!newLocation.trim()) return;
    const loc = newLocation.trim();
    if (locations.includes(loc)) return;

    try {
      const newList = [...locations, loc];
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations'), { list: newList }, { merge: true });
      setNewLocation('');
    } catch (e) { console.error(e); }
  };

  const removeLocation = async (loc: string) => {
    try {
      const newList = locations.filter(l => l !== loc);
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations'), { list: newList }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const toggleLocationVisibility = async (loc: string, currentVisible: boolean) => {
    try {
      const newVisibility = { ...locationVisibility, [loc]: !currentVisible };
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations'), { visibility: newVisibility }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const isAdmin = currentUser?.role === 'admin';
  const baseUsers = isAdmin ? users : users.filter(u => u.id === currentUser?.id);
  
  const displayUsers = useMemo(() => {
    return baseUsers.filter(u => {
      if (!searchTerm) return true;
      
      return matchesAdvancedSearch(searchTerm, [u.username, u.role, (u as any).department, (u as any).position], [], (term) => {
        if (u.locationPermissions && Object.keys(u.locationPermissions).some(loc => u.locationPermissions![loc] && loc.toLowerCase().includes(term))) {
          return true;
        }
        if (u.partyPermissions && Object.keys(u.partyPermissions).some(party => u.partyPermissions![party] && party.toLowerCase().includes(term))) {
          return true;
        }
        return false;
      });
    });
  }, [baseUsers, searchTerm]);

  const updatePermission = async (role: AppRole, action: PermissionAction, module: PermissionModule, value: boolean) => {
    try {
      const newMatrix = JSON.parse(JSON.stringify(permissionMatrix));
      if (!newMatrix[role]) newMatrix[role] = {};
      if (!newMatrix[role][action]) newMatrix[role][action] = {};
      newMatrix[role][action][module] = value;
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'permissions'), newMatrix);
    } catch (e) { console.error(e); }
  };

  const renderCell = (role: AppRole, action: PermissionAction, module: PermissionModule) => (
    <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336]">
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

  const handleDeleteUser = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Account',
      message: 'Delete this account?',
      onConfirm: async () => {
        try {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', id));
        } catch (e) { console.error(e); }
      }
    });
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm overflow-hidden">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">{isAdmin ? 'User Account Control' : 'My Account'}</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 z-10" />
            <DebouncedSearchInput
              placeholder="Search users..."
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              debounceMs={500}
              className="pl-9 pr-8 py-1.5 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          {isAdmin && (
            <button title={t("Add User")} 
              onClick={onAddUser}
              className="px-4 py-1.5 bg-slate-900 dark:bg-blue-600 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-2 h-full"
            >
              <Plus className="w-4 h-4" />{t("Add User")}</button>
          )}
        </div>
      </div>
      <div className="overflow-y-auto flex-grow p-4 space-y-8">
        
        {/* Table 1: User Role Assignment */}
        <div>
          <h3 className="text-md font-bold text-slate-700 dark:text-[#c3c3c3] mb-3 text-center">{isAdmin ? 'Ma trận phân quyền' : 'Tài khoản của tôi'}</h3>
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
                              onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
                            />
                            <button onClick={handleAddLocation}
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
                              onKeyDown={(e) => e.key === 'Enter' && handleAddParty()}
                            />
                            <button onClick={handleAddParty}
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
                      {/* All Permissions */}
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
                      {/* By Party Access */}
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
                      {/* Notification Permission */}
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
                      {/* Store Permissions */}
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
                      {/* Location Assignment */}
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
                      {/* Party Assignment */}
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
                      <button onClick={() => handleDeleteUser(u.id)}
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

      {isAdmin && (
        <>
          {/* Table 2: Permission Matrix */}
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
              {/* Manager */}
              <tr className="border-b border-slate-100 dark:border-[#333336]">
                <td rowSpan={2} className="px-2 py-2 font-bold text-slate-800 dark:text-[#e3e3e3] border-r border-slate-100 dark:border-[#333336] align-middle">Manager</td>
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">See</td>
                {renderCell('Manager', 'See', 'general')}
                {renderCell('Manager', 'See', 'detail')}
                {renderCell('Manager', 'See', 'calendar')}
                {renderCell('Manager', 'See', 'budget')}
                {renderCell('Manager', 'See', 'costDetail')}
                {renderCell('Manager', 'See', 'report')}
                {renderCell('Manager', 'See', 'layout')}
                {renderCell('Manager', 'See', 'taskDelegation')}
                {renderCell('Manager', 'See', 'pictureMapping')}
                {renderCell('Manager', 'See', 'importCsv')}
              </tr>
              <tr className="border-b border-slate-200 dark:border-[#444446]">
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">Write</td>
                {renderCell('Manager', 'Write', 'general')}
                {renderCell('Manager', 'Write', 'detail')}
                {renderCell('Manager', 'Write', 'calendar')}
                {renderCell('Manager', 'Write', 'budget')}
                {renderCell('Manager', 'Write', 'costDetail')}
                {renderCell('Manager', 'Write', 'report')}
                {renderCell('Manager', 'Write', 'layout')}
                {renderCell('Manager', 'Write', 'taskDelegation')}
                {renderCell('Manager', 'Write', 'pictureMapping')}
                {renderCell('Manager', 'Write', 'importCsv')}
              </tr>
              {/* Staff */}
              <tr className="border-b border-slate-100 dark:border-[#333336]">
                <td rowSpan={2} className="px-2 py-2 font-bold text-slate-800 dark:text-[#e3e3e3] border-r border-slate-100 dark:border-[#333336] align-middle">Staff</td>
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">See</td>
                {renderCell('Staff', 'See', 'general')}
                {renderCell('Staff', 'See', 'detail')}
                {renderCell('Staff', 'See', 'calendar')}
                {renderCell('Staff', 'See', 'budget')}
                {renderCell('Staff', 'See', 'costDetail')}
                {renderCell('Staff', 'See', 'report')}
                {renderCell('Staff', 'See', 'layout')}
                {renderCell('Staff', 'See', 'taskDelegation')}
                {renderCell('Staff', 'See', 'pictureMapping')}
                {renderCell('Staff', 'See', 'importCsv')}
              </tr>
              <tr className="border-b border-slate-200 dark:border-[#444446]">
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">Write</td>
                {renderCell('Staff', 'Write', 'general')}
                {renderCell('Staff', 'Write', 'detail')}
                {renderCell('Staff', 'Write', 'calendar')}
                {renderCell('Staff', 'Write', 'budget')}
                {renderCell('Staff', 'Write', 'costDetail')}
                {renderCell('Staff', 'Write', 'report')}
                {renderCell('Staff', 'Write', 'layout')}
                {renderCell('Staff', 'Write', 'taskDelegation')}
                {renderCell('Staff', 'Write', 'pictureMapping')}
                {renderCell('Staff', 'Write', 'importCsv')}
              </tr>
              {/* External */}
              <tr className="border-b border-slate-100 dark:border-[#333336]">
                <td rowSpan={2} className="px-2 py-2 font-bold text-slate-800 dark:text-[#e3e3e3] border-r border-slate-100 dark:border-[#333336] align-middle">External</td>
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">See</td>
                {renderCell('External', 'See', 'general')}
                {renderCell('External', 'See', 'detail')}
                {renderCell('External', 'See', 'calendar')}
                {renderCell('External', 'See', 'budget')}
                {renderCell('External', 'See', 'costDetail')}
                {renderCell('External', 'See', 'report')}
                {renderCell('External', 'See', 'layout')}
                {renderCell('External', 'See', 'taskDelegation')}
                {renderCell('External', 'See', 'pictureMapping')}
                {renderCell('External', 'See', 'importCsv')}
              </tr>
              <tr className="border-b border-slate-200 dark:border-[#444446]">
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">Write</td>
                {renderCell('External', 'Write', 'general')}
                {renderCell('External', 'Write', 'detail')}
                {renderCell('External', 'Write', 'calendar')}
                {renderCell('External', 'Write', 'budget')}
                {renderCell('External', 'Write', 'costDetail')}
                {renderCell('External', 'Write', 'report')}
                {renderCell('External', 'Write', 'layout')}
                {renderCell('External', 'Write', 'taskDelegation')}
                {renderCell('External', 'Write', 'pictureMapping')}
                {renderCell('External', 'Write', 'importCsv')}
              </tr>
              {/* CP */}
              <tr className="border-b border-slate-100 dark:border-[#333336]">
                <td rowSpan={2} className="px-2 py-2 font-bold text-slate-800 dark:text-[#e3e3e3] border-r border-slate-100 dark:border-[#333336] align-middle">CP</td>
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">See</td>
                {renderCell('CP', 'See', 'general')}
                {renderCell('CP', 'See', 'detail')}
                {renderCell('CP', 'See', 'calendar')}
                {renderCell('CP', 'See', 'budget')}
                {renderCell('CP', 'See', 'costDetail')}
                {renderCell('CP', 'See', 'report')}
                {renderCell('CP', 'See', 'layout')}
                {renderCell('CP', 'See', 'taskDelegation')}
                {renderCell('CP', 'See', 'pictureMapping')}
                {renderCell('CP', 'See', 'importCsv')}
              </tr>
              <tr className="border-b border-slate-200 dark:border-[#444446]">
                <td className="px-2 py-2 border-r border-slate-100 dark:border-[#333336] text-left">Write</td>
                {renderCell('CP', 'Write', 'general')}
                {renderCell('CP', 'Write', 'detail')}
                {renderCell('CP', 'Write', 'calendar')}
                {renderCell('CP', 'Write', 'budget')}
                {renderCell('CP', 'Write', 'costDetail')}
                {renderCell('CP', 'Write', 'report')}
                {renderCell('CP', 'Write', 'layout')}
                {renderCell('CP', 'Write', 'taskDelegation')}
                {renderCell('CP', 'Write', 'pictureMapping')}
                {renderCell('CP', 'Write', 'importCsv')}
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}

      </div>
    </div>
  );
}
