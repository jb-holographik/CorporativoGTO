import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { ctaHoverEase } from '../utils/animationUtils.js'
import { initAboutItemsData } from '../utils/homeAboutItems.js'

gsap.registerPlugin(ScrollTrigger)
gsap.registerPlugin(Flip)

function collectImageUrls(img) {
  const urls = []
  const src = img.getAttribute('src')
  if (src) urls.push(src)
  if (img.currentSrc) urls.push(img.currentSrc)
  return urls
}

function whenHeroHasLoaded(callback) {
  const hero = document.querySelector('img.hero-img_img')
  if (!hero || hero.complete) {
    callback()
    return
  }

  let done = false
  const once = () => {
    if (done) return
    done = true
    callback()
  }

  hero.addEventListener('load', once, { once: true })
  hero.addEventListener('error', once, { once: true })
  window.setTimeout(once, 1200)
}

function preloadAboutSectionImages(section) {
  if (!section || section.dataset.aboutImagesPreloaded === 'true') return
  section.dataset.aboutImagesPreloaded = 'true'

  const images = section.querySelectorAll('img[src]')
  const urls = new Set()

  images.forEach((img) => {
    img.loading = 'eager'
    img.fetchPriority = 'low'
    img.setAttribute('fetchpriority', 'low')
    const src = img.getAttribute('src')
    if (src) img.src = src
    collectImageUrls(img).forEach((url) => urls.add(url))
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {})
    }
  })

  urls.forEach((url) => {
    const preloader = new Image()
    preloader.decoding = 'async'
    preloader.fetchPriority = 'low'
    preloader.src = url
  })
}

// Reusable: freeze an element in place and FLIP it to match a target's bounds
export function freezeAndFlipToTarget({
  itemEl,
  targetEl,
  sourceImageEl,
  duration = 1.2,
  ease = 'power2.inOut',
  useClone = true,
}) {
  if (!itemEl) return

  // Decide which element to animate (clone avoids interfering with scroll timelines)
  let el = itemEl
  if (useClone) {
    const r = itemEl.getBoundingClientRect()
    // Build a clean overlay structure instead of cloning nested transforms
    const clone = document.createElement('div')
    clone.className = 'item-clone'
    const inner = document.createElement('div')
    inner.className = 'clone_inner'
    clone.appendChild(inner)
    // Ensure inner fills the clone
    gsap.set(inner, {
      width: '100%',
      height: '100%',
    })
    // Try to grab the big image from the original item
    const srcImg =
      sourceImageEl ||
      itemEl.querySelector('.about-img_big') ||
      itemEl.querySelector('img')
    if (srcImg) {
      const img = srcImg.cloneNode(true)
      img.removeAttribute('srcset')
      img.removeAttribute('sizes')
      const decodedSrc = srcImg.currentSrc || srcImg.getAttribute('src')
      if (decodedSrc) img.setAttribute('src', decodedSrc)
      inner.appendChild(img)
      gsap.set(img, {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      })
    }
    gsap.set(clone, {
      position: 'fixed',
      left: r.left + r.width / 2, // center anchoring
      top: r.top + r.height / 2,
      width: r.width,
      height: r.height,
      margin: 0,
      x: 0,
      y: 0,
      xPercent: -50,
      yPercent: -50,
      transformOrigin: '50% 50%',
      zIndex: 2,
      overflow: 'hidden',
      willChange: 'transform',
      pointerEvents: 'none',
    })
    document.body.appendChild(clone)
    // Hide original so timelines can continue without visual conflict
    gsap.set(itemEl, { autoAlpha: 0 })
    el = clone
  } else {
    // Freeze current visual position on the original element
    const r = itemEl.getBoundingClientRect()
    gsap.set(itemEl, {
      position: 'fixed',
      left: r.left + r.width / 2, // center anchoring
      top: r.top,
      width: r.width,
      height: r.height,
      x: 0,
      y: 0,
      xPercent: -50,
      yPercent: 0,
      transformOrigin: '50% 50%',
      zIndex: 1000,
      willChange: 'transform',
    })
  }

  if (targetEl) {
    // Use Flip.fit to tween from current frozen rect to target's rect
    const tween = Flip.fit(el, targetEl, {
      scale: true,
      duration,
      ease,
      onComplete: () => gsap.set(el, { willChange: 'auto' }),
    })
    if (tween && typeof tween.pause === 'function') tween.pause(0)
    return { element: el, tween }
  }

  return { element: el }
}

