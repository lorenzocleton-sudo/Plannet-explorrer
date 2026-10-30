'use strict';
// ---------- machine + lander panels (opened with Interact) ----------
let panelTarget = null, panelAcc = 0;
function openPanel(target) {
  panelTarget = target;
  showMenu('machine');
}
// the inventory a panel trades with: the lander's hold or a crate
function panelStore() {
  if (panelTarget === 'lander') return { inv: landerInv(), cap: LANDER_CAP, name: "Lander's hold" };
  if (panelTarget && panelTarget.type === 'crate') return { inv: crateInv(panelTarget), cap: panelTarget.def.storage, name: 'Crate' };
  return null;
}
function pxStore(id, n) {
  const st = panelStore(), inv = playerInv();
  const ids = id ? [id] : Object.keys(inv);
  let moved = 0;
  for (const k of ids) { const m = invAdd(st.inv, k, Math.min(n, inv[k] || 0), st.cap); invTake(inv, k, m); moved += m; }
  if (!moved) toast(`${st.name} is full.`, 'bad');
  writeSave(); renderPanel();
}
function pxTake(id, n) {
  const st = panelStore(), inv = playerInv();
  const ids = id ? [id] : Object.keys(st.inv);
  let moved = 0;
  for (const k of ids) { const m = invAdd(inv, k, Math.min(n, st.inv[k] || 0), invCap()); invTake(st.inv, k, m); moved += m; }
  if (!moved) toast('Your inventory is full.', 'bad');
  writeSave(); renderPanel();
}
// take a machine's output buffer into your inventory
function pxTakeOut(key) {
  const b = panelTarget, buf = b.rec.s[key] || {}, inv = playerInv();
  for (const id of Object.keys(buf)) invTake(buf, id, invAdd(inv, id, buf[id], invCap()));
  if (invTotal(buf)) toast('Your inventory is full.', 'bad');
  writeSave(); renderPanel();
}
function pxMode(m) { panelTarget.rec.s.mode = m; writeSave(); renderPanel(); }
function pxCraft(id) {
  const r = fabById(id), b = panelTarget;
  if (!payCost(r.in, nearbyStores().concat(b.stores))) { toast(`Needs ${costText(r.in)}`, 'bad'); return; }
  (b.rec.s.q || (b.rec.s.q = [])).push(id);
  writeSave(); renderPanel();
}
function pxRemove() {
  const b = panelTarget;
  if (!confirm(`Deconstruct the ${b.def.name}? You get all materials and contents back.`)) return;
  deconstruct(b);
  if (!world.buildings.includes(b)) goBack();
}

function itemRows(inv, btns) {
  const ids = Object.keys(inv).filter(id => inv[id] > 0);
  if (!ids.length) return '<p class="muted">Empty</p>';
  return `<div class="irows">${ids.map(id => `<div class="irow">${chip(id, inv[id])}<span style="flex:1"></span>${btns(id)}</div>`).join('')}</div>`;
}
function powerLine(b) {
  if (!b.def.power) return '';
  if (!b.grid) return `<p class="warn">⚡ No power: build a Solar Panel or Battery within ${POWER_RANGE} m (or build next to the lander).</p>`;
  const g = b.grid, pct = Math.round(g.ratio * 100);
  return `<p class="${pct < 50 && machineWants(b) ? 'warn' : 'muted'}">⚡ Power grid: making ${g.gen.toFixed(1)}, using ${g.demand.toFixed(1)}${machineWants(b) ? ` · running at ${Math.min(100, pct)}%` : ''}</p>`;
}
function storageLine(b) {
  if (b.type === 'crate' || b.type === 'solar' || b.type === 'battery') return '';
  return b.stores.length ? `<p class="muted">📦 Uses ${b.stores.length} store${b.stores.length > 1 ? 's' : ''} within ${STORAGE_RANGE} m (crates / lander)</p>`
    : `<p class="warn">📦 No storage within ${STORAGE_RANGE} m: build a Storage Crate nearby${b.type === 'drill' ? ' or collect by hand' : ''}.</p>`;
}
const bar2 = f => `<div class="pbar"><i style="width:${Math.round(clamp(f, 0, 1) * 100)}%"></i></div>`;

