import { gsap } from 'gsap'

import { customEase, listEasing } from '../utils/animationUtils.js'
import { getLenis } from './lenis.js'

let navElementRef = null
let navListRef = null
let navIndicatorRef = null
let navItemsRef = []
let currentItemRef = null
let lockedItemRef = null
let navInitialized = false
let menuTimelineRef = null
let menuElementRef = null
let menuOpenTriggerRef = null
let menuCloseTriggerRef = null
let menuOpen = false
let restoreFocusOnMenuHide = false
let wasTabletAndBelow = null
let navScrollHideInitialized = false
let navHidden = false
let navScrollLocked = false
let lastScrollY = 0
let scrollIntent = 0

const TABLET_MAX_WIDTH = 991
const NAV_FADE_DURATION = 0.35
const NAV_HIDE_MIN_Y = 72
const NAV_HIDE_DELTA = 10
const NAV_SHOW_DELTA = 2

export function initNavIndicator() {
  // Si le DOM a été remplacé (Barba), réinitialiser les références
  if (navElementRef && !document.contains(navElementRef)) {
    navElementRef = null
    navListRef = null
    navIndicatorRef = null
    navItemsRef = []
    currentItemRef = null
    lockedItemRef = null
    navInitialized = false
  }

  navElementRef = document.querySelector('.nav')
  if (!navElementRef) return

  navListRef = navElementRef.querySelector('.nav_list')
  navIndicatorRef = navElementRef.querySelector('.nav_indicator')
  if (!navListRef || !navIndicatorRef) return

  navItemsRef = Array.from(navListRef.querySelectorAll('.nav_list_item'))
  if (navItemsRef.length === 0) return

  if (navInitialized) {
    currentItemRef = lockedItemRef || getDefaultItem()
    if (currentItemRef) moveIndicatorToItem(currentItemRef, false)
    return
  }

  navInitialized = true
  currentItemRef = getDefaultItem()
  if (currentItemRef) moveIndicatorToItem(currentItemRef, false)

  navItemsRef.forEach((item) => {
    item.addEventListener('mouseenter', () => handleEnter(item))
    item.addEventListener('focusin', () => handleEnter(item))

    const link = item.querySelector('.navlink')
    if (link) {
      link.addEventListener('click', () => {
        lockIndicatorOnItem(item)
      })
    }
  })

  navElementRef.addEventListener('mouseleave', () => {
    if (lockedItemRef) return
    currentItemRef = getDefaultItem()
    if (currentItemRef) moveIndicatorToItem(currentItemRef)
  })

  navElementRef.addEventListener('focusout', (e) => {
    if (lockedItemRef) return
    if (!navElementRef.contains(e.relatedTarget)) {
      currentItemRef = getDefaultItem()
      if (currentItemRef) moveIndicatorToItem(currentItemRef)
    }
  })

  window.addEventListener('resize', () => {
    const isTabletNow = isTabletAndBelow()
    if (wasTabletAndBelow === null) {
      wasTabletAndBelow = isTabletNow
    }
    // Si on change de breakpoint et qu'aucun item n'est verrouillé, recalcule le défaut
    if (!lockedItemRef && wasTabletAndBelow !== isTabletNow) {
      currentItemRef = getDefaultItem()
      wasTabletAndBelow = isTabletNow
    }
    const target = lockedItemRef || currentItemRef || getDefaultItem()
    if (target) moveIndicatorToItem(target, false)
  })
}

export function setNavIndicatorTransitionState(isFront) {
  const indicator = resolveNavIndicator()
  if (!indicator) return

  if (isFront) {
    if (!indicator.dataset.prevZindex) {
      indicator.dataset.prevZindex = indicator.style.zIndex || ''
    }
    indicator.style.zIndex = '9999'
    return
  }

  if (indicator.dataset.prevZindex !== undefined) {
    indicator.style.zIndex = indicator.dataset.prevZindex
    delete indicator.dataset.prevZindex
  } else {
    indicator.style.removeProperty('z-index')
  }
}

export function unlockNavIndicator() {
  if (!navElementRef) return
  lockedItemRef = null
  navElementRef.removeAttribute('data-nav-indicator-locked')
  currentItemRef = getDefaultItem()
  if (currentItemRef) moveIndicatorToItem(currentItemRef, false)
}

