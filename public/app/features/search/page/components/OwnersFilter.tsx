import { css } from '@emotion/css';
import { useMemo } from 'react';

import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Icon, MultiSelect, useStyles2 } from '@grafana/ui';
import { useSearchTeamsQuery } from 'app/api/clients/legacy';
import { teamOwnerRef } from 'app/features/browse-dashboards/utils/dashboards';

const ALL_TEAMS_VALUE = '__all-teams__';

interface OwnersFilterProps {
  ownerReference: string[];
  onChange: (ownerReference: string[]) => void;
}

export function OwnersFilter({ ownerReference, onChange }: OwnersFilterProps) {
  const styles = useStyles2(getStyles);
  // At this point we have hard limit for number of items we show. The issue is we are using MultiSelect because of
  // some UX bug (it opens only when clicking on internal input, not the full element) in Combobox but Multiselect
  // then does not allow for async options loading.
  const { data, isLoading } = useSearchTeamsQuery({ perpage: 200, sort: 'name-asc' });

  const teamOptions = useMemo<Array<SelectableValue<string>>>(() => {
    if (!data?.teams) {
      return [];
    }
    return data.teams.map((team) => ({
      label: team.name,
      value: teamOwnerRef(team),
      imgUrl: team.avatarUrl,
    }));
  }, [data?.teams]);

  const allTeamsValue = useMemo(() => {
    return {
      label: t('browse-dashboards.filters.all-teams', 'All teams'),
      value: ALL_TEAMS_VALUE,
    };
  }, []);

  const allTeamReferences = useMemo(() => {
    // option.value is UID of the team. This needs to exist always so we should be able to use ! here.
    return teamOptions.map((option) => option.value!);
  }, [teamOptions]);

  const hasAllTeamsSelected =
    ownerReference.length > 0 &&
    allTeamReferences.length > 0 &&
    ownerReference.length === allTeamReferences.length &&
    allTeamReferences.every((reference) => ownerReference.includes(reference));

  const value = hasAllTeamsSelected
    ? [allTeamsValue]
    : teamOptions.filter((option) => option.value && ownerReference.includes(option.value));

  const options = useMemo<Array<SelectableValue<string>>>(() => {
    if (teamOptions.length === 0) {
      return [];
    }
    return [allTeamsValue, ...teamOptions];
  }, [teamOptions, allTeamsValue]);

  return (
    <div className={styles.ownerFilter}>
      <MultiSelect<string>
        aria-label={t('browse-dashboards.filters.owner-aria-label', 'Owner filter')}
        options={options}
        value={value}
        onChange={(selectedOptions) => {
          const values = selectedOptions.map((option) => option.value!);
          onChange(
            values.includes(ALL_TEAMS_VALUE) ? allTeamReferences : values.filter((value) => value !== ALL_TEAMS_VALUE)
          );
        }}
        noOptionsMessage={t('browse-dashboards.filters.owner-no-options', 'No teams found')}
        loadingMessage={t('browse-dashboards.filters.owner-loading', 'Loading teams...')}
        placeholder={t('browse-dashboards.filters.owner-placeholder', 'Filter by owner')}
        isLoading={isLoading}
        prefix={<Icon name="filter" />}
      />
    </div>
  );
}

const getStyles = (_theme: GrafanaTheme2) => ({
  ownerFilter: css({
    minWidth: '180px',
    flexGrow: 1,
  }),
});
