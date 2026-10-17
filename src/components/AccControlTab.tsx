import React, { Suspense, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { AppUser } from '../types';
import { useLanguage } from "../lib/LanguageContext";
import { Plus, Search } from 'lucide-react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, APP_ID } from "../lib/firebase";
import { matchesAdvancedSearch } from '../lib/utils';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { bumpConfigVersion } from '../lib/configCacheService';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { AccControlUserTable } from './AccControlTabParts/AccControlUserTable';
import { AccControlRbacMatrix } from './AccControlTabParts/AccControlRbacMatrix';
import { AccControlTabProps, AccConfirmModalState } from './AccControlTabParts/accControlTypes';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');

export function AccControlTab({ users, locationVisibility = {}, onEditUser, onAddUser }: AccControlTabProps) {
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');

  const [confirmModal, setConfirmModal] = useState<AccConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const updateUserInStore = (userId: string, updateFn: (u: AppUser) => AppUser) => {
    const setAppUsers = useAppStore.getState().setAppUsers;
    const currentList = useAppStore.getState().appUsers;
    const updatedList = currentList.map(u => u.id === userId ? updateFn(u) : u);
    setAppUsers(updatedList);
  };

  const handleAddParty = async (party: string) => {
    if (parties.includes(party)) return;
    try {
      const newList = [...parties, party];
      useAppStore.getState().setParties(newList);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'parties'), { list: newList }, { merge: true });
      await bumpConfigVersion('parties');
    } catch (e) {
      console.error(e);
    }
  };

  const removeParty = async (party: string) => {
    try {
      const newList = parties.filter(p => p !== party);
      useAppStore.getState().setParties(newList);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'parties'), { list: newList }, { merge: true });
      await bumpConfigVersion('parties');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddLocation = async (loc: string) => {
    if (locations.includes(loc)) return;
    try {
      const newList = [...locations, loc];
      useAppStore.getState().setLocations(newList);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations'), { list: newList }, { merge: true });
      await bumpConfigVersion('locations');
    } catch (e) {
      console.error(e);
    }
  };

  const removeLocation = async (loc: string) => {
    try {
      const newList = locations.filter(l => l !== loc);
      useAppStore.getState().setLocations(newList);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations'), { list: newList }, { merge: true });
      await bumpConfigVersion('locations');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleLocationVisibility = async (loc: string, currentVisible: boolean) => {
    try {
      const newVisibility = { ...locationVisibility, [loc]: !currentVisible };
      useAppStore.getState().setLocationVisibility(newVisibility);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations'), { visibility: newVisibility }, { merge: true });
      await bumpConfigVersion('locations');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Account',
      message: 'Delete this account?',
      onConfirm: async () => {
        try {
          const setAppUsers = useAppStore.getState().setAppUsers;
          const currentList = useAppStore.getState().appUsers;
          setAppUsers(currentList.filter(u => u.id !== id));
          await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', id));
          await bumpConfigVersion('app_users');
        } catch (e) {
          console.error(e);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
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

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm overflow-hidden">
      <Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal 
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
        )}
      </Suspense>

      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">{isAdmin ? 'User Account Control' : 'My Account'}</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <DebouncedSearchInput
              placeholder="Search users..."
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              debounceMs={500}
              className="w-64"
            />
          </div>
          {isAdmin && (
            <button
              title={t("Add User")} 
              onClick={onAddUser}
              className="px-4 py-1.5 bg-slate-900 dark:bg-blue-600 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-2 h-full"
            >
              <Plus className="w-4 h-4" />{t("Add User")}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto flex-grow p-4 space-y-8">
        <AccControlUserTable 
          displayUsers={displayUsers}
          isAdmin={isAdmin}
          locations={locations}
          parties={parties}
          locationVisibility={locationVisibility}
          onEditUser={onEditUser}
          onDeleteUser={handleDeleteUser}
          toggleLocationVisibility={toggleLocationVisibility}
          removeLocation={removeLocation}
          handleAddLocation={handleAddLocation}
          removeParty={removeParty}
          handleAddParty={handleAddParty}
          updateUserInStore={updateUserInStore}
        />

        {isAdmin && (
          <AccControlRbacMatrix 
            permissionMatrix={permissionMatrix}
          />
        )}
      </div>
    </div>
  );
}

export default AccControlTab;
