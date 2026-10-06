import barba from '@barba/core'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import {
  initDecorativeMedia,
  initExternalLinks,
} from '../utils/accessibility.js'
import { listEasing } from '../utils/animationUtils.js'
import { initScrollChapters } from '../utils/scrollCounter.js'
import { initAboutUs } from './aboutus.js'
import { initCareers } from './careers.js'
import { initCompanies } from './companies.js'
import {
  initHeadingReveals,
  prepareHeadingReveals,
  revealHeading,
} from './headingReveal.js'
import { initHero } from './hero.js'
import { initHomeAbout } from './homeAbout.js'
import { initLenis, getLenis } from './lenis.js'
import { mountIntroLoader, playIntroLoader } from './loader.js'
import {
  animateNavIndicatorToTarget,
  closeNavMenu,
  initNavIndicator,
  initNavMenuToggle,
  initNavScrollHide,
  prepareNavForTransition,
  revealNavbarThroughClip,
  setNavIndicatorTransitionState,
  setNavScrollLock,
  shouldUseMobileMenuTransition,
  unlockNavIndicator,
} from './nav.js'
import { initSocialImpact } from './socialImpact.js'
import { initStickyParagraph } from './stickyParagraph.js'

gsap.registerPlugin(ScrollTrigger)

const animationModules = [
  initNavIndicator,
  initNavMenuToggle,
  initNavScrollHide,
  initHero,
  initHomeAbout,
  initStickyParagraph,
  initScrollChapters,
  initCareers,
  initAboutUs,
  initCompanies,
  initSocialImpact,
  initExternalLinks,
  initDecorativeMedia,
  initHeadingReveals,
]

const hasBrowserEnv =
  typeof window !== 'undefined' && typeof document !== 'undefined'

let hasBootstrapped = false
let listenersAttached = false
let transitionsReady = false
let skipNextAfterEnterHydration = false
// Navbar masquée au clic : à révéler dans le clip de la page suivante
let revealNavInClip = false

export function initPageTransitions() {
  if (!hasBrowserEnv || hasBootstrapped) return

  const start = () => {
    hasBootstrapped = true
    ensureManualScrollRestoration()
    attachLoadListener()
    // Loader monté avant l'hydratation : les animations d'entrée l'attendent
    const hasIntroLoader = mountIntroLoader()
    hydratePage({ reason: 'initial' })
    initBarbaRouter()
    if (hasIntroLoader) {
      const container = document.querySelector('[data-barba="container"]')
      // Les ScrollTriggers ont été créés avant que la page passe dans le
      // calque de la révélation : on les recalcule une fois revenue en place
      playIntroLoader(() =>
        revealContainerThroughClip(container, { revealNavbar: true }).then(() =>
          ScrollTrigger.refresh()
        )
      )
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
}
function ensureManualScrollRestoration() {
  if (typeof window === 'undefined') return
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }
}
function attachLoadListener() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  window.addEventListener('load', () => {})
}

function hydratePage({ reason, next } = {}) {
  setNavIndicatorTransitionState(false)
  syncCurrentNavLink(next)
  unlockNavIndicator()
  resumeSmoothScroll()

  // Lors d'une transition Barba, on doit attendre que le DOM soit prêt
  // avant de créer les ScrollTriggers
  if (reason === 'barba') {
    // Nettoyer la mémoire de scroll de GSAP pour éviter les conflits
    ScrollTrigger.clearScrollMemory()

    // Délai pour laisser le DOM se stabiliser après la transition
    setTimeout(() => {
      // Resize Lenis pour qu'il recalcule les dimensions
      const lenis = getLenis()
      if (lenis && typeof lenis.resize === 'function') {
        lenis.resize()
      }

      // Initialiser les animations
      runAnimationModules(reason)

      // Rafraîchir ScrollTrigger après la création des triggers
      requestAnimationFrame(() => {
        ScrollTrigger.refresh(true)
      })
    }, 100)
  } else {
    runAnimationModules(reason)
    requestAnimationFrame(() => {
      ScrollTrigger.refresh()
      requestAnimationFrame(() => {
        ScrollTrigger.refresh()
      })
    })
  }
}

function resumeSmoothScroll() {
  const lenis = initLenis()
  if (lenis && typeof lenis.start === 'function') {
    lenis.start()
    resetScrollTopImmediate()
  }
  return lenis
}

