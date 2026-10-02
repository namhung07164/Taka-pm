export interface LiveLayoutViewerProps {
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
}

export interface LiveLayoutMainViewProps extends LiveLayoutViewerProps {
  config: any;
  onRefreshConfig?: () => void;
}
