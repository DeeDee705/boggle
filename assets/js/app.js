// ---- CONFIG ----
const BASE = { w: 320, h: 480 }; // artboard size
const COORDS_URL = "assets/ui_coords_full_with_timer_counter.json"; // keep in /assets
const GRID = { rows: 5, cols: 5, size: 38, gutter: 5, topLeftCenter: { x: 72.366, y: 254.0 } };
const TIMER_R = 26, COUNTER_R = 18;
const BTN_SIZE = { w: 60, h: 24 };

// ---- PIXI APP ----
const app = new PIXI.Application({ backgroundAlpha: 0, autoDensity: true, antialias: true, resizeTo: window });
document.getElementById("app").appendChild(app.view);

const root = new PIXI.Container(); app.stage.addChild(root);
const frameLayer = new PIXI.Container();
const gridLayer  = new PIXI.Container();
const uiLayer    = new PIXI.Container();
const fxLayer    = new PIXI.Container();
root.addChild(frameLayer, gridLayer, uiLayer, fxLayer);

// layout: center + scale to fit viewport
function layout() {
  const vw = app.renderer.width, vh = app.renderer.height;
  const s = Math.min(vw / BASE.w, vh / BASE.h);
  root.scale.set(s);
  root.position.set((vw - BASE.w * s) / 2, (vh - BASE.h * s) / 2);
}
function relayoutSoon(){ requestAnimationFrame(layout); requestAnimationFrame(layout); }
window.addEventListener("resize", layout);
app.renderer.on("resize", layout);
layout(); requestAnimationFrame(layout);

// helpers
const DPR = window.devicePixelRatio || 1;
const suf = () => (DPR >= 2.5 ? "@3x" : DPR >= 1.5 ? "@2x" : "@1x");
async function tryLoad(u){ try{ return await PIXI.Assets.load(u);}catch{ return null; } }
async function firstTexture(paths){ for (const p of paths){ const t = await tryLoad(p); if (t) return t; } return null; }

