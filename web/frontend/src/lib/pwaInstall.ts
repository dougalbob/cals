export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Listener = (event: InstallPromptEvent | null) => void

let capturedPrompt: InstallPromptEvent | null = null
let captureStarted = false
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener(capturedPrompt)
}

/** Capture the browser's one-shot install prompt for the app's whole lifetime. */
export function startInstallPromptCapture(): void {
  if (typeof window === 'undefined' || captureStarted) return
  captureStarted = true
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    capturedPrompt = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    capturedPrompt = null
    notify()
  })
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return capturedPrompt
}

export function subscribeToInstallPrompt(listener: Listener): () => void {
  listeners.add(listener)
  listener(capturedPrompt)
  return () => listeners.delete(listener)
}
