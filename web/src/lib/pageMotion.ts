import { flushSync } from 'react-dom'

let active: ViewTransition | undefined
let request = 0

export function transitionPage(update: () => void) {
  const id = ++request
  active?.skipTransition()

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }

  if (typeof document.startViewTransition !== 'function') {
    flushSync(update)
    document.querySelector('[data-page-motion]')?.animate(
      [{ opacity: .55, translate: '0 14px' }, { opacity: 1, translate: '0 0' }],
      { duration: 340, easing: 'cubic-bezier(.22,.7,.25,1)' },
    )
    return
  }

  const transition = document.startViewTransition(() => {
    if (id === request) flushSync(update)
  })
  active = transition
  void transition.ready.catch(() => {
    // A newer navigation, a background tab, or the browser may skip the animation.
  })
  const clear = () => { if (active === transition) active = undefined }
  void transition.finished.then(clear, clear)
}
