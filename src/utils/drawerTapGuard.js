// Shared props for the mobile navigation drawer's scrollable list. Scrolling the list (or tapping
// to stop a momentum scroll) must never be treated as a tap on a module. Only one drawer is open
// at a time, so a single gesture record is enough.
const gesture = { active: false, moved: false, x: 0, y: 0, scrollTop: 0, lastScrollAt: 0 }

export const drawerTapGuard = {
  onScroll: () => { gesture.lastScrollAt = Date.now() },
  onPointerDown: event => {
    if (event.pointerType === 'mouse') return
    Object.assign(gesture, { x: event.clientX, y: event.clientY, scrollTop: event.currentTarget.scrollTop, moved: false, active: true })
  },
  onPointerMove: event => {
    if (gesture.active && (Math.abs(event.clientX - gesture.x) > 6 || Math.abs(event.clientY - gesture.y) > 6)) gesture.moved = true
  },
  // The browser took the gesture over for scrolling.
  onPointerCancel: () => { gesture.moved = true },
  onClickCapture: event => {
    if (!gesture.active) return
    gesture.active = false
    const scrolled = Math.abs(event.currentTarget.scrollTop - gesture.scrollTop) > 1 || Date.now() - gesture.lastScrollAt < 350
    if (gesture.moved || scrolled) {
      event.preventDefault()
      event.stopPropagation()
    }
  },
}
