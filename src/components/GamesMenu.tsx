import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Clock, Inbox, Play, UserPlus } from 'lucide-react';
import './GamesMenu.css';

type GameSummary = {
  id: string;
  type: string;
  status: string;
  members?: Array<{ user_id: string; username: string | null }>;
};

interface GamesMenuProps {
  games: GameSummary[];
  gamesLoading: boolean;
  userId?: string | null;
  disabled?: boolean;
}

const inviteStatuses = new Set(['waiting', 'invited', 'pending']);
const activeStatuses = new Set(['active', 'in_progress', 'inprogress']);

function getOpponentName(game: GameSummary, userId?: string | null): string {
  const fallback = 'Opponent';
  if (!userId) return fallback;
  return game.members?.find((member) => member.user_id !== userId)?.username || fallback;
}

function formatGameLabel(game: GameSummary, userId?: string | null): string {
  const typeLabel = game.type ? `${game.type.charAt(0).toUpperCase()}${game.type.slice(1)}` : 'Game';
  return `${typeLabel} vs ${getOpponentName(game, userId)}`;
}

export default function GamesMenu({ games, gamesLoading, userId, disabled = false }: GamesMenuProps): React.ReactElement {
  const navigate = useNavigate();
  const menuId = useId();
  const buttonId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const inviteGames = useMemo(() => {
    return games.filter((game) => inviteStatuses.has(game.status?.toLowerCase()));
  }, [games]);

  const activeGames = useMemo(() => {
    return games.filter((game) => activeStatuses.has(game.status?.toLowerCase()));
  }, [games]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleNavigate = (path: string): void => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div className="games-menu" ref={wrapperRef} data-testid="nav-games-wrapper">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className="games-menu-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
      >
        <span className="games-menu-button-label">Games</span>
        <ChevronDown className="games-menu-button-icon" aria-hidden="true" />
      </button>

      <div
        id={menuId}
        role="menu"
        aria-labelledby={buttonId}
        className="games-menu-panel"
        data-open={isOpen}
      >
        <div className="games-menu-section" role="presentation">
          <div className="games-menu-section-header">
            <Play className="games-menu-section-icon" aria-hidden="true" />
            <span>Start Here</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="games-menu-item"
            onClick={() => handleNavigate('/games/local')}
            disabled={disabled}
          >
            <Play className="games-menu-item-icon" aria-hidden="true" />
            <span>Play vs computer</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="games-menu-item"
            onClick={() => handleNavigate('/games')}
          >
            <UserPlus className="games-menu-item-icon" aria-hidden="true" />
            <span>Invite a player</span>
          </button>
        </div>

        <div className="games-menu-divider" role="presentation" />

        <div className="games-menu-section" role="presentation">
          <div className="games-menu-section-header">
            <Inbox className="games-menu-section-icon" aria-hidden="true" />
            <span>Invitations</span>
            {inviteGames.length > 0 && (
              <span className="games-menu-badge" aria-label={`${inviteGames.length} invites`}>
                {inviteGames.length}
              </span>
            )}
          </div>
          {gamesLoading ? (
            <div className="games-menu-empty">Loading invites...</div>
          ) : inviteGames.length ? (
            inviteGames.map((game) => (
              <button
                key={game.id}
                type="button"
                role="menuitem"
                className="games-menu-item"
                onClick={() => handleNavigate(`/games/${game.id}`)}
              >
                <UserPlus className="games-menu-item-icon" aria-hidden="true" />
                <span>{formatGameLabel(game, userId)}</span>
              </button>
            ))
          ) : (
            <div className="games-menu-empty">No invites right now.</div>
          )}
        </div>

        <div className="games-menu-divider" role="presentation" />

        <div className="games-menu-section" role="presentation">
          <div className="games-menu-section-header">
            <Clock className="games-menu-section-icon" aria-hidden="true" />
            <span>In Progress</span>
          </div>
          {gamesLoading ? (
            <div className="games-menu-empty">Loading matches...</div>
          ) : activeGames.length ? (
            activeGames.map((game) => (
              <button
                key={game.id}
                type="button"
                role="menuitem"
                className="games-menu-item"
                onClick={() => handleNavigate(`/games/${game.id}`)}
              >
                <Clock className="games-menu-item-icon" aria-hidden="true" />
                <span>{formatGameLabel(game, userId)}</span>
              </button>
            ))
          ) : (
            <div className="games-menu-empty">No active matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