function handleEnter(item) {
  if (!item || lockedItemRef) return
  currentItemRef = item
  moveIndicatorToItem(item)
}

function lockIndicatorOnItem(item) {
  if (!item) return
  lockedItemRef = item
  currentItemRef = item
  if (navElementRef) {
    navElementRef.setAttribute('data-nav-indicator-locked', 'true')
  }
  moveIndicatorToItem(item, false)
}

function moveIndicatorToItem(targetItem, animate = true, tweenVars = {}) {
  if (!targetItem || !navListRef || !navIndicatorRef) return
  const listRect = navListRef.getBoundingClientRect()
  const itemRect = targetItem.getBoundingClientRect()
  const translateYPx = itemRect.top - listRect.top
  if (animate) {
    gsap.to(navIndicatorRef, {
      y: translateYPx,
      duration: 0.3,
      ease: customEase,
      overwrite: 'auto',
      ...tweenVars,
    })
  } else {
    gsap.set(navIndicatorRef, { y: translateYPx })
  }
}

function findItemForPath(path) {
  if (isTabletAndBelow()) return getDefaultItem()
  return (
    navItemsRef.find((item) => {
      const link = item.querySelector('a.navlink')
      return link && normalizeHrefPath(link.getAttribute('href')) === path
    }) || null
  )
}

/**
 * Début d'une transition Barba (hors menu mobile) : verrouille l'indicateur
 * sur le lien de la page suivante, quel que soit le lien cliqué (navbar ou
 * footer). Il est ensuite déplacé au démarrage du clip :
 * - navbar visible : il glisse en même temps (animateNavIndicatorToTarget)
 * - navbar masquée : il est placé directement et la navbar est révélée dans
 *   le clip de la page suivante (revealNavbarThroughClip)
 * Retourne true si la navbar est masquée.
 */
export function prepareNavForTransition(nextHref) {
  const wasHidden = navHidden
  if (!navElementRef || !navListRef || !navIndicatorRef) return wasHidden

  const target = findItemForPath(normalizeHrefPath(nextHref))
  if (!target) return wasHidden

  lockedItemRef = target
  currentItemRef = target
  navElementRef.setAttribute('data-nav-indicator-locked', 'true')
  return wasHidden
}

export function animateNavIndicatorToTarget(tweenVars) {
  if (lockedItemRef) moveIndicatorToItem(lockedItemRef, true, tweenVars)
}

/**
 * Affiche la navbar découpée par le rectangle SVG de la transition, pour
 * qu'elle apparaisse avec la page suivante au lieu de surgir après.
 * Retourne une fonction qui arrête le suivi et retire le découpage.
 */
export function revealNavbarThroughClip(clipRect) {
  const navbar = document.querySelector('.navbar')
  if (!navbar || !clipRect) return () => {}

  navHidden = false
  gsap.killTweensOf(navbar)
  navbar.classList.remove('is-scroll-hidden')

  // Le rectangle est en coordonnées viewport (clip userSpaceOnUse sur un
  // calque fixe plein écran), comme la navbar fixe
  const syncClip = () => {
    const rect = navbar.getBoundingClientRect()
    const x = parseFloat(clipRect.getAttribute('x')) || 0
    const y = parseFloat(clipRect.getAttribute('y')) || 0
    const width = parseFloat(clipRect.getAttribute('width')) || 0
    const height = parseFloat(clipRect.getAttribute('height')) || 0
    navbar.style.clipPath = `inset(${y - rect.top}px ${
      rect.right - (x + width)
    }px ${rect.bottom - (y + height)}px ${x - rect.left}px)`
  }

  gsap.set(navbar, { display: 'flex', visibility: 'visible', opacity: 1 })
  // Positions lisibles seulement maintenant que la navbar est affichée
  if (lockedItemRef) moveIndicatorToItem(lockedItemRef, false)
  syncClip()
  gsap.ticker.add(syncClip)

  return () => {
    gsap.ticker.remove(syncClip)
    navbar.style.removeProperty('clip-path')
  }
}

function getDefaultItem() {
  if (!navElementRef) return null

  if (isTabletAndBelow()) {
    const menuButton = document.querySelector('#menu-button')
    if (menuButton) return menuButton
  }

  const currentLink = navElementRef.querySelector('.navlink.w--current')
  if (currentLink) {
    const li = currentLink.closest('.nav_list_item')
    if (li) return li
  }
  return navItemsRef[0] || null
}

