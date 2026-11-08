/**
 * jsdom implements neither PointerEvent nor pointer capture, so component
 * tests dispatch this minimal stand-in. It carries the three fields the pan
 * hook reads — pointerId, pointerType and clientX — and nothing else.
 */
export class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string

  constructor(
    type: string,
    init: { clientX?: number; pointerType?: string; pointerId?: number; button?: number } = {},
  ) {
    super(type, { clientX: init.clientX, button: init.button ?? 0, bubbles: true, cancelable: true })
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'touch'
  }
}

/** Press on the chart itself; the hook listens for this on each pan element. */
export function pointerDown(target: EventTarget, clientX: number, pointerType = 'touch'): void {
  target.dispatchEvent(new TestPointerEvent('pointerdown', { clientX, pointerType }))
}

/** Movement and release are listened for on the window, so a drag survives
 *  leaving the chart. */
export function pointerMove(clientX: number, pointerType = 'touch'): void {
  window.dispatchEvent(new TestPointerEvent('pointermove', { clientX, pointerType }))
}

export function pointerUp(clientX = 0, pointerType = 'touch'): void {
  window.dispatchEvent(new TestPointerEvent('pointerup', { clientX, pointerType }))
}

/** jsdom reports every element as zero-width; a pan needs a real one. */
export function withClientWidth<T extends HTMLElement>(element: T, width: number): T {
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true })
  return element
}
