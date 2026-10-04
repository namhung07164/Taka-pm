import { NotificationRule } from "../../types";

export interface SettingTabProps {
  rules: NotificationRule[];
}

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}
