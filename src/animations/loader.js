import { gsap } from 'gsap'

import { listEasing } from '../utils/animationUtils.js'
import { getLenis } from './lenis.js'

const LOADER_BG = '#151515'
const MIN_DISPLAY_MS = 600
const MAX_WAIT_MS = 2500
// Classe optionnelle posée par un snippet dans le <head> Webflow pour masquer
// la page avant le chargement de ce script (évite un flash du contenu)
const PENDING_CLASS = 'gto-loading'

let loaderEl = null
let resolveRevealed = null
// Résolue quand le loader commence à révéler la page (ou tout de suite s'il
// n'y a pas de loader) : les animations d'entrée attendent ce moment
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
      node.setAttribute('fill', LOADER_BG)
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
    mixBlendMode: 'difference',
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
    zIndex: '10000',
    backgroundColor: LOADER_BG,
    clipPath: 'inset(0 0 0 0%)',
    pointerEvents: 'auto',
  })

  const logo = createLogo()
  if (logo) loaderEl.appendChild(logo)
  document.body.appendChild(loaderEl)
  clearPending()

  revealedPromise = new Promise((resolve) => {
    resolveRevealed = resolve
  })
  return true
}

function waitForHeroImage() {
  const img = document.querySelector('.section_hero .hero-img_img')
  if (!img || (img.complete && img.naturalWidth > 0)) return Promise.resolve()
  return new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', resolve, { once: true })
  })
}

/**
 * Lance la sortie du loader : le fond glisse vers la droite (clip-path) et
 * masque progressivement le logo qui reste fixe.
 */
export async function playIntroLoader() {
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

  if (resolveRevealed) resolveRevealed()
  if (lenis && typeof lenis.start === 'function') lenis.start()

  await gsap.to(loaderEl, {
    clipPath: 'inset(0 0 0 100%)',
    duration: 1.4,
    ease: listEasing,
  })

  loaderEl.remove()
  loaderEl = null
}
