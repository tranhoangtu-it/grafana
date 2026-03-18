import { css } from '@emotion/css';

import { GrafanaTheme2, colorManipulator } from '@grafana/data';

export const getStyles = (theme: GrafanaTheme2) => {
  const gradient = `linear-gradient(
    90deg,
    ${colorManipulator.alpha(theme.colors.primary.text, 0.1)} 0%,
    ${colorManipulator.alpha(theme.colors.secondary.main, 0.1)} 100%
  )`;

  return {
    dashGrid: css({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: theme.spacing(1.5),
      padding: theme.spacing(0, 0.5),
    }),
    dashlistLink: css({
      display: 'flex',
      padding: theme.spacing(1, 1.5),
      alignItems: 'center',
      borderRadius: theme.shape.radius.default,
      border: `1px solid ${theme.colors.border.weak}`,
      background: theme.colors.background.secondary,
      transition: 'border-color 0.15s ease, background 0.15s ease',

      '&:hover': {
        borderColor: theme.colors.border.medium,
        background: theme.colors.action.hover,
      },

      a: {
        flex: 1,
        minWidth: 0,

        '&:hover': {
          '> p': {
            '&:first-child': {
              color: theme.colors.text.primary,
            },
          },
        },
      },
    }),
    dashlistCardContainer: css({
      display: 'block',
      height: '100%',
      paddingTop: theme.spacing(1.25),
      paddingBottom: theme.spacing(1.25),

      '&:has(a:hover)': {
        backgroundImage: gradient,
        color: theme.colors.text.primary,
      },
    }),
    dashlistCard: css({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: theme.spacing(0.75),
      height: '100%',
      width: '100%',

      '&:hover': {
        '> div': {
          '&:first-child': {
            color: theme.colors.text.link,
            textDecoration: 'underline',
          },
        },
      },
    }),
    dashlistCardIcon: css({
      marginRight: theme.spacing(0.25),
      marginTop: theme.spacing(0.25),
    }),
    dashlistCardLink: css({
      paddingTop: theme.spacing(0.5),
      whiteSpace: 'normal',
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: 2,
      overflow: 'hidden',
      [theme.breakpoints.down('lg')]: {
        WebkitLineClamp: 1,
      },
    }),
    dashlistCardFolder: css({
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: 1,
      overflow: 'hidden',
      whiteSpace: 'normal',
    }),
  };
};
