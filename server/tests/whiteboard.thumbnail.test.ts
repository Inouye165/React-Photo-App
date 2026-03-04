/* eslint-env jest */

/**
 * Whiteboard thumbnail integration test.
 *
 * Validates the full snapshot→thumbnail pipeline:
 *  1. Stroke events persisted via persistEvent() are returned by the snapshot endpoint.
 *  2. The returned events are in the correct format for the thumbnail renderer.
 *  3. Empty boards (no events) return an empty snapshot (no crash).
 *  4. The events contain valid drawable data (type, finite x/y, strokeId).
 *  5. Missing legacy events fall back to Excalidraw elements from the Yjs document.
 */

/// <reference path="./jest-globals.d.ts" />

export {}

import express, { type NextFunction, type Request, type Response } from 'express'
import * as Y from 'yjs'
const request = require('supertest')

const createWhiteboardRouter = require('../routes/whiteboard')

/* ── shared types ──────────────────────────────────────────── */

type RoomMember = { room_id: string; user_id: string; is_owner?: boolean }

type WhiteboardEventRow = {
  id: number
  board_id: string
  event_type: 'stroke:start' | 'stroke:move' | 'stroke:end'
  stroke_id: string
  x: number
  y: number
  t: number
  segment_index: number | null
  source_id: string | null
  color: string | null
  width: number | null
}

type MockDbState = {
  roomMembers: RoomMember[]
  events: WhiteboardEventRow[]
  whiteboardDocuments?: Array<{ board_id: string; ydoc: Buffer | null }>
}

/* ── mock DB builder ───────────────────────────────────────── */

function createMockDb(state: MockDbState) {
  const existingTables = new Set(['room_members', 'whiteboard_events'])
  if (state.whiteboardDocuments) {
    existingTables.add('whiteboard_documents')
  }

  const db: any = (tableName: string) => {
    if (tableName === 'room_members') {
      let conditions: Record<string, string> = {}
      const query = {
        where: (cond: Record<string, string>) => {
          conditions = { ...conditions, ...cond }
          return query
        },
        first: async () => {
          return (
            state.roomMembers.find(
              (m) => m.room_id === conditions.room_id && m.user_id === conditions.user_id,
            ) ?? null
          )
        },
      }
      return query
    }

    if (tableName === 'whiteboard_events') {
      let boardFilter: string | null = null
      let limitVal: number | null = null
      const query = {
        select: () => query,
        where: (col: string | Record<string, string>, val?: string) => {
          if (typeof col === 'string' && col === 'board_id') {
            boardFilter = String(val)
          } else if (typeof col === 'object') {
            boardFilter = col.board_id ?? null
          }
          return query
        },
        orderBy: () => query,
        limit: (v: number) => {
          limitVal = v
          return query
        },
        then: async (resolve: (rows: WhiteboardEventRow[]) => unknown) => {
          let rows = boardFilter
            ? state.events.filter((e) => e.board_id === boardFilter)
            : [...state.events]
          rows = rows.slice().sort((a, b) => a.id - b.id)
          if (typeof limitVal === 'number') rows = rows.slice(0, limitVal)
          return resolve(rows)
        },
      }
      return query
    }

    if (tableName === 'whiteboard_documents') {
      let conditions: Record<string, string> = {}
      const query = {
        select: (..._cols: string[]) => query,
        where: (cond: Record<string, string>) => {
          conditions = { ...conditions, ...cond }
          return query
        },
        first: async () => {
          if (!state.whiteboardDocuments) return null
          return (
            state.whiteboardDocuments.find(
              (d) => d.board_id === conditions.board_id,
            ) ?? null
          )
        },
      }
      return query
    }

    throw new Error(`Unexpected table: ${tableName}`)
  }

  db.schema = {
    hasTable: async (name: string) => existingTables.has(name),
  }

  return db
}

/* ── test app helper ───────────────────────────────────────── */

type RequestWithUser = Request & { user?: { id?: string } }

function createTestApp(db: ReturnType<typeof createMockDb>) {
  const app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    ;(req as RequestWithUser).user = { id: 'user-1' }
    next()
  })
  app.use('/api/whiteboard', createWhiteboardRouter({ db }))
  return app
}

/* ── helpers ───────────────────────────────────────────────── */

