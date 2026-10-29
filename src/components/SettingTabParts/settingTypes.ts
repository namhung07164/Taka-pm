import { NotificationRule } from "../../types";

export interface SettingTabProps {
  rules: NotificationRule[];
}

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmStyle?: "danger" | "primary";
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
}
