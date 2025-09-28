// assets/js/app.js
import { Trie } from '../../core/trie.js?v=17';
import { isValidPath, pathToWord, scoreWord } from '../../core/gameCore.js?v=17'; // (not used yet, but fine to keep)

// ------------------ BOOT ------------------
const trie = new Trie();

// ------------------ CONFIG ------------------
const BASE = { w: 320, h: 480 }; // artboard size
const COORDS_URL = "assets/ui_coords_full_with_timer_counter.json"; // JSON in /assets

const GRID = {
  rows: 5, cols: 5,
  size: 38, gutter: 7,
  topLeftCenter: { x: 72.000, y: 126.000 },
  scale: 0.96,
  overlayScale: 0.95
};

const TIMER_R   = 26;
const COUNTER_R = 18;
const BTN_SIZE  = { w: 48, h: 15 };

// ------------------ PIXI APP ------------------
const app = new PIXI.Application({
  backgroundAlpha: 0,
  autoDensity: true,
  antialias: true,
  resizeTo: window
});
document.getElementById("app").appendChild(app.view);

const root = new PIXI.Container(); app.stage.addChild(root);
const frameLayer = new PIXI.Container();
const gridLayer  = new PIXI.Container();
const uiLayer    = new PIXI.Container();
const fxLayer    = new PIXI.Container();
root.addChild(frameLayer, gridLayer, uiLayer, fxLayer);

// Center + scale to viewport
function layout(){
  const vw = app.renderer.width, vh = app.renderer.height;
  const s = Math.min(vw/BASE.w, vh/BASE.h);
  root.scale.set(s);
  root.position.set((vw-BASE.w*s)/2, (vh-BASE.h*s)/2);
}
function relayoutSoon(){ requestAnimationFrame(layout); requestAnimationFrame(layout); }
window.addEventListener("resize", layout);
app.renderer.on("resize", layout);
layout(); requestAnimationFrame(layout);

// ------------------ HELPERS ------------------
const DPR = window.devicePixelRatio || 1;
const suf = () => (DPR >= 2.5 ? "@3x" : DPR >= 1.5 ? "@2x" : "@1x");

async function tryLoad(url){
  return new Promise((resolve) => {
    const tex = PIXI.Texture.from(url);
    const bt = tex.baseTexture;
    if (bt.valid) return resolve(tex);
    bt.once("loaded", () => resolve(tex));
    bt.once("error",  () => resolve(null));
  });
}
async function firstTexture(paths){
  for (const p of paths){ const t = await tryLoad(p); if (t) return t; }
  return null;
}

// ------------------ LOAD COORDS + INIT ------------------
let coords = { lights: [], buttons: [], timer: {}, counter: null };

