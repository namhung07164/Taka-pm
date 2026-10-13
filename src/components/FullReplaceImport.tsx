import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import Draggable from 'react-draggable';
import { Upload, X, ShieldAlert, Loader2 } from 'lucide-react';
import {  db, APP_ID , writeBatch } from "../lib/firebase";
import { collection, getDocs, doc } from 'firebase/firestore';
import { parseCSV } from '../lib/csvUtils';
import { markRestoreVersionCompleted } from '../lib/deltaSyncService';

interface FullReplaceImportProps {
  collectionName: string;
  onImportSuccess: (count: number) => void;
  title?: string;
  onParseRow: (row: string[], headers: string[], rowIndex: number) => any;
  headersOrder?: string[];
  id?: string; hiddenBtn?: boolean;
  onRecordSave?: (record: any, batch: import('firebase/firestore').WriteBatch) => void;
}

export function FullReplaceImport({ 
  collectionName, onImportSuccess, title, onParseRow, id, hiddenBtn = false, onRecordSave}: FullReplaceImportProps) {
  const { t } = useLanguage();
  const nodeRef = React.useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ADMIN_PWD = '1641985';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleImport = async () => {
    if (password !== ADMIN_PWD) {
      setError('Incorrect password');
      return;
    }
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        throw new Error('CSV file is empty or has no data');
      }

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      // Pre-validation to ensure required fields
      const parsedDataList: any[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (row.every(cell => !String(cell).trim())) continue; // Skip completely empty rows
        
        const data = onParseRow(row, headers, i);
        if (!data) continue;

        const codeVal = data.code || data.projectCode;
        const yearVal = data.year || data.projectYear;
        const storeVal = data.store || data.projectStore;

        if (!String(codeVal || '').trim() || !String(yearVal || '').trim() || !String(storeVal || '').trim()) {
           throw new Error(`Row ${i + 2} is missing required data. All imported records must have Year, Store, and Project Code.`);
        }
        
        parsedDataList.push(data);
      }

      if (parsedDataList.length === 0) {
        throw new Error('No valid data found to import.');
      }

      // 1. Clear existing collection
      const collRef = collection(db, 'artifacts', APP_ID, 'public', 'data', collectionName);
      const snapshot = await getDocs(collRef);
      
      const deleteBatches = [];
      let currentDeleteBatch = writeBatch(db);
      let deleteCount = 0;

      for (const d of snapshot.docs) {
        currentDeleteBatch.delete(d.ref);
        deleteCount++;
        if (deleteCount === 500) {
          deleteBatches.push(currentDeleteBatch.commit());
          currentDeleteBatch = writeBatch(db);
          deleteCount = 0;
        }
      }
      if (deleteCount > 0) {
        deleteBatches.push(currentDeleteBatch.commit());
      }
      await Promise.all(deleteBatches);

      // 2. Import new data
      const writeBatches = [];
      let currentWriteBatch = writeBatch(db);
      let writeCount = 0;
      let totalImported = 0;

      for (const data of parsedDataList) {
        // Ensure ID
        let finalId = data.id;
        if (!finalId && data.no && !isNaN(Number(data.no))) {
          finalId = String(data.no);
        }
        if (!finalId) {
          finalId = `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', collectionName, finalId);
        
        const recordToSave = { ...data, id: finalId, updatedAt: new Date().toISOString() };
        if (recordToSave.year !== undefined && recordToSave.year !== null && recordToSave.year !== '' && !isNaN(Number(recordToSave.year))) {
          recordToSave.year = Number(recordToSave.year);
        }
        if (recordToSave.projectYear !== undefined && recordToSave.projectYear !== null && recordToSave.projectYear !== '' && !isNaN(Number(recordToSave.projectYear))) {
          recordToSave.projectYear = Number(recordToSave.projectYear);
        }

        currentWriteBatch.set(docRef, recordToSave);
        if (onRecordSave) {
          onRecordSave(recordToSave, currentWriteBatch);
        }
        writeCount++;
        totalImported++;

        if (writeCount === 500) {
          writeBatches.push(currentWriteBatch.commit());
          currentWriteBatch = writeBatch(db);
          writeCount = 0;
        }
      }
      if (writeCount > 0) {
        writeBatches.push(currentWriteBatch.commit());
      }
      await Promise.all(writeBatches);

      // Lock out pre-restore historical deltas so future updates won't re-read or re-apply faulty changes
      markRestoreVersionCompleted(Date.now());

      onImportSuccess(totalImported);
      setIsOpen(false);
      setPassword('');
      setFile(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unknown error during import');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button id={id}
        onClick={() => setIsOpen(true)}
        className={hiddenBtn ? "hidden" : "p-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors shadow-sm flex items-center gap-2 text-xs font-bold"}
        title={`Full Replace ${title}`}
      >
        <ShieldAlert className="w-4 h-4" />
        Full Import
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
        <div ref={nodeRef} className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-[#333336] animate-in fade-in zoom-in duration-200">
          <div className="modal-handle cursor-move bg-red-600 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6" />
            <h2 className="text-xl font-black uppercase tracking-tight">Full Replace: {title}</h2>
          </div>
          <button onClick={() => setIsOpen(false)} className="hover:bg-red-700 p-1 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-red-800 text-sm leading-relaxed font-medium">
            <p><strong>Warning:</strong> This action will <span className="font-bold underline">DELETE ALL</span> existing records in the <span className="font-bold">"{collectionName}"</span> collection and replace them with data from your CSV file. This cannot be undone by normal means.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">CSV File</label>
              <div className="relative group">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all ${file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 group-hover:border-blue-400 group-hover:bg-blue-50'}`}>
                  <Upload className={`w-8 h-8 mb-2 ${file ? 'text-emerald-500' : 'text-slate-400 group-hover:text-blue-500'}`} />
                  <p className="text-sm font-bold text-slate-600 truncate max-w-full px-4">
                    {file ? file.name : "Choose CSV File"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">Only .csv files allowed</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Admin Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to authorize cleanup"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-red-500 text-slate-900 shadow-inner"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-lg animate-pulse">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setIsOpen(false)}
              className="flex-1 py-3 px-4 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-[#a3a3a3] rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-[#28282a] transition-all active:scale-95"
              disabled={loading}
            >{t("Cancel")}</button>
            <button onClick={handleImport}
              disabled={loading || !file || !password}
              className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-5 h-5 group-hover:animate-bounce" />
                  Execute Replace
                </>
              )}
            </button>
          </div>
        </div>
      </div></Draggable>
    </div>
  );
}
