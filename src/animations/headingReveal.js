import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'

import { listEasing } from '../utils/animationUtils.js'

gsap.registerPlugin(SplitText)

const HEADING_SELECTOR = 'h1, h2, h3'
// Titres du carrousel "About" du home : déjà animés au scroll
const EXCLUDED_SELECTOR = '.about-heading'
// Débord du masque : les titres en line-height serré (0.75) dépassent de leur
// boîte de ligne, sans ça le masque couperait le haut/bas des lettres
const MASK_BLEED = '0.15em'
const HIDDEN_Y_PERCENT = 150

const splits = new WeakMap()
let observer = null

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
    splitHeading(heading)
  })
}

/**
 * Fait glisser les lignes d'un titre dans leur masque, puis retire le
 * découpage pour que le titre se recompose normalement au resize.
 */
export function revealHeading(heading) {
  const split = splits.get(heading)
  if (!split || heading.dataset.headingReveal !== 'pending') return null
  heading.dataset.headingReveal = 'revealed'
  return gsap.to(split.lines, {
    yPercent: 0,
    duration: 1.2,
    stagger: 0.1,
    ease: listEasing,
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
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        observer.unobserve(entry.target)
        revealHeading(entry.target)
      })
    },
    { rootMargin: '0px 0px -10% 0px' }
  )
  getHeadings().forEach((heading) => {
    if (heading.dataset.headingReveal === 'pending') observer.observe(heading)
  })

  // Si la police n'était pas encore chargée, les lignes ont été calculées avec
  // la police de secours : on redécoupe les titres pas encore révélés
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(() => {
      getHeadings().forEach((heading) => {
        const split = splits.get(heading)
        if (!split || heading.dataset.headingReveal !== 'pending') return
        split.revert()
        splitHeading(heading)
      })
    })
  }
}