(async function init(){
  try {
    const res = await fetch(COORDS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("coords 404");
    coords = await res.json();
  } catch (e) {
    console.warn("Using fallback coords:", e.message);
    coords.buttons = [{ id:"btn_green", x:132, y:430 }, { id:"btn_red", x:188, y:430 }];
    coords.timer   = { face: { id:"timer_face", x:139.7366, y:392.0765 } };
    coords.counter = { id:"counter", x:140.4563, y:32.6174 };
    coords.lights  = [];
  }

  // ---------- FRAME ----------
  const frameTex = await firstTexture([
    `assets/frame/frame${suf()}.png`,
    `assets/frame/frame@1x.png`
  ]);
  if (frameTex){
    const s = new PIXI.Sprite(frameTex);
    s.width = BASE.w; s.height = BASE.h;
    frameLayer.addChild(s);
    relayoutSoon();
  } else {
    const g = new PIXI.Graphics();
    g.beginFill(0x1a2029); g.drawRoundedRect(0,0,BASE.w,BASE.h,12); g.endFill();
    frameLayer.addChild(g);
  }

  // ---------- TILES (coded base + overlay + letters) ----------
  const overlayTex = await firstTexture([
    `assets/tiles/tile_base${suf()}.png`,
    `assets/tiles/tile_base@1x.png`
  ]);

  function makeTile(localX, localY, size){
    const cont = new PIXI.Container();
    cont.position.set(localX, localY);       // local (relative) position in grid root
    cont.eventMode = "static";

    // 1) coded white base
    const baseG = new PIXI.Graphics();
    baseG.lineStyle(1, 0xcad3df, 0.9);
    baseG.beginFill(0xf8fbff);
    baseG.drawRoundedRect(-size/2, -size/2, size, size, 5);
    baseG.endFill();
    cont.addChild(baseG);

    // 2) letter
    const letter = new PIXI.Text("", new PIXI.TextStyle({
      fontFamily:"system-ui, -apple-system, Segoe UI, Roboto",
      fontWeight:"800",
      fontSize: Math.round(size*0.72),
      fill:0x23303a, stroke:0xffffff, strokeThickness:2
    }));
    letter.anchor.set(0.5);
    letter.position.y -= 2; // visually centered
    cont.addChild(letter);

    // 3) overlay
    let overlay = null;
    if (overlayTex){
      overlay = new PIXI.Sprite(overlayTex);
      overlay.anchor.set(0.5);
      overlay.width = overlay.height = size * (GRID.overlayScale ?? 0.95);
      cont.addChild(overlay);
    }

    return { cont, letter, overlay };
  }

  // grid root anchored at top-left tile center
  const gridRoot = new PIXI.Container();
  gridLayer.addChild(gridRoot);

  const tiles = [], letters = [];
  for (let r=0;r<GRID.rows;r++){
    for (let c=0;c<GRID.cols;c++){
      const lx = c * (GRID.size + GRID.gutter); // local X
      const ly = r * (GRID.size + GRID.gutter); // local Y
      const { cont, letter, overlay } = makeTile(lx, ly, GRID.size);
      gridRoot.addChild(cont);
      tiles.push({cont, overlay}); letters.push(letter);
    }
  }

  // position grid root at the anchor (top-left tile center)
  gridRoot.position.set(GRID.topLeftCenter.x, GRID.topLeftCenter.y);
  gridRoot.scale.set(GRID.scale ?? 1);

  // store characters by [r][c]
  const charGrid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(""));

  // letters (simple weighted MVP)
  const ALPH="EEEEEEEEEEEEAAAAAAAIIIIIIIONNNNRRRRTTTTTLLLLSSSSUUUUDDGGBBCCMMPPFFHHVVWWYYKJXQZ";
  function rollLetters(){
    for (let r=0; r<GRID.rows; r++){
      for (let c=0; c<GRID.cols; c++){
        const i = r * GRID.cols + c;
        const ch = ALPH[Math.floor(Math.random()*ALPH.length)];
        charGrid[r][c] = ch;
        letters[i].text = ch;
        letters[i].alpha = 1;
        tiles[i].cont.alpha = 1;
        if (tiles[i].overlay) tiles[i].overlay.tint=0xFFFFFF;
      }
    }
  }

  // --- DICTIONARY (EN) ---------------------------------------------------
  try {
    const res = await fetch('assets/words/en.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    const txt = await res.text();
    const words = txt.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(Boolean);
    words.forEach(w => trie.insert(w));
    console.log(`[dict] EN loaded: ${words.length} words`);
  } catch (e) {
    console.warn('[dict] load failed, using tiny fallback', e);
    ['tree','clear','enter','water','huis','boom'].forEach(w => trie.insert(w));
  }

  // --- DEBUG: grid override via ?grid=25letters ---------------------------
  const params = new URLSearchParams(location.search);
  const gridParam = params.get('grid');

  function applyGridString(s){
    const arr = s.replace(/[^A-Za-z]/g, '').toUpperCase().split('');
    const N = GRID.rows * GRID.cols;
    if (arr.length !== N) { console.warn('[grid] expected', N, 'letters'); return false; }
    for (let r = 0; r < GRID.rows; r++){
      for (let c = 0; c < GRID.cols; c++){
        const i = r * GRID.cols + c;
        const ch = arr[i];
        charGrid[r][c] = ch;
        letters[i].text = ch;
        letters[i].alpha = 1;
        tiles[i].cont.alpha = 1;
        if (tiles[i].overlay) tiles[i].overlay.tint = 0xFFFFFF;
      }
    }
    return true;
  }

  // Use override if present, else random roll
  if (!(gridParam && applyGridString(gridParam))) {
    rollLetters();
  }

  // ---------- SELECTION (simple toggle for now) ----------
  const selected=[];
  tiles.forEach((t,i)=>{
    t.cont.on("pointerdown", ()=>{
      const k = selected.indexOf(i);
      if (k>=0){ selected.splice(k,1); t.cont.alpha=1; if(t.overlay) t.overlay.tint=0xFFFFFF; }
      else     { selected.push(i);     t.cont.alpha=0.95; if(t.overlay) t.overlay.tint=0xE9FFD6; }
    });
  });
  function clearSelection(){
    selected.splice(0);
    tiles.forEach(t=>{ t.cont.alpha=1; if(t.overlay) t.overlay.tint=0xFFFFFF; });
  }

  // ---------- COUNTER ----------
  const counterPos = coords.counter
    ? { x: coords.counter.x + COUNTER_R, y: coords.counter.y + COUNTER_R }
    : { x:160, y:40 };

  const counterBg = new PIXI.Graphics();
  counterBg.beginFill(0x24303a);
  counterBg.drawCircle(0,0,COUNTER_R);
  counterBg.endFill();
  counterBg.position.set(counterPos.x, counterPos.y);
  uiLayer.addChild(counterBg);

  const counterText = new PIXI.Text("0", new PIXI.TextStyle({
    fontFamily:"system-ui, -apple-system, Segoe UI, Roboto",
    fontWeight:"800", fontSize:16, fill:0xffffff
  }));
  counterText.anchor.set(0.5);
  counterText.position.copyFrom(counterBg.position);
  uiLayer.addChild(counterText);

  let wordsCount=0;
  const foundWords = new Set();
  function setWordCount(n){ counterText.text = String(n); }

  // ---------- SUBMIT (dictionary-backed) ----------
  function submitWord(){
    if (!selected.length) return;

    // build the word from the currently selected tiles
    const word = selected.map(i => letters[i].text).join('').toLowerCase();

    if (word.length < 3) { clearSelection(); return; }
    if (!trie.hasWord(word)) { clearSelection(); return; }
    if (foundWords.has(word)) { clearSelection(); return; }

    foundWords.add(word);
    wordsCount += 1;
    setWordCount(wordsCount);
    clearSelection();
  }

  // ---------- BUTTONS (code-drawn) ----------
  function makeVerticalGradient(topColor, bottomColor, w, h) {
    const buf = new Uint8Array([
      (topColor >> 16) & 0xFF, (topColor >> 8) & 0xFF, topColor & 0xFF, 0xFF,
      (bottomColor >> 16) & 0xFF, (bottomColor >> 8) & 0xFF, bottomColor & 0xFF, 0xFF
    ]);
    const tex = PIXI.Texture.fromBuffer(buf, 1, 2);
    tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    const spr = new PIXI.Sprite(tex);
    spr.width = w;
    spr.height = h;
    spr.anchor.set(0.5);
    return spr;
  }

  function drawCodeButton({ w, h, fillTop, fillBottom, brass = 0xB48F42 }) {
    const cont = new PIXI.Container();

    const groove = new PIXI.Graphics();
    groove.lineStyle(1, 0x000000, 0.35);
    groove.drawRoundedRect(-w/2 - 2, -h/2 - 2, w + 4, h + 4, 6);
    cont.addChild(groove);

    const grad = makeVerticalGradient(fillTop, fillBottom, w, h);
    cont.addChild(grad);

    const outline = new PIXI.Graphics();
    outline.lineStyle(1, brass, 0.9);
    outline.drawRoundedRect(-w/2 + 0.5, -h/2 + 0.5, w - 1, h - 1, 6);
    cont.addChild(outline);

    const highlight = new PIXI.Graphics();
    highlight.beginFill(0xffffff, 0.06);
    highlight.drawRoundedRect(-w/2 + 2, -h/2 + 2, w - 4, h - h*0.65, 5);
    highlight.endFill();
    cont.addChild(highlight);

    return cont;
  }

  function findBtn(which) {
    const b = (coords.buttons || []).find(b => which==="green" ? b.id==="btn_green" : b.id==="btn_red");
    return b ? { x:b.x, y:b.y } : null;
  }

  function makeCodeButton(which, onClick) {
    const center = findBtn(which) || (which==="green" ? {x:132,y:430} : {x:188,y:430});

    const GREEN_TOP = 0x3DAE70, GREEN_BOTTOM = 0x2B7E51;
    const RED_TOP   = 0xB34A4A, RED_BOTTOM   = 0x8F2D2D;

    const colors = (which==="green")
      ? { top: GREEN_TOP, bottom: GREEN_BOTTOM }
      : { top: RED_TOP, bottom: RED_BOTTOM };

    const s = drawCodeButton({
      w: BTN_SIZE.w, h: BTN_SIZE.h,
      fillTop: colors.top, fillBottom: colors.bottom
    });
    s.position.set(center.x, center.y);
    s.eventMode = "static";
    s.cursor = "pointer";
    s.hitArea = new PIXI.Rectangle(-BTN_SIZE.w/2, -BTN_SIZE.h/2, BTN_SIZE.w, BTN_SIZE.h);

    // simple shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.28);
    shadow.drawRoundedRect(-BTN_SIZE.w/2, -BTN_SIZE.h/2, BTN_SIZE.w, BTN_SIZE.h, 6);
    shadow.endFill();
    shadow.position.set(center.x, center.y + 2);
    uiLayer.addChild(shadow);

    uiLayer.addChild(s);

    // press feedback
    s.on("pointerdown", ()=> { s.y += 2; s.scale.set(0.98); });
    s.on("pointerup", ()=> { s.y -= 2; s.scale.set(1.0); onClick && onClick(); });
    s.on("pointerupoutside", ()=> { s.y -= 2; s.scale.set(1.0); });
    s.on("pointercancel", ()=> { s.y -= 2; s.scale.set(1.0); });

    s.__btnId = (which==="green") ? "btn_green" : "btn_red";
    uiLayer.addChild(s);
  }

  await makeCodeButton("green", submitWord);     // submit
  await makeCodeButton("red",   clearSelection); // clear

  // ---------- TIMER ----------
  const faceTL = coords.timer && coords.timer.face ? { x:coords.timer.face.x, y:coords.timer.face.y } : { x:140, y:392 };
  const faceContainer = new PIXI.Container();
  faceContainer.position.set(faceTL.x + TIMER_R, faceTL.y + TIMER_R);
  uiLayer.addChild(faceContainer);

  const faceTex = await firstTexture([`assets/timer/face${suf()}.png`,`assets/timer/face@1x.png`]);
  if (faceTex){
    const s = new PIXI.Sprite(faceTex); s.anchor.set(0.5); s.width = s.height = TIMER_R*2; faceContainer.addChild(s);
  } else {
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0x000000, 0.5);
    g.beginFill(0x2b2f35);
    g.drawCircle(0,0,TIMER_R);
    g.endFill();
    faceContainer.addChild(g);
  }

  // ---------- LIGHTS ----------
  const bulbs = [];
  (coords.lights || []).forEach((L, i) => {
    const LIGHT_R = 2.4;
    const LIGHT_ALPHA = 0.55;
    const BLUR = 0.9;

    const dot = new PIXI.Graphics();
    dot.beginFill(0xfff080);
    dot.drawCircle(0, 0, LIGHT_R);
    dot.endFill();

    const spr = new PIXI.Sprite(app.renderer.generateTexture(dot));
    spr.anchor.set(0.5);
    spr.position.set(L.x, L.y);
    spr.alpha = LIGHT_ALPHA;

    const blur = new PIXI.BlurFilter(); // v7 API
    blur.blur = BLUR;
    spr.filters = [blur];

    spr.__lightIndex = i;
    fxLayer.addChild(spr);
    bulbs.push(spr);
  });

  // ---------- ROUND TIMER LOOP ----------
  const ROUND_S=180, WARN_S=10;
  let elapsed=0, running=true, warned=false;
  app.ticker.add((delta)=>{
    layout();
    if(!running) return;
    const dt=delta/60; elapsed+=dt;
    faceContainer.rotation=(elapsed*(Math.PI*2/ROUND_S))%(Math.PI*2);
    const rem=ROUND_S-elapsed;
    if(!warned && rem<=WARN_S && rem>0){ warned=true; bulbs.forEach(b=> b.alpha=1.0); }
    if(elapsed>=ROUND_S){
      running=false; faceContainer.rotation=0;
      let n=0; const iv=setInterval(()=>{ bulbs.forEach(b=> b.tint=(n%2?0xfff080:0xd92626)); if(++n>=4) clearInterval(iv); },160);
      // TODO: results/splash
    }
  });

  // keyboard helpers
  window.addEventListener("keydown", e=>{
    if (e.key==="Enter") submitWord();
    if (e.key==="Escape" || e.key==="Backspace") clearSelection();
    if (e.key===" "){ e.preventDefault(); running = !running; }
  });
})();