export function initHomeAbout() {
  const hasMatchMedia =
    typeof window !== 'undefined' && typeof window.matchMedia !== 'undefined'
  const isMobileLayout =
    hasMatchMedia && window.matchMedia('(max-width: 991px)').matches
  const isTabletLayout =
    hasMatchMedia &&
    window.matchMedia('(min-width: 768px) and (max-width: 991px)').matches

  const sections = Array.from(document.querySelectorAll('.section_about'))

  if (!sections.length) return

  sections.forEach((section) => {
    whenHeroHasLoaded(() => preloadAboutSectionImages(section))
    initHomeAboutSection({ section, isMobileLayout, isTabletLayout })
  })
}

function initHomeAboutSection({ section, isMobileLayout, isTabletLayout }) {
  const aboutCarousel = section.querySelector(
    isMobileLayout ? '.about-carousel_mobile' : '.about-carousel'
  )
  const aboutWrap = section.querySelector(
    isMobileLayout ? '.about-wrap_carousel' : '.about-wrap'
  )
  const aboutItems = section.querySelectorAll(
    isMobileLayout ? '.about-item_mobile' : '.about-item'
  )

  // Get items data with individual configs
  const itemsData = initAboutItemsData(section)

  if (!aboutCarousel || !aboutWrap || itemsData.length === 0) return

  // Headings travel a shorter distance on mobile
  const headingStep = isMobileLayout ? (isTabletLayout ? 6.05 : 2.4) : 8.4

  // Sur mobile/tablette, on laisse le CSS gérer la largeur (pas d'inline width GSAP)
  if (isMobileLayout) {
    gsap.set(aboutItems, { clearProps: 'width' })
  }

  // Get position of about-carousel when it reaches the top of the viewport
  const startScrollY = window.scrollY || window.pageYOffset || 0
  const rect = aboutCarousel.getBoundingClientRect()
  const distanceToTop = rect.top // distance from viewport top at load

  // Width animation: from 100% viewport to 0 (top of carousel goes from bottom to top of viewport)
  const startCarouselAnimation = startScrollY + rect.top - window.innerHeight
  const endCarouselAnimation = startScrollY + rect.top

  // Headings: initial offset and entrance animation while section comes into view
  const aboutHeadingsInner = aboutCarousel.querySelector(
    '.about_headings_inner'
  )
  if (aboutHeadingsInner) {
    gsap.set(aboutHeadingsInner, { y: `${headingStep}em` })
  }

  const targetItemWidth = isMobileLayout ? '5.5em' : '7.93em'
  if (isMobileLayout) {
    gsap.set(aboutItems, { width: 0 })
  }

  if (startCarouselAnimation <= endCarouselAnimation) {
    const itemWidthTl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        start: startCarouselAnimation,
        end: endCarouselAnimation,
        scrub: true,
      },
    })

    itemWidthTl.to(aboutItems, { width: targetItemWidth }, 0)
    if (aboutHeadingsInner) {
      // Move from +8.4em to 0 while the section comes into view
      itemWidthTl.to(aboutHeadingsInner, { y: '0em' }, 0)
    }
  }

  // Calculate the scroll position where about-carousel reaches viewport top
  const triggerPoint = startScrollY + Math.max(0, distanceToTop)

  // First animation: when scrolled 50vh from trigger point
  const firstStepScroll = triggerPoint + window.innerHeight * 0.5

  // Create timeline for first 50vh scroll
  const firstTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      start: triggerPoint,
      end: firstStepScroll,
      scrub: true,
    },
  })

  // Headings movement during sticky scroll (first part): 0 -> -8.4em
  if (aboutHeadingsInner) {
    firstTl.to(aboutHeadingsInner, { y: `-${headingStep}em`, ease: 'none' }, 0)
  }

  // Animate each item with its individual config
  itemsData.forEach((item) => {
    // Item animation (element itself moves in X and Y)
    if (item.element) {
      const itemTransform = {
        xPercent: item.itemStop1.transformX,
        yPercent: item.itemStop1.transformY,
        ease: 'none',
      }
      firstTl.to(item.element, itemTransform, 0)
    }

    // Slider animation (slider inside moves only in X)
    if (item.slider) {
      const sliderTransform = { ease: 'none' }
      if (typeof item.sliderStop1.transformX === 'number') {
        sliderTransform.x = `${item.sliderStop1.transformX}em`
      }
      if (typeof item.sliderStop1.transformY === 'number') {
        sliderTransform.y = `${item.sliderStop1.transformY}em`
      }
      firstTl.to(item.slider, sliderTransform, 0)
    }
  })

  // Second animation: when scrolled another 50vh from first step
  const secondStepScroll = firstStepScroll + window.innerHeight * 0.5

  const secondTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      start: firstStepScroll,
      end: secondStepScroll,
      scrub: true,
      invalidateOnRefresh: true,
    },
  })

  // Headings movement during sticky scroll (second part): -8.4em -> -16.8em
  if (aboutHeadingsInner) {
    secondTl.to(
      aboutHeadingsInner,
      { y: `-${headingStep * 2}em`, ease: 'none' },
      0
    )
  }

  // Animate each item with its individual config for second stop
  itemsData.forEach((item) => {
    // Item animation (element itself moves in X and Y)
    if (item.element) {
      secondTl.to(
        item.element,
        {
          xPercent: item.itemStop2.transformX,
          yPercent: item.itemStop2.transformY,
          ease: 'none',
        },
        0
      )
    }

    // Slider animation
    if (item.slider) {
      const sliderTransform = { ease: 'none' }
      if (typeof item.sliderStop2.transformX === 'number') {
        sliderTransform.x = `${item.sliderStop2.transformX}em`
      }
      if (typeof item.sliderStop2.transformY === 'number') {
        sliderTransform.y = `${item.sliderStop2.transformY}em`
      }
      secondTl.to(item.slider, sliderTransform, 0)
    }
  })

  // Third animation: when scrolled another 50vh from second step
  const thirdStepScroll = secondStepScroll + window.innerHeight * 0.5

  const thirdTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      start: secondStepScroll,
      end: thirdStepScroll,
      scrub: true,
      invalidateOnRefresh: true,
    },
  })

  // Headings movement during sticky scroll (third part): -16.8em -> -25.2em
  if (aboutHeadingsInner) {
    thirdTl.to(
      aboutHeadingsInner,
      { y: `-${headingStep * 3}em`, ease: 'none' },
      0
    )
  }

  // Animate each item with its individual config for third stop
  itemsData.forEach((item) => {
    // Item animation (element itself moves in X and Y)
    if (item.element) {
      thirdTl.to(
        item.element,
        {
          xPercent: item.itemStop3.transformX,
          yPercent: item.itemStop3.transformY,
          ease: 'none',
        },
        0
      )
    }

    // Slider animation
    if (item.slider) {
      const sliderTransform = { ease: 'none' }
      if (typeof item.sliderStop3.transformX === 'number') {
        sliderTransform.x = `${item.sliderStop3.transformX}em`
      }
      if (typeof item.sliderStop3.transformY === 'number') {
        sliderTransform.y = `${item.sliderStop3.transformY}em`
      }
      thirdTl.to(item.slider, sliderTransform, 0)
    }
  })

  // Fourth animation: when scrolled another 50vh from third step
  const fourthStepScroll = thirdStepScroll + window.innerHeight * 0.5

  const fourthTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      start: thirdStepScroll,
      end: fourthStepScroll,
      scrub: true,
      invalidateOnRefresh: true,
    },
  })

  // Headings movement during sticky scroll (fourth part): -25.2em -> -33.6em
  if (aboutHeadingsInner) {
    fourthTl.to(
      aboutHeadingsInner,
      { y: `-${headingStep * 4}em`, ease: 'none' },
      0
    )
  }

  // Animate each item with its individual config for fourth stop
  itemsData.forEach((item) => {
    // Item animation (element itself moves in X and Y)
    if (item.element) {
      const itemTransform =
        item.itemStop4 && item.itemStop4.centerX
          ? {
              x: () => {
                const rectNow = item.element.getBoundingClientRect()
                const currentCenter = rectNow.left + rectNow.width / 2
                const currentXPercent =
                  typeof item.itemStop3.transformX === 'number'
                    ? item.itemStop3.transformX
                    : 0
                const deltaFromPercent =
                  (-currentXPercent / 100) * rectNow.width
                const targetX =
                  window.innerWidth / 2 - (currentCenter + deltaFromPercent)
                return targetX
              },
              xPercent: 0,
              yPercent: item.itemStop4.transformY,
              ease: 'none',
            }
          : {
              xPercent: item.itemStop4.transformX,
              yPercent: item.itemStop4.transformY,
              ease: 'none',
            }

      fourthTl.to(item.element, itemTransform, 0)
    }

    // Slider animation
    if (item.slider) {
      const sliderTransform = { ease: 'none' }
      if (typeof item.sliderStop4.transformX === 'number') {
        sliderTransform.x = `${item.sliderStop4.transformX}em`
      }
      if (typeof item.sliderStop4.transformY === 'number') {
        sliderTransform.y = `${item.sliderStop4.transformY}em`
      }
      fourthTl.to(item.slider, sliderTransform, 0)
    }
  })

  // === FLIP handoff after stop4 ends: item 13 desktop, item 28 mobile ===
  const flipItemId = isMobileLayout ? 28 : 13
  const flipItemEl =
    itemsData.find((item) => item.id === flipItemId)?.element ||
    section.querySelector(
      `${
        isMobileLayout ? '.about-item_mobile' : '.about-item'
      }.is-${flipItemId}`
    )
  const nextImgEl =
    document.querySelector('.section_next .next-img_img') ||
    document.querySelector('.next-img_img') ||
    document.querySelector('.next-img')

  if (flipItemEl && nextImgEl) {
    ScrollTrigger.create({
      start: fourthStepScroll,
      end: fourthStepScroll + 1,
      once: true,
      onEnter: () => {
        // Laisser les timelines ScrollTrigger de l'item actif pour qu'il suive au retour

        // Freeze and get a fixed overlay clone (no target, manual scroll-driven steps)
        const itemImages = flipItemEl.querySelectorAll('img')
        const result = freezeAndFlipToTarget({
          itemEl: flipItemEl,
          targetEl: null,
          sourceImageEl: itemImages[itemImages.length - 1],
        })
        const overlay = result?.element
        if (!overlay) return
        // Target background in next section (fade-in at the end)
        const nextBgEl =
          document.querySelector('.section.section_next .next-img_img') ||
          document.querySelector('.next-img_img')
        if (nextBgEl) gsap.set(nextBgEl, { autoAlpha: 0 })

        // Single scroll animation (linear) to the final state
        const step1Start = fourthStepScroll
        const step1End = step1Start + window.innerHeight * 0.25
        const step2Start = step1End
        // Le seuil peut être franchi de plusieurs pixels entre deux frames.
        // Démarrer au scroll réel évite que le clone apparaisse déjà transformé.
        const overlayStart = window.scrollY
        const nextSectionEl = document.querySelector('.section.section_next')

        // Determine step2 end point
        let step2End
        if (nextSectionEl) {
          step2End = null // Will use endTrigger instead
        } else {
          step2End = step2Start + window.innerHeight * 0.75
        }

        // Create a single timeline for both steps
        const scrollTriggerConfig = {
          start: overlayStart,
          scrub: true,
          onEnter: () => {
            gsap.set(overlay, { autoAlpha: 1 })
            gsap.set(flipItemEl, { autoAlpha: 0 })
          },
          onLeaveBack: () => {
            gsap.set(overlay, { autoAlpha: 0 })
            gsap.set(flipItemEl, { autoAlpha: 1 })
          },
          onLeave: () => {
            gsap.set(overlay, { autoAlpha: 0 })
            if (nextBgEl) gsap.set(nextBgEl, { autoAlpha: 1 })
          },
          onEnterBack: () => {
            gsap.set(overlay, { autoAlpha: 1 })
            if (nextBgEl) gsap.set(nextBgEl, { autoAlpha: 0 })
          },
        }

        // Set appropriate end point
        if (nextSectionEl) {
          scrollTriggerConfig.endTrigger = nextSectionEl
          scrollTriggerConfig.end = 'top top'
        } else {
          scrollTriggerConfig.end = step2End
        }

        const overlayTl = gsap.timeline({
          scrollTrigger: scrollTriggerConfig,
        })

        // Linear: from current size/pos to final full-screen state
        overlayTl.to(
          overlay,
          {
            width: () => window.innerWidth,
            height: () => window.innerHeight * 2,
            top: () => window.innerHeight,
            ease: 'none',
          },
          0
        )

        // Forcer la bonne visibilité aux bornes de la timeline, sans modifier l'animation
        const st = overlayTl.scrollTrigger
        overlayTl.eventCallback('onUpdate', () => {
          const p =
            st && typeof st.progress === 'number'
              ? st.progress
              : overlayTl.progress()
          if (p <= 0.001) {
            gsap.set(overlay, { autoAlpha: 0 })
            gsap.set(flipItemEl, { autoAlpha: 1 })
            if (nextBgEl) gsap.set(nextBgEl, { autoAlpha: 0 })
          } else if (p >= 0.999) {
            gsap.set(overlay, { autoAlpha: 0 })
            if (nextBgEl) gsap.set(nextBgEl, { autoAlpha: 1 })
          }
        })
      },
    })
  }

  // Initialize Next Section CTA animations
  initNextCta()
}

