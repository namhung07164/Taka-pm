export interface FirestorePerformanceDashboardProps {
  onClose?: () => void;
}

export interface CollectionStatItem {
  name: string;
  serverReads: number;
  cacheReads: number;
  activeListeners: number;
  efficiency: string;
}
