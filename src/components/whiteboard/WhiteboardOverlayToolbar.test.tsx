import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WhiteboardOverlayToolbar from './WhiteboardOverlayToolbar'

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: () => <div data-testid="qr-code" />,
}))

const advanceIdle = () => {
  act(() => {
    vi.advanceTimersByTime(2600)
  })
}

describe('WhiteboardOverlayToolbar', () => {
  it('shows on interaction and auto-hides after idle', () => {
    vi.useFakeTimers()
    render(
      <WhiteboardOverlayToolbar boardId="room-1">
        <div data-testid="canvas" />
      </WhiteboardOverlayToolbar>,
    )

    const container = screen.getByTestId('whiteboard-overlay-container')
    const toolbar = screen.getByTestId('whiteboard-overlay-toolbar')

    expect(toolbar).toHaveAttribute('data-state', 'hidden')

    fireEvent.pointerMove(container)
    expect(toolbar).toHaveAttribute('data-state', 'visible')

    advanceIdle()
    expect(toolbar).toHaveAttribute('data-state', 'hidden')

    vi.useRealTimers()
  })

  it('stays visible while the QR dialog is open', () => {
    vi.useFakeTimers()
    render(
      <WhiteboardOverlayToolbar boardId="room-2">
        <div data-testid="canvas" />
      </WhiteboardOverlayToolbar>,
    )

    const container = screen.getByTestId('whiteboard-overlay-container')
    const toolbar = screen.getByTestId('whiteboard-overlay-toolbar')

    fireEvent.pointerMove(container)
    const padButton = screen.getByRole('button', { name: /pad/i })
    fireEvent.click(padButton)

    expect(screen.getByRole('dialog', { name: /pad mode/i })).toBeInTheDocument()

    advanceIdle()
    expect(toolbar).toHaveAttribute('data-state', 'visible')

    vi.useRealTimers()
  })
})