// Next Section CTA animations
export function initNextCta() {
  const nextSectionEl = document.querySelector('.section.section_next')
  if (!nextSectionEl) return

  const nextBtn = document.querySelector('.next-btn_btn')
  const nextBtnLabel = document.querySelector('.next-btn_label')
  const nextBtnUnderline = document.querySelector('.next-btn_underline')
  const nextBtnUnderlineWrap = document.querySelector(
    '.next-btn_underline-wrap'
  )
  const nextBtnImgWrap = document.querySelector('.next-btn_img-wrap')
  const nextBtnImg = document.querySelector('.next-btn_img-img')
  const nextImgEl = document.querySelector('.next-img_img')

  // Centre l'image de fond sur le centre du CTA
  const positionNextBg = () => {
    if (!nextBtnImgWrap || !nextBtn || !nextSectionEl) return
    const btnRect = nextBtn.getBoundingClientRect()
    const sectionRect = nextSectionEl.getBoundingClientRect()
    const centerX = btnRect.left + btnRect.width / 2 - sectionRect.left
    const centerY = btnRect.top + btnRect.height / 2 - sectionRect.top

    gsap.set(nextBtnImgWrap, {
      x: centerX,
      y: centerY,
      xPercent: -50,
      yPercent: -50,
    })
  }

  // Initial states
  if (nextBtnImgWrap)
    gsap.set(nextBtnImgWrap, {
      width: 0,
      height: 0,
      overflow: 'hidden',
      position: 'absolute',
      xPercent: -50,
      yPercent: -50,
    })
  if (nextBtnLabel) gsap.set(nextBtnLabel, { yPercent: 110 })
  if (nextBtnUnderline)
    gsap.set(nextBtnUnderline, {
      width: 0,
      transformOrigin: 'center center',
      scaleX: 1,
    })
  if (nextBtnImg)
    gsap.set(nextBtnImg, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      xPercent: -50,
      yPercent: -50,
      width: '100vw',
      height: '100vh',
      transformOrigin: 'center center',
      scale: 1.4,
      pointerEvents: 'none',
    })

  // Assure l'alignement centre CTA / fond, y compris au resize/refresh GSAP
  positionNextBg()
  gsap.delayedCall(0, positionNextBg)
  window.addEventListener('resize', positionNextBg)
  {
    let rafPending = false
    const onScroll = () => {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => {
        positionNextBg()
        rafPending = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
  }
  if (typeof ScrollTrigger !== 'undefined')
    ScrollTrigger.addEventListener('refreshInit', positionNextBg)

  // Scroll reveal: from top top to +25vh
  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: nextSectionEl,
        start: 'top top',
        end: () => '+=' + window.innerHeight * 0.25,
        scrub: true,
        invalidateOnRefresh: true,
      },
    })
    .to(nextBtnLabel || {}, { yPercent: 0 }, 0)
    .to(nextBtnUnderline || {}, { width: '100%' }, 0)

  // Track if scroll animation is complete
  let isScrollAnimationComplete = false

  // Align underline-wrap at the end of the 25vh reveal window
  ScrollTrigger.create({
    trigger: nextSectionEl,
    start: 'top top',
    end: () => '+=' + window.innerHeight * 0.25,
    onLeave: () => {
      isScrollAnimationComplete = true
      if (nextBtnUnderlineWrap)
        gsap.set(nextBtnUnderlineWrap, { justifyContent: 'center' })
    },
    onEnterBack: () => {
      isScrollAnimationComplete = false
      // optional reset when scrolling back up
      if (nextBtnUnderlineWrap)
        gsap.set(nextBtnUnderlineWrap, { justifyContent: '' })
    },
  })

  // Hover interactions (keeps sticky containers intact). Use progress tween so easing is identical both ways
  if (nextBtn) {
    const hoverTl = gsap.timeline({ paused: true })
    if (nextBtnImgWrap)
      hoverTl.to(
        nextBtnImgWrap,
        { width: '100%', height: '100%', duration: 1.25 },
        0
      )
    if (nextBtnImg) hoverTl.to(nextBtnImg, { scale: 1, duration: 1.25 }, 0)
    if (nextImgEl)
      hoverTl.to(
        nextImgEl,
        { width: '110%', height: '110%', duration: 1.25 },
        0
      )
    if (nextBtnUnderline)
      hoverTl.to(nextBtnUnderline, { scaleX: 0, duration: 1.25 }, 0)

    let progressTween

    nextBtn.addEventListener('mouseenter', () => {
      // Only trigger hover if scroll animation is complete
      if (!isScrollAnimationComplete) return

      if (progressTween) progressTween.kill()
      progressTween = gsap.to(hoverTl, {
        progress: 1,
        duration: 1.25,
        ease: ctaHoverEase,
      })
    })
    nextBtn.addEventListener('mouseleave', () => {
      // Only trigger if scroll animation is complete
      if (!isScrollAnimationComplete) return

      if (progressTween) progressTween.kill()
      progressTween = gsap.to(hoverTl, {
        progress: 0,
        duration: 1,
        ease: ctaHoverEase,
      })
    })
  }
}
