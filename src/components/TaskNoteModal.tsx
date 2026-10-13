import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import Draggable from 'react-draggable';
import { X, Plus, Trash2 } from 'lucide-react';
import { Task, TaskNote } from '../types';
import { formatDisplayDateTime } from '../lib/utils';

interface TaskNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSave: (taskId: string, notes: TaskNote[]) => void;
  canWrite: boolean;
}

export function TaskNoteModal({ isOpen, onClose, task, onSave, canWrite}: TaskNoteModalProps) {
  const { t } = useLanguage();
  const nodeRef = React.useRef(null);
  const [notes, setNotes] = useState<TaskNote[]>([]);

  React.useEffect(() => {
    if (task && isOpen) {
      setNotes(task.notes || []);
    }
  }, [task, isOpen]);

  React.useEffect(() => {
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

  if (!isOpen || !task) return null;

  const handleAddNote = () => {
    const newNote: TaskNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: '',
      updatedAt: new Date().toISOString()
    };
    setNotes([...notes, newNote]);
  };

  const handleUpdateNote = (id: string, content: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, content, updatedAt: new Date().toISOString() } : n));
  };

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const handleSave = () => {
    onSave(task.id, notes);
    onClose();
  };

  const sortedNotes = [...notes].sort((a, b) => {
    const dateA = new Date(a.updatedAt || 0).getTime();
    const dateB = new Date(b.updatedAt || 0).getTime();
    return dateB - dateA;
  });

  return (
<Portal>
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-4 ">
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
        <div ref={nodeRef} className="bg-white dark:bg-[#1e1e20] md:rounded-xl shadow-xl w-full h-full md:h-auto max-w-3xl flex flex-col max-h-screen md:max-h-[90vh] relative">
          <div className="modal-handle cursor-move flex items-center justify-between p-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 md:rounded-t-xl shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3] truncate pr-4">Note-detail(update) - {task.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-[#333336] rounded-full transition-colors text-slate-500 dark:text-[#a3a3a3] shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-grow overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {canWrite && (
            <div className="mb-4 flex justify-end">
              <button title="Add Note" 
                onClick={handleAddNote}
                className="px-3 py-1.5 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Note
              </button>
            </div>
          )}
          
          <table className="w-full text-sm text-left text-slate-600 dark:text-[#a3a3a3] border-collapse">
            <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20]/50 border-b border-slate-200 dark:border-[#444446]">
              <tr>
                <th className="px-4 py-3 font-bold w-2/3">Content</th>
                <th className="px-4 py-3 font-bold w-1/3">Update-date</th>
                {canWrite && <th className="px-4 py-3 font-bold w-12 text-center">{t("Action")}</th>}
              </tr>
            </thead>
            <tbody>
              {sortedNotes.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 3 : 2} className="px-4 py-8 text-center text-slate-400 dark:text-[#838383] italic">
                    No notes available.
                  </td>
                </tr>
              ) : (
                sortedNotes.map(note => (
                  <tr key={note.id} className="border-b border-slate-100 dark:border-[#333336] hover:bg-slate-50 dark:hover:bg-[#28282a]/50">
                    <td className="px-4 py-2">
                      {canWrite ? (
                        <textarea
                          value={note.content}
                          onChange={(e) => handleUpdateNote(note.id, e.target.value)}
                          className="w-full min-h-[60px] p-2 border border-slate-200 dark:border-[#444446] rounded focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                          placeholder="Enter note content..."
                        />
                      ) : (
                        <div className="whitespace-pre-wrap">{note.content}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500 dark:text-[#a3a3a3]">
                      {formatDisplayDateTime(note.updatedAt)}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 dark:text-red-400 hover:bg-red-50 rounded transition-colors"
                          title="Delete note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 md:rounded-b-xl flex justify-end gap-3 shrink-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-4">
          <button onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-200 dark:hover:bg-[#333336] rounded-lg font-medium transition-colors"
          >
            {canWrite ? 'Cancel' : 'Close'}
          </button>
          {canWrite && (
            <button title="Save Changes" 
              onClick={handleSave}
              className="px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              Save Changes
            </button>
          )}
        </div>
      </div></Draggable>
        </div>
</Portal>
  );
}
