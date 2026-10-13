import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import { X, ChevronRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface AppTourProps {
  onClose: () => void;
}

const steps = [
  {
    title: "Welcome to the App!",
    content: "Since this is your first time here as a guest, let's take a quick tour to help you get started.",
  },
  {
    title: "Navigation",
    content: "Use the tabs at the top to switch between Dashboard, Gantt chart, Tasks, and more. This is how you access all the main features.",
  },
  {
    title: "Notifications",
    content: "The bell icon in the top right shows your notifications. You'll see alerts here when someone mentions you or assigns a task.",
  },
  {
    title: "Settings & Options",
    content: "Click the icons on the top right to customize your experience, switch to Dark Mode, change the language, or manage your keyboard shortcuts.",
  },
];

export function AppTour({ onClose}: AppTourProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
        <div 
          className="bg-white dark:bg-[#1e1e20] w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
          
          <div className="p-6">
            <h3 className="font-bold text-xl text-slate-800 dark:text-[#e3e3e3] mb-2">{steps[currentStep].title}</h3>
            <p className="text-sm text-slate-600 dark:text-[#a3a3a3] mb-8 min-h-[60px]">
              {steps[currentStep].content}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {steps.map((_, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      idx === currentStep ? "bg-blue-600" : "bg-slate-200 dark:bg-[#333336]"
                    )}
                  />
                ))}
              </div>
              
              <button
                onClick={nextStep}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                {currentStep === steps.length - 1 ? (
                  <>Get Started <Check className="w-4 h-4" /></>
                ) : (
                  <>Next <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </Portal>
  );
}
