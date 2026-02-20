process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('supabase realtime migration contracts', () => {
  test('publication migration keeps required realtime tables', () => {
    const sql = read('..\\supabase\\migrations\\20260220181500_add_missing_realtime_publications_for_games_and_chat.sql');

    const requiredTables = [
      'public.messages',
      'public.room_members',
      'public.rooms',
      'public.chess_moves',
      'public.games',
      'public.game_members',
    ];

    for (const table of requiredTables) {
      expect(sql).toContain(`ADD TABLE ${table}`);
    }
  });

  test('chat hardening migration preserves realtime-safe RLS defaults', () => {
    const js = read('db\\migrations\\20260220164500_fix_chat_rooms_select_creator_and_last_read_at.js');

    expect(js).toContain('NO FORCE ROW LEVEL SECURITY');
    expect(js).toContain('created_by = auth.uid()');
    expect(js).toContain('public.is_room_member(id)');
    expect(js).toContain('ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ');
  });
});
