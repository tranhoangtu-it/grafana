import { css, cx } from '@emotion/css';
import { DOMAttributes } from '@react-types/shared';
import { memo, forwardRef, useCallback, useMemo, useState } from 'react';
import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';

import { usePatchUserPreferencesMutation } from '@grafana/api-clients/internal/rtkq/legacy/preferences';
import { GrafanaTheme2, NavModelItem, toIconName } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { reportInteraction } from '@grafana/runtime';
import { Icon, IconButton, Link, ScrollContainer, Text, Tooltip, useStyles2 } from '@grafana/ui';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { setBookmark } from 'app/core/reducers/navBarTree';
import { contextSrv } from 'app/core/services/context_srv';
import { useDispatch, useSelector } from 'app/types/store';

import { MegaMenuExtensionPoint } from './MegaMenuExtensionPoint';
import { MegaMenuHeader } from './MegaMenuHeader';
import { usePinnedItems } from './hooks';
import { enrichWithInteractionTracking, getActiveItem, hasChildMatch } from './utils';

export const MENU_WIDTH = '300px';
const RAIL_WIDTH = 64;

export interface Props extends DOMAttributes {
  onClose: () => void;
}

export const MegaMenu = memo(
  forwardRef<HTMLDivElement, Props>(({ onClose, ...restProps }, ref) => {
    const navTree = useSelector((state) => state.navBarTree);
    const styles = useStyles2(getStyles);
    const location = useLocation();
    const { chrome } = useGrafana();
    const dispatch = useDispatch();
    const state = chrome.useState();
    const [patchPreferences] = usePatchUserPreferencesMutation();
    const pinnedItems = usePinnedItems();
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
    const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set());

    const hiddenIds = new Set(['profile', 'help', 'starred', 'bookmarks', 'home']);
    const navItems = navTree
      .filter((item) => !hiddenIds.has(item.id ?? ''))
      .map((item) => enrichWithInteractionTracking(item, state.megaMenuDocked));

    const activeItem = getActiveItem(navItems, state.sectionNav.node, location.pathname);

    const autoActiveParentId = useMemo(() => {
      if (!activeItem) {
        return null;
      }
      for (const item of navItems) {
        if (item === activeItem && item.children?.length) {
          return item.id ?? null;
        }
        if (hasChildMatch(item, activeItem)) {
          return item.id ?? null;
        }
      }
      return null;
    }, [activeItem, navItems]);

    const displayParentId = selectedParentId ?? autoActiveParentId;
    const displayParent = navItems.find((item) => item.id === displayParentId);
    const childItems = displayParent?.children?.filter((child) => !child.isCreateAction);

    const handleDockedMenu = () => {
      chrome.setMegaMenuDocked(!state.megaMenuDocked);
      if (state.megaMenuDocked) {
        chrome.setMegaMenuOpen(false);
      }
    };

    const isPinned = useCallback(
      (url?: string) => {
        if (!url || !pinnedItems?.length) {
          return false;
        }
        return pinnedItems.includes(url);
      },
      [pinnedItems]
    );

    const onPinItem = (item: NavModelItem) => {
      const { url } = item;
      if (url) {
        const isSaved = isPinned(url);
        const newItems = isSaved ? pinnedItems.filter((i) => url !== i) : [...pinnedItems, url];
        const interactionName = isSaved ? 'grafana_nav_item_unpinned' : 'grafana_nav_item_pinned';
        reportInteraction(interactionName, { path: url });
        patchPreferences({
          patchPrefsCmd: { navbar: { bookmarkUrls: newItems } },
        }).then((data) => {
          if (!data.error) {
            dispatch(setBookmark({ item, isSaved: !isSaved }));
          }
        });
      }
    };

    const handleRailClick = (item: NavModelItem) => {
      if (item.children?.length) {
        setSelectedParentId(selectedParentId === item.id ? null : (item.id ?? null));
        setExpandedChildren(new Set());
      } else if (item.url) {
        item.onClick?.();
        if (!state.megaMenuDocked) {
          onClose();
        }
      }
    };

    const toggleChildExpand = (childId: string) => {
      setExpandedChildren((prev) => {
        const next = new Set(prev);
        if (next.has(childId)) {
          next.delete(childId);
        } else {
          next.add(childId);
        }
        return next;
      });
    };

    return (
      <div data-testid={selectors.components.NavMenu.Menu} ref={ref} {...restProps}>
        <MegaMenuHeader handleDockedMenu={handleDockedMenu} onClose={onClose} />
        <div className={styles.body}>
          <nav className={styles.rail} aria-label={t('navigation.megamenu.list-label', 'Navigation')}>
            <ScrollContainer height="100%" overflowX="hidden" showScrollIndicators>
              <ul className={styles.railList}>
                {navItems.map((link) => {
                  const isSelected = displayParentId === link.id;
                  const isLeafActive = link === activeItem && !link.children?.length;
                  const hasActive = autoActiveParentId === link.id;

                  return (
                    <li key={link.text}>
                      <RailIcon
                        link={link}
                        isSelected={isSelected}
                        isHighlighted={!isSelected && hasActive}
                        isLeafActive={isLeafActive}
                        onClick={() => handleRailClick(link)}
                        onNavigate={() => {
                          link.onClick?.();
                          if (!state.megaMenuDocked) {
                            onClose();
                          }
                        }}
                        styles={styles}
                      />
                    </li>
                  );
                })}
              </ul>
            </ScrollContainer>
          </nav>

          <div className={cx(styles.childPanel, { [styles.childPanelVisible]: Boolean(childItems?.length) })}>
            {childItems && childItems.length > 0 && displayParent && (
              <>
                <div className={styles.childPanelHeader}>
                  {displayParent.url ? (
                    <Link
                      href={displayParent.url}
                      className={styles.childPanelHeaderLink}
                      onClick={() => {
                        displayParent.onClick?.();
                        if (!state.megaMenuDocked) {
                          onClose();
                        }
                      }}
                    >
                      <Text variant="bodySmall" weight="medium">
                        {displayParent.text}
                      </Text>
                    </Link>
                  ) : (
                    <Text variant="bodySmall" weight="medium" color="secondary">
                      {displayParent.text}
                    </Text>
                  )}
                </div>
                <ScrollContainer height="100%" overflowX="hidden" showScrollIndicators>
                  <ul className={styles.childList}>
                    {childItems.map((child) => {
                      const isChildActive = child === activeItem;
                      const grandchildren = child.children?.filter((gc) => !gc.isCreateAction);
                      const hasGrandchildren = Boolean(grandchildren?.length);
                      const isExpanded = expandedChildren.has(child.id ?? child.text);

                      return (
                        <li key={child.text}>
                          <ChildNavLink
                            item={child}
                            isActive={isChildActive}
                            isPinned={isPinned(child.url)}
                            onPin={() => onPinItem(child)}
                            onClick={() => {
                              child.onClick?.();
                              if (!state.megaMenuDocked) {
                                onClose();
                              }
                            }}
                            styles={styles}
                            expandable={hasGrandchildren}
                            expanded={isExpanded}
                            onToggleExpand={() => toggleChildExpand(child.id ?? child.text)}
                          />
                          {hasGrandchildren && isExpanded && (
                            <ul className={styles.grandchildList}>
                              {grandchildren!.map((gc) => (
                                <li key={gc.text}>
                                  <ChildNavLink
                                    item={gc}
                                    isActive={gc === activeItem}
                                    isPinned={isPinned(gc.url)}
                                    onPin={() => onPinItem(gc)}
                                    onClick={() => {
                                      gc.onClick?.();
                                      if (!state.megaMenuDocked) {
                                        onClose();
                                      }
                                    }}
                                    styles={styles}
                                    indented
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <MegaMenuExtensionPoint />
                </ScrollContainer>
              </>
            )}
          </div>
        </div>
      </div>
    );
  })
);

MegaMenu.displayName = 'MegaMenu';

interface RailIconProps {
  link: NavModelItem;
  isSelected: boolean;
  isHighlighted: boolean;
  isLeafActive: boolean;
  onClick: () => void;
  onNavigate: () => void;
  styles: ReturnType<typeof getStyles>;
}

function RailIcon({ link, isSelected, isHighlighted, isLeafActive, onClick, onNavigate, styles }: RailIconProps) {
  let iconEl: React.JSX.Element | null = null;
  if (link.icon) {
    iconEl = <Icon name={toIconName(link.icon) ?? 'link'} size="lg" />;
  } else if (link.img) {
    iconEl = <img className={styles.railImg} src={link.img} alt="" />;
  }

  if (link.children?.length) {
    return (
      <Tooltip content={link.text} placement="right">
        <button
          className={cx(styles.railButton, {
            [styles.railButtonActive]: isSelected,
            [styles.railButtonHighlight]: isHighlighted,
          })}
          onClick={onClick}
          aria-label={link.text}
          aria-expanded={isSelected}
        >
          {iconEl}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={link.text} placement="right">
      <Link
        href={link.url ?? '/'}
        className={cx(styles.railButton, {
          [styles.railButtonActive]: isLeafActive,
        })}
        onClick={onNavigate}
        aria-label={link.text}
      >
        {iconEl}
      </Link>
    </Tooltip>
  );
}

interface ChildNavLinkProps {
  item: NavModelItem;
  isActive: boolean;
  isPinned: boolean;
  onPin: () => void;
  onClick: () => void;
  styles: ReturnType<typeof getStyles>;
  indented?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

function ChildNavLink({
  item,
  isActive,
  isPinned,
  onPin,
  onClick,
  styles,
  indented,
  expandable,
  expanded,
  onToggleExpand,
}: ChildNavLinkProps) {
  if (!item.url) {
    return null;
  }

  const LinkComponent = !item.target && item.url.startsWith('/') ? Link : 'a';

  return (
    <div className={cx(styles.childItemWrapper, { [styles.childItemActive]: isActive })}>
      <LinkComponent
        href={item.url}
        target={item.target}
        className={cx(styles.childLink, { [styles.childLinkIndented]: indented })}
        onClick={onClick}
        data-testid={selectors.components.NavMenu.item}
        {...(isActive && { 'aria-current': 'page' as const })}
      >
        <Text truncate>{item.text}</Text>
        {item.target === '_blank' && <Icon name="external-link-alt" size="sm" />}
      </LinkComponent>
      {expandable && (
        <IconButton
          name={expanded ? 'angle-up' : 'angle-down'}
          className={styles.expandButton}
          onClick={onToggleExpand}
          size="sm"
          aria-label={expanded ? `Collapse ${item.text}` : `Expand ${item.text}`}
          aria-expanded={expanded}
        />
      )}
      {contextSrv.isSignedIn && item.url !== '/bookmarks' && (
        <IconButton
          name="bookmark"
          className="pin-icon"
          iconType={isPinned ? 'solid' : 'default'}
          onClick={onPin}
          size="sm"
          aria-label={
            isPinned
              ? t('navigation.item.remove-bookmark', 'Remove {{itemName}} from Bookmarks', { itemName: item.text })
              : t('navigation.item.add-bookmark', 'Add {{itemName}} to Bookmarks', { itemName: item.text })
          }
        />
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  body: css({
    display: 'flex',
    flexGrow: 1,
    minHeight: 0,
    overflow: 'hidden',
  }),

  // Icon Rail (left column)
  rail: css({
    display: 'flex',
    flexDirection: 'column',
    width: RAIL_WIDTH,
    flexShrink: 0,
    borderRight: `1px solid ${theme.colors.border.weak}`,
    background: theme.colors.background.primary,
  }),
  railList: css({
    display: 'flex',
    flexDirection: 'column',
    listStyleType: 'none',
    padding: theme.spacing(1, 0),
    gap: theme.spacing(0.5),
    alignItems: 'center',
  }),
  railButton: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: theme.shape.radius.default,
    border: 'none',
    background: 'transparent',
    color: theme.colors.text.secondary,
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease',

    '&:hover': {
      background: theme.colors.action.hover,
      color: theme.colors.text.primary,
    },

    '&:focus-visible': {
      boxShadow: 'none',
      outline: `2px solid ${theme.colors.primary.main}`,
      outlineOffset: -2,
    },
  }),
  railButtonActive: css({
    background: theme.colors.action.selected,
    color: theme.colors.text.primary,
  }),
  railButtonHighlight: css({
    color: theme.colors.text.primary,
  }),
  railImg: css({
    width: 20,
    height: 20,
  }),

  // Child Panel (right column)
  childPanel: css({
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    background: theme.colors.background.primary,
    opacity: 0,
    width: 0,
    overflow: 'hidden',
    transition: 'opacity 0.15s ease',
  }),
  childPanelVisible: css({
    opacity: 1,
    width: 'auto',
    overflow: 'visible',
  }),
  childPanelHeader: css({
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    flexShrink: 0,
  }),
  childPanelHeaderLink: css({
    color: theme.colors.text.secondary,
    '&:hover': {
      color: theme.colors.text.primary,
      textDecoration: 'underline',
    },
  }),
  childList: css({
    display: 'flex',
    flexDirection: 'column',
    listStyleType: 'none',
    padding: theme.spacing(0.5, 0),
  }),
  grandchildList: css({
    display: 'flex',
    flexDirection: 'column',
    listStyleType: 'none',
  }),
  childItemWrapper: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: theme.spacing(0.25, 1),
    borderRadius: theme.shape.radius.default,
    position: 'relative',

    '.pin-icon': {
      visibility: 'hidden',
    },

    '&:hover, &:focus-within': {
      backgroundColor: theme.colors.action.hover,

      '.pin-icon': {
        visibility: 'visible',
      },
    },
  }),
  childItemActive: css({
    backgroundColor: theme.colors.action.selected,
    color: theme.colors.text.primary,
  }),
  childLink: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75, 1.5),
    color: theme.colors.text.secondary,
    width: '100%',
    minWidth: 0,

    '&:hover': {
      color: theme.colors.text.primary,
    },

    '&:focus-visible': {
      boxShadow: 'none',
      outline: `2px solid ${theme.colors.primary.main}`,
      outlineOffset: -2,
      borderRadius: theme.shape.radius.default,
    },
  }),
  childLinkIndented: css({
    paddingLeft: theme.spacing(3),
  }),
  expandButton: css({
    color: theme.colors.text.secondary,
    flexShrink: 0,
    marginRight: theme.spacing(0.5),
  }),
});
