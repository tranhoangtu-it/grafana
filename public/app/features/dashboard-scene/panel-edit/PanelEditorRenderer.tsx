import { css, cx } from '@emotion/css';
import { useEffect, useMemo } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
<<<<<<< Updated upstream
import { SceneComponentProps, VizPanel } from '@grafana/scenes';
import { Button, Spinner, ToolbarButton, useStyles2, useTheme2 } from '@grafana/ui';
||||||| Stash base
import { SceneComponentProps, useSceneObjectState, VizPanel } from '@grafana/scenes';
import { Button, Spinner, ToolbarButton, useStyles2, useTheme2 } from '@grafana/ui';
=======
import { SceneComponentProps, useSceneObjectState, VizPanel } from '@grafana/scenes';
import { Button, Sidebar, Spinner, ToolbarButton, useSidebar, useStyles2, useTheme2 } from '@grafana/ui';
>>>>>>> Stashed changes
import { MIN_SUGGESTIONS_PANE_WIDTH } from 'app/features/panel/suggestions/constants';

import { useEditPaneCollapsed } from '../edit-pane/shared';
import { NavToolbarActions } from '../scene/NavToolbarActions';
import { UnlinkModal } from '../scene/UnlinkModal';
import { getDashboardSceneFor, getLibraryPanelBehavior } from '../utils/utils';

import { PanelEditor } from './PanelEditor';
import { SaveLibraryVizPanelModal } from './SaveLibraryVizPanelModal';
import { useSnappingSplitter } from './splitter/useSnappingSplitter';
import { scrollReflowMediaCondition, useScrollReflowLimit } from './useScrollReflowLimit';

export function PanelEditorRenderer({ model }: SceneComponentProps<PanelEditor>) {
  const dashboard = getDashboardSceneFor(model);
  const { optionsPane } = model.useState();
  const styles = useStyles2(getStyles);
  const [isInitiallyCollapsed, setIsCollapsed] = useEditPaneCollapsed();

  const isScrollingLayout = useScrollReflowLimit();

  const theme = useTheme2();
  const panePadding = useMemo(() => +theme.spacing(2).replace(/px$/, ''), [theme]);

  const sidebarContext = useSidebar({
    hasOpenPane: true,
    contentMargin: 1,
    position: 'right',
    persistanceKey: 'panel-edit',
    defaultToDocked: true,
    onClosePane: () => {},
    bottomMargin: 0,
    edgeMargin: 0,
  });

  return (
    <>
      <NavToolbarActions dashboard={dashboard} />
      <div
        className={cx(styles.outerWrapper)}
        data-testid={selectors.components.PanelEditor.General.content}
        {...sidebarContext.outerWrapperProps}
      >
        <div className={styles.body}>
          <VizAndDataPane model={model} />
        </div>
        <Sidebar contextValue={sidebarContext}>
          {optionsPane && <optionsPane.Component model={optionsPane} />}
          {!optionsPane && <Spinner />}
        </Sidebar>
      </div>
    </>
  );
}