function resolveNavIndicator() {
  if (navIndicatorRef && document.contains(navIndicatorRef)) {
    return navIndicatorRef
  }
  navIndicatorRef = document.querySelector('.nav_indicator')
  return navIndicatorRef
}

export function isTabletAndBelow() {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(max-width: ${TABLET_MAX_WIDTH}px)`).matches
  }
  return window.innerWidth <= TABLET_MAX_WIDTH
}

function hideMenuElement() {
  if (menuElementRef) gsap.set(menuElementRef, { display: 'none' })
  if (!restoreFocusOnMenuHide) return
  restoreFocusOnMenuHide = false
  // Rendre le focus au bouton Menu seulement s'il était resté dans le menu
  // (après une transition Barba, il est déjà sur le titre de la nouvelle page)
  const active = document.activeElement
  if (!active || active === document.body || menuElementRef?.contains(active)) {
    menuOpenTriggerRef?.focus({ preventScroll: true })
  }
}

function setMenuOpenState(open) {
  menuOpen = open
  menuOpenTriggerRef?.setAttribute('aria-expanded', String(open))
  if (open) restoreFocusOnMenuHide = true
}

function getMenuFocusables() {
  if (!menuElementRef) return []
  return Array.from(
    menuElementRef.querySelectorAll('a[href], button:not([disabled])')
  ).filter((el) => el.getClientRects().length > 0)
}

function handleMenuKeydown(event) {
  if (!menuOpen || !menuTimelineRef) return

  if (event.key === 'Escape') {
    event.preventDefault()
    setMenuOpenState(false)
    menuTimelineRef.reverse()
    return
  }

  if (event.key !== 'Tab') return
  // Garder le focus dans le menu tant qu'il est ouvert
  const focusables = getMenuFocusables()
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!menuElementRef.contains(active)) {
    event.preventDefault()
    first.focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

export function isNavMenuOpen() {
  return Boolean(menuTimelineRef && menuTimelineRef.progress() > 0.01)
}

export function shouldUseMobileMenuTransition(trigger) {
  if (!isTabletAndBelow() || !isNavMenuOpen()) return false
  if (!trigger || typeof trigger === 'string') return false
  if (!(trigger instanceof Element)) return false
  return Boolean(
    trigger.closest('.nav__mobile__link') ||
      trigger.closest('.menu a.nav-logo_link')
  )
}

export function closeNavMenu() {
  return new Promise((resolve) => {
    const timeline = menuTimelineRef
    if (!timeline || timeline.progress() === 0) {
      hideMenuElement()
      resolve()
      return
    }

    setMenuOpenState(false)
    timeline.eventCallback('onReverseComplete', () => {
      hideMenuElement()
      timeline.eventCallback('onReverseComplete', hideMenuElement)
      resolve()
    })
    timeline.reverse()
  })
}

export function setNavScrollLock(locked) {
  navScrollLocked = Boolean(locked)
  if (!navScrollLocked) showNavbarImmediate()
}

export function showNavbarImmediate() {
  const navbar = document.querySelector('.navbar')
  if (!navbar) return
  navHidden = false
  gsap.killTweensOf(navbar)
  navbar.classList.remove('is-scroll-hidden')
  gsap.set(navbar, { display: 'flex', visibility: 'visible', opacity: 1 })
}

function hideNavbar() {
  const navbar = document.querySelector('.navbar')
  if (!navbar || navHidden || navScrollLocked || isNavMenuOpen()) return
  navHidden = true
  gsap.killTweensOf(navbar)
  gsap.to(navbar, {
    opacity: 0,
    duration: NAV_FADE_DURATION,
    ease: 'power2.out',
    onComplete: () => {
      if (!navHidden) return
      navbar.classList.add('is-scroll-hidden')
      gsap.set(navbar, { display: 'none' })
    },
  })
}

function showNavbar() {
  const navbar = document.querySelector('.navbar')
  if (!navbar || !navHidden) return
  navHidden = false
  gsap.killTweensOf(navbar)
  navbar.classList.remove('is-scroll-hidden')
  gsap.set(navbar, { display: 'flex', visibility: 'visible' })
  gsap.fromTo(
    navbar,
    { opacity: 0 },
    { opacity: 1, duration: NAV_FADE_DURATION, ease: 'power2.out' }
  )
}

function normalizeHrefPath(href) {
  if (!href || href === '#') return ''
  try {
    const path = new URL(href, window.location.origin).pathname
    const stripped = path
      .replace(/\/index\.html$/i, '/')
      .replace(/\.html$/i, '')
      .replace(/\/+$/, '')
    return stripped || '/'
  } catch (error) {
    return href
  }
}

function onNavScroll(y) {
  if (navScrollLocked || isNavMenuOpen()) {
    lastScrollY = y
    scrollIntent = 0
    if (isNavMenuOpen()) showNavbarImmediate()
    return
  }

  if (y <= NAV_HIDE_MIN_Y) {
    if (navHidden) showNavbar()
    lastScrollY = y
    scrollIntent = 0
    return
  }

  const delta = y - lastScrollY
  lastScrollY = y
  if (delta === 0) return

  if (scrollIntent !== 0 && Math.sign(delta) !== Math.sign(scrollIntent)) {
    scrollIntent = 0
  }
  scrollIntent += delta

  if (scrollIntent > NAV_HIDE_DELTA) {
    hideNavbar()
    scrollIntent = 0
  } else if (scrollIntent < -NAV_SHOW_DELTA) {
    showNavbar()
    scrollIntent = 0
  }
}

export function initNavScrollHide() {
  showNavbarImmediate()
  lastScrollY = window.scrollY || 0
  if (navScrollHideInitialized) return

  const navbar = document.querySelector('.navbar')
  if (!navbar) return
  navScrollHideInitialized = true

  const lenis = getLenis()
  if (lenis && typeof lenis.on === 'function') {
    lenis.on('scroll', (event) => {
      const y =
        typeof event?.scroll === 'number' ? event.scroll : window.scrollY
      onNavScroll(y)
    })
    return
  }

  window.addEventListener(
    'scroll',
    () => onNavScroll(window.scrollY || window.pageYOffset || 0),
    { passive: true }
  )
}

export function initNavMenuToggle() {
  const menuElement = document.querySelector('.menu')
  const openTrigger = document.querySelector('#menu-button')
  const closeTrigger = document.querySelector('.navlink.menu-close')
  const mobileNavLinks = menuElement?.querySelectorAll('.nav__mobile__link')
  if (!menuElement || !openTrigger || !closeTrigger) return

  if (menuTimelineRef) return

  menuElementRef = menuElement
  menuOpenTriggerRef = openTrigger
  menuCloseTriggerRef = closeTrigger
  gsap.set(menuElement, { width: '0%', display: 'none' })

  if (!menuElement.id) menuElement.id = 'site-menu'
  openTrigger.setAttribute('aria-controls', menuElement.id)
  openTrigger.setAttribute('aria-expanded', 'false')

  const timeline = gsap.timeline({
    paused: true,
    defaults: { duration: 1.2, ease: listEasing },
  })

  timeline.to(menuElement, {
    width: '100%',
    onStart: () => {
      gsap.set(menuElement, { display: 'block' })
      menuCloseTriggerRef?.focus({ preventScroll: true })
    },
  })

  timeline.eventCallback('onReverseComplete', hideMenuElement)

  const handleOpen = (event) => {
    event?.preventDefault()
    showNavbarImmediate()
    setMenuOpenState(true)
    timeline.play()
  }

  const handleClose = (event) => {
    event?.preventDefault()
    setMenuOpenState(false)
    timeline.reverse()
  }

  const handleMobileLinkClick = (event) => {
    if (!isTabletAndBelow()) return
    const href = event.currentTarget.getAttribute('href')
    const nextPath = normalizeHrefPath(href)
    const currentPath = normalizeHrefPath(window.location.pathname || '/')
    if (!nextPath || nextPath === currentPath) {
      event.preventDefault()
      setMenuOpenState(false)
      timeline.reverse()
    }
  }

  openTrigger.addEventListener('click', handleOpen)
  document.addEventListener('keydown', handleMenuKeydown)
  closeTrigger.addEventListener('click', handleClose)
  mobileNavLinks.forEach((link) => {
    link.addEventListener('click', handleMobileLinkClick)
  })

  menuTimelineRef = timeline
}
