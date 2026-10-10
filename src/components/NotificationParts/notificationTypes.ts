import { ActiveNotification, NotificationPriority } from '../../types';

export interface NotificationTabProps {
  activeNotifications: ActiveNotification[];
  readNotifs: string[];
  filterId?: string | null;
  initialStatusFilter?: 'read' | 'unread' | 'all';
  onClearFilter?: () => void;
  onToggleRead: (id: string) => void;
  onMarkAllRead?: () => void;
  onNotificationClick: (notif: ActiveNotification) => void;
  onRequestPermission: () => void;
  onTogglePushEnabled: (enabled: boolean) => void;
  onActionAgree?: (notif: ActiveNotification) => void;
  onActionReject?: (notif: ActiveNotification) => void;
  onQuickCompleteTask?: (notif: ActiveNotification) => Promise<void> | void;
  onSnoozeNotif?: (notifId: string, hours: number) => void;
  onClearStaleNotifs?: () => void;
}

export type NotificationStatusFilter = 'read' | 'unread' | 'all';
export type NotificationTypeFilter = 'project' | 'task' | 'task_delegation' | 'all';
export type NotificationStoreFilter = 'all' | 'HCM' | 'HN';
export type NotificationPriorityFilter = 'all' | NotificationPriority;
export type NotificationAssigneeFilter = 'all' | 'assigned_to_me';
