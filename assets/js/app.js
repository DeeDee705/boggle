// ------------------ CONFIG ------------------
const BASE = { w: 320, h: 480 }; // artboard size
const COORDS_URL = "assets/ui_coords_full_with_timer_counter.json"; // JSON in /assets

const GRID = {
  rows: 5, cols: 5,
  size: 38, gutter: 7,
  topLeftCenter: { x: 67.000, y: 122.000 }, // your latest
  scale: 0.96,        // shrink whole raster slightly (tweak here)
  overlayScale: 0.95  // overlay slightly smaller than tile base
};

const TIMER_R   = 26;
const COUNTER_R = 18;
const BTN_SIZE  = { w: 60, h: 24 };

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

  // grid root anchored at top-left tile center, so scaling won't drift the anchor
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

  // letters (placeholder)
  const ALPH="EEEEEEEEEEEEAAAAAAAIIIIIIIONNNNRRRRTTTTTLLLLSSSSUUUUDDGGBBCCMMPPFFHHVVWWYYKJXQZ";
  function rollLetters(){
    for (let i=0;i<letters.length;i++){
      letters[i].text = ALPH[Math.floor(Math.random()*ALPH.length)];
      letters[i].alpha=1; tiles[i].cont.alpha=1; if (tiles[i].overlay) tiles[i].overlay.tint=0xFFFFFF;
    }
  }
  rollLetters();

  // simple select toggle (MVP)
  const selected=[];
  tiles.forEach((t,i)=>{
    t.cont.on("pointerdown", ()=>{
      const k = selected.indexOf(i);
      if (k>=0){ selected.splice(k,1); t.cont.alpha=1; if(t.overlay) t.overlay.tint=0xFFFFFF; }
      else     { selected.push(i);     t.cont.alpha=0.95; if(t.overlay) t.overlay.tint=0xE9FFD6; }
    });
  });
  function clearSelection(){ selected.splice(0); tiles.forEach(t=>{ t.cont.alpha=1; if(t.overlay) t.overlay.tint=0xFFFFFF; }); }

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
  function setWordCount(n){ counterText.text = String(n); }
  function submitWord(){ if(!selected.length) return; wordsCount++; setWordCount(wordsCount); clearSelection(); }

  // ---------- BUTTONS ----------
  function btnPaths(base){
    const s=suf();
    return { up:`assets/buttons/${base}${s}.png`, down:`assets/buttons/${base}Press${s}.png` };
  }
  function findBtn(which){
    const b = (coords.buttons||[]).find(b => which==="green" ? b.id==="btn_green" : b.id==="btn_red");
    return b ? { x:b.x, y:b.y } : null;
  }
  async function makeButton(which, baseName, onClick){
    const center = findBtn(which) || (which==="green" ? {x:132,y:430} : {x:188,y:430});
    const p = btnPaths(baseName);
    const [texUp, texDown] = await Promise.all([tryLoad(p.up), tryLoad(p.down)]);
    const s = new PIXI.Sprite(texUp || texDown);
    s.anchor.set(0.5); s.position.set(center.x, center.y);
    if (s.width && s.height){
      const sx = BTN_SIZE.w/s.width, sy = BTN_SIZE.h/s.height; s.scale.set(sx, sy);
    }
    s.eventMode="static"; s.cursor="pointer";
    s.hitArea = new PIXI.Rectangle(-BTN_SIZE.w/2, -BTN_SIZE.h/2, BTN_SIZE.w, BTN_SIZE.h);
    s.on("pointerdown", ()=>{ if (texDown) s.texture = texDown; });
    s.on("pointerup",   ()=>{ if (texUp)   s.texture = texUp; onClick && onClick(); });
    s.on("pointerupoutside", ()=>{ if (texUp) s.texture = texUp; });
    s.on("pointercancel",    ()=>{ if (texUp) s.texture = texUp; });
    uiLayer.addChild(s);
  }
  await makeButton("green","leftButton", submitWord);
  await makeButton("red","rightButton",   clearSelection);

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
  const bulbs=[];
  (coords.lights||[]).forEach(L=>{
    const dot = new PIXI.Graphics();
    dot.beginFill(0xfff080);
    dot.drawCircle(0,0,3.6);
    dot.endFill();
    const spr = new PIXI.Sprite(app.renderer.generateTexture(dot));
    spr.anchor.set(0.5);
    spr.position.set(L.x, L.y);
    spr.alpha = 0.7;
    const blur = new PIXI.filters.BlurFilter(); blur.blur = 1.4; spr.filters = [blur];
    fxLayer.addChild(spr); bulbs.push(spr);
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
/* ======================= DEV PLACEMENT MODE ======================= */
/* Paste this below the closing "})();" of your init IIFE.            */
/* Hotkeys:                                                           */
/*   D           => toggle dev mode                                   */
/*   [ / ]       => previous / next target                            */
/*   Arrows      => move ±1px  (Shift+Arrows => ±5px)                 */
/*   S           => save & download updated JSON                      */

(function devPlacementMode(){
  // Wait until PIXI is ready and our globals from init exist
  if (!app || !root) return;

  let devOn = false;
  let targets = [];
  let idx = 0;

  // Helpers to find objects we created in init()
  function getButtonCenter(id){
    const b = (coords.buttons||[]).find(x => x.id === id);
    return b ? {x:b.x, y:b.y, ref:b} : null;
  }

  // Build the selectable target list
  function rebuildTargets(){
    targets = [];

    // 1) GRID (top-left tile center)
    targets.push({
      id: "GRID",
      get: () => ({ x: GRID.topLeftCenter.x, y: GRID.topLeftCenter.y }),
      set: (p) => {
        GRID.topLeftCenter.x = p.x;
        GRID.topLeftCenter.y = p.y;
        // our code uses gridRoot positioned at the top-left tile center
        const gr = gridLayer.children.find(c => c.__isGridRoot);
        if (gr) gr.position.set(GRID.topLeftCenter.x, GRID.topLeftCenter.y);
      },
      draw: (g) => {
        const W = GRID.cols*GRID.size + (GRID.cols-1)*GRID.gutter;
        const H = GRID.rows*GRID.size + (GRID.rows-1)*GRID.gutter;
        const x = GRID.topLeftCenter.x - GRID.size/2;
        const y = GRID.topLeftCenter.y - GRID.size/2;
        g.lineStyle(1, 0x00ffff, 0.9).drawRect(x, y, W*(GRID.scale||1), H*(GRID.scale||1));
      }
    });

    // 2) TIMER (stored as top-left in JSON; we show/adjust by CENTER)
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
        draw: (g) => {
          const cx = t.x + TIMER_R, cy = t.y + TIMER_R;
          g.lineStyle(1, 0xffcc00, 0.9).drawCircle(cx, cy, TIMER_R+2);
        }
      });
    }

    // 3) COUNTER (stored top-left; adjust via CENTER)
    const c = coords.counter || null;
    if (c){
      targets.push({
        id: "COUNTER",
        get: () => ({ x: c.x + COUNTER_R, y: c.y + COUNTER_R }),
        set: (p) => {
          c.x = p.x - COUNTER_R; c.y = p.y - COUNTER_R;
          const bg = uiLayer.children.find(s => s.__isCounterBg);
          const txt = uiLayer.children.find(s => s.__isCounterTxt);
          if (bg){ bg.position.set(p.x, p.y); }
          if (txt){ txt.position.set(p.x, p.y); }
        },
        draw: (g) => {
          const cx = c.x + COUNTER_R, cy = c.y + COUNTER_R;
          g.lineStyle(1, 0x66ff66, 0.9).drawCircle(cx, cy, COUNTER_R+2);
        }
      });
    }

    // 4) BUTTONS (centers)
    const bg = getButtonCenter("btn_green");
    const br = getButtonCenter("btn_red");
    if (bg){
      targets.push({
        id: "BTN_GREEN",
        get: () => ({ x: bg.ref.x, y: bg.ref.y }),
        set: (p) => {
          bg.ref.x = p.x; bg.ref.y = p.y;
          const spr = uiLayer.children.find(s => s.__btnId === "btn_green");
          if (spr) spr.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0x66ffcc, 0.9).drawRect(bg.ref.x-30, bg.ref.y-12, 60, 24)
      });
    }
    if (br){
      targets.push({
        id: "BTN_RED",
        get: () => ({ x: br.ref.x, y: br.ref.y }),
        set: (p) => {
          br.ref.x = p.x; br.ref.y = p.y;
          const spr = uiLayer.children.find(s => s.__btnId === "btn_red");
          if (spr) spr.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0xff6666, 0.9).drawRect(br.ref.x-30, br.ref.y-12, 60, 24)
      });
    }

    // 5) LIGHTS (individual bulbs)
    (coords.lights || []).forEach((L, i) => {
      targets.push({
        id: `LIGHT_${String(i+1).padStart(3,"0")}`,
        get: () => ({ x: L.x, y: L.y }),
        set: (p) => {
          L.x = p.x; L.y = p.y;
          const b = fxLayer.children.find(s => s.__lightIndex === i);
          if (b) b.position.set(p.x, p.y);
        },
        draw: (g) => g.lineStyle(1, 0xfff080, 0.9).drawCircle(L.x, L.y, 5)
      });
    });
  }

  // Visual overlay
  const overlay = new PIXI.Graphics();
  overlay.zIndex = 9999;
  root.addChild(overlay);
  root.sortableChildren = true;

  function drawOverlay(){
    overlay.clear();
    if (!devOn || targets.length === 0) return;
    const t = targets[idx];
    t.draw(overlay);

    // crosshair
    const p = t.get();
    overlay.lineStyle(1, 0xffffff, 0.7);
    overlay.moveTo(p.x - 6, p.y); overlay.lineTo(p.x + 6, p.y);
    overlay.moveTo(p.x, p.y - 6); overlay.lineTo(p.x, p.y + 6);

    // label
    const label = new PIXI.Text(`${t.id}  (${Math.round(p.x)}, ${Math.round(p.y)})`, {
      fontFamily: "monospace", fontSize: 10, fill: 0xffffff
    });
    label.position.set(p.x + 8, p.y + 8);
    overlay.addChild(label);
  }

  function selectNext(d){
    if (targets.length === 0) return;
    idx = (idx + d + targets.length) % targets.length;
    drawOverlay();
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
    // Rebuild buttons array from coords (already updated)
    const blob = new Blob([JSON.stringify(coords, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ui_coords_full_with_timer_counter.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // Hook up nodes we want to move live (timer face, counter pieces, buttons, bulbs)
  // Mark some sprites so setters can find them quickly
  // (We created them in init(); mark them now, safely if they exist.)
  const faceCont = uiLayer.children.find(c => c instanceof PIXI.Container && c.children.length);
  if (faceCont) faceCont.__isTimerFace = true;

  const counterBg = uiLayer.children.find(g => g instanceof PIXI.Graphics && !g.__isMarkedCounter);
  if (counterBg){ counterBg.__isMarkedCounter = true; counterBg.__isCounterBg = true; }
  const counterText = uiLayer.children.find(t => t instanceof PIXI.Text && !t.__isMarkedCounter);
  if (counterText){ counterText.__isMarkedCounter = true; counterText.__isCounterTxt = true; }

  // Mark buttons & bulbs
  uiLayer.children.forEach(s=>{
    if (s.cursor === "pointer" && s.hitArea instanceof PIXI.Rectangle){
      // Guess id by x, y matching coords
      const bg = getButtonCenter("btn_green");
      const br = getButtonCenter("btn_red");
      if (bg && Math.abs(s.x - bg.ref.x) < 2 && Math.abs(s.y - bg.ref.y) < 2) s.__btnId = "btn_green";
      if (br && Math.abs(s.x - br.ref.x) < 2 && Math.abs(s.y - br.ref.y) < 2) s.__btnId = "btn_red";
    }
  });
  fxLayer.children.forEach((s, i)=>{ s.__lightIndex = i; });

  // mark gridRoot so GRID setter can find it
  const gr = gridLayer.children.find(c => c instanceof PIXI.Container);
  if (gr) gr.__isGridRoot = true;

  // Build initial targets and draw
  rebuildTargets();
  drawOverlay();

  // Keyboard controls
  window.addEventListener("keydown", (e)=>{
    if (e.key === "d" || e.key === "D"){
      devOn = !devOn;
      overlay.visible = devOn;
      drawOverlay();
    }
    if (!devOn) return;

    if (e.key === "[")       { selectNext(-1); }
    else if (e.key === "]")  { selectNext(+1); }
    else if (e.key === "s" || e.key === "S") { e.preventDefault(); saveJSON(); }
    else if (e.key.startsWith("Arrow")){
      const mult = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft")  nudge(-1, 0, mult);
      if (e.key === "ArrowRight") nudge(+1, 0, mult);
      if (e.key === "ArrowUp")    nudge(0, -1, mult);
      if (e.key === "ArrowDown")  nudge(0, +1, mult);
    }
  });
})();
