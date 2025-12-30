import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

type TypingChannel = {
  on: (type: 'broadcast', filter: { event: string }, callback: (payload: any) => void) => TypingChannel;
  subscribe: (callback?: (status: string) => void) => TypingChannel;
  send: (args: { type: 'broadcast'; event: string; payload: Record<string, unknown> }) => unknown;
  unsubscribe: () => unknown;
};

interface TypingUser {
  userId: string;
  username?: string;
}

interface UseChatTypingOptions {
  roomId: string;
  userId: string;
  supabase: unknown;
  participants?: TypingUser[];
}

export function useChatTyping({ roomId, userId, supabase, participants }: UseChatTypingOptions) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<TypingChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingState = useRef<boolean>(false);

  // Map userId to username
  const getUsername = useCallback(
    (id: string) => {
      const name = participants?.find((p) => p.userId === id)?.username;
      if (typeof name === 'string' && name.trim()) return name;
      // If we can't resolve a name for a remote user, keep it generic.
      return 'Someone';
    },
    [participants]
  );

  useEffect(() => {
    const supabaseAny = supabase as any;

    // Cleanup previous channel
    if (channelRef.current) {
      try {
        supabaseAny?.removeChannel?.(channelRef.current);
      } catch {
        channelRef.current.unsubscribe();
      }
      channelRef.current = null;
    }
    setTypingUsers(new Set());
    lastTypingState.current = false;
    if (!roomId || !userId) return;
    if (typeof supabaseAny?.channel !== 'function') return;
    try {
      const channel = supabaseAny.channel(`typing:${roomId}`) as TypingChannel;
      channel.on('broadcast', { event: 'typing' }, (payload: any) => {
        const { userId: incomingId, typing } = payload.payload || {};
        if (!incomingId || incomingId === userId) return;
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (typing) {
            next.add(incomingId);
          } else {
            next.delete(incomingId);
          }
          return next;
        });
      });

      channel.subscribe(() => {
        // no-op; we remain best-effort
      });
      channelRef.current = channel;
    } catch (e) {
      // Fail gracefully
      channelRef.current = null;
    }
    return () => {
      if (channelRef.current) {
        try {
          supabaseAny?.removeChannel?.(channelRef.current);
        } catch {
          channelRef.current.unsubscribe();
        }
        channelRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [roomId, userId, supabase]);

  const typingUsernames = useMemo(() => Array.from(typingUsers).map(getUsername), [typingUsers, getUsername]);

  // Call on input change
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!userId) return;
      if (!channelRef.current || lastTypingState.current === isTyping) return;
      try {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId, typing: isTyping },
        });
        lastTypingState.current = isTyping;
      } catch (e) {
        // Fail gracefully
      }
    },
    [userId]
  );

  // Debounced typing handler
  const handleInputChange = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTyping(true);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 1500);
  }, [sendTyping]);

  // Call on submit
  const handleInputSubmit = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTyping(false);
  }, [sendTyping]);

  return {
    typingUsernames,
    handleInputChange,
    handleInputSubmit,
  };
}
