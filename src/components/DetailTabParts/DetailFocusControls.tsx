import React, { memo } from 'react';
import { ArrowLeft, EyeOff } from 'lucide-react';
import { Task, Project } from '../../types';

interface DetailFocusControlsProps {
  initialFocusTaskId?: string;
  initialFilterCode?: string;
  tasks?: Task[];
  projects?: Project[];
  onBackToGantt: () => void;
  onClearFocus?: () => void;
}

export const DetailFocusControls = memo(function DetailFocusControls() {
  return null;
});
