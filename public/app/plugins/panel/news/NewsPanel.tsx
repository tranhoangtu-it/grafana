import { css } from '@emotion/css';
import { useEffect } from 'react';

import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { RefreshEvent } from '@grafana/runtime';
import { Alert, TextLink, useStyles2 } from '@grafana/ui';

import { News } from './component/News';
import { DEFAULT_FEED_URL } from './constants';
import { Options } from './panelcfg.gen';
import { useNewsFeed } from './useNewsFeed';

const MAX_NEWS_ITEMS = 4;

interface NewsPanelProps extends PanelProps<Options> {}

export function NewsPanel(props: NewsPanelProps) {
  const {
    width,
    options: { feedUrl = DEFAULT_FEED_URL, showImage },
  } = props;

  const styles = useStyles2(getNewsPanelStyles);
  const { state, getNews } = useNewsFeed(feedUrl);

  useEffect(() => {
    const sub = props.eventBus.subscribe(RefreshEvent, getNews);

    return () => {
      sub.unsubscribe();
    };
  }, [getNews, props.eventBus]);

  useEffect(() => {
    getNews();
  }, [getNews]);

  if (state.error) {
    return (
      <Alert title={t('news.news-panel.title-error-loading-rss-feed', 'Error loading RSS feed')}>
        <Trans i18nKey="news.news-panel.body-error-loading-rss-feed">
          Make sure that the feed URL is correct and that CORS is configured correctly on the server. See{' '}
          <TextLink href="https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/news/" external>
            News panel documentation.
          </TextLink>
        </Trans>
      </Alert>
    );
  }
  if (state.loading) {
    return (
      <div>
        <Trans i18nKey="news.news-panel.loading">Loading...</Trans>
      </div>
    );
  }

  if (!state.value) {
    return null;
  }

  const itemCount = Math.min(state.value.length, MAX_NEWS_ITEMS);

  return (
    <div className={styles.grid}>
      {Array.from({ length: itemCount }, (_, index) => (
        <News key={index} index={index} width={width} showImage={showImage} data={state.value} />
      ))}
    </div>
  );
}

const getNewsPanelStyles = (theme: GrafanaTheme2) => ({
  grid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: theme.spacing(1),
    padding: theme.spacing(0, 0.5),
    height: '100%',
  }),
});
