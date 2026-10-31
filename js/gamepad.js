'use strict';
// ---------- game controller (Gamepad API, "standard" layout: Xbox / PlayStation / Switch Pro) ----------
// Playing:  left stick move · right stick look · A jump · B interact · X or RT use tool · LT scanner pulse
//           LB / RB or D-pad left/right switch tool · Y build menu · View/Select codex · D-pad up star map
//           Start pause · while building: LB / RB rotate, Y deconstruct mode, B done
// Menus:    D-pad or left stick move the highlight · A press · B back · left/right change a slider or list
//           right stick scrolls · Start resumes · any button skips a travel cutscene
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const PAD_DEAD = 0.2, PAD_LOOK = 950, PAD_REPEAT0 = 0.38, PAD_REPEAT = 0.13;
const PAD = { index: null, active: false, lx: 0, ly: 0, now: [], prev: [], act: false, inter: false, up: false, down: false, fast: false,
  focus: null, focusRect: null, navDir: null, navT: 0 };
let padAct = false, padInter = false;

const padDead = v => Math.abs(v) < PAD_DEAD ? 0 : Math.sign(v) * (Math.abs(v) - PAD_DEAD) / (1 - PAD_DEAD);
const padDown = i => !!PAD.now[i];
const padPressed = i => !!PAD.now[i] && !PAD.prev[i];

addEventListener('gamepadconnected', e => {
  if (PAD.index === null) PAD.index = e.gamepad.index;
  toast(`Controller connected: ${e.gamepad.id.replace(/\s*\(.*$/, '') || 'gamepad'}`);
});
addEventListener('gamepaddisconnected', e => {
  if (e.gamepad.index !== PAD.index) return;
  PAD.index = null; padAct = padInter = false;
  setPadActive(false);
  toast('Controller disconnected');
  if (menu === null && world && !cutscene) showMenu('pause');
});

// prompts and on-screen buttons follow whatever you touched last
function setPadActive(on) {
  if (PAD.active === on) return;
  PAD.active = on;
  document.body.classList.toggle('pad', on);
  if (on) { KEY.use = '(X)'; KEY.interact = '(B)'; }
  else if (isTouch) { KEY.use = 'USE'; KEY.interact = 'INTERACT'; }
  else { KEY.use = '[E]'; KEY.interact = '[F]'; }
  if (!on) clearPadFocus();
  else if (menu) padFocusFirst();
}
['keydown', 'pointerdown', 'touchstart'].forEach(ev => addEventListener(ev, () => setPadActive(false), { passive: true, capture: true }));
addEventListener('mousemove', e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) setPadActive(false); }, { passive: true });

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = PAD.index !== null ? pads[PAD.index] : null;
  if (!gp) for (const p of pads) if (p && p.connected) { gp = p; PAD.index = p.index; break; }
  return gp && gp.connected ? gp : null;
}

function pollGamepad(dt) {
  const gp = readPad();
  PAD.prev = PAD.now;
  if (!gp) { PAD.now = []; PAD.lx = PAD.ly = 0; padAct = padInter = false; return; }
  PAD.now = gp.buttons.map((b, i) => (i === BTN.LT || i === BTN.RT) ? b.value > 0.35 : b.pressed);
  const ax = gp.axes, lx = padDead(ax[0] || 0), ly = padDead(ax[1] || 0), rx = padDead(ax[2] || 0), ry = padDead(ax[3] || 0);
  if (PAD.now.some(Boolean) || lx || ly || rx || ry) setPadActive(true);
  PAD.lx = lx; PAD.ly = ly;

  if (cutscene) {
    PAD.lx = PAD.ly = 0;
    if (PAD.now.some((b, i) => b && !PAD.prev[i])) skipCutscene();
    return;
  }
  if (menu) { padAct = padInter = false; PAD.up = PAD.down = false; padMenu(dt, lx, ly, ry); return; }
  if (!world) return;
  playPad(dt, rx, ry);
}

// ---------- playing ----------
function playPad(dt, rx, ry) {
  // a gentle curve: small stick moves aim finely, full tilt turns fast
  if (rx || ry) rotateCam(rx * Math.abs(rx) * PAD_LOOK * dt, ry * Math.abs(ry) * PAD_LOOK * 0.65 * dt);
  PAD.fast = padDown(BTN.L3);
  if (flying) {
    PAD.up = padDown(BTN.A); PAD.down = padDown(BTN.B);
    padAct = padDown(BTN.X) || padDown(BTN.RT); padInter = false;
  } else {
    PAD.up = PAD.down = false;
    if (padPressed(BTN.A)) jumpQueued = true;
    padAct = padDown(BTN.X) || padDown(BTN.RT);
    padInter = !build.active && padDown(BTN.B);
  }
  if (padPressed(BTN.START)) { showMenu('pause'); return; }
  if (build.active) {
    if (padPressed(BTN.B) && !flying) { stopBuild(); return; }
    if (build.mode === 'place' && (padPressed(BTN.LB) || padPressed(BTN.RB))) rotateBuild();
    if (padPressed(BTN.Y)) { build.mode === 'remove' ? startPlacing(build.type || 'crate') : startRemoving(); }
  } else {
    if (padPressed(BTN.LB) || padPressed(BTN.LEFT)) selectTool(tool - 1, false);
    if (padPressed(BTN.RB) || padPressed(BTN.RIGHT)) selectTool(tool + 1, false);
    if (padPressed(BTN.Y)) openBuildMenu();
  }
  if (padPressed(BTN.LT)) doScan();
  if (padPressed(BTN.VIEW)) showMenu('codex');
  if (padPressed(BTN.UP)) openStarMap();
  if (debugOn()) {
    if (padPressed(BTN.DOWN)) toggleFly();
    if (padPressed(BTN.R3)) teleportToLander();
  }
}

