import { render, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import EditHeaderActions from './EditHeaderActions';

describe('EditHeaderActions', () => {
  it('renders Recheck AI button when not polling', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    expect(scope.getByText('Recheck AI')).toBeInTheDocument();
    expect(scope.queryByText('Processing...')).not.toBeInTheDocument();
  });

  it('renders Processing badge when isPolling is true', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={true}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    expect(scope.getByText('Processing...')).toBeInTheDocument();
    expect(scope.queryByText('Recheck AI')).not.toBeInTheDocument();
  });

  it('renders Processing badge when recheckingAI is true', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={true}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    expect(scope.getByText('Processing...')).toBeInTheDocument();
    expect(scope.queryByText('Recheck AI')).not.toBeInTheDocument();
  });

  it('calls onSaveClick when Save Changes button is clicked', async () => {
    const user = userEvent.setup();
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    await user.click(scope.getByText('Save Changes'));
    expect(onSaveClick).toHaveBeenCalled();
  });

  it('calls onRecheckClick when Recheck AI button is clicked', async () => {
    const user = userEvent.setup();
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    await user.click(scope.getByText('Recheck AI'));
    expect(onRecheckClick).toHaveBeenCalled();
  });

  it('shows "Saving..." text when saving is true', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={true}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    expect(scope.getByText('Saving...')).toBeInTheDocument();
  });

  it('disables Recheck AI button when aiReady is false', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    const { container } = render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={false}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const scope = within(container);
    const recheckButton = scope.getByText('Recheck AI');
    expect(recheckButton).toBeDisabled();
  });
});