function pauseSmoothScroll() {
  const lenis = getLenis()
  if (lenis && typeof lenis.stop === 'function') {
    lenis.stop()
  }
}

function runAnimationModules(reason) {
  animationModules.forEach((initFn) => {
    try {
      initFn()
    } catch (error) {
      console.error(
        `[pageTransitions] Échec de ${initFn.name} pendant ${reason || 'init'}`,
        error
      )
    }
  })
}

function initBarbaRouter() {
  if (transitionsReady) return

  if (!hasBarbaMarkup()) {
    console.warn(
      'BarbaJS: aucun attribut data-barba détecté. Ajoutez-les dans Webflow pour activer les transitions.'
    )
    return
  }

  skipNextAfterEnterHydration = true
  registerBarbaHooks()

  barba.init({
    preventRunning: true,
    timeout: 7000,
    transitions: [createMobileMenuTransition(), createFadeTransition()],
  })

  attachNavigationClickGuard()
  transitionsReady = true
}

// Entre le clic et le démarrage effectif de la transition, Barba a déjà poussé
// la nouvelle URL mais n'est pas encore "running" : un second clic (double-clic,
// autre lien) passe alors à travers `preventRunning` et déclenche soit une
// transition concurrente, soit un rechargement natif ("même URL").
// On bloque donc tout clic de lien tant qu'une navigation Barba est en cours.
function attachNavigationClickGuard() {
  let navigationInFlight = false
  let hrefBeforeClick = null

  // Capture : passe avant le listener de Barba
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target?.closest?.('a[href]')
      if (!link) return
      if (navigationInFlight) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      // Lien vers la page active : ne rien faire (Barba l'ignore et le
      // navigateur rechargerait la page). Pas de stopPropagation pour que le
      // menu mobile puisse encore se fermer.
      if (isLinkToCurrentPage(link, event)) {
        event.preventDefault()
        return
      }
      hrefBeforeClick = currentPageUrl()
    },
    true
  )

  // Bubble, enregistré après barba.init : si Barba a pris le clic en charge,
  // il a déjà fait son pushState de façon synchrone
  document.addEventListener('click', () => {
    if (hrefBeforeClick && currentPageUrl() !== hrefBeforeClick) {
      navigationInFlight = true
    }
    hrefBeforeClick = null
  })

  barba.hooks.after(() => {
    navigationInFlight = false
  })
}

function isLinkToCurrentPage(link, event) {
  if (event.button > 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false
  }
  if (link.target === '_blank' || link.hasAttribute('download')) return false
  let url
  try {
    url = new URL(link.href, window.location.href)
  } catch (error) {
    return false
  }
  if (url.origin !== window.location.origin) return false
  // Une vraie ancre (#section) doit rester fonctionnelle
  if (url.hash && url.hash !== '#') return false
  return (
    normalizePath(url.pathname) === normalizePath(window.location.pathname) &&
    url.search === window.location.search
  )
}

// URL sans le hash : un lien d'ancre ne déclenche pas de transition Barba
function currentPageUrl() {
  return window.location.href.split('#')[0]
}

function hasBarbaMarkup() {
  if (!hasBrowserEnv) return false
  const wrapper = document.querySelector('[data-barba="wrapper"]')
  const container = document.querySelector('[data-barba="container"]')
  return Boolean(wrapper && container)
}

function registerBarbaHooks() {
  barba.hooks.beforeLeave((data) => {
    revealNavInClip = false
    if (!shouldUseMobileMenuTransition(data?.trigger)) {
      setNavIndicatorTransitionState(true)
      revealNavInClip = prepareNavForTransition(data?.next?.url?.href)
    }
    setNavScrollLock(true)
    pauseSmoothScroll()
    disableScrollTriggersKeepState()
  })

  barba.hooks.afterLeave(({ next }) => {
    killScrollTriggers()
    removePrefetchLinks(next?.container)
  })

  barba.hooks.beforeEnter(({ next }) => {
    updateBodyNamespace(next)
  })

  barba.hooks.afterEnter((data) => {
    if (skipNextAfterEnterHydration) {
      skipNextAfterEnterHydration = false
      setNavScrollLock(false)
      return
    }
    hydratePage({ reason: 'barba', next: data?.next })
    focusPageHeading(data?.next?.container)
    if (!shouldUseMobileMenuTransition(data?.trigger)) {
      setNavScrollLock(false)
    }
  })
}

