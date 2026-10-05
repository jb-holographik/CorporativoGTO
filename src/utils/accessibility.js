// Liens externes (réseaux sociaux…) : ouvrir dans un nouvel onglet pour ne pas
// faire quitter le site
export function initExternalLinks() {
  document.querySelectorAll('a[href^="http"]').forEach((link) => {
    if (link.hostname === window.location.hostname) return
    link.setAttribute('target', '_blank')
    const rel = new Set((link.getAttribute('rel') || '').split(/\s+/))
    rel.add('noopener')
    rel.delete('')
    link.setAttribute('rel', Array.from(rel).join(' '))
  })
}

// Les listes CMS qui ne contiennent que des images décoratives (alt="")
// seraient annoncées comme des listes vides : on les masque aux lecteurs
// d'écran
export function initDecorativeMedia() {
  document.querySelectorAll('[role="list"]').forEach((list) => {
    if (list.hasAttribute('aria-hidden')) return
    const images = list.querySelectorAll('img')
    if (!images.length) return
    if (list.textContent.trim()) return
    if (list.querySelector('a[href], button, input, select, textarea')) return
    const allDecorative = Array.from(images).every(
      (img) => img.getAttribute('alt') === ''
    )
    if (allDecorative) list.setAttribute('aria-hidden', 'true')
  })
}
