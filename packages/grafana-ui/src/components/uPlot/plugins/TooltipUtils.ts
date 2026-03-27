import { LinkModel } from '@grafana/data';

import { AdHocFilterModel } from '../../VizTooltip/VizTooltipFooter';

import { LocalMutatableVars } from './types';

export function initMutatableVars(): LocalMutatableVars {
  const dataLinks: LinkModel[] = [];
  const adHocFilters: AdHocFilterModel[] = [];

  // for onceClick link rendering during mousemoves we use these pre-generated first links or actions
  // these will be wrong if the titles have interpolation using the hovered *value*
  // but this should be quite rare. we'll fix it if someone actually encounters this
  const persistentLinks: LinkModel[][] = [];
  const yZoomed = false;

  return {
    dataLinks,
    adHocFilters,
    persistentLinks,
    yZoomed,
  };
}

export function initConstVars(style: Partial<React.CSSProperties>) {
  return {
    defaultStyles: style,
  };
}