// Webflow ajoute des <link rel="prefetch"> à côté des liens. Réinsérés à chaque
// transition, ils relancent des requêtes inutiles (Barba précharge déjà au
// survol) qui sont ensuite annulées quand le container est retiré
// (net::ERR_ABORTED). On les retire du container avant son insertion.
function removePrefetchLinks(container) {
  if (!container) return
  container
    .querySelectorAll('link[rel="prefetch"]')
    .forEach((link) => link.remove())
}

// Après une transition, le focus resterait sur le lien cliqué (déjà retiré du
// DOM) : on le place sur le titre de la nouvelle page pour que les lecteurs
// d'écran annoncent le changement et que la tabulation reparte du haut.
function focusPageHeading(container) {
  if (!container) return
  const heading = container.querySelector('h1') || container
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1')
    heading.dataset.focusTarget = 'true'
  }
  heading.focus({ preventScroll: true })
}

function killScrollTriggers() {
  ScrollTrigger.getAll().forEach((trigger) => {
    try {
      if (trigger.animation) trigger.animation.kill()
      trigger.kill()
    } catch (error) {
      // GSAP peut throw si un tween scrub a déjà été détruit
    }
  })
}

function disableScrollTriggersKeepState() {
  ScrollTrigger.getAll().forEach((trigger) => trigger.disable(false))
}

function updateBodyNamespace(next) {
  if (!next || !next.namespace || !hasBrowserEnv) return
  document.body.setAttribute('data-barba-namespace', next.namespace)
}

function syncCurrentNavLink(next) {
  if (!hasBrowserEnv) return
  const navLinks = document.querySelectorAll('.navlink')
  if (navLinks.length === 0) return

  const targetPath = resolveTargetPath(next)
  let activeApplied = false

  navLinks.forEach((link) => {
    link.classList.remove('w--current')
    if (activeApplied) return

    const hrefPath = resolvePathname(link.getAttribute('href'))
    if (hrefPath === targetPath) {
      link.classList.add('w--current')
      activeApplied = true
    }
  })
}

function resolveTargetPath(next) {
  if (next?.url?.path) return normalizePath(next.url.path)
  if (next?.url?.href) return resolvePathname(next.url.href)
  if (hasBrowserEnv) {
    return normalizePath(window.location.pathname || '/')
  }
  return '/'
}

function resolvePathname(href) {
  if (!href) return '/'
  try {
    const base = hasBrowserEnv
      ? window.location.origin
      : 'https://placeholder.local'
    const url = new URL(href, base)
    return normalizePath(url.pathname)
  } catch (error) {
    if (href.startsWith('/')) {
      return normalizePath(href)
    }
    return normalizePath(`/${href}`)
  }
}

function normalizePath(path) {
  if (!path) return '/'
  const clean = path.split('?')[0].split('#')[0] || '/'
  const withLeadingSlash = clean.startsWith('/') ? clean : `/${clean}`
  const trimmed = withLeadingSlash.replace(/\/+$/, '')
  return trimmed || '/'
}

function createMobileMenuTransition() {
  return {
    name: 'mobile-menu-behind',
    custom: ({ trigger }) => shouldUseMobileMenuTransition(trigger),
    // Pas de `sync: true` : sinon Barba attend la requête de la page suivante
    // avant de marquer la transition comme "running", et un second clic (ou un
    // double-clic) pendant ce délai lance une transition concurrente qui casse
    // le DOM et force un rechargement complet.
    leave({ current }) {
      if (current?.container) {
        gsap.set(current.container, { display: 'none' })
      }
    },
    enter({ next }) {
      if (next?.container) {
        gsap.set(next.container, { opacity: 1, visibility: 'visible' })
      }
      resetScrollTopImmediate()
    },
    after() {
      // Ne pas attendre la fermeture du menu : tant que la transition n'est pas
      // terminée, Barba ignore les clics. Si le menu est rouvert pendant sa
      // fermeture, celle-ci ne se termine jamais et plus aucun lien ne
      // fonctionnait.
      closeNavMenu().then(() => setNavScrollLock(false))
    },
  }
}