function renderPanel() {
  const t = panelTarget;
  if (!t || (t !== 'lander' && !world.buildings.includes(t))) { goBack(); return; }
  if (t !== 'lander' && (factoryDirty || !world.grids)) rebuildLinks(world);
  let h = '';
  const inv = playerInv();
  if (t === 'lander') {
    const hold = landerInv();
    h += `<h2>Lander</h2><p class="sub">Hold ${invTotal(hold)}/${LANDER_CAP} · ${chip('fuel', hold.fuel || 0)} on board · Your inventory ${invTotal(inv)}/${invCap()}</p>
      <div class="row" style="margin-top:0">${typeof openTech === 'function' ? '<button onclick="openTech()">Tech Tree</button>' : ''}<button onclick="showMenu('map', 'machine')">Star Map</button><button class="ghost" onclick="openBuildMenu()">Build</button></div>
      <p class="muted">The lander powers machines within ${LANDER_LINK} m (${LANDER_POWER} power) and works as storage for machines within ${LANDER_LINK} m.</p>`;
  } else {
    h += `<h2>${t.def.name}</h2><p class="sub">${t.def.desc}</p>${powerLine(t)}${storageLine(t)}`;
    const s = t.rec.s;
    if (t.type === 'drill') {
      const buf = s.buf || {};
      h += `<p>Mining <b>${itemName(t.spotRes)}</b> from ${t.spotDepth} m deep · ${(drillSpeed(t) * 60).toFixed(1)} per minute${save.upgrades.fastdrill ? ' (fast drill)' : ''}</p>
        ${bar2(invTotal(buf) / DRILL_BUF)}<p>Stored ${invTotal(buf)}/${DRILL_BUF}</p>
        <div class="row"><button ${invTotal(buf) ? '' : 'disabled'} onclick="pxTakeOut('buf')">Take all</button></div>`;
    } else if (t.type === 'smelter') {
      const r = s.cur && SMELT.find(x => x.id === s.cur);
      h += `<p>Recipe: ${['auto', ...SMELT.map(x => x.id)].map(m => `<button class="${(s.mode || 'auto') === m ? '' : 'ghost'}" style="padding:6px 10px;font-size:13px" onclick="pxMode('${m}')">${m === 'auto' ? 'Auto' : itemName(Object.keys(SMELT.find(x => x.id === m).out)[0])}</button>`).join(' ')}</p>
        <p class="muted">${SMELT.map(x => `${costText(x.in)} → ${costText(x.out)} (${x.time}s)`).join('<br>')}</p>
        ${r ? `<p>Making ${costText(r.out)}</p>${bar2(s.prog)}` : '<p class="muted">Waiting for ore in a crate or the lander nearby.</p>'}
        <p>Made so far: ${s.made || 0}</p>${invTotal(s.out || {}) ? `<p>Waiting to be stored: ${costText(s.out)}</p><button onclick="pxTakeOut('out')">Take</button>` : ''}`;
    } else if (t.type === 'fabricator') {
      const q = s.q || [];
      h += q.length ? `<p>Crafting <b>${fabName(fabById(q[0]))}</b>${q.length > 1 ? ` (+${q.length - 1} queued)` : ''}</p>${bar2(s.prog)}` : '<p class="muted">Idle. Pick something to craft (materials come from your inventory, nearby crates and the lander).</p>';
      if (invTotal(s.out || {})) h += `<p>Finished: ${costText(s.out)} <button onclick="pxTakeOut('out')">Take</button></p>`;
      const stores = nearbyStores().concat(t.stores);
      for (const kind of ['part', 'tool', 'upgrade']) {
        h += `<h4>${{ part: 'Parts', tool: 'Tools', upgrade: 'Upgrades' }[kind]}</h4><div class="bgrid">`;
        for (const r of FAB.filter(x => x.kind === kind)) {
          const owned = !r.out && save.upgrades[r.id], queued = q.includes(r.id), unlocked = typeof techHas !== 'function' || techHas(r.id);
          const cost = Object.entries(r.in).map(([id, n]) => chip(id, n, storesCount(stores, id) < n ? ` <em>(have ${storesCount(stores, id)})</em>` : '')).join(' ');
          h += `<div class="bcard ${unlocked ? '' : 'locked'}"><b>${fabName(r)}</b>${r.desc ? `<p class="muted">${r.desc}</p>` : ''}<div class="chips">${cost}</div>
            ${owned ? '<button disabled>Installed</button>' : queued && !r.out ? '<button disabled>Queued</button>' : !unlocked ? '<button disabled>Research it in the tech tree</button>'
              : `<button ${canAfford(r.in, stores) ? '' : 'disabled'} onclick="pxCraft('${r.id}')">Craft (${r.time}s)</button>`}</div>`;
        }
        h += '</div>';
      }
    } else if (t.type === 'solar') {
      h += `<p>Making ${(t.def.gen * solarFactor(world, t)).toFixed(1)} of ${t.def.gen} power (sunlight here ${Math.round(solarFactor(world, t) * 100)}%)</p><p class="muted">No power at night: add a Battery to store the daytime surplus.</p>`;
      if (t.grid) h += `<p class="muted">Grid: making ${t.grid.gen.toFixed(1)}, using ${t.grid.demand.toFixed(1)}</p>`;
    } else if (t.type === 'battery') {
      h += `${bar2((s.charge || 0) / t.def.capacity)}<p>${Math.round(s.charge || 0)} / ${t.def.capacity} stored</p>`;
      if (t.grid) h += `<p class="muted">Grid: making ${t.grid.gen.toFixed(1)}, using ${t.grid.demand.toFixed(1)}</p>`;
    } else if (t.type === 'o2gen') {
      h += `${bar2((s.o2 || 0) / O2_CAP)}<p>${Math.round(s.o2 || 0)} / ${O2_CAP} oxygen stored · 1 Ice → ${O2_PER_ICE} oxygen</p><p class="muted">Stand within ${O2_RANGE} m to refill your suit.</p>`;
    } else if (t.type === 'refinery') {
      h += s.busy ? `<p>Refining 2 Ice → 1 Rocket Fuel</p>${bar2(s.prog)}` : '<p class="muted">Waiting for 2 Ice in a crate or the lander nearby.</p>';
      h += `<p>Fuel made: ${s.made || 0}. It goes into the nearest crate or the lander; travel uses the fuel in the lander's hold (and crates next to it).</p>`;
      if (invTotal(s.out || {})) h += `<p>Waiting to be stored: ${costText(s.out)} <button onclick="pxTakeOut('out')">Take</button></p>`;
    }
  }
  const st = panelStore();
  if (st) {
    h += `<div class="xfer"><div><h4>Your inventory (${invTotal(inv)}/${invCap()})</h4>${itemRows(inv, id => `<button class="ghost sm2" onclick="pxStore('${id}', 999)">Store</button>`)}
        <button class="ghost sm2" onclick="pxStore(null, 9999)">Store everything</button></div>
      <div><h4>${st.name} (${invTotal(st.inv)}/${st.cap})</h4>${itemRows(st.inv, id => `<button class="ghost sm2" onclick="pxTake('${id}', 10)">Take 10</button><button class="ghost sm2" onclick="pxTake('${id}', 999)">All</button>`)}</div></div>`;
  }
  h += `<div class="row">${t !== 'lander' ? '<button class="danger" onclick="pxRemove()">Deconstruct</button>' : ''}<button class="ghost" onclick="goBack()">Close</button></div>`;
  $('machineBody').innerHTML = h;
}
function panelTick(dt) {
  if (menu !== 'machine') return;
  panelAcc -= dt;
  if (panelAcc <= 0) { panelAcc = 0.5; renderPanel(); }
}
