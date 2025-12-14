import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import EditHeaderActions from './EditHeaderActions';

describe('EditHeaderActions', () => {
  it('renders Recheck AI button when not polling', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    expect(screen.getByText('Recheck AI')).toBeInTheDocument();
    expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
  });

  it('renders Processing badge when isPolling is true', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={true}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.queryByText('Recheck AI')).not.toBeInTheDocument();
  });

  it('renders Processing badge when recheckingAI is true', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={true}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.queryByText('Recheck AI')).not.toBeInTheDocument();
  });

  it('calls onSaveClick when Save Changes button is clicked', async () => {
    const user = userEvent.setup();
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    await user.click(screen.getByText('Save Changes'));
    expect(onSaveClick).toHaveBeenCalled();
  });

  it('calls onRecheckClick when Recheck AI button is clicked', async () => {
    const user = userEvent.setup();
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    await user.click(screen.getByText('Recheck AI'));
    expect(onRecheckClick).toHaveBeenCalled();
  });

  it('shows "Saving..." text when saving is true', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={true}
        saving={true}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('disables Recheck AI button when aiReady is false', () => {
    const onRecheckClick = vi.fn();
    const onSaveClick = vi.fn();
    render(
      <EditHeaderActions
        isPolling={false}
        recheckingAI={false}
        aiReady={false}
        saving={false}
        onRecheckClick={onRecheckClick}
        onSaveClick={onSaveClick}
      />
    );

    const recheckButton = screen.getByText('Recheck AI');
    expect(recheckButton).toBeDisabled();
  });
});
