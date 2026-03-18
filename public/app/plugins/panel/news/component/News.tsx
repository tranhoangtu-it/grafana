import { css } from '@emotion/css';
import { useId } from 'react';
import Skeleton from 'react-loading-skeleton';

import { DataFrameView, GrafanaTheme2, textUtil, dateTimeFormat } from '@grafana/data';
import { TextLink, useStyles2 } from '@grafana/ui';
import { attachSkeleton, SkeletonComponent } from '@grafana/ui/unstable';

import { NewsItem } from '../types';

interface NewsItemProps {
  width: number;
  showImage?: boolean;
  index: number;
  data: DataFrameView<NewsItem>;
}

function NewsComponent({ data, index }: NewsItemProps) {
  const titleId = useId();
  const styles = useStyles2(getStyles);
  const newsItem = data.get(index);

  return (
    <article aria-labelledby={titleId} className={styles.item}>
      <div className={styles.body}>
        <time className={styles.date} dateTime={dateTimeFormat(newsItem.date, { format: 'MMM DD' })}>
          {dateTimeFormat(newsItem.date, { format: 'MMM DD' })}
        </time>

        <h1 className={styles.title} id={titleId}>
          <TextLink href={textUtil.sanitizeUrl(newsItem.link)} external inline={false}>
            {newsItem.title}
          </TextLink>
        </h1>
        <div className={styles.content} dangerouslySetInnerHTML={{ __html: textUtil.sanitize(newsItem.content) }} />
      </div>
    </article>
  );
}

const NewsSkeleton: SkeletonComponent<Pick<NewsItemProps, 'width' | 'showImage'>> = ({ rootProps }) => {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.item} {...rootProps}>
      <div className={styles.body}>
        <Skeleton containerClassName={styles.date} width={60} />
        <Skeleton containerClassName={styles.title} width="80%" />
        <Skeleton containerClassName={styles.content} width="100%" count={2} />
      </div>
    </div>
  );
};

export const News = attachSkeleton(NewsComponent, NewsSkeleton);

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    height: '100%',
  }),
  item: css({
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.weak}`,
    background: theme.colors.background.secondary,
    transition: 'border-color 0.15s ease, background 0.15s ease',

    '&:hover': {
      borderColor: theme.colors.border.medium,
      background: theme.colors.action.hover,
    },
  }),
  body: css({
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  }),
  title: css({
    ...theme.typography.body,
    fontWeight: theme.typography.fontWeightMedium,
    marginBottom: theme.spacing(0.5),
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: 2,
    overflow: 'hidden',
  }),
  content: css({
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: 2,
    overflow: 'hidden',

    p: {
      marginBottom: 0,
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
    },
  }),
  date: css({
    marginBottom: theme.spacing(0.5),
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.fontWeightRegular,
    color: theme.colors.text.disabled,
  }),
});
