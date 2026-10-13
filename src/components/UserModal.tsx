import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from "../store/useAppStore";
import { useLanguage } from "../lib/LanguageContext";
import Draggable from 'react-draggable';
import { X, GripHorizontal } from 'lucide-react';
import { AppUser } from '../types';
import { doc } from 'firebase/firestore';
import { db, APP_ID , setDoc } from "../lib/firebase";
import { generateId } from '../lib/utils';
import { bumpConfigVersion } from "../lib/configCacheService";
import { Portal } from './Portal';
import { getZIndexClass } from '../lib/zIndexManager';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
}

export function UserModal({ isOpen, onClose, user}: UserModalProps) {
  const { t } = useLanguage();
  const currentUser = useAppStore(state => state.currentUser);
  const nodeRef = React.useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      const isHashed = user.password?.length === 64;
      setPassword(isHashed ? '' : (user.password || ''));
    } else {
      setUsername('');
      setPassword('');
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAdmin = currentUser?.role === 'admin';
  const disableUsername = user && !isAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !user) return; // Non-admins can't add new users
    const id = user ? user.id : generateId();
    
    let finalPassword = user ? (user.password || '') : '';
    // Hash password if it's new or changed
    if (password && (!user || password !== user.password)) {
      const hashArray = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
      finalPassword = Array.from(new Uint8Array(hashArray)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    try {
      const newUserObj: AppUser = {
        id,
        username,
        password: finalPassword,
        role: user ? user.role : 'Staff',
        canSee: user ? user.canSee : true,
        canWrite: user ? user.canWrite : true,
        ...(user || {})
      };
      const currentUsers = useAppStore.getState().appUsers;
      const exists = currentUsers.some(u => u.id === id);
      const updatedUsers = exists
        ? currentUsers.map(u => u.id === id ? { ...u, ...newUserObj } : u)
        : [...currentUsers, newUserObj];
      useAppStore.getState().setAppUsers(updatedUsers);

      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', id), {
        id,
        username,
        password: finalPassword,
        role: user ? user.role : 'Staff',
        canSee: user ? user.canSee : true,
        canWrite: user ? user.canWrite : true
      }, { merge: true });
      await bumpConfigVersion("app_users");
      onClose();
    } catch (e) { console.error(e); }
  };

  return (
    <Portal>
      <div className={`fixed inset-0 bg-slate-900/60 ${getZIndexClass('MODAL_BASE')} flex items-center justify-center p-0 md:p-4`}>
        <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
          <div ref={nodeRef} className="bg-white dark:bg-[#1e1e20] md:rounded-2xl shadow-2xl w-full h-full md:h-auto max-w-sm relative flex flex-col pointer-events-auto">
            <div className="modal-handle cursor-grab active:cursor-grabbing px-4 md:px-6 py-4 border-b border-slate-100 dark:border-[#333336] flex justify-between items-center bg-slate-50/50 dark:bg-[#1e1e20]/50 shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
              <div className="flex items-center gap-2">
                <GripHorizontal className="w-4 h-4 text-slate-400" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-[#e3e3e3]">{user ? 'Edit Account' : 'Add New Account'}</h3>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#a3a3a3] p-2 -mr-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 overflow-y-auto flex-grow pb-[env(safe-area-inset-bottom)]">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#838383] uppercase mb-1">Username</label>
                <input 
                  ref={usernameRef}
                  type="text" 
                  inputMode="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  disabled={!!disableUsername}
                  className={`w-full p-3 border border-slate-200 dark:border-[#444446] rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-transparent dark:text-[#e3e3e3] ${disableUsername ? 'bg-slate-100 dark:bg-[#333336] text-slate-500 dark:text-[#838383] cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#838383] uppercase mb-1">Password</label>
                <input 
                  type="text" 
                  inputMode="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!user}
                  placeholder={user && user.password?.length === 64 ? '•••••••• (Leave blank to keep unchanged)' : ''}
                  className="w-full p-3 border border-slate-200 dark:border-[#444446] rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-transparent dark:text-[#e3e3e3]"
                />
              </div>
              <div className="pt-2">
                <button title="Save changes" type="submit" className="w-full bg-slate-900 dark:bg-blue-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </Draggable>
      </div>
    </Portal>
  );
}