// ---------- menus ----------
const menuRoot = () => menu && menus[menu];
function padTargets() {
  const root = menuRoot();
  if (!root) return [];
  return [...root.querySelectorAll('button, input, select, [onclick]')].filter(el => {
    if (el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}
function clearPadFocus() {
  if (PAD.focus) PAD.focus.classList.remove('padfocus');
  PAD.focus = null;
}
function setPadFocus(el) {
  if (PAD.focus === el) return;
  clearPadFocus();
  if (!el) return;
  PAD.focus = el;
  el.classList.add('padfocus');
  PAD.focusRect = el.getBoundingClientRect();
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function padFocusFirst() {
  const t = padTargets();
  // menus that list choices first: start on the main action instead of the first tiny button
  const pref = t.find(el => el.id === 'startBtn' || el.id === 'pResume') || t[0];
  setPadFocus(pref || null);
}
// keep the highlight when a panel re-renders (machine panels refresh every half second)
function padValidate() {
  if (PAD.focus && PAD.focus.isConnected && menuRoot() && menuRoot().contains(PAD.focus) && !PAD.focus.disabled) {
    PAD.focusRect = PAD.focus.getBoundingClientRect();
    return;
  }
  const t = padTargets(), fr = PAD.focusRect;
  if (!t.length) { clearPadFocus(); return; }
  if (!fr || !PAD.focus) { padFocusFirst(); return; }
  const cx = fr.left + fr.width / 2, cy = fr.top + fr.height / 2;
  let best = t[0], bd = Infinity;
  for (const el of t) {
    const r = el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
    if (d < bd) { bd = d; best = el; }
  }
  PAD.focus = null;
  setPadFocus(best);
}
// spatial navigation: the nearest element in the pushed direction, preferring ones in line with the current one
function padMove(dx, dy) {
  const cur = PAD.focus;
  if (!cur) { padFocusFirst(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of padTargets()) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), bx = r.left + r.width / 2, by = r.top + r.height / 2;
    const along = (bx - ax) * dx + (by - ay) * dy, across = Math.abs((bx - ax) * dy - (by - ay) * dx);
    if (along <= 4) continue;
    const s = along + across * 2.5;
    if (s < bs) { bs = s; best = el; }
  }
  if (best) setPadFocus(best);
}
// LEFT / RIGHT on a slider or list changes its value instead of moving
function padAdjust(el, dir) {
  if (el.tagName === 'INPUT' && el.type === 'range') {
    const st = +el.step || 1, v = clamp(+el.value + dir * st, +el.min, +el.max);
    el.value = String(Math.round(v / st) * st);
  } else if (el.tagName === 'SELECT') {
    el.selectedIndex = (el.selectedIndex + dir + el.options.length) % el.options.length;
  } else return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
function padActivate(el) {
  if (el.tagName === 'INPUT' && el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (el.tagName === 'SELECT') padAdjust(el, 1);
  else if (el.tagName === 'INPUT' && el.type === 'range') {}
  else if (el.tagName === 'INPUT') el.focus(); // text field: type with a keyboard
  else el.click();
}
function padBack() {
  if (menu === 'title') return;
  if (menu === 'map' && mapZoomOut()) return;
  goBack();
}
function padMenu(dt, lx, ly, ry) {
  if (!PAD.active) return;
  padValidate();
  // direction with auto-repeat
  let dir = null;
  if (padDown(BTN.UP) || ly < -0.5) dir = 'u';
  else if (padDown(BTN.DOWN) || ly > 0.5) dir = 'd';
  else if (padDown(BTN.LEFT) || lx < -0.5) dir = 'l';
  else if (padDown(BTN.RIGHT) || lx > 0.5) dir = 'r';
  let fire = false;
  if (dir !== PAD.navDir) { PAD.navDir = dir; PAD.navT = PAD_REPEAT0; fire = !!dir; }
  else if (dir && (PAD.navT -= dt) <= 0) { PAD.navT = PAD_REPEAT; fire = true; }
  if (fire) {
    const el = PAD.focus, h = dir === 'l' ? -1 : dir === 'r' ? 1 : 0;
    if (!(h && el && padAdjust(el, h))) padMove(h, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
  }
  // right stick scrolls long panels
  if (ry) { const p = menuRoot() && menuRoot().querySelector('.panel'); if (p) p.scrollTop += ry * 900 * dt; }
  const m = menu;
  if (padPressed(BTN.A) && PAD.focus) padActivate(PAD.focus);
  else if (padPressed(BTN.B)) padBack();
  else if (padPressed(BTN.START)) { if (m === 'title') $('startBtn').click(); else if (m === 'pause') resume(); else goBack(); }
  else if (padPressed(BTN.LB) && m === 'map') mapZoomOut();
  if (menu !== m) { clearPadFocus(); PAD.focusRect = null; }
}
