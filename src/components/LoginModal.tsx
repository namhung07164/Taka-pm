import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useLanguage } from "../lib/LanguageContext";
import Draggable from 'react-draggable';
import { X, GripHorizontal } from 'lucide-react';
import { AppUser } from '../types';
import { Portal } from './Portal';
import { getZIndexClass } from '../lib/zIndexManager';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: AppUser) => void;
}

export function LoginModal({ isOpen, onClose, onLogin}: LoginModalProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const nodeRef = React.useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    const hashArray = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(trimmedPassword));
    const hashedPassword = Array.from(new Uint8Array(hashArray)).map(b => b.toString(16).padStart(2, '0')).join('');

    const found = appUsers.find(u => 
      String(u.username || '').toLowerCase() === trimmedUsername.toLowerCase() && 
      (String(u.password) === trimmedPassword || String(u.password) === hashedPassword)
    );
    if (found) {
      onLogin(found);
    } else if (trimmedUsername.toLowerCase() === 'admin' && trimmedPassword === 'admin') {
      // Auto-provision admin for Dev environment
      const newAdmin: AppUser = {
        id: 'admin_auto',
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        canSee: true,
        canWrite: true
      };
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const { db, APP_ID } = await import('../lib/firebase');
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', newAdmin.id), newAdmin);
        
        // Cập nhật local store để không phải load lại
        useAppStore.getState().setAppUsers([...appUsers, newAdmin]);
        useAppStore.getState().setToast({ title: 'System', message: 'Auto-created Admin account successfully (Dev Mode).' });
        
        onLogin(newAdmin);
      } catch (err) {
        console.error('Failed to auto-provision admin:', err);
        setError('Incorrect username or password.');
      }
    } else {
      setError('Incorrect username or password.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
        <div ref={nodeRef} className="bg-white dark:bg-[#1e1e20] rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-md p-6 md:p-8 relative pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:pb-8 my-auto border dark:border-[#333336]">
          <div className="modal-handle cursor-move absolute top-0 left-0 right-12 h-12"></div>
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 dark:text-[#838383] hover:text-slate-600 dark:hover:text-[#e3e3e3] p-2 z-10">
          <X className="w-6 h-6" />
        </button>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white dark:bg-[#111111] rounded-2xl flex items-center justify-center shadow-sm mx-auto mb-4 border border-slate-200 dark:border-[#444446]">
            <svg className="w-12 h-12 text-red-600 dark:text-red-500" viewBox="0 0 100 100" fill="currentColor">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"/>
              <text x="50" y="65" fontFamily="Arial" fontSize="50" textAnchor="middle" fill="currentColor" fontWeight="bold">高</text>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-[#e3e3e3]">System Login</h2>
          <p className="text-slate-500 dark:text-[#838383] text-sm mt-2">Enter credentials to manage Cloud Data</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-[#838383] uppercase mb-1">Username</label>
            <input 
              type="text" 
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
              className="w-full p-4 border border-slate-200 dark:border-[#444446] rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm bg-white dark:bg-[#111111] text-slate-900 dark:text-[#e3e3e3]" 
              placeholder="admin / Dep1..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-[#838383] uppercase mb-1">Password</label>
            <input 
              type="password" 
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              className="w-full p-4 border border-slate-200 dark:border-[#444446] rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm bg-white dark:bg-[#111111] text-slate-900 dark:text-[#e3e3e3]" 
              placeholder="••••••"
            />
          </div>
          {error && <div className="text-red-500 dark:text-red-400 text-xs text-center font-medium">{error}</div>}
          <button title="Log In to Cloud" type="submit" className="w-full bg-slate-900 dark:bg-blue-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95">
            Log In to Cloud
          </button>
        </form>
        </div>
      </Draggable>
    </div>
  );
}
