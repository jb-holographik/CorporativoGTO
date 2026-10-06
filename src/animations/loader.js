import { gsap } from 'gsap'

import { listEasing } from '../utils/animationUtils.js'
import { revealHeading } from './headingReveal.js'
import { getLenis } from './lenis.js'

const LOADER_BG = '#151515'
const LOGO_COLOR = '#ffffff'
const MIN_DISPLAY_MS = 600
const MAX_WAIT_MS = 2500
const REVEAL_DURATION = 1.4
// Décalage de départ de l'image du hero (vers le haut), en part du viewport
const HERO_IMAGE_OFFSET = 0.3
// Eyebrows du hero : même départ que dans la transition de page
const EYEBROW_HIDDEN_Y_PERCENT = 400
// Les textes démarrent avant d'être découverts : quand le bord du masque est
// encore à cette distance (part du viewport) sous eux
const TEXT_TRIGGER_LEAD = 0.4
// Classe optionnelle posée par un snippet dans le <head> Webflow pour masquer
// la page avant le chargement de ce script (évite un flash du contenu)
const PENDING_CLASS = 'gto-loading'

let loaderEl = null
let resolveRevealed = null
let heroImageOffset = 0
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

function getHeroEyebrows() {
  return Array.from(
    document.querySelectorAll('.section_hero .hero_content .eyebrow-wrap')
  )
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
    zIndex: '10000',
    backgroundColor: LOADER_BG,
    clipPath: 'inset(0 0 0% 0)',
    pointerEvents: 'auto',
  })

  const logo = createLogo()
  if (logo) loaderEl.appendChild(logo)
  document.body.appendChild(loaderEl)
  clearPending()

  // État de départ du hero, caché sous le loader
  const eyebrows = getHeroEyebrows()
  if (eyebrows.length)
    gsap.set(eyebrows, { yPercent: EYEBROW_HIDDEN_Y_PERCENT })

  const heroImage = getHeroImage()
  const heroWrapper = heroImage?.parentElement
  if (heroImage && heroWrapper) {
    // L'image remonte dans son cadre (qui la découpe) : on limite le
    // décalage à la partie du cadre sous la ligne de flottaison pour que le
    // vide laissé en bas ne soit jamais visible
    const roomBelowFold =
      heroWrapper.getBoundingClientRect().bottom - window.innerHeight
    heroImageOffset = Math.max(
      0,
      Math.min(window.innerHeight * HERO_IMAGE_OFFSET, roomBelowFold - 1)
    )
    gsap.set(heroImage, { y: -heroImageOffset })
  }

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
 * Éléments du hero à faire glisser au moment où le bord du masque, qui
 * remonte, les découvre.
 */
function getEdgeTargets() {
  const targets = getHeroEyebrows().map((eyebrow) => ({
    bottom: eyebrow.getBoundingClientRect().bottom,
    reveal: () =>
      gsap.to(eyebrow, { yPercent: 0, duration: 0.8, ease: listEasing }),
  }))

  const heading = document.querySelector('.section_hero h1')
  if (heading) {
    targets.push({
      bottom: heading.getBoundingClientRect().bottom,
      // Lignes du bas d'abord, pour suivre le masque qui remonte
      reveal: () =>
        revealHeading(heading, { stagger: { each: 0.05, from: 'end' } }),
    })
  }
  return targets
}

/**
 * Sortie du loader : le fond remonte (clip-path) en masquant progressivement
 * le logo qui reste fixe, l'image du hero descend jusqu'à sa position et les
 * textes glissent à mesure qu'ils sont découverts.
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

  if (lenis && typeof lenis.start === 'function') lenis.start()

  const targets = getEdgeTargets()
  const mask = { progress: 0 }

  const heroImage = getHeroImage()
  if (heroImage && heroImageOffset) {
    gsap.to(heroImage, {
      y: 0,
      duration: REVEAL_DURATION,
      ease: listEasing,
    })
  }

  await gsap.to(mask, {
    progress: 100,
    duration: REVEAL_DURATION,
    ease: listEasing,
    onUpdate: () => {
      loaderEl.style.clipPath = `inset(0 0 ${mask.progress}% 0)`
      // Bord bas du masque, en px depuis le haut du viewport
      const edge = window.innerHeight * (1 - mask.progress / 100)
      const lead = window.innerHeight * TEXT_TRIGGER_LEAD
      targets.forEach((target) => {
        if (target.done || edge > target.bottom + lead) return
        target.done = true
        target.reveal()
      })
    },
  })

  targets.forEach((target) => {
    if (!target.done) target.reveal()
  })
  loaderEl.remove()
  loaderEl = null
  if (resolveRevealed) resolveRevealed()
}
