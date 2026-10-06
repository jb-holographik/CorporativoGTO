import { getLenis } from './lenis.js'

const LOADER_BG = '#151515'
const LOGO_COLOR = '#ffffff'
const MIN_DISPLAY_MS = 600
const MAX_WAIT_MS = 2500
// Sous le calque de la transition de page (.transition, z-index 900) : la
// page s'ouvre dans son clip par-dessus le fond sombre et le logo
const LOADER_Z_INDEX = '850'
// Classe optionnelle posée par un snippet dans le <head> Webflow pour masquer
// la page avant le chargement de ce script (évite un flash du contenu)
const PENDING_CLASS = 'gto-loading'

let loaderEl = null
let resolveRevealed = null
// Résolue quand le loader a fini de révéler la page (ou tout de suite s'il n'y
// a pas de loader) : les révélations au scroll attendent ce moment
let revealedPromise = Promise.resolve()

export function whenIntroRevealed() {
  return revealedPromise
}

function clearPending() {
  document.documentElement.classList.remove(PENDING_CLASS)
}

function isHomePage() {
  const container = document.querySelector('[data-barba="container"]')
  return container?.dataset.barbaNamespace === 'home'
}

function getHeroImage() {
  return document.querySelector('.section_hero .hero-img_img')
}

function createLogo() {
  const navLogo = document.querySelector('.navbar .nav-logo svg')
  if (!navLogo) return null
  const rect = navLogo.getBoundingClientRect()
  if (!rect.width) return null

  const logo = navLogo.cloneNode(true)
  logo.removeAttribute('aria-label')
  logo.setAttribute('aria-hidden', 'true')
  logo.querySelectorAll('[fill]').forEach((node) => {
    if (node.getAttribute('fill') !== 'none') {
      node.setAttribute('fill', LOGO_COLOR)
    }
  })
  // Même taille et même position horizontale que le logo de la navbar,
  // centré verticalement
  Object.assign(logo.style, {
    position: 'absolute',
    top: '50%',
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: 'translateY(-50%)',
  })
  return logo
}

/**
 * Monte le loader au chargement direct de la page d'accueil (jamais pendant
 * une transition Barba, qui ne recharge pas la page). À appeler avant
 * l'hydratation pour que les animations d'entrée l'attendent.
 */
export function mountIntroLoader() {
  if (loaderEl || !isHomePage()) {
    clearPending()
    return false
  }

  loaderEl = document.createElement('div')
  loaderEl.className = 'intro-loader'
  loaderEl.setAttribute('aria-hidden', 'true')
  Object.assign(loaderEl.style, {
    position: 'fixed',
    inset: '0',
    zIndex: LOADER_Z_INDEX,
    backgroundColor: LOADER_BG,
    pointerEvents: 'auto',
  })

  const logo = createLogo()
  if (logo) loaderEl.appendChild(logo)
  document.body.appendChild(loaderEl)

  // La navbar (au-dessus du loader) est masquée par un clip vide : elle
  // apparaîtra dans le clip de la révélation, comme pendant une transition
  const navbar = document.querySelector('.navbar')
  if (navbar) navbar.style.clipPath = 'inset(50%)'

  clearPending()

  revealedPromise = new Promise((resolve) => {
    resolveRevealed = resolve
  })
  return true
}

function waitForHeroImage() {
  const img = getHeroImage()
  if (!img || (img.complete && img.naturalWidth > 0)) return Promise.resolve()
  return new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', resolve, { once: true })
  })
}

/**
 * Sortie du loader : même animation que la transition de page (reveal),
 * jouée par-dessus le fond sombre et le logo.
 */
export async function playIntroLoader(reveal) {
  if (!loaderEl) return

  const lenis = getLenis()
  if (lenis && typeof lenis.stop === 'function') lenis.stop()

  await Promise.all([
    new Promise((resolve) => setTimeout(resolve, MIN_DISPLAY_MS)),
    Promise.race([
      waitForHeroImage(),
      new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS)),
    ]),
  ])

  try {
    if (typeof reveal === 'function') await reveal()
  } finally {
    const navbar = document.querySelector('.navbar')
    if (navbar) navbar.style.removeProperty('clip-path')
    loaderEl.remove()
    loaderEl = null
    if (lenis && typeof lenis.start === 'function') lenis.start()
    if (resolveRevealed) resolveRevealed()
  }
}
