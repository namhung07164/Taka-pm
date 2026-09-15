const fs = require('fs');

const modal = fs.readFileSync('src/components/TaskModal.tsx', 'utf8');

const startGrid = modal.indexOf('<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">');
const endGrid = modal.indexOf('</form>');

let basicInfoJsx = modal.substring(startGrid, endGrid);

// Generate TaskBasicInfo.tsx
const basicInfoContent = `import React from 'react';
import { TaskModalLogicType } from '../../hooks/useTaskModalLogic';
import { MultiSelect } from '../MultiSelect';
import { PredecessorMultiInput } from '../PredecessorMultiInput';
import { FastInput } from '../FastInput';
import { Target, ExternalLink } from 'lucide-react';
import { ensureUrlProtocol } from '../../lib/utils';
import { getTaskStatus } from '../../lib/utils';

export function TaskBasicInfo({ logic, task, onNavigateToDelegation }: { logic: TaskModalLogicType, task: any, onNavigateToDelegation: any }) {
  const {
    projects, tasks, delegationGroups, canWrite, t,
    formData, setFormData, dateErrors,
    handlePredecessorChange, handleApplyPredecessorDates, handleDateChange, handleDurationChange, toggleDurationManual,
    resolvedPredecessors, parties, appUsers, subAppUsers, nameRef
  } = logic;

  return (
    <>
      ${basicInfoJsx}
    </>
  );
}
`;
fs.writeFileSync('src/components/TaskModalParts/TaskBasicInfo.tsx', basicInfoContent);

// Update TaskModal.tsx
let newModal = modal.replace(basicInfoJsx, '<TaskBasicInfo logic={logic} task={task} onNavigateToDelegation={onNavigateToDelegation} />\n');
newModal = newModal.replace("import { TaskChat } from './TaskModalParts/TaskChat';", "import { TaskChat } from './TaskModalParts/TaskChat';\nimport { TaskBasicInfo } from './TaskModalParts/TaskBasicInfo';");

// We also need to change how `logic` is accessed in TaskModal.tsx since we destructured it previously.
const logicReplace = `
  const logic = useTaskModalLogic(props);
  const {
    activeTab, setActiveTab, confirmModal, setConfirmModal, isSubmitting,
    handleOpenProjectComments, handleSubmit, t, nodeRef, canWrite, formData
  } = logic;
  const { task, onNavigateToDelegation, onClose } = props;
`;

// Oh wait, in TaskModal.tsx we had:
//  const {
//    projects, tasks, delegationGroups, currentUser, appUsers, subAppUsers, parties, canWrite, t, nodeRef,
//    formData, setFormData, dateErrors, isSubmitting, activeTab, setActiveTab, confirmModal, setConfirmModal, resolvedPredecessors, nameRef,
//    handleOpenProjectComments, handlePredecessorChange, handleApplyPredecessorDates, handleSubmit, handleDateChange, handleDurationChange, toggleDurationManual
//  } = useTaskModalLogic(props);

// Let's replace the whole destructuring block.
