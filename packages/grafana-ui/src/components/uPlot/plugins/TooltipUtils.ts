import { LinkModel } from '@grafana/data';
import { DashboardCursorSync } from '@grafana/schema';

import { AdHocFilterModel } from '../../VizTooltip/VizTooltipFooter';

import { TimeRange2 } from './TooltipPlugin2';
import { LocalMutatableVars } from './types';

export function initMutatableVars(isPinned: boolean, syncMode: DashboardCursorSync | undefined): LocalMutatableVars {
  let yDrag = false;

  let offsetX = 0;
  let offsetY = 0;

  let selectedRange: TimeRange2 | null = null;
  let seriesIdxs: Array<number | null> = [];
  let closestSeriesIdx: number | null = null;
  let viaSync = false;
  let dataLinks: LinkModel[] = [];
  let adHocFilters: AdHocFilterModel[] = [];

  // for onceClick link rendering during mousemoves we use these pre-generated first links or actions
  // these will be wrong if the titles have interpolation using the hovered *value*
  // but this should be quite rare. we'll fix it if someone actually encounters this
  let persistentLinks: LinkModel[][] = [];

  let pendingRender = false;
  let pendingPinned = false;

  let yZoomed = false;
  let _someSeriesIdx = false;
  let _isPinned = isPinned;

  let plotVisible = false;

  // Window vars
  const scrollbarWidth = 16;
  let winWid = 0;
  let winHgt = 0;

  const syncTooltip = syncMode === DashboardCursorSync.Tooltip;
  return {
    yDrag,
    offsetX,
    offsetY,
    selectedRange,
    seriesIdxs,
    closestSeriesIdx,
    viaSync,
    dataLinks,
    adHocFilters,
    persistentLinks,
    pendingRender,
    pendingPinned,
    yZoomed,
    _someSeriesIdx,
    _isPinned,
    plotVisible,
    scrollbarWidth,
    winWid,
    winHgt,
    syncTooltip,
  };
}

export function initConstVars(style: Partial<React.CSSProperties>) {
  return {
    defaultStyles: style,
  };
}