// ---- LOAD COORDS (robust with fallback) ----
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

  // ---- FRAME ----
  const frameTex = await firstTexture([`assets/frame/frame${suf()}.png`, `assets/frame/frame@1x.png`]);
  if (frameTex) {
    const s = new PIXI.Sprite(frameTex);
    s.width = BASE.w; s.height = BASE.h;
    frameLayer.addChild(s);
    relayoutSoon();
  } else {
    frameLayer.addChild(new PIXI.Graphics().roundRect(0,0,BASE.w,BASE.h,12).fill(0x1a2029));
  }

  // ---- TILES: coded base + overlay PNG + letters ----
  const overlayTex = await firstTexture([`assets/tiles/tile_base${suf()}.png`, `assets/tiles/tile_base@1x.png`]); // overlay only
  function makeTile(x,y,size){
    const cont = new PIXI.Container(); cont.position.set(x,y); cont.eventMode = "static";
    // base (coded)
    const baseG = new PIXI.Graphics();
baseG.lineStyle(1, 0xcad3df, 0.9);
baseG.beginFill(0xf8fbff);
baseG.drawRoundedRect(-size/2, -size/2, size, size, 5);
baseG.endFill();
    cont.addChild(baseG);
    // letter
    const letter = new PIXI.Text("", new PIXI.TextStyle({
      fontFamily:"system-ui, -apple-system, Segoe UI, Roboto",
      fontWeight:"800", fontSize: Math.round(size*0.72),
      fill:0x23303a, stroke:0xffffff, strokeThickness:2
    }));
    letter.anchor.set(0.5); cont.addChild(letter);
    // overlay (filigree)
    let overlay = null;
    if (overlayTex){ overlay = new PIXI.Sprite(overlayTex); overlay.anchor.set(0.5); overlay.width = overlay.height = size; cont.addChild(overlay); }
    return { cont, letter, overlay };
  }

  const tiles = [], letters = [];
  for (let r=0;r<GRID.rows;r++){
    for (let c=0;c<GRID.cols;c++){
      const cx = GRID.topLeftCenter.x + c*(GRID.size+GRID.gutter);
      const cy = GRID.topLeftCenter.y + r*(GRID.size+GRID.gutter);
      const { cont, letter, overlay } = makeTile(cx, cy, GRID.size);
      gridLayer.addChild(cont);
      tiles.push({ cont, overlay }); letters.push(letter);
    }
  }

  // roll letters (placeholder)
  const ALPH = "EEEEEEEEEEEEAAAAAAAIIIIIIIONNNNRRRRTTTTTLLLLSSSSUUUUDDGGBBCCMMPPFFHHVVWWYYKJXQZ";
  function rollLetters(){ for (let i=0;i<letters.length;i++){ letters[i].text = ALPH[Math.floor(Math.random()*ALPH.length)]; letters[i].alpha=1; tiles[i].cont.alpha=1; if (tiles[i].overlay) tiles[i].overlay.tint=0xFFFFFF; } }
  rollLetters();

  // selection MVP
  const selected = [];
  tiles.forEach((t,i)=>{
    t.cont.on("pointerdown", ()=>{
      const k = selected.indexOf(i);
      if (k >= 0){ selected.splice(k,1); t.cont.alpha=1; if (t.overlay) t.overlay.tint=0xFFFFFF; }
      else       { selected.push(i);     t.cont.alpha=0.95; if (t.overlay) t.overlay.tint=0xE9FFD6; }
    });
  });
  function clearSelection(){ selected.splice(0); tiles.forEach(t=>{ t.cont.alpha=1; if (t.overlay) t.overlay.tint=0xFFFFFF; }); }

  // ---- COUNTER (coords.counter is TOP-LEFT) ----
  const counterPos = coords.counter ? { x: coords.counter.x + COUNTER_R, y: coords.counter.y + COUNTER_R } : { x:160, y:40 };
  const counterBg = new PIXI.Graphics().circle(0,0,COUNTER_R).fill(0x24303a);
  counterBg.position.set(counterPos.x, counterPos.y); uiLayer.addChild(counterBg);
  const counterText = new PIXI.Text("0", new PIXI.TextStyle({ fontFamily:"system-ui, -apple-system, Segoe UI, Roboto", fontWeight:"800", fontSize:16, fill:0xffffff }));
  counterText.anchor.set(0.5); counterText.position.copyFrom(counterBg.position); uiLayer.addChild(counterText);
  let wordsCount = 0; function setWordCount(n){ counterText.text = String(n); }
  function submitWord(){ if (!selected.length) return; wordsCount++; setWordCount(wordsCount); clearSelection(); }

  // ---- BUTTONS (PNG + pressed) ----
  function btnPaths(base){ const s = suf(); return { up:`assets/buttons/${base}${s}.png`, down:`assets/buttons/${base}Press${s}.png` }; }
  function findBtn(which){
    const b = (coords.buttons||[]).find(b => which==="green" ? b.id==="btn_green" : b.id==="btn_red");
    return b ? { x: b.x, y: b.y } : null;
  }
  async function makeButton(which, baseName, onClick){
    const center = findBtn(which); if (!center) return;
    const p = btnPaths(baseName);
    const [texUp, texDown] = await Promise.all([tryLoad(p.up), tryLoad(p.down)]);
    const s = new PIXI.Sprite(texUp || texDown); s.anchor.set(0.5); s.position.set(center.x, center.y);
    if (s.width && s.height){ const sx = BTN_SIZE.w / s.width, sy = BTN_SIZE.h / s.height; s.scale.set(sx, sy); }
    s.eventMode="static"; s.cursor="pointer";
    s.hitArea = new PIXI.Rectangle(-BTN_SIZE.w/2, -BTN_SIZE.h/2, BTN_SIZE.w, BTN_SIZE.h);
    s.on("pointerdown", ()=>{ if (texDown) s.texture = texDown; });
    s.on("pointerup",   ()=>{ if (texUp)   s.texture = texUp;   onClick && onClick(); });
    s.on("pointerupoutside", ()=>{ if (texUp) s.texture = texUp; });
    s.on("pointercancel",    ()=>{ if (texUp) s.texture = texUp; });
    uiLayer.addChild(s);
  }
  await makeButton("green", "leftButton",  submitWord);
  await makeButton("red",   "rightButton", clearSelection);

  // ---- TIMER (coords.timer.face is TOP-LEFT) ----
  const faceTL = coords.timer && coords.timer.face ? { x: coords.timer.face.x, y: coords.timer.face.y } : { x: 140, y: 392 };
  const faceContainer = new PIXI.Container(); faceContainer.position.set(faceTL.x + TIMER_R, faceTL.y + TIMER_R); uiLayer.addChild(faceContainer);
  const faceTex = await firstTexture([`assets/timer/face${suf()}.png`,`assets/timer/face@1x.png`]);
  if (faceTex){ const s = new PIXI.Sprite(faceTex); s.anchor.set(0.5); s.width = s.height = TIMER_R * 2; faceContainer.addChild(s); }
  else { faceContainer.addChild(new PIXI.Graphics().circle(0,0,TIMER_R).fill(0x2b2f35).stroke({ width:2, color:0x000, alpha:.5 })); }

  // ---- LIGHTS (coded dots) ----
  const bulbs = [];
  (coords.lights || []).forEach(L=>{
    const dot = new PIXI.Graphics().circle(0,0,3.6).fill(0xfff080);
    const spr = new PIXI.Sprite(app.renderer.generateTexture(dot)); spr.anchor.set(0.5);
    spr.position.set(L.x, L.y); spr.alpha = 0.7;
    const blur = new PIXI.filters.BlurFilter(); blur.blur = 1.4; spr.filters = [blur];
    fxLayer.addChild(spr); bulbs.push(spr);
  });

  // ---- ROUND TIMER LOOP ----
  const ROUND_S = 180, WARN_S = 10;
  let elapsed = 0, running = true, warned = false;
  app.ticker.add((delta)=>{
    layout();
    if (!running) return;
    const dt = delta / 60; elapsed += dt;
    faceContainer.rotation = (elapsed * (Math.PI * 2 / ROUND_S)) % (Math.PI * 2);
    const remaining = ROUND_S - elapsed;
    if (!warned && remaining <= WARN_S && remaining > 0){ warned = true; bulbs.forEach(b=> b.alpha = 1.0); }
    if (elapsed >= ROUND_S){
      running = false; faceContainer.rotation = 0;
      let n=0; const iv = setInterval(()=>{ bulbs.forEach(b=> b.tint = (n%2 ? 0xfff080 : 0xd92626)); if(++n>=4) clearInterval(iv); }, 160);
      // TODO: splash/results
    }
  });

  // keyboard helpers
  window.addEventListener("keydown", e=>{
    if (e.key === "Enter") submitWord();
    if (e.key === "Escape" || e.key === "Backspace") clearSelection();
    if (e.key === " "){ e.preventDefault(); running = !running; }
  });
})();
