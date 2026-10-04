import { AppUser } from "../../types";

export interface AccControlTabProps {
  users: AppUser[];
  locationVisibility?: Record<string, boolean>;
  onEditUser: (u: AppUser) => void;
  onAddUser: () => void;
}

export interface AccConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}
