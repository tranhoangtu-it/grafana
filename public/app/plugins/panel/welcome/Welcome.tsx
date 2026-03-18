import { css } from '@emotion/css';
import { useKBar } from 'kbar';
import { useMemo } from 'react';

import { colorManipulator, GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { Icon, Link, Text, TextLink, useStyles2 } from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';
import { getModKey } from 'app/core/utils/browser';

const helpOptions = [
  { label: 'Documentation', href: 'https://grafana.com/docs/grafana/latest' },
  { label: 'Tutorials', href: 'https://grafana.com/tutorials' },
  { label: 'Community', href: 'https://community.grafana.com' },
  { label: 'Public Slack', href: 'http://slack.grafana.com' },
];

const quickActions = [
  { label: 'Create dashboard', icon: 'apps' as const, href: '/dashboard/new' },
  { label: 'Import dashboard', icon: 'import' as const, href: '/dashboard/import' },
  { label: 'Explore data', icon: 'compass' as const, href: '/explore' },
  { label: 'Alerting', icon: 'bell' as const, href: '/alerting' },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export const WelcomeBanner = () => {
  const styles = useStyles2(getStyles);
  const { query: kbar } = useKBar();
  const modKey = useMemo(() => getModKey(), []);
  const userName = contextSrv.user.name || contextSrv.user.login;
  const greeting = getGreeting();

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <Text color="secondary" variant="bodySmall">
          {greeting}, {userName}
        </Text>
        <h1 className={styles.title}>
          <Trans i18nKey="welcome.welcome-banner.welcome-to-grafana">Welcome to Grafana</Trans>
        </h1>

        <button className={styles.searchBar} onClick={() => kbar.toggle()}>
          <div className={styles.searchLeft}>
            <Icon name="search" size="lg" />
            <span className={styles.searchPlaceholder}>Search dashboards, data sources, and more...</span>
          </div>
          <div className={styles.searchRight}>
            <span className={styles.searchShortcut}>{modKey}+K</span>
          </div>
        </button>
      </div>

      <div className={styles.actions}>
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href} className={styles.actionCard}>
            <Icon name={action.icon} size="xl" className={styles.actionIcon} />
            <Text variant="bodySmall" weight="medium">
              {action.label}
            </Text>
          </Link>
        ))}
      </div>

      <div className={styles.helpRow}>
        {helpOptions.map((option, index) => (
          <TextLink
            key={`${option.label}-${index}`}
            href={`${option.href}?utm_source=grafana_gettingstarted`}
            external
            inline={false}
            variant="bodySmall"
          >
            {option.label}
          </TextLink>
        ))}
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => {
  const accentOrange = theme.colors.primary.main;
  const accentAmber = '#F5D63A';
  const accentBlue = '#5794F2';

  return {
    container: css({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: theme.spacing(4, 3),
      gap: theme.spacing(4),
      position: 'relative',
      overflow: 'hidden',

      '&::before': {
        content: '""',
        position: 'absolute',
        top: '-40%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '140%',
        height: '80%',
        borderRadius: '50%',
        background: `radial-gradient(ellipse at center, ${colorManipulator.alpha(accentOrange, 0.08)} 0%, ${colorManipulator.alpha(accentBlue, 0.04)} 40%, transparent 70%)`,
        pointerEvents: 'none',
      },
    }),

    hero: css({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: theme.spacing(1),
      width: '100%',
      maxWidth: 640,
      position: 'relative',
      zIndex: 1,
    }),

    title: css({
      margin: 0,
      marginBottom: theme.spacing(2),
      textAlign: 'center',
      background: `linear-gradient(135deg, ${theme.colors.text.primary} 0%, ${accentOrange} 50%, ${accentAmber} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    }),

    searchBar: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      padding: theme.spacing(1.5, 2),
      borderRadius: theme.shape.radius.default,
      border: `1px solid ${colorManipulator.alpha(accentOrange, 0.2)}`,
      background: colorManipulator.alpha(theme.colors.background.secondary, 0.8),
      backdropFilter: 'blur(8px)',
      color: theme.colors.text.secondary,
      cursor: 'pointer',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',

      '&:hover': {
        borderColor: colorManipulator.alpha(accentOrange, 0.4),
        boxShadow: `0 0 20px ${colorManipulator.alpha(accentOrange, 0.1)}`,
      },

      '&:focus-visible': {
        outline: `2px solid ${accentOrange}`,
        outlineOffset: -1,
      },
    }),

    searchLeft: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1.5),
    }),

    searchPlaceholder: css({
      color: theme.colors.text.disabled,
      fontSize: theme.typography.body.fontSize,
    }),

    searchRight: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
    }),

    searchShortcut: css({
      fontSize: theme.typography.bodySmall.fontSize,
      color: theme.colors.text.disabled,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      padding: theme.spacing(0.25, 0.75),
      lineHeight: 1.5,
    }),

    actions: css({
      display: 'flex',
      gap: theme.spacing(2),
      flexWrap: 'wrap',
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1,

      [theme.breakpoints.down('sm')]: {
        gap: theme.spacing(1),
      },
    }),

    actionCard: css({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing(1),
      padding: theme.spacing(2, 3),
      borderRadius: theme.shape.radius.default,
      border: `1px solid ${theme.colors.border.weak}`,
      background: colorManipulator.alpha(theme.colors.background.secondary, 0.6),
      backdropFilter: 'blur(4px)',
      color: theme.colors.text.secondary,
      cursor: 'pointer',
      transition: 'border-color 0.2s ease, color 0.2s ease, background 0.2s ease, transform 0.15s ease',
      minWidth: 120,

      '&:hover': {
        borderColor: colorManipulator.alpha(accentOrange, 0.3),
        color: theme.colors.text.primary,
        background: colorManipulator.alpha(theme.colors.background.secondary, 0.9),
        transform: 'translateY(-2px)',
      },

      [theme.breakpoints.down('sm')]: {
        minWidth: 100,
        padding: theme.spacing(1.5, 2),
      },
    }),

    actionIcon: css({
      color: accentOrange,
    }),

    helpRow: css({
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(3),
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1,
    }),
  };
};
