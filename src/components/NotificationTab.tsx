import React from 'react';
import { Bell } from 'lucide-react';
import { NotificationTabProps } from './NotificationParts/notificationTypes';
import { useNotificationData } from './NotificationParts/useNotificationData';
import { NotificationFilterToolbar } from './NotificationParts/NotificationFilterToolbar';
import { NotificationItemCard } from './NotificationParts/NotificationItemCard';

export function NotificationTab({
  activeNotifications,
  readNotifs,
  filterId,
  initialStatusFilter = 'unread',
  onClearFilter,
  onToggleRead,
  onMarkAllRead,
  onNotificationClick,
  onActionAgree,
  onActionReject,
  onQuickCompleteTask,
  onSnoozeNotif,
  onClearStaleNotifs,
}: NotificationTabProps) {
  const {
    allowedStores,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    priorityFilter,
    setPriorityFilter,
    assigneeFilter,
    setAssigneeFilter,
    storeFilter,
    setStoreFilter,
    unreadProjectCount,
    unreadTaskCount,
    unreadDelegationCount,
    unreadHcmCount,
    unreadHnCount,
    unreadCriticalCount,
    unreadUrgentCount,
    unreadActionCount,
    unreadAssignedToMeCount,
    snoozedCount,
    filteredNotifications,
    tasks,
    projects,
    delegationGroups,
  } = useNotificationData({
    activeNotifications,
    readNotifs,
    filterId,
    initialStatusFilter,
  });

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm overflow-hidden">
      <NotificationFilterToolbar
        filterId={filterId}
        onClearFilter={onClearFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        storeFilter={storeFilter}
        setStoreFilter={setStoreFilter}
        allowedStores={allowedStores}
        unreadProjectCount={unreadProjectCount}
        unreadTaskCount={unreadTaskCount}
        unreadDelegationCount={unreadDelegationCount}
        unreadHcmCount={unreadHcmCount}
        unreadHnCount={unreadHnCount}
        unreadCriticalCount={unreadCriticalCount}
        unreadUrgentCount={unreadUrgentCount}
        unreadActionCount={unreadActionCount}
        unreadAssignedToMeCount={unreadAssignedToMeCount}
        snoozedCount={snoozedCount}
        onMarkAllRead={onMarkAllRead}
        onClearStaleNotifs={onClearStaleNotifs}
      />

      <div className="overflow-y-auto flex-grow p-4 bg-slate-50/50">
        <div className="space-y-3 max-w-3xl mx-auto">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 dark:text-[#838383] font-medium">No active notifications</p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <NotificationItemCard
                key={notif.id}
                notif={notif}
                isRead={readNotifs.includes(notif.id)}
                tasks={tasks}
                projects={projects}
                delegationGroups={delegationGroups}
                onNotificationClick={onNotificationClick}
                onToggleRead={onToggleRead}
                onActionAgree={onActionAgree}
                onActionReject={onActionReject}
                onQuickCompleteTask={onQuickCompleteTask}
                onSnoozeNotif={onSnoozeNotif}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationTab;