/** Build a minimal stroke sequence (start → N moves → end) */
function makeStrokeEvents(opts: {
  boardId: string
  strokeId: string
  startId: number
  points: Array<{ x: number; y: number }>
  color?: string
  width?: number
}): WhiteboardEventRow[] {
  const { boardId, strokeId, startId, points, color = '#111827', width = 2 } = opts
  const events: WhiteboardEventRow[] = []
  let id = startId
  for (let i = 0; i < points.length; i++) {
    let eventType: WhiteboardEventRow['event_type'] = 'stroke:move'
    if (i === 0) eventType = 'stroke:start'
    else if (i === points.length - 1) eventType = 'stroke:end'
    events.push({
      id: id++,
      board_id: boardId,
      event_type: eventType,
      stroke_id: strokeId,
      x: points[i].x,
      y: points[i].y,
      t: 1000 + i,
      segment_index: i,
      source_id: 'user-1',
      color,
      width,
    })
  }
  return events
}

/* ── tests ─────────────────────────────────────────────────── */

describe('whiteboard thumbnail pipeline', () => {
  const boardId = '22222222-2222-4222-8222-222222222222'
  const membership: RoomMember = { room_id: boardId, user_id: 'user-1' }

  describe('snapshot returns persisted stroke events for thumbnail rendering', () => {
    test('returns stroke events that the thumbnail renderer can draw', async () => {
      const strokeEvents = makeStrokeEvents({
        boardId,
        strokeId: 'stroke-abc',
        startId: 1,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
          { x: 0.5, y: 0.6 },
          { x: 0.7, y: 0.8 },
        ],
        color: '#ff0000',
        width: 3,
      })

      const db = createMockDb({
        roomMembers: [membership],
        events: strokeEvents,
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)

      expect(res.status).toBe(200)
      expect(res.body.boardId).toBe(boardId)
      expect(Array.isArray(res.body.events)).toBe(true)

      // ── Key assertion: events are non-empty ──
      const events = res.body.events
      expect(events.length).toBeGreaterThan(0)
      expect(events.length).toBe(4)

      // ── Every event must have the fields the thumbnail renderer needs ──
      for (const evt of events) {
        expect(['stroke:start', 'stroke:move', 'stroke:end']).toContain(evt.type)
        expect(typeof evt.x).toBe('number')
        expect(typeof evt.y).toBe('number')
        expect(Number.isFinite(evt.x)).toBe(true)
        expect(Number.isFinite(evt.y)).toBe(true)
        expect(typeof evt.strokeId).toBe('string')
        expect(evt.strokeId.length).toBeGreaterThan(0)
        expect(typeof evt.boardId).toBe('string')
      }

      // ── Verify event ordering: start → moves → end ──
      expect(events[0].type).toBe('stroke:start')
      expect(events[events.length - 1].type).toBe('stroke:end')

      // ── Verify coordinates match what was persisted ──
      expect(events[0].x).toBeCloseTo(0.1, 5)
      expect(events[0].y).toBeCloseTo(0.2, 5)
      expect(events[1].x).toBeCloseTo(0.3, 5)
      expect(events[3].x).toBeCloseTo(0.7, 5)

      // ── Verify color and width are preserved ──
      expect(events[0].color).toBe('#ff0000')
      expect(events[0].width).toBe(3)

      // ── Verify seq (from row id) is present ──
      expect(typeof events[0].seq).toBe('number')
      expect(events[0].seq).toBe(1)

      // ── Verify cursor reflects last event ──
      expect(res.body.cursor.lastSeq).toBe(4)
    })

    test('returns drawable events from multiple strokes', async () => {
      const stroke1 = makeStrokeEvents({
        boardId,
        strokeId: 'stroke-1',
        startId: 1,
        points: [
          { x: 0.0, y: 0.0 },
          { x: 0.2, y: 0.3 },
          { x: 0.4, y: 0.5 },
        ],
        color: '#0000ff',
        width: 2,
      })
      const stroke2 = makeStrokeEvents({
        boardId,
        strokeId: 'stroke-2',
        startId: 4,
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.7, y: 0.8 },
          { x: 0.9, y: 0.9 },
        ],
        color: '#00ff00',
        width: 4,
      })

      const db = createMockDb({
        roomMembers: [membership],
        events: [...stroke1, ...stroke2],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)

      const events = res.body.events
      expect(events.length).toBe(6)

      // Both strokes present
      const strokeIds = new Set(events.map((e: any) => e.strokeId))
      expect(strokeIds.size).toBe(2)
      expect(strokeIds.has('stroke-1')).toBe(true)
      expect(strokeIds.has('stroke-2')).toBe(true)

      // All events have valid drawable fields
      const drawableEvents = events.filter(
        (e: any) =>
          (e.type === 'stroke:start' || e.type === 'stroke:move' || e.type === 'stroke:end') &&
          Number.isFinite(e.x) &&
          Number.isFinite(e.y),
      )
      expect(drawableEvents.length).toBe(6)
    })
  })

  describe('empty board returns empty snapshot (fallback thumbnail)', () => {
    test('returns empty events array for a board with no strokes', async () => {
      const db = createMockDb({
        roomMembers: [membership],
        events: [],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)
      expect(res.body.events).toEqual([])
      expect(res.body.cursor.lastSeq).toBe(0)
    })
  })

  describe('events with invalid coordinates are filtered out', () => {
    test('filters events where x/y/t are NaN or Infinity', async () => {
      const db = createMockDb({
        roomMembers: [membership],
        events: [
          {
            id: 1,
            board_id: boardId,
            event_type: 'stroke:start',
            stroke_id: 's1',
            x: 0.1,
            y: 0.2,
            t: 1000,
            segment_index: 0,
            source_id: null,
            color: null,
            width: null,
          },
          {
            id: 2,
            board_id: boardId,
            event_type: 'stroke:move',
            stroke_id: 's1',
            x: NaN as any,
            y: 0.3,
            t: 1001,
            segment_index: 1,
            source_id: null,
            color: null,
            width: null,
          },
          {
            id: 3,
            board_id: boardId,
            event_type: 'stroke:end',
            stroke_id: 's1',
            x: 0.5,
            y: Infinity as any,
            t: 1002,
            segment_index: 2,
            source_id: null,
            color: null,
            width: null,
          },
          {
            id: 4,
            board_id: boardId,
            event_type: 'stroke:end',
            stroke_id: 's1',
            x: 0.6,
            y: 0.7,
            t: 1003,
            segment_index: 3,
            source_id: null,
            color: null,
            width: null,
          },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)

      // Only the valid events (id 1 and 4) should be returned
      expect(res.body.events.length).toBe(2)
      expect(res.body.events[0].x).toBeCloseTo(0.1, 5)
      expect(res.body.events[1].x).toBeCloseTo(0.6, 5)
    })
  })

  describe('string-typed DB values are normalized to numbers', () => {
    test('converts string x/y/t from DB to numeric values', async () => {
      const db = createMockDb({
        roomMembers: [membership],
        events: [
          {
            id: 1,
            board_id: boardId,
            event_type: 'stroke:start',
            stroke_id: 's1',
            x: '0.25' as any,
            y: '0.75' as any,
            t: '1000' as any,
            segment_index: 0,
            source_id: null,
            color: '#000000',
            width: 2,
          },
          {
            id: 2,
            board_id: boardId,
            event_type: 'stroke:end',
            stroke_id: 's1',
            x: '0.50' as any,
            y: '0.90' as any,
            t: '1001' as any,
            segment_index: 1,
            source_id: null,
            color: '#000000',
            width: 2,
          },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)

      // String values must be converted to numbers
      const events = res.body.events
      expect(events.length).toBe(2)
      expect(typeof events[0].x).toBe('number')
      expect(typeof events[0].y).toBe('number')
      expect(events[0].x).toBeCloseTo(0.25, 5)
      expect(events[0].y).toBeCloseTo(0.75, 5)
      expect(typeof events[0].seq).toBe('number')
    })
  })

  describe('snapshot only returns events for the requested board', () => {
    test('does not leak events from other boards', async () => {
      const otherBoardId = '33333333-3333-4333-8333-333333333333'

      const db = createMockDb({
        roomMembers: [membership],
        events: [
          {
            id: 1,
            board_id: boardId,
            event_type: 'stroke:start',
            stroke_id: 's1',
            x: 0.1,
            y: 0.1,
            t: 1000,
            segment_index: 0,
            source_id: null,
            color: null,
            width: null,
          },
          {
            id: 2,
            board_id: otherBoardId,
            event_type: 'stroke:start',
            stroke_id: 's2',
            x: 0.9,
            y: 0.9,
            t: 2000,
            segment_index: 0,
            source_id: null,
            color: null,
            width: null,
          },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)
      expect(res.body.events.length).toBe(1)
      expect(res.body.events[0].boardId).toBe(boardId)
    })
  })

  describe('Excalidraw elements from Yjs document', () => {
    /** Helper: create a Y.Doc with Excalidraw elements and encode as Buffer */
    function encodeExcalidrawDoc(elements: Record<string, unknown>[]): Buffer {
      const doc = new Y.Doc()
      const map = doc.getMap('excalidraw')
      map.set('elements', elements)
      map.set('updatedAt', Date.now())
      const update = Y.encodeStateAsUpdate(doc)
      doc.destroy()
      return Buffer.from(update)
    }

    test('returns excalidrawElements when legacy events are empty', async () => {
      const elements = [
        {
          id: 'el-1',
          type: 'freedraw',
          x: 100,
          y: 50,
          width: 200,
          height: 150,
          strokeColor: '#ff0000',
          strokeWidth: 2,
          points: [[0, 0], [50, 30], [100, 10], [200, 150]],
          isDeleted: false,
        },
        {
          id: 'el-2',
          type: 'rectangle',
          x: 300,
          y: 100,
          width: 150,
          height: 80,
          strokeColor: '#0000ff',
          strokeWidth: 1,
          isDeleted: false,
        },
      ]

      const db = createMockDb({
        roomMembers: [membership],
        events: [],
        whiteboardDocuments: [
          { board_id: boardId, ydoc: encodeExcalidrawDoc(elements) },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)
      expect(res.body.events).toEqual([])

      // Should include excalidrawElements from the Yjs document
      expect(Array.isArray(res.body.excalidrawElements)).toBe(true)
      expect(res.body.excalidrawElements.length).toBe(2)

      const freedraw = res.body.excalidrawElements.find((e: any) => e.type === 'freedraw')
      expect(freedraw).toBeDefined()
      expect(freedraw.id).toBe('el-1')
      expect(freedraw.x).toBe(100)
      expect(freedraw.y).toBe(50)
      expect(freedraw.strokeColor).toBe('#ff0000')
      expect(Array.isArray(freedraw.points)).toBe(true)
      expect(freedraw.points.length).toBe(4)

      const rect = res.body.excalidrawElements.find((e: any) => e.type === 'rectangle')
      expect(rect).toBeDefined()
      expect(rect.id).toBe('el-2')
      expect(rect.width).toBe(150)
      expect(rect.height).toBe(80)
    })

    test('filters out deleted elements', async () => {
      const elements = [
        {
          id: 'visible',
          type: 'freedraw',
          x: 10,
          y: 20,
          width: 100,
          height: 50,
          strokeColor: '#000000',
          strokeWidth: 1,
          points: [[0, 0], [50, 25]],
          isDeleted: false,
        },
        {
          id: 'deleted',
          type: 'rectangle',
          x: 200,
          y: 100,
          width: 50,
          height: 50,
          isDeleted: true,
        },
      ]

      const db = createMockDb({
        roomMembers: [membership],
        events: [],
        whiteboardDocuments: [
          { board_id: boardId, ydoc: encodeExcalidrawDoc(elements) },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)
      expect(res.body.excalidrawElements.length).toBe(1)
      expect(res.body.excalidrawElements[0].id).toBe('visible')
    })

    test('does not include excalidrawElements when legacy events exist', async () => {
      const strokeEvents = makeStrokeEvents({
        boardId,
        strokeId: 'stroke-legacy',
        startId: 1,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.5, y: 0.6 },
        ],
      })

      const db = createMockDb({
        roomMembers: [membership],
        events: strokeEvents,
        whiteboardDocuments: [
          {
            board_id: boardId,
            ydoc: encodeExcalidrawDoc([
              { id: 'x', type: 'freedraw', x: 0, y: 0, width: 0, height: 0, points: [[0, 0], [1, 1]] },
            ]),
          },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)
      expect(res.body.events.length).toBe(2)
      // excalidrawElements should not be present when legacy events exist
      expect(res.body.excalidrawElements).toBeUndefined()
    })

    test('returns empty snapshot when both legacy events and Yjs doc are empty', async () => {
      const db = createMockDb({
        roomMembers: [membership],
        events: [],
        whiteboardDocuments: [
          { board_id: boardId, ydoc: encodeExcalidrawDoc([]) },
        ],
      })
      const app = createTestApp(db)

      const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
      expect(res.status).toBe(200)
      expect(res.body.events).toEqual([])
      expect(res.body.excalidrawElements).toBeUndefined()
    })
  })
})
