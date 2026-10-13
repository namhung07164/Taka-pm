import React, { FC } from 'react';

export interface GanttSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const GanttSettingsModal: React.FC<GanttSettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#1E1E20] rounded-xl shadow-2xl p-6 max-w-md w-full border border-gray-200 dark:border-[#333336]">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Gantt Settings</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Gantt display preferences and configuration.</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GanttSettingsModal;
