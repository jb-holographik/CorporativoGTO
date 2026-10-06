import { gsap } from 'gsap'

import { listEasing } from '../utils/animationUtils.js'
import { getLenis } from './lenis.js'

const LOADER_BG = '#151515'
// Le logo part de la couleur du fond (invisible) et passe au blanc, bloc par
// bloc de gauche à droite
const LOGO_START_COLOR = LOADER_BG
const LOGO_COLOR = '#ffffff'
const LOGO_BLOCK_DURATION = 0.25
// Durée totale du décalage, identique pour les barres et les lettres pour
// qu'elles démarrent et finissent ensemble
const LOGO_STAGGER_AMOUNT = 0.25
// Petit temps de pause une fois le logo blanc, avant la révélation
const LOGO_HOLD_MS = 150
// Écart (unités SVG) en dessous duquel deux morceaux sont considérés bord à bord
const TOUCH_TOLERANCE = 0.1
const MIN_DISPLAY_MS = 600
const MAX_WAIT_MS = 2500
// Sous le calque de la transition de page (.transition, z-index 900) : la
// page s'ouvre dans son clip par-dessus le fond sombre et le logo
const LOADER_Z_INDEX = '850'
// Classe optionnelle posée par un snippet dans le <head> Webflow pour masquer
// la page avant le chargement de ce script (évite un flash du contenu)
const PENDING_CLASS = 'gto-loading'

let loaderEl = null
let logoAnimation = null
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
      node.setAttribute('fill', LOGO_START_COLOR)
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

function getBoxRight(box) {
  return box.x + box.width
}

function boxContains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    getBoxRight(inner) <= getBoxRight(outer) &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/**
 * Découpe un chemin composé (un mot entier) en un chemin par lettre. Les
 * contours intérieurs (trous du O, du R…) restent dans le chemin de leur
 * lettre, sinon ils seraient remplis. Le tracé n'utilise que des commandes
 * absolues : on peut couper à chaque « M ».
 */
function splitWordIntoLetters(path) {
  const subpaths = (path.getAttribute('d') || '')
    .split(/(?=M)/)
    .map((d) => d.trim())
    .filter(Boolean)
  if (subpaths.length < 2) return [path]

  const measured = subpaths.map((d) => {
    const probe = path.cloneNode(false)
    probe.setAttribute('d', d)
    path.parentNode.insertBefore(probe, path)
    const box = probe.getBBox()
    probe.remove()
    return { d, box, area: box.width * box.height }
  })

  // Les plus grands contours d'abord : chaque contour contenu dans une lettre
  // déjà trouvée est un trou de cette lettre
  const letters = []
  measured
    .slice()
    .sort((a, b) => b.area - a.area)
    .forEach((subpath) => {
      const parent = letters.find((letter) =>
        boxContains(letter.box, subpath.box)
      )
      if (parent) parent.d.push(subpath.d)
      else letters.push({ box: subpath.box, d: [subpath.d] })
    })

  // Lettres dessinées en plusieurs morceaux bord à bord (le O de « GTO » est
  // fait de deux moitiés) : on les regroupe. Deux lettres voisines ne se
  // touchent jamais exactement (écart ou léger chevauchement).
  const mergedLetters = []
  letters
    .sort((a, b) => a.box.x - b.box.x)
    .forEach((letter) => {
      const previous = mergedLetters[mergedLetters.length - 1]
      if (
        previous &&
        Math.abs(letter.box.x - getBoxRight(previous.box)) < TOUCH_TOLERANCE
      ) {
        const right = getBoxRight(letter.box)
        previous.d.push(...letter.d)
        previous.box = {
          x: previous.box.x,
          y: Math.min(previous.box.y, letter.box.y),
          width: right - previous.box.x,
          height:
            Math.max(
              previous.box.y + previous.box.height,
              letter.box.y + letter.box.height
            ) - Math.min(previous.box.y, letter.box.y),
        }
        return
      }
      mergedLetters.push(letter)
    })

  const letterPaths = mergedLetters.map((letter) => {
    const letterPath = path.cloneNode(false)
    letterPath.setAttribute('d', letter.d.join(' '))
    path.parentNode.insertBefore(letterPath, path)
    return letterPath
  })
  path.remove()
  return letterPaths
}

/**
 * Sépare le logo en barres (le symbole) et en lettres, chacune dans l'ordre
 * de gauche à droite. Le logo doit être dans le DOM pour être mesuré.
 */
function getLogoBlocks(logo) {
  const paths = Array.from(logo.querySelectorAll('path'))
  const bars = []
  const words = []
  // Le symbole est un ensemble de barres simples à gauche, chaque mot est un
  // chemin composé de plusieurs contours
  paths.forEach((path) => {
    const subpathCount = ((path.getAttribute('d') || '').match(/M/g) || [])
      .length
    if (subpathCount > 1) words.push(path)
    else bars.push(path)
  })
  const byRightEdge = (a, b) =>
    getBoxRight(a.getBBox()) - getBoxRight(b.getBBox())
  const byLeftEdge = (a, b) => a.getBBox().x - b.getBBox().x
  return {
    bars: bars.sort(byRightEdge),
    letters: words
      .sort(byLeftEdge)
      .flatMap((word) => splitWordIntoLetters(word)),
  }
}

function animateLogo(logo) {
  const { bars, letters } = getLogoBlocks(logo)
  const blocks = [...bars, ...letters]
  if (!blocks.length) return null
  gsap.set(blocks, { fill: LOGO_START_COLOR })

  const tl = gsap.timeline()
  const vars = {
    fill: LOGO_COLOR,
    duration: LOGO_BLOCK_DURATION,
    // cubic-bezier(0.6, 0, 0, 1)
    ease: listEasing,
    stagger: { amount: LOGO_STAGGER_AMOUNT },
  }
  if (bars.length) tl.to(bars, vars, 0)
  if (letters.length) tl.to(letters, vars, 0)
  return tl
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
  if (logo) logoAnimation = animateLogo(logo)

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
    // Logo entièrement blanc avant la révélation
    logoAnimation
      ? logoAnimation.then(
          () => new Promise((resolve) => setTimeout(resolve, LOGO_HOLD_MS))
        )
      : null,
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
    logoAnimation = null
    if (lenis && typeof lenis.start === 'function') lenis.start()
    if (resolveRevealed) resolveRevealed()
  }
}
