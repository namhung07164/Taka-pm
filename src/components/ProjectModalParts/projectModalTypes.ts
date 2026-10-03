import { Project } from '../../types';

export interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  isReadOnly?: boolean;
  initialTab?: 'details' | 'chat' | 'delegation';
  onOpenTask?: (taskId: string) => void;
}

export interface LinkCodesValidationError {
  invalidCode: string;
  duplicateProjectCode: string;
  duplicateProjectName: string;
  duplicateProjectYear: string | number;
}

export function getLinkCodesValidationError(
  inputLinkCodes: string,
  currentCode: string,
  currentProjectId: string | undefined,
  allProjects: Project[],
  currentYear?: string | number | null,
  currentStore?: string | null
): LinkCodesValidationError | null {
  if (!inputLinkCodes || !inputLinkCodes.trim()) return null;

  const enteredCodes = inputLinkCodes
    .split(/[,;/]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const selfCodeLower = (currentCode || '').trim().toLowerCase();
  const currentYearStr = currentYear !== undefined && currentYear !== null ? String(currentYear).trim() : '';
  const currentStoreStr = currentStore ? String(currentStore).trim().toLowerCase() : '';

  for (const code of enteredCodes) {
    const codeLower = code.toLowerCase();
    if (codeLower === selfCodeLower) continue;

    const duplicate = allProjects.find((p) => {
      if (currentProjectId && p.id === currentProjectId) return false;
      const otherCodeLower = String(p.code || '').trim().toLowerCase();
      if (otherCodeLower !== codeLower || otherCodeLower === '') return false;

      // Condition: Compare Year / Project Year
      const pAny = p as any;
      const otherYearStr = p.year !== undefined && p.year !== null 
        ? String(p.year).trim() 
        : (pAny.projectYear !== undefined && pAny.projectYear !== null ? String(pAny.projectYear).trim() : '');

      if (currentYearStr && otherYearStr && currentYearStr !== otherYearStr) {
        return false; // Different year - no collision
      }

      // Condition: Compare Store if both present
      const otherStoreStr = p.store ? String(p.store).trim().toLowerCase() : (pAny.projectStore ? String(pAny.projectStore).trim().toLowerCase() : '');
      if (currentStoreStr && otherStoreStr && currentStoreStr !== otherStoreStr) {
        return false; // Different store - no collision
      }

      return true;
    });

    if (duplicate) {
      const dupYear = duplicate.year || (duplicate as any).projectYear || '';
      return {
        invalidCode: code,
        duplicateProjectCode: duplicate.code,
        duplicateProjectName: duplicate.name,
        duplicateProjectYear: dupYear,
      };
    }
  }

  return null;
}
