import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const CHAPTER_SELECTOR = '[data-scroll-chapter], .our-story'
const PINNED_SCROLL_VIEWPORTS = 5

function resolveChapterRoot(target) {
  if (typeof target === 'string') {
    const match = document.querySelector(target)
    if (!match) {
      return null
    }
    if (match.matches(CHAPTER_SELECTOR)) {
      return match
    }
    return match.querySelector(CHAPTER_SELECTOR)
  }

  if (target instanceof Element) {
    if (target.matches(CHAPTER_SELECTOR)) {
      return target
    }
    return target.querySelector(CHAPTER_SELECTOR)
  }

  return null
}

function getChapterScrollTriggerVars(root) {
  const section = root.closest('.section') || root.parentElement || root
  const extraTravel = (section?.offsetHeight || 0) - root.offsetHeight
  const shouldPin = extraTravel < window.innerHeight * 0.75

  if (shouldPin) {
    return {
      trigger: root,
      start: 'top top',
      end: () =>
        `+=${Math.max(window.innerHeight * PINNED_SCROLL_VIEWPORTS, 1)}`,
      scrub: true,
      invalidateOnRefresh: true,
      pin: true,
      pinSpacing: true,
    }
  }

  return {
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    invalidateOnRefresh: true,
  }
}

/**
 * Initialise toutes les instances Scroll Chapter présentes dans la page.
 * Branché sur [data-scroll-chapter] (composant Webflow) et .our-story (legacy).
 */
export function initScrollChapters() {
  const hasDOM =
    typeof window !== 'undefined' && typeof document !== 'undefined'
  if (!hasDOM) {
    return
  }

  document.querySelectorAll(CHAPTER_SELECTOR).forEach((root) => {
    initScrollCounter(root)
  })
}

/**
 * Initialise l'animation complète du scroll counter avec compteur mécanique et animations d'images
 * L'instance doit contenir:
 * - le root sticky ([data-scroll-chapter] / .our-story)
 * - .counter-right_slider, .counter-center_slider, .counter-left_slider (sliders du compteur)
 * - .our-story_image-2, .our-story_image-3, .our-story_image-4 (images à animer)
 *   ou .our-people_image-1 à .our-people_image-4 (nouveau naming)
 * - .our-story_content_left .p-small et .our-story_content_right .p-small (paragraphes texte)
 *
 * @param {string|Element} target - Root du chapter, ou un ancêtre qui le contient
 */