function VizAndDataPane({ model }: SceneComponentProps<PanelEditor>) {
  const dashboard = getDashboardSceneFor(model);
  const { dataPane, showLibraryPanelSaveModal, showLibraryPanelUnlinkModal, tableView } = model.useState();
  const panel = model.getPanel();
  const libraryPanel = getLibraryPanelBehavior(panel);
  const { controls } = dashboard.useState();
  const styles = useStyles2(getStyles);

  const isScrollingLayout = useScrollReflowLimit();

  const { containerProps, primaryProps, secondaryProps, splitterProps, splitterState, onToggleCollapse } =
    useSnappingSplitter({
      direction: 'column',
      dragPosition: 'start',
      initialSize: 0.5,
      collapseBelowPixels: 150,
      disabled: isScrollingLayout,
    });

  containerProps.className = cx(containerProps.className, styles.container);

  if (!dataPane && !isScrollingLayout) {
    primaryProps.style.flexGrow = 1;
  }

  return (
    <div className={cx(styles.pageContainer, controls && styles.pageContainerWithControls)}>
      {controls && (
        <div className={styles.controlsWrapper}>
          <controls.Component model={controls} />
        </div>
      )}
      <div {...containerProps}>
        <div {...primaryProps} className={cx(primaryProps.className, isScrollingLayout && styles.fixedSizeViz)}>
          <VizWrapper panel={panel} tableView={tableView} />
        </div>
        {showLibraryPanelSaveModal && libraryPanel && (
          <SaveLibraryVizPanelModal
            libraryPanel={libraryPanel}
            onDismiss={model.onDismissLibraryPanelSaveModal}
            onConfirm={model.onConfirmSaveLibraryPanel}
            onDiscard={model.onDiscard}
          ></SaveLibraryVizPanelModal>
        )}
        {showLibraryPanelUnlinkModal && libraryPanel && (
          <UnlinkModal
            onDismiss={model.onDismissUnlinkLibraryPanelModal}
            onConfirm={model.onConfirmUnlinkLibraryPanel}
            isOpen
          />
        )}
        {dataPane && (
          <>
            <div {...splitterProps} />
            <div
              {...secondaryProps}
              className={cx(secondaryProps.className, isScrollingLayout && styles.fullSizeEditor)}
            >
              {splitterState.collapsed && (
                <div className={styles.expandDataPane}>
                  <Button
                    tooltip={t('dashboard-scene.viz-and-data-pane.tooltip-open-query-pane', 'Open query pane')}
                    icon={'arrow-to-right'}
                    onClick={onToggleCollapse}
                    variant="secondary"
                    size="sm"
                    className={styles.openDataPaneButton}
                    aria-label={t('dashboard-scene.viz-and-data-pane.aria-label-open-query-pane', 'Open query pane')}
                  />
                </div>
              )}
              {/* @ts-expect-error - dataPane is a union type of PanelDataPane and PanelDataPaneNext */}
              {!splitterState.collapsed && <dataPane.Component model={dataPane} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface VizWrapperProps {
  panel: VizPanel;
  tableView?: VizPanel;
}

function VizWrapper({ panel, tableView }: VizWrapperProps) {
  const styles = useStyles2(getStyles);
  const panelToShow = tableView ?? panel;

  return (
    <div className={styles.vizWrapper}>
      <panelToShow.Component model={panelToShow} />
    </div>
  );
}

function getStyles(theme: GrafanaTheme2) {
  const scrollReflowMediaQuery = '@media ' + scrollReflowMediaCondition;
  return {
    outerWrapper: css({
      label: 'outer-wrapper',
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      flex: '1 1 0',
      position: 'absolute',
      width: '100%',
      height: '100%',
      overflow: 'unset',
      marginTop: theme.spacing(2),

      [scrollReflowMediaQuery]: {
        height: 'auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(470px, 1fr) 330px',
        gridTemplateRows: '1fr',
        gap: theme.spacing(1),
        position: 'static',
        width: '100%',
      },
    }),
    pageContainer: css({
      display: 'grid',
      gridTemplateAreas: `
        "panels"`,
      gridTemplateColumns: `1fr`,
      gridTemplateRows: '1fr',
      height: '100%',
      [scrollReflowMediaQuery]: {
        gridTemplateColumns: `100%`,
      },
    }),
    pageContainerWithControls: css({
      gridTemplateAreas: `
        "controls"
        "panels"`,
      gridTemplateRows: 'auto 1fr',
    }),
    container: css({
      gridArea: 'panels',
      height: '100%',
    }),
    canvasContent: css({
      label: 'canvas-content',
      display: 'flex',
      flexDirection: 'column',
      flexBasis: '100%',
      flexGrow: 1,
      minHeight: 0,
      width: '100%',
    }),
    body: css({
      label: 'body',
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      paddingRight: theme.spacing(1),
    }),
    optionsPane: css({
      flexDirection: 'column',
      borderLeft: `1px solid ${theme.colors.border.weak}`,
      background: theme.colors.background.primary,
      marginTop: theme.spacing(2),
      borderTop: `1px solid ${theme.colors.border.weak}`,
      borderTopLeftRadius: theme.shape.radius.default,
    }),
    expandOptionsWrapper: css({
      display: 'flex',
      flexDirection: 'column',
      padding: theme.spacing(2, 1),
    }),
    expandDataPane: css({
      display: 'flex',
      flexDirection: 'row',
      padding: theme.spacing(1),
      borderTop: `1px solid ${theme.colors.border.weak}`,
      borderRight: `1px solid ${theme.colors.border.weak}`,
      background: theme.colors.background.primary,
      flexGrow: 1,
      justifyContent: 'space-around',
    }),
    rotate180: css({
      rotate: '180deg',
    }),
    controlsWrapper: css({
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 0,
      gridArea: 'controls',
    }),
    openDataPaneButton: css({
      width: theme.spacing(8),
      justifyContent: 'center',
      svg: {
        rotate: '-90deg',
      },
    }),
    vizWrapper: css({
      height: '100%',
      width: '100%',
      paddingLeft: theme.spacing(2),
    }),
    fixedSizeViz: css({
      height: '100vh',
    }),
    fullSizeEditor: css({
      height: 'max-content',
    }),
  };
}
