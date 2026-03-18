import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from 'test/test-utils';

import { NavModelItem } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { configureStore } from 'app/store/configureStore';

import { MegaMenu } from './MegaMenu';

const setup = () => {
  const navBarTree: NavModelItem[] = [
    {
      text: 'Section name',
      id: 'section',
      url: 'section',
      icon: 'folder',
      children: [
        {
          text: 'Child1',
          id: 'child1',
          url: 'section/child1',
          children: [{ text: 'Grandchild1', id: 'grandchild1', url: 'section/child1/grandchild1' }],
        },
        { text: 'Child2', id: 'child2', url: 'section/child2' },
      ],
    },
    {
      text: 'Profile',
      id: 'profile',
      url: 'profile',
    },
  ];

  const store = configureStore({ navBarTree });
  return render(<MegaMenu onClose={() => {}} />, { store });
};

describe('MegaMenu', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('should render component', async () => {
    setup();

    expect(await screen.findByTestId(selectors.components.NavMenu.Menu)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Section name' })).toBeInTheDocument();
  });

  it('should render children when parent is clicked', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Section name' }));
    expect(await screen.findByRole('link', { name: 'Child1' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Child2' })).toBeInTheDocument();
  });

  it('should render grandchildren when child is expanded', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Section name' }));
    expect(await screen.findByRole('link', { name: 'Child1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Grandchild1' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Expand Child1' }));
    expect(await screen.findByRole('link', { name: 'Grandchild1' })).toBeInTheDocument();
  });

  it('should filter out profile', async () => {
    setup();

    expect(screen.queryByLabelText('Profile')).not.toBeInTheDocument();
  });
});
