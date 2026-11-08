// Shared by the visual tests and scripts/record-demo.mjs (no test-runner imports here).

/** Scroll an element to where a person could tap it: on phones the band between the pinned instrument and the step
 *  card at the bottom, elsewhere the middle of the screen. Runs in the page. */
export function scrollToReach(e) {
  const inst = document.querySelector('.instrument');
  if (e.closest('.instrument')) return;
  // controls in a fixed overlay (expanded state map, Explain sheet, step card) are always on screen: never scroll
  for (let a = e; a; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return;
  if (getComputedStyle(inst).position !== 'sticky') return void e.scrollIntoView({ block: 'center' });
  const coach = document.getElementById('coach');
  const top = inst.getBoundingClientRect().height;
  const bottom = coach && !coach.hidden ? coach.getBoundingClientRect().top : innerHeight;
  const b = e.getBoundingClientRect();
  window.scrollBy(0, b.top + b.height / 2 - (top + bottom) / 2);
}