function createFadeTransition() {
  return {
    name: 'transition-overlay',
    async leave({ next }) {
      await ensureNextIsReady(next)
      const { transitionEl, clipRect } = getOrCreateTransitionElementsFromDOM()
      const { start, viewportW, viewportH } = computeClipTargets()
      gsap.set(transitionEl, {
        display: 'none',
        width: `${viewportW}px`,
        height: `${viewportH}px`,
        justifyContent: 'center',
        alignItems: 'center',
      })
      gsap.set(clipRect, { attr: start })
    },
    async enter({ next }) {
      if (!next || !next.container) return
      const revealNavbar = revealNavInClip
      revealNavInClip = false
      await revealContainerThroughClip(next.container, { revealNavbar })
    },
  }
}

/**
 * Révèle un container dans le rectangle SVG qui s'ouvre depuis le centre
 * (petit cadre puis plein écran), avec le clone de l'image du hero qui prend
 * sa place et les textes du hero qui glissent. Utilisé par la transition de
 * page et par le loader d'accueil.
 * revealNavbar : la navbar est masquée et apparaît dans le clip ; sinon
 * l'indicateur glisse vers le lien de la page pendant l'ouverture.
 */
export async function revealContainerThroughClip(
  nextContainer,
  { revealNavbar = false } = {}
) {
  const wrapper = document.querySelector('[data-barba="wrapper"]')
  if (!wrapper || !nextContainer) return

  const { transitionEl, transitionInner, clipRect, clipId, defsSvg } =
    getOrCreateTransitionElementsFromDOM(wrapper)
  const { start, mid, end, viewportW, viewportH } = computeClipTargets()

  const pageWrap =
    nextContainer.querySelector('.page-wrap') || nextContainer || wrapper
  const pageContent =
    pageWrap.querySelector('.page-content') || nextContainer || pageWrap

  // Préparer un clone du hero de la page cible
  const heroImg = pageContent.querySelector('.section_hero .hero-img_img')
  const heroRect = heroImg ? heroImg.getBoundingClientRect() : null
  const rootFontSize =
    parseFloat(
      window.getComputedStyle(document.documentElement).fontSize || '16'
    ) || 16
  const cloneWpx = 40 * rootFontSize
  const cloneHpx = 25 * rootFontSize
  let heroClone = null
  if (heroImg && heroRect) {
    heroClone = heroImg.cloneNode(true)
    const cloneStyle = heroClone.style
    cloneStyle.position = 'absolute'
    cloneStyle.top = '50%'
    cloneStyle.left = '50%'
    cloneStyle.transformOrigin = '50% 50%'
    cloneStyle.objectFit = 'cover'
    cloneStyle.pointerEvents = 'none'
    cloneStyle.zIndex = '2'
    cloneStyle.maxWidth = 'none'
    cloneStyle.maxHeight = 'none'
    cloneStyle.minWidth = `${cloneWpx}px`
    cloneStyle.minHeight = `${cloneHpx}px`
    cloneStyle.setProperty('width', `${cloneWpx}px`, 'important')
    cloneStyle.setProperty('height', `${cloneHpx}px`, 'important')
    heroClone.dataset.heroDistanceTop = `${heroRect.top || 0}`
    heroClone.dataset.heroHeight = `${heroRect.height || 0}`
    gsap.set(heroClone, { xPercent: -50, yPercent: -50 })
  }

  const eyebrows = Array.from(
    pageContent.querySelectorAll('.hero_content .eyebrow-wrap')
  )
  if (eyebrows.length) {
    gsap.set(eyebrows, { yPercent: 400 })
  }

  // Cacher les titres avant la révélation ; celui du hero glisse avec les
  // eyebrows, les autres au scroll (initHeadingReveals)
  prepareHeadingReveals(nextContainer)
  const heroHeading = pageContent.querySelector('.section_hero h1')

  const placeholder = document.createElement('div')
  pageContent.parentNode.insertBefore(placeholder, pageContent)

  if (!transitionEl.contains(transitionInner)) {
    transitionEl.appendChild(transitionInner)
  }
  if (defsSvg) {
    defsSvg.setAttribute('width', `${viewportW}`)
    defsSvg.setAttribute('height', `${viewportH}`)
    defsSvg.setAttribute('viewBox', `0 0 ${viewportW} ${viewportH}`)
  }

  const maskWrapper = document.createElement('div')
  maskWrapper.className = 'transition_mask-wrapper'
  Object.assign(maskWrapper.style, {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
    clipPath: `url(#${clipId})`,
    WebkitClipPath: `url(#${clipId})`,
  })

  maskWrapper.appendChild(pageContent)
  if (heroClone) {
    maskWrapper.appendChild(heroClone)
  }
  transitionInner.appendChild(maskWrapper)

  gsap.set(pageContent, {
    position: 'absolute',
    top: 0,
    left: 0,
    width: `${viewportW}px`,
    height: `${viewportH}px`,
    minWidth: `${viewportW}px`,
    minHeight: `${viewportH}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    flex: '0 0 auto',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    opacity: 0,
  })

  gsap.set(transitionEl, {
    display: 'flex',
    width: `${viewportW}px`,
    height: `${viewportH}px`,
    justifyContent: 'center',
    alignItems: 'center',
  })
  gsap.set(clipRect, { attr: start })

  // Navbar masquée : elle apparaît dans le clip avec la page suivante.
  // Visible : l'indicateur glisse vers le lien de la page en même temps
  // que le clip s'ouvre.
  const stopNavClip = revealNavbar ? revealNavbarThroughClip(clipRect) : null
  if (!revealNavbar) {
    animateNavIndicatorToTarget({ duration: 0.8, ease: listEasing })
  }

  await gsap.to(clipRect, {
    attr: mid,
    duration: 0.8,
    ease: listEasing,
    onStart: () => gsap.set(pageContent, { opacity: 1 }),
  })

  // Pas attendu : la transition ne doit pas durer plus longtemps
  // Fini en même temps que l'ouverture du clip (seconde phase, 0.8s)
  if (heroHeading) revealHeading(heroHeading, { totalDuration: 0.8 })

  if (heroClone) {
    const heroRectNow = heroImg?.getBoundingClientRect()
    const centerX = heroRectNow
      ? heroRectNow.left + heroRectNow.width / 2
      : viewportW / 2
    const centerY = heroRectNow
      ? heroRectNow.top + heroRectNow.height / 2
      : viewportH / 2
    const targetX = centerX - viewportW / 2
    const targetY = centerY - viewportH / 2
    const targetW = heroRectNow ? `${heroRectNow.width}px` : '100vw'
    const targetH = heroRectNow ? `${heroRectNow.height}px` : '100vh'

    await Promise.all(
      [
        gsap.to(clipRect, {
          attr: end,
          duration: 0.8,
          ease: listEasing,
        }),
        gsap.to(heroClone, {
          width: targetW,
          height: targetH,
          xPercent: -50,
          yPercent: -50,
          x: targetX,
          y: targetY,
          duration: 0.8,
          ease: listEasing,
        }),
        eyebrows.length
          ? gsap.to(eyebrows, {
              yPercent: 0,
              duration: 0.8,
              ease: listEasing,
            })
          : null,
      ].filter(Boolean)
    )
  } else {
    await Promise.all(
      [
        gsap.to(clipRect, {
          attr: end,
          duration: 0.8,
          ease: listEasing,
        }),
        eyebrows.length
          ? gsap.to(eyebrows, {
              yPercent: 0,
              duration: 0.8,
              ease: listEasing,
            })
          : null,
      ].filter(Boolean)
    )
  }

  if (stopNavClip) stopNavClip()

  document.querySelectorAll('[data-barba="container"]').forEach((container) => {
    if (container !== nextContainer) container.remove()
  })

  placeholder.replaceWith(pageContent)
  if (hasBrowserEnv) {
    const lenis = getLenis()
    if (lenis && typeof lenis.scrollTo === 'function') {
      lenis.scrollTo(0, { duration: 0, immediate: true })
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }
  gsap.set(pageContent, {
    position: '',
    top: '',
    left: '',
    width: '',
    height: '',
    opacity: '',
    pointerEvents: '',
    minWidth: '',
    minHeight: '',
    maxWidth: '',
    maxHeight: '',
    flex: '',
    boxSizing: '',
  })

  gsap.set(clipRect, { attr: start })
  gsap.set(transitionEl, { display: 'none', width: '', height: '' })
  if (maskWrapper && maskWrapper.parentNode) {
    maskWrapper.parentNode.removeChild(maskWrapper)
  }
  if (heroClone && heroClone.parentNode) {
    heroClone.parentNode.removeChild(heroClone)
  }
}

async function ensureNextIsReady(next) {
  if (!next) return
  if (next.container) return next.container

  // Poll légèrement pour laisser le temps à Barba de construire le container
  const maxTries = 20
  for (let i = 0; i < maxTries; i++) {
    if (next.container) return next.container
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return next.container
}

function getOrCreateTransitionElementsFromDOM(wrapper) {
  const scope =
    wrapper || document.querySelector('[data-barba="wrapper"]') || document.body
  let pageWrap =
    scope.querySelector('.page-wrap') || scope.querySelector('main.page-wrap')

  if (!pageWrap) pageWrap = scope

  let transitionEl = pageWrap.querySelector('.transition')
  let transitionInner =
    transitionEl && transitionEl.querySelector('.transition__inner')
  let clipRect = null
  let defsSvg = null
  const clipId = 'transition-clip'

  if (!transitionEl) {
    transitionEl = document.createElement('div')
    transitionEl.className = 'transition'
    Object.assign(transitionEl.style, {
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'none',
      justifyContent: 'center',
      alignItems: 'center',
      pointerEvents: 'none',
      overflow: 'hidden',
      backgroundColor: 'var(--off-white, #ecedee)',
    })
    pageWrap.insertBefore(transitionEl, pageWrap.firstChild)
  }

  if (!transitionInner || transitionInner.dataset.type !== 'mask-container') {
    const svgNS = 'http://www.w3.org/2000/svg'
    transitionInner = document.createElement('div')
    transitionInner.classList.add('transition__inner')
    transitionInner.dataset.type = 'mask-container'
    Object.assign(transitionInner.style, {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'none',
    })

    defsSvg = document.createElementNS(svgNS, 'svg')
    defsSvg.dataset.maskDefs = 'true'
    defsSvg.setAttribute('width', '100%')
    defsSvg.setAttribute('height', '100%')
    defsSvg.setAttribute('viewBox', '0 0 100 100')
    defsSvg.setAttribute(
      'style',
      'position:absolute; top:0; left:0; pointer-events:none;'
    )

    const defs = document.createElementNS(svgNS, 'defs')
    const clipPath = document.createElementNS(svgNS, 'clipPath')
    clipPath.setAttribute('id', clipId)
    clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse')

    clipRect = document.createElementNS(svgNS, 'rect')
    clipRect.setAttribute('id', 'transition-clip-rect')
    clipRect.setAttribute('x', '0')
    clipRect.setAttribute('y', '0')
    clipRect.setAttribute('width', '0')
    clipRect.setAttribute('height', '0')

    clipPath.appendChild(clipRect)
    defs.appendChild(clipPath)
    defsSvg.appendChild(defs)
    transitionInner.appendChild(defsSvg)

    transitionEl.appendChild(transitionInner)
  } else {
    defsSvg = transitionInner.querySelector('[data-mask-defs="true"]')
    clipRect = transitionInner.querySelector('#transition-clip-rect')
  }

  return { transitionEl, transitionInner, clipRect, clipId, defsSvg }
}

function resetScrollTopImmediate() {
  if (!hasBrowserEnv) return
  const lenis = getLenis()
  if (lenis && typeof lenis.scrollTo === 'function') {
    lenis.scrollTo(0, { duration: 0, immediate: true })
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

function computeClipTargets() {
  // Clip en userSpaceOnUse, valeurs en px pour correspondre aux em souhaités
  const fallback = () => {
    const vw = 1440
    const vh = 900
    const midW = 0.2 * vw
    const midH = 0.1333 * vh
    return {
      start: { width: 0, height: 0, x: vw / 2, y: vh / 2 },
      mid: {
        width: midW,
        height: midH,
        x: (vw - midW) / 2,
        y: (vh - midH) / 2,
      },
      end: { width: vw, height: vh, x: 0, y: 0 },
      viewportW: vw,
      viewportH: vh,
    }
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback()
  }

  const rootFontSize =
    parseFloat(
      window.getComputedStyle(document.documentElement).fontSize || '16'
    ) || 16
  const emToPx = (em) => em * rootFontSize

  const visual =
    typeof window.visualViewport !== 'undefined' ? window.visualViewport : null
  const vw =
    visual?.width ||
    window.innerWidth ||
    document.documentElement.clientWidth ||
    1440
  const vh =
    visual?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    900

  const midW = emToPx(22.5)
  const midH = emToPx(15)

  return {
    start: { width: 0, height: 0, x: vw / 2, y: vh / 2 },
    mid: {
      width: midW,
      height: midH,
      x: (vw - midW) / 2,
      y: (vh - midH) / 2,
    },
    end: { width: vw, height: vh, x: 0, y: 0 },
    viewportW: vw,
    viewportH: vh,
  }
}