/* ======================= DEV PLACEMENT MODE (robust) ======================= */
(function devPlacementMode(){
  if (!app || !root) return;

  let devOn = false;
  let targets = [];
  let idx = 0;

  // ------- ensure markers exist on created nodes -------
  (function markGridRoot(){
    const gr = gridLayer.children.find(c => c instanceof PIXI.Container);
    if (gr) gr.__isGridRoot = true;
  })();
  (function markTimer(){
    const faceCont = uiLayer.children.find(c => c instanceof PIXI.Container && c.children && c.children.length);
    if (faceCont) faceCont.__isTimerFace = true;
  })();
  (function markCounter(){
    const bg = uiLayer.children.find(g => g instanceof PIXI.Graphics && !g.__isCounterBg);
    const txt = uiLayer.children.find(t => t instanceof PIXI.Text && !t.__isCounterTxt);
    if (bg) bg.__isCounterBg = true;
    if (txt) txt.__isCounterTxt = true;
  })();
  (function markButtons(){
    uiLayer.children.forEach(s=>{
      if (s.cursor === "pointer" && s.hitArea instanceof PIXI.Rectangle && !s.__btnId){
        const g = (coords.buttons||[]).find(b=>b.id==="btn_green");
        const r = (coords.buttons||[]).find(b=>b.id==="btn_red");
        if (g && Math.abs(s.x-g.x)<3 && Math.abs(s.y-g.y)<3) s.__btnId = "btn_green";
        if (r && Math.abs(s.x-r.x)<3 && Math.abs(s.y-r.y)<3) s.__btnId = "btn_red";
      }
    });
  })();
  (function markLights(){
    fxLayer.children.forEach((s,i)=>{ if (s && s.__lightIndex==null) s.__lightIndex = i; });
  })();

  function getButton(id){
    return (coords.buttons||[]).find(b => b.id === id) || null;
  }

  function rebuildTargets(){
    targets = [];

    // GRID
    targets.push({
      id: "GRID",
      get: () => ({ x: GRID.topLeftCenter.x, y: GRID.topLeftCenter.y }),
      set: (p) => {
        GRID.topLeftCenter.x = p.x;
        GRID.topLeftCenter.y = p.y;
        const gr = gridLayer.children.find(c => c.__isGridRoot);
        if (gr) gr.position.set(p.x, p.y);
      },
      draw: (g) => {
        const W = GRID.cols*GRID.size + (GRID.cols-1)*GRID.gutter;
        const H = GRID.rows*GRID.size + (GRID.rows-1)*GRID.gutter;
        const x = GRID.topLeftCenter.x - GRID.size/2;
        const y = GRID.topLeftCenter.y - GRID.size/2;
        g.lineStyle(1, 0x00ffff, 0.95).drawRect(x, y, W*(GRID.scale||1), H*(GRID.scale||1));
      }
    });

    // TIMER
    const t = coords.timer && coords.timer.face ? coords.timer.face : null;
    if (t){
      targets.push({
        id: "TIMER",
        get: () => ({ x: t.x + TIMER_R, y: t.y + TIMER_R }),
        set: (p) => {
          t.x = p.x - TIMER_R; t.y = p.y - TIMER_R;
          const cont = uiLayer.children.find(c => c.__isTimerFace);
          if (cont) cont.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0xffcc00, 0.95).drawCircle(t.x + TIMER_R, t.y + TIMER_R, TIMER_R+2)
      });
    }

    // COUNTER
    const c = coords.counter || null;
    if (c){
      targets.push({
        id: "COUNTER",
        get: () => ({ x: c.x + COUNTER_R, y: c.y + COUNTER_R }),
        set: (p) => {
          c.x = p.x - COUNTER_R; c.y = p.y - COUNTER_R;
          const bg = uiLayer.children.find(s => s.__isCounterBg);
          const txt = uiLayer.children.find(s => s.__isCounterTxt);
          if (bg) bg.position.set(p.x, p.y);
          if (txt) txt.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0x66ff66, 0.95).drawCircle(c.x + COUNTER_R, c.y + COUNTER_R, COUNTER_R+2)
      });
    }

    // BUTTONS
    const bg = getButton("btn_green");
    if (bg){
      targets.push({
        id: "BTN_GREEN",
        get: () => ({ x: bg.x, y: bg.y }),
        set: (p) => {
          bg.x = p.x; bg.y = p.y;
          const spr = uiLayer.children.find(s => s.__btnId === "btn_green");
          if (spr) spr.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0x66ffcc, 0.95).drawRect(bg.x-30, bg.y-12, 60, 24)
      });
    }
    const br = getButton("btn_red");
    if (br){
      targets.push({
        id: "BTN_RED",
        get: () => ({ x: br.x, y: br.y }),
        set: (p) => {
          br.x = p.x; br.y = p.y;
          const spr = uiLayer.children.find(s => s.__btnId === "btn_red");
          if (spr) spr.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0xff6666, 0.95).drawRect(br.x-30, br.y-12, 60, 24)
      });
    }

    // LIGHTS
    (coords.lights || []).forEach((L, i) => {
      targets.push({
        id: `LIGHT_${String(i+1).padStart(3,"0")}`,
        get: () => ({ x: L.x, y: L.y }),
        set: (p) => {
          L.x = p.x; L.y = p.y;
          const b = fxLayer.children.find(s => s.__lightIndex === i);
          if (b) b.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0xfff080, 0.95).drawCircle(L.x, L.y, 5)
      });
    });
  }

  // overlay HUD
  const overlay = new PIXI.Graphics();
  overlay.zIndex = 9999;
  root.sortableChildren = true;
  root.addChild(overlay);

  const hud = new PIXI.Text("", { fontFamily:"monospace", fontSize:10, fill:0xffffff });
  hud.position.set(6, 6);
  root.addChild(hud);
  hud.visible = false;

  function drawOverlay(){
    overlay.clear();
    hud.visible = devOn;
    if (!devOn || targets.length === 0) return;
    const t = targets[idx];
    t.draw(overlay);

    const p = t.get();
    overlay.lineStyle(1, 0xffffff, 0.8);
    overlay.moveTo(p.x-6, p.y); overlay.lineTo(p.x+6, p.y);
    overlay.moveTo(p.x, p.y-6); overlay.lineTo(p.x, p.y+6);

    hud.text = `DEV ON — target: ${t.id} @ (${Math.round(p.x)}, ${Math.round(p.y)})\nKeys: D toggle, Tab/[/]/\\ prev/next, arrows (Shift=×5), S save JSON, 1..5 quick jump`;
  }

  function selectNext(d){
    if (targets.length === 0) return;
    idx = (idx + d + targets.length) % targets.length;
    drawOverlay();
  }

  function selectByName(name){
    const j = targets.findIndex(t => t.id === name);
    if (j >= 0){ idx = j; drawOverlay(); }
  }

  function nudge(dx, dy, mult){
    if (!devOn || targets.length === 0) return;
    const t = targets[idx];
    const p = t.get();
    p.x += dx * mult;
    p.y += dy * mult;
    t.set(p);
    drawOverlay();
  }

  function saveJSON(){
    const blob = new Blob([JSON.stringify(coords, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ui_coords_full_with_timer_counter.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // build once now
  rebuildTargets(); drawOverlay();

  // key handling
  window.addEventListener("keydown", (e)=>{
    if (e.key === "d" || e.key === "D"){
      devOn = !devOn;
      overlay.visible = devOn;
      hud.visible = devOn;
      if (devOn) rebuildTargets();
      drawOverlay();
      console.log("[DEV] toggled:", devOn);
      return;
    }
    if (!devOn) return;

    if (e.key === "Tab"){ e.preventDefault(); selectNext(e.shiftKey?-1:+1); return; }
    if (e.key === "[" || e.key === "\\"){ e.preventDefault(); selectNext(-1); return; }
    if (e.key === "]" || e.key === "/"){  e.preventDefault(); selectNext(+1); return; }

    if (e.key === "1"){ selectByName("GRID"); return; }
    if (e.key === "2"){ selectByName("TIMER"); return; }
    if (e.key === "3"){ selectByName("COUNTER"); return; }
    if (e.key === "4"){ selectByName("BTN_GREEN"); return; }
    if (e.key === "5"){ selectByName("BTN_RED"); return; }

    if (e.key === "s" || e.key === "S"){ e.preventDefault(); saveJSON(); return; }

    if (e.key.startsWith("Arrow")){
      const mult = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft")  nudge(-1, 0, mult);
      if (e.key === "ArrowRight") nudge(+1, 0, mult);
      if (e.key === "ArrowUp")    nudge(0, -1, mult);
      if (e.key === "ArrowDown")  nudge(0, +1, mult);
      console.log("[DEV] nudge", targets[idx].id);
      return;
    }
  });
})();