export function initScrollCounter(target) {
  const hasDOM =
    typeof window !== 'undefined' && typeof document !== 'undefined'
  if (!hasDOM) {
    return
  }

  const root = resolveChapterRoot(target)
  if (!root) {
    return
  }

  const requiredSelectors = {
    rightSlider: '.counter-right_slider',
    centerSlider: '.counter-center_slider',
    leftSlider: '.counter-left_slider',
    container: '.counter-right',
  }

  const resolved = {}
  const missingSelectors = []

  Object.entries(requiredSelectors).forEach(([key, selector]) => {
    const element = root.querySelector(selector)
    resolved[key] = element
    if (!element) {
      missingSelectors.push(selector)
    }
  })

  if (missingSelectors.length) {
    return
  }

  const sticky = root
  const { rightSlider, centerSlider, leftSlider, container } = resolved

  // Compteur purement visuel : sans ça, les lecteurs d'écran lisent toutes les
  // colonnes de chiffres ("1012345678900123…%")
  const counter = container.closest('.our-story_counter') || container
  counter.setAttribute('aria-hidden', 'true')
  const leftParagraph = root.querySelector('.our-story_content_left .p-small')
  const rightParagraph = root.querySelector('.our-story_content_right .p-small')
  const scrollTriggerVars = getChapterScrollTriggerVars(root)

  if (!sticky || !rightSlider || !centerSlider || !leftSlider || !container) {
    return
  }

  // Reset any previous transforms
  gsap.set([rightSlider, centerSlider, leftSlider], { x: 0, y: 0 })

  // Calculer la hauteur d'un chiffre
  let digitHeight = 0
  const getDigitHeight = () => {
    if (digitHeight === 0) {
      const testSpan = rightSlider.querySelector('.counter-number')
      if (testSpan) {
        const rect = testSpan.getBoundingClientRect()
        digitHeight = rect.height || 0
      }
    }
    return digitHeight
  }

  let chapterTween = null

  // Utilitaire: split un paragraphe en lignes visibles et retourne les covers ajoutés
  const splitIntoLinesWithCovers = (paragraph) => {
    if (!paragraph) return []
    // Restaurer si déjà splitté
    if (paragraph.dataset.originalHtml) {
      paragraph.innerHTML = paragraph.dataset.originalHtml
    } else {
      paragraph.dataset.originalHtml = paragraph.innerHTML
    }
    const text = paragraph.textContent || ''
    // Créer des spans par mot + espace
    paragraph.innerHTML = ''
    const tokens = text.split(/(\s+)/) // conserve espaces
    const tokenSpans = []
    tokens.forEach((tok) => {
      const span = document.createElement('span')
      span.textContent = tok
      span.style.display = 'inline'
      span.style.whiteSpace = 'pre-wrap'
      paragraph.appendChild(span)
      tokenSpans.push(span)
    })
    // Mesurer les lignes par changement de top
    const groups = []
    let current = []
    let lastTop = null
    tokenSpans.forEach((el) => {
      const r = el.getBoundingClientRect()
      const top = Math.round(r.top)
      if (lastTop === null) {
        lastTop = top
      }
      if (Math.abs(top - lastTop) > 1) {
        if (current.length) groups.push(current)
        current = []
        lastTop = top
      }
      current.push(el)
    })
    if (current.length) groups.push(current)

    // Construire des wrappers de lignes + cover
    const covers = []
    const lineHeight = (() => {
      const cs = getComputedStyle(paragraph)
      const lh = parseFloat(cs.lineHeight)
      if (isNaN(lh)) {
        const fs = parseFloat(cs.fontSize) || 16
        const lhFactor = 1.1
        return fs * lhFactor
      }
      return lh
    })()

    groups.forEach((grp) => {
      const hasText = grp.some((n) => (n.textContent || '').trim())
      if (!hasText) {
        return
      }

      const lineWrap = document.createElement('span')
      lineWrap.className = 'our-story_line-wrap'
      lineWrap.style.display = 'block'
      lineWrap.style.position = 'relative'
      lineWrap.style.width = 'fit-content'
      lineWrap.style.maxWidth = '100%'
      // Déplacer les tokens dans le wrapper
      grp[0].parentNode.insertBefore(lineWrap, grp[0])
      grp.forEach((n) => lineWrap.appendChild(n))
      lineWrap.style.whiteSpace = 'nowrap'
      const words = grp.filter((n) => (n.textContent || '').trim())
      if (words.length) {
        const left = words[0].getBoundingClientRect().left
        const right = words[words.length - 1].getBoundingClientRect().right
        lineWrap.style.width = `${Math.ceil(right - left)}px`
      }
      // Cover
      const cover = document.createElement('span')
      cover.className = 'our-story_line-cover'
      cover.style.position = 'absolute'
      // Ancrer à droite (réduction vers la gauche)
      cover.style.inset = '0 0 auto auto'
      cover.style.top = '0'
      cover.style.right = '0'
      cover.style.left = 'auto'
      cover.style.height = lineHeight + 'px'
      cover.style.width = '100%'
      // Opacité et dégradé à l'extrémité (de #ECEDEE 100% à 0%)
      cover.style.opacity = '0.9'
      cover.style.background =
        'linear-gradient(90deg, rgba(236,237,238,0) 0%, rgba(236,237,238,1) 10%, rgba(236,237,238,1) 100%)'
      cover.style.pointerEvents = 'none'
      cover.style.willChange = 'width'
      cover.style.zIndex = '2'
      lineWrap.appendChild(cover)
      covers.push(cover)
    })
    return covers
  }

  const imageSelectorSets = [
    [
      '.our-story_image-1',
      '.our-story_image-2',
      '.our-story_image-3',
      '.our-story_image-4',
    ],
    [
      '.our-people_image-1',
      '.our-people_image-2',
      '.our-people_image-3',
      '.our-people_image-4',
    ],
  ]

  const imagesToAnimate =
    imageSelectorSets
      .map((selectors) =>
        selectors
          .map((sel) => root.querySelector(sel))
          .filter((img) => img instanceof HTMLElement)
      )
      .find((set) => set.length > 0) || []

  const staticImage = imagesToAnimate[0] || null
  const animatedImages = imagesToAnimate.slice(1)

  if (staticImage) {
    gsap.set(staticImage, { scale: 1, transformOrigin: '50% 50%' })
  }
  animatedImages.forEach((image) => {
    gsap.set(image, { scale: 0, transformOrigin: '50% 50%' })
  })

  const buildChapterTimeline = () => {
    if (chapterTween) {
      chapterTween.scrollTrigger?.kill()
      chapterTween.kill()
      chapterTween = null
    }

    const covers = [
      ...splitIntoLinesWithCovers(leftParagraph),
      ...splitIntoLinesWithCovers(rightParagraph),
    ]
    const dh = getDigitHeight()

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        ...scrollTriggerVars,
        onRefreshInit: () => {
          digitHeight = 0
        },
      },
    })

    if (covers.length) {
      const lineWidths = covers.map((cv) => {
        const wrap = cv.parentElement
        return Math.max(wrap?.getBoundingClientRect().width || 0, 1)
      })
      const totalWidth = lineWidths.reduce((sum, width) => sum + width, 0)
      let time = 0
      covers.forEach((cv, index) => {
        const duration = lineWidths[index] / totalWidth
        const fromWidth = lineWidths[index] * 1.1
        gsap.set(cv, { width: fromWidth })
        tl.fromTo(
          cv,
          { width: fromWidth },
          { width: 0, duration, immediateRender: index === 0 },
          time
        )
        time += duration
      })
    } else {
      tl.to({}, { duration: 1 })
    }

    if (dh > 0) {
      gsap.set([rightSlider, centerSlider, leftSlider], { y: 0 })
      tl.to(rightSlider, { y: () => -100 * getDigitHeight(), duration: 1 }, 0)
      for (let i = 0; i < 10; i++) {
        tl.to(
          centerSlider,
          {
            y: () => -(i + 1) * getDigitHeight(),
            duration: 0.01,
          },
          (i + 1) * 0.1 - 0.01
        )
      }
      tl.to(leftSlider, { y: () => -getDigitHeight(), duration: 0.01 }, 0.99)
    }

    if (animatedImages.length) {
      const segment = 1 / animatedImages.length
      animatedImages.forEach((image, index) => {
        tl.fromTo(
          image,
          { scale: 0 },
          { scale: 1, duration: segment, immediateRender: false },
          segment * index
        )
      })
    }

    chapterTween = tl
  }

  const initChapterTimeline = () => {
    if (getDigitHeight() > 0) {
      buildChapterTimeline()
    } else {
      setTimeout(initChapterTimeline, 100)
    }
  }

  initChapterTimeline()

  // Les lignes sont figées en px au découpage. Si la largeur des colonnes
  // change sans rechargement (fenêtre redimensionnée sous 768px) ou si la
  // police arrive après le découpage, le texte repasse à la ligne à
  // l'intérieur de chaque ligne et les caches n'en couvrent qu'une partie :
  // on redécoupe et on reconstruit la timeline.
  const columns = [leftParagraph, rightParagraph]
    .map((paragraph) => paragraph?.parentElement)
    .filter(Boolean)
  const getColumnWidths = () =>
    columns
      .map((column) => Math.round(column.getBoundingClientRect().width))
      .join(',')
  let lastColumnWidths = getColumnWidths()
  let resplitTimer = null
  let resizeObserver = null

  const resplit = () => {
    if (!document.contains(root)) {
      resizeObserver?.disconnect()
      return
    }
    if (!chapterTween) return
    buildChapterTimeline()
    ScrollTrigger.refresh()
    lastColumnWidths = getColumnWidths()
  }

  if (typeof ResizeObserver !== 'undefined' && columns.length) {
    resizeObserver = new ResizeObserver(() => {
      if (!document.contains(root)) {
        resizeObserver.disconnect()
        return
      }
      const widths = getColumnWidths()
      if (widths === lastColumnWidths) return
      lastColumnWidths = widths
      clearTimeout(resplitTimer)
      resplitTimer = setTimeout(resplit, 150)
    })
    columns.forEach((column) => resizeObserver.observe(column))
  }

  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(resplit)
  }
}
