import { LinkModel } from '@grafana/data';

import { AdHocFilterModel } from '../../VizTooltip/VizTooltipFooter';

export interface LocalMutatableVars {
  dataLinks: LinkModel[];
  adHocFilters: AdHocFilterModel[];
  persistentLinks: LinkModel[][];
  yZoomed: boolean;
}
