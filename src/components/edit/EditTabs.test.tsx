import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import EditTabs from './EditTabs';

describe('EditTabs', () => {
  it('renders Story and Location tabs by default', () => {
    const onTabChange = vi.fn();
    render(
      <EditTabs
        activeTab="story"
        onTabChange={onTabChange}
        showCollectiblesTab={false}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.queryByText('Collectibles')).not.toBeInTheDocument();
  });

  it('renders Collectibles tab when showCollectiblesTab is true', () => {
    const onTabChange = vi.fn();
    render(
      <EditTabs
        activeTab="story"
        onTabChange={onTabChange}
        showCollectiblesTab={true}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    expect(screen.getByText('Collectibles')).toBeInTheDocument();
  });

  it('calls onTabChange when Location tab is clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <EditTabs
        activeTab="story"
        onTabChange={onTabChange}
        showCollectiblesTab={false}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    await user.click(screen.getByText('Location'));
    expect(onTabChange).toHaveBeenCalledWith('location');
  });

  it('calls onTabChange when Collectibles tab is clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <EditTabs
        activeTab="story"
        onTabChange={onTabChange}
        showCollectiblesTab={true}
        isCollectiblePhoto={false}
        hasCollectibleData={false}
      />
    );

    await user.click(screen.getByText('Collectibles'));
    expect(onTabChange).toHaveBeenCalledWith('collectibles');
  });

  it('shows collectible indicator when isCollectiblePhoto is true and hasCollectibleData is false', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <EditTabs
        activeTab="story"
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
        activeTab="story"
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
