import { render, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import EditTabs from './EditTabs';

describe('EditTabs', () => {
  it('renders Context tab by default', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="context"
        onTabChange={onTabChange}
        showCollectiblesTab={false}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    const scope = within(container);
    expect(scope.getByText('Context')).toBeInTheDocument();
    expect(scope.queryByText('Collectibles')).not.toBeInTheDocument();
  });

  it('renders Collectibles tab when showCollectiblesTab is true', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="context"
        onTabChange={onTabChange}
        showCollectiblesTab={true}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    const scope = within(container);
    expect(scope.getByText('Collectibles')).toBeInTheDocument();
  });

  it('calls onTabChange when Context tab is clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="collectibles"
        onTabChange={onTabChange}
        showCollectiblesTab={false}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    const scope = within(container);
    await user.click(scope.getByText('Context'));
    expect(onTabChange).toHaveBeenCalledWith('context');
  });

  it('calls onTabChange when Collectibles tab is clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="context"
        onTabChange={onTabChange}
        showCollectiblesTab={true}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    const scope = within(container);
    await user.click(scope.getByText('Collectibles'));
    expect(onTabChange).toHaveBeenCalledWith('collectibles');
  });

  it('shows collectible indicator when isCollectiblePhoto is true and hasCollectibleData is false', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="context"
        onTabChange={onTabChange}
        showCollectiblesTab={true}
        isCollectiblePhoto={true}
        hasCollectibleData={false}
      />
    );

    // Check for the indicator span with title attribute
    const indicator = container.querySelector('span[title="AI detected collectible"]');
    expect(indicator).toBeInTheDocument();
  });

  it('does not show collectible indicator when hasCollectibleData is true', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="context"
        onTabChange={onTabChange}
        showCollectiblesTab={true}
        isCollectiblePhoto={true}
        hasCollectibleData={true}
      />
    );

    const indicator = container.querySelector('span[title="AI detected collectible"]');
    expect(indicator).not.toBeInTheDocument();
  });
});
