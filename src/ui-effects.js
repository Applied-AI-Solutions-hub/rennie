import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/styles/themes/default.css';

// Motion preference controls only subtle CSS color transitions. Content and
// buttons never translate, scale, or animate on entry in the desktop workspace.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const preferenceKey = 'applied-ai-interface-motion';
let enabled = false;
try { enabled = localStorage.getItem(preferenceKey) === 'on'; } catch {}
const permitsMotion = () => enabled && !reduced.matches && !document.hidden;
function applyPreference() {
  document.documentElement.dataset.motion = permitsMotion() ? 'on' : 'off';
  const toggle = document.querySelector('#interface-motion');
  if (toggle) toggle.checked = enabled;
  const note = document.querySelector('#motion-note');
  if (note) note.textContent = reduced.matches
    ? 'Windows reduced-motion preference is active.'
    : 'Subtle color changes on hover. No sliding panels or page animations.';
}
document.addEventListener('change', event => {
  if (event.target.id !== 'interface-motion') return;
  enabled = event.target.checked;
  try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch {}
  applyPreference();
});
reduced.addEventListener('change', applyPreference);
document.addEventListener('visibilitychange', applyPreference);
window.appEffects = { render: applyPreference, welcome() {}, permitsMotion };
applyPreference();
