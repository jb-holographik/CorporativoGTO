import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'

import { listEasing } from '../utils/animationUtils.js'
import { whenIntroRevealed } from './loader.js'

gsap.registerPlugin(SplitText)

const HEADING_SELECTOR = 'h1, h2, h3'
// Titres du carrousel "About" du home : déjà animés au scroll
const EXCLUDED_SELECTOR = '.about-heading'
// Débord du masque : les titres en line-height serré (0.75) dépassent de leur
// boîte de ligne, sans ça le masque couperait le haut/bas des lettres
const MASK_BLEED = '0.15em'
const HIDDEN_Y_PERCENT = 150
const REVEAL_DURATION = 1.2
const LINE_STAGGER = 0.05

const splits = new WeakMap()
// Révélations demandées avant que le titre soit découpé (police en cours de
// chargement) : jouées dès que le découpage est fait
const deferredReveals = new WeakMap()
let observer = null

function areFontsLoaded() {
  return !document.fonts || document.fonts.status === 'loaded'
}

function getHeadings(scope) {
  const root =
    scope || document.querySelector('[data-barba="container"]') || document
  return Array.from(root.querySelectorAll(HEADING_SELECTOR)).filter(
    (heading) => !heading.closest(EXCLUDED_SELECTOR)
  )
}

function splitHeading(heading) {
  const split = new SplitText(heading, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'heading-line',
  })
  // clip-path négatif plutôt que padding/marge : agrandit la zone visible du
  // masque sans toucher à la mise en page
  gsap.set(split.masks, {
    overflow: 'visible',
    clipPath: `inset(-${MASK_BLEED} -${MASK_BLEED})`,
  })
  gsap.set(split.lines, { yPercent: HIDDEN_Y_PERCENT })
  splits.set(heading, split)
}

/**
 * Découpe les titres en lignes masquées et les cache sous leur masque.
 * Appelé au chargement et, pendant une transition Barba, sur la page entrante
 * avant qu'elle soit révélée.
 */
export function prepareHeadingReveals(scope) {
  getHeadings(scope).forEach((heading) => {
    if (heading.dataset.headingReveal) return
    heading.dataset.headingReveal = 'pending'

    if (areFontsLoaded()) {
      splitHeading(heading)
      return
    }

    // Découper avec la police de secours donnerait de mauvaises coupures de
    // ligne : le titre reste caché jusqu'au chargement de la police
    gsap.set(heading, { visibility: 'hidden' })
    document.fonts.ready.then(() => {
      if (heading.dataset.headingReveal === 'pending' && !splits.has(heading)) {
        splitHeading(heading)
      }
      gsap.set(heading, { clearProps: 'visibility' })
      if (deferredReveals.has(heading)) {
        const tweenVars = deferredReveals.get(heading)
        deferredReveals.delete(heading)
        revealHeading(heading, tweenVars)
      }
    })
  })
}

/**
 * Fait glisser les lignes d'un titre dans leur masque, puis retire le
 * découpage pour que le titre se recompose normalement au resize.
 * totalDuration : durée totale imposée, décalage des lignes compris (pour
 * finir en même temps qu'une autre animation).
 */
export function revealHeading(heading, tweenVars = {}) {
  if (heading.dataset.headingReveal !== 'pending') return null
  const split = splits.get(heading)
  if (!split) {
    deferredReveals.set(heading, tweenVars)
    return null
  }
  heading.dataset.headingReveal = 'revealed'
  const { totalDuration, ...vars } = tweenVars
  const timing = { duration: REVEAL_DURATION, stagger: LINE_STAGGER }
  if (totalDuration) {
    const staggerTotal = LINE_STAGGER * (split.lines.length - 1)
    timing.duration = Math.max(0.1, totalDuration - staggerTotal)
  }
  return gsap.to(split.lines, {
    yPercent: 0,
    ...timing,
    ease: listEasing,
    ...vars,
    onComplete: () => {
      split.revert()
      splits.delete(heading)
    },
  })
}

export function initHeadingReveals() {
  prepareHeadingReveals()

  // IntersectionObserver plutôt que ScrollTrigger : certains titres entrent à
  // l'écran via d'autres animations (cartes empilées, sections épinglées), il
  // faut se baser sur leur visibilité réelle et non sur leur position au scroll
  if (observer) observer.disconnect()
  const pageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        pageObserver.unobserve(entry.target)
        revealHeading(entry.target)
      })
    },
    { rootMargin: '0px 0px -10% 0px' }
  )
  observer = pageObserver
  // Pas de révélation cachée derrière le loader d'accueil
  whenIntroRevealed().then(() => {
    if (observer !== pageObserver) return
    getHeadings().forEach((heading) => {
      if (heading.dataset.headingReveal === 'pending') {
        pageObserver.observe(heading)
      }
    })
  })
}
