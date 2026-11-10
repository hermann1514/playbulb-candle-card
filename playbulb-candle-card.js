/*!
 * playbulb-candle-card
 * Home-Assistant-Karte für MIPOW Playbulb Candle (Integration "playbulb_candle").
 * Zeigt die Lampe als SVG in der aktuellen Farbe. Eine Datei, kein Build.
 * Alle Optionen sind im visuellen Editor einstellbar.
 *
 * YAML (alles außer entity optional):
 *   type: custom:playbulb-candle-card
 *   entity: light.playbulb_candle
 *   layout: vertical              # vertical (Standard) | horizontal (kompakt)
 *   show_battery: true            # Batteriesymbol in der Statuszeile
 *   battery_entity: sensor.xyz    # leer = automatisch über das Gerät der Lampe
 *   battery_warning: 50           # ab hier (≤) gelb
 *   battery_critical: 20          # ab hier (≤) rot
 *   icon_tap_action:   { action: toggle }
 *   icon_hold_action:  { action: more-info }
 *   tap_action:        { action: none }
 */

const PBC_VERSION = "1.6.0";
const PBC_WARM_WHITE = [255, 196, 120]; // Farbton des Weißkanals der Kerze
const PBC_HOLD_MS = 500;   // ab dieser Dauer gilt ein Druck als "Halten"
const PBC_DOUBLE_MS = 250; // Wartezeit auf den zweiten Tipp
const PBC_MOVE_PX = 10;    // mehr Bewegung = Scrollen, keine Geste

const PBC_DEFAULTS = {
  layout: "vertical",
  show_name: true,
  show_state: true,
  show_brightness: true,
  show_color_picker: true,
  show_effects: true,
  show_battery: true,
  battery_warning: 50,
  battery_critical: 20,
};

// Batteriesymbol (liegend): Innenraum für den Füllbalken
const PBC_BATT_X = 2.5, PBC_BATT_W = 16;
const PBC_BATT_SVG = `
<svg viewBox="0 0 24 12" aria-hidden="true">
  <rect x=".75" y=".75" width="19.5" height="10.5" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="20.75" y="3.75" width="2.25" height="4.5" rx="1" fill="currentColor"/>
  <rect class="batt-fill" id="battfill" x="${PBC_BATT_X}" y="2.5" width="0" height="7" rx="1"/>
</svg>`;

// Standardaktionen wie bei der HA-Button-Karte (Lampe) bzw. ohne Aktion (Karte)
const PBC_ACTION_DEFAULTS = {
  icon_tap_action: "toggle",
  icon_hold_action: "more-info",
  icon_double_tap_action: "none",
  tap_action: "none",
  hold_action: "none",
  double_tap_action: "none",
};

const pbcClamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Bis v1.3 war tap_action ein String und galt für die Lampe.
function pbcMigrate(config) {
  const c = { ...config };
  if (typeof c.tap_action === "string") {
    if (!c.icon_tap_action) c.icon_tap_action = { action: c.tap_action };
    delete c.tap_action;
  }
  return c;
}

function pbcHsv(h, s, v) {
  // h: 0-360, s/v: 0-1
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

// RGB -> [Farbton 0-360, Sättigung 0-1]
function pbcRgbToHs([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (max <= 0 || d === 0) return [0, 0];
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / max];
}

// Tippen / Doppeltippen / Halten auf einem Element erkennen.
// Bewegt sich der Finger mehr als PBC_MOVE_PX, wird nichts ausgelöst (Scrollen).
function pbcGestures(el, { canHold, canDouble, ignore, onAction }) {
  let start = null, holdTimer = null, held = false, dblTimer = null;
  const reset = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    start = null;
  };
  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || (ignore && ignore(ev))) return;
    start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    held = false;
    clearTimeout(holdTimer);
    if (canHold()) {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        held = true;
        onAction("hold");
      }, PBC_HOLD_MS);
    }
  });
  el.addEventListener("pointermove", (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > PBC_MOVE_PX) reset();
  });
  el.addEventListener("pointerup", (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    reset();
    if (held) return;
    if (!canDouble()) {
      onAction("tap");
    } else if (dblTimer) {
      clearTimeout(dblTimer);
      dblTimer = null;
      onAction("double_tap");
    } else {
      dblTimer = setTimeout(() => {
        dblTimer = null;
        onAction("tap");
      }, PBC_DOUBLE_MS);
    }
  });
  el.addEventListener("pointercancel", reset);
  el.addEventListener("contextmenu", (ev) => {
    // Langes Drücken öffnet auf dem Handy sonst das Kontextmenü
    if (canHold() && !(ignore && ignore(ev))) ev.preventDefault();
  });
  el.addEventListener("keydown", (ev) => {
    if (ev.target !== el || (ev.key !== "Enter" && ev.key !== " ")) return;
    ev.preventDefault();
    onAction("tap");
  });
}

// mdi:creation (Effekt-Symbol wie im HA-Detail-Dialog)
const PBC_ICON_FX =
  "M19,1L17.74,3.75L15,5L17.74,6.26L19,9L20.25,6.26L23,5L20.25,3.75M9,4L6.5,9.5L1,12L6.5,14.5L9,20" +
  "L11.5,14.5L17,12L11.5,9.5M19,15L17.74,17.74L15,19L17.74,20.25L19,23L20.25,20.25L23,19L20.25,17.74";

const PBC_STYLE = `
  :host { display: block; height: 100%; }
  ha-card {
    height: 100%; box-sizing: border-box; padding: 16px;
    overflow: hidden; isolation: isolate;
    display: flex; flex-direction: column;
  }
  ha-card.compact { padding: 12px; }
  ha-card.actionable { cursor: pointer; }
  ha-card.actionable, .lampbox {
    -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none;
    -webkit-user-select: none; user-select: none; touch-action: manipulation;
  }
  ha-card:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: -2px; }
  .root {
    --c: rgb(255,196,120); --glow: 0; --tint: 0; --flame: 1;
    --sc: var(--c);
    display: flex; flex-direction: column; gap: 12px;
    margin-block: auto; min-width: 0;
  }
  .root.off { --sc: var(--state-inactive-color, #9e9e9e); }
  .root.unavail { opacity: .5; }

  .head { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
  .lampbox { width: 100%; max-width: 230px; border-radius: 12px; outline: none; cursor: default; }
  .lampbox.actionable { cursor: pointer; }
  .lampbox:focus-visible { box-shadow: 0 0 0 2px var(--primary-color, #03a9f4); }
  svg { display: block; width: 100%; height: auto; aspect-ratio: 236 / 245; }
  .lit { transition: opacity .5s ease; }
  .root.off .lit, .root.unavail .lit { opacity: 0; }
  .glow  { opacity: var(--glow); }
  .tint  { opacity: var(--tint); }
  .inner { opacity: var(--flame); }
  .flame { fill: url(#flameGrad); opacity: var(--flame);
           transform-box: fill-box; transform-origin: 50% 100%; }
  .core  { fill: #fff; opacity: .75; filter: blur(1.5px);
           transform-box: fill-box; transform-origin: 50% 50%; }

  .root.fx-candle .core  { animation: pbc-flicker 1.1s ease-in-out infinite; }
  .root.fx-candle .inner { animation: pbc-glowflicker 1.7s ease-in-out infinite; }
  .root.fx-pulse  .lit   { animation: pbc-pulse 1.8s ease-in-out infinite; }
  .root.fx-flash  .lit   { animation: pbc-flash .9s linear infinite; }
  @keyframes pbc-flicker {
    0%,100% { transform: scale(1,1); opacity: .75; }
    20% { transform: scale(1.15,.9); opacity: .55; }
    45% { transform: scale(.9,1.1); opacity: .85; }
    70% { transform: scale(1.08,.95); opacity: .6; }
  }
  @keyframes pbc-glowflicker {
    0%,100% { opacity: var(--flame); } 30% { opacity: calc(var(--flame) * .8); }
    60% { opacity: calc(var(--flame) * .95); } 80% { opacity: calc(var(--flame) * .75); }
  }
  @keyframes pbc-pulse { 0%,100% { opacity: 1; } 50% { opacity: .15; } }
  @keyframes pbc-flash { 0%,40% { opacity: 1; } 45%,70% { opacity: .04; } 75%,100% { opacity: 1; } }

  .info { text-align: center; min-width: 0; max-width: 100%; }
  .name { font-size: 1.1em; font-weight: 500; color: var(--primary-text-color); overflow-wrap: anywhere; }
  .state { font-size: .9em; color: var(--secondary-text-color); overflow-wrap: anywhere; }

  /* --- Statuszeile mit Batteriesymbol --- */
  .stline {
    display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
    column-gap: 8px; row-gap: 2px; min-width: 0;
  }
  .stline .state { min-width: 0; }
  .batt {
    display: inline-flex; align-items: center; gap: 4px; flex: none;
    font-size: .9em; line-height: 1; color: var(--secondary-text-color);
    font-variant-numeric: tabular-nums;
  }
  .batt svg { display: block; width: 22px; height: 11px; aspect-ratio: auto; }
  .batt-fill { fill: var(--bc, transparent); transition: fill .3s ease; }
  .batt.good { --bc: var(--state-sensor-battery-high-color, var(--green-color, #4caf50)); }
  .batt.mid  { --bc: var(--state-sensor-battery-medium-color, var(--yellow-color, #ffc107)); }
  .batt.low  { --bc: var(--state-sensor-battery-low-color, var(--red-color, #f44336)); }

  /* --- Kompakt: kleine Lampe neben Name/Status --- */
  .lay-horizontal .head { flex-direction: row; gap: 12px; }
  .lay-horizontal .lampbox { width: 64px; flex: none; }
  .lay-horizontal .info { text-align: left; flex: 1; }
  .lay-horizontal .name, .lay-horizontal .state {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lay-horizontal .stline { justify-content: flex-start; flex-wrap: nowrap; }
  .lay-horizontal .wheel { max-width: 200px; }

  /* --- Helligkeit: Stil wie ha-control-slider (Kachel-Feature) --- */
  .csw { position: relative; }
  .cs {
    --p: 0; position: relative; height: 42px; border-radius: 12px; overflow: hidden;
    cursor: pointer; outline: none; touch-action: pan-y; user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .cs::before {
    content: ""; position: absolute; inset: 0; background: var(--sc); opacity: .2;
    transition: background-color .18s ease-in-out;
  }
  .cs-bar {
    position: absolute; top: 0; bottom: 0; left: 0; width: calc(var(--p) * 100%);
    background: var(--sc); transition: width .18s ease-in-out, background-color .18s ease-in-out;
  }
  .cs.drag .cs-bar { transition: background-color .18s ease-in-out; }
  .cs-bar::after {
    content: ""; position: absolute; top: 0; bottom: 0; right: 5px; margin: auto;
    width: 4px; height: 50%; border-radius: 4px; background: #fff; opacity: .9;
  }
  .cs[data-zero] .cs-bar::after { display: none; }
  .cs:focus-visible { box-shadow: 0 0 0 2px var(--sc); }
  .cs-tip {
    position: absolute; bottom: calc(100% + 6px); left: calc(var(--p) * 100%);
    transform: translateX(-50%); padding: 4px 10px; border-radius: 10px; pointer-events: none;
    font-size: 14px; line-height: 20px; white-space: nowrap;
    background: var(--card-background-color, #fff); color: var(--primary-text-color);
    box-shadow: 0 2px 8px rgba(0,0,0,.25); opacity: 0; transition: opacity .18s ease;
  }
  .csw.tip .cs-tip { opacity: 1; }

  /* --- Farbrad: Stil wie ha-hs-color-picker --- */
  .wheel {
    --x: 50%; --y: 50%; position: relative; align-self: center;
    width: calc(100% - 16px); max-width: 240px; aspect-ratio: 1;
    border-radius: 50%; cursor: pointer; touch-action: none; user-select: none; outline: none;
    background:
      radial-gradient(circle closest-side, #fff, rgba(255,255,255,0)),
      conic-gradient(from 90deg,
        hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%),
        hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%));
    -webkit-tap-highlight-color: transparent;
  }
  .mk {
    position: absolute; left: var(--x); top: var(--y); width: 28px; height: 28px;
    transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none;
    background: var(--mc, #fff); border: 3px solid #fff; box-sizing: border-box;
    box-shadow: 0 0 0 1px rgba(0,0,0,.15), 0 2px 6px rgba(0,0,0,.35);
    transition: width .15s ease, height .15s ease;
  }
  .wheel.drag .mk { width: 36px; height: 36px; }
  .wheel:focus-visible .mk { box-shadow: 0 0 0 2px var(--primary-color, #03a9f4), 0 2px 6px rgba(0,0,0,.35); }
  .wheel.nomk .mk { display: none; }
  .wheel.disabled { pointer-events: none; opacity: .5; }

  /* --- Effekt: Stil wie im HA-Detail-Dialog (ha-control-select-menu) --- */
  .eff { align-self: center; max-width: 100%; }
  .eff-btn {
    position: relative; display: flex; align-items: center; gap: 12px;
    box-sizing: border-box; min-width: 160px; max-width: 100%; height: 56px;
    padding: 0 10px 0 16px; margin: 0; border: none; border-radius: 12px;
    font: inherit; text-align: left; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--primary-text-color, #000) 8%, transparent);
    cursor: pointer; outline: none; overflow: hidden;
    -webkit-tap-highlight-color: transparent;
    transition: background-color .18s ease;
  }
  .eff-btn:hover { background: color-mix(in srgb, var(--primary-text-color, #000) 12%, transparent); }
  .eff-btn:focus-visible { box-shadow: 0 0 0 2px var(--primary-color, #03a9f4); }
  .eff-btn[aria-expanded="true"] { background: color-mix(in srgb, var(--primary-text-color, #000) 14%, transparent); }
  .eff-btn:disabled { cursor: default; opacity: .5; }
  .eff-btn:disabled:hover { background: color-mix(in srgb, var(--primary-text-color, #000) 8%, transparent); }
  .eff-btn svg { flex: none; fill: currentColor; }
  .eff-ic { width: 24px; height: 24px; }
  .eff-arrow { width: 20px; height: 20px; color: var(--secondary-text-color); transition: transform .18s ease; }
  .eff-btn[aria-expanded="true"] .eff-arrow { transform: rotate(180deg); }
  .eff-txt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .eff-lbl { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; }
  .eff-val {
    font-size: 12px; line-height: 16px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .eff-val:empty { display: none; }

  .eff-menu {
    position: fixed; inset: auto; margin: 0; box-sizing: border-box;
    flex-direction: column; gap: 2px; padding: 4px; overflow-y: auto; overscroll-behavior: contain;
    min-width: 200px; z-index: 1000;
    color: var(--primary-text-color);
    background: var(--card-background-color, var(--ha-card-background, #fff));
    border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,.28), 0 1px 4px rgba(0,0,0,.18);
  }
  .eff-menu:not(.open) { display: none; }
  .eff-menu.open { display: flex; animation: pbc-menu-in .14s ease-out; }
  .eff-menu.up { transform-origin: 50% 100%; }
  .eff-menu.down { transform-origin: 50% 0; }
  @keyframes pbc-menu-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
  .eff-item {
    display: flex; align-items: center; gap: 16px; flex: none;
    min-height: 40px; padding: 0 16px; border-radius: 8px;
    font-size: 14px; line-height: 20px; cursor: pointer; outline: none; user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .eff-item::before {
    content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%;
    background: var(--secondary-text-color); transition: background-color .12s ease, transform .12s ease;
  }
  .eff-item:hover { background: color-mix(in srgb, var(--primary-text-color, #000) 8%, transparent); }
  .eff-item:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-text-color); }
  .eff-item[aria-selected="true"] {
    background: color-mix(in srgb, var(--primary-color, #03a9f4) 16%, transparent);
    color: var(--primary-color, #03a9f4); font-weight: 500;
  }
  .eff-item[aria-selected="true"]::before { background: var(--primary-color, #03a9f4); transform: scale(1.35); }
  .hidden { display: none !important; }
`;

// Umriss nach Original-Fotos der MIPOW Playbulb Candle (BTL300):
// offener, bauchiger Milchglas-Becher auf abgerundetem weißem Sockel.
const PBC_CUP =
  "M24 20 C14 50 6 95 8 130 C9 150 10 163 14 174 C35 188 165 188 186 174 " +
  "C190 163 191 150 192 130 C194 95 186 50 176 20 A76 12 0 0 0 24 20 Z";
const PBC_BASE =
  "M14 174 C35 188 165 188 186 174 C182 198 168 215 148 221 " +
  "C130 224.5 70 224.5 52 221 C32 215 18 198 14 174 Z";

// viewBox umfasst auch den Lichtschein (Kreis r=118 um 100/105),
// damit nichts außerhalb der SVG-Box gezeichnet wird.
const PBC_SVG = `
<svg viewBox="-18 -13 236 245" width="236" height="245" role="img" aria-label="Playbulb Candle">
  <defs>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:.7"/>
      <stop offset=".5"  style="stop-color:var(--c);stop-opacity:.25"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="cupGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#e2e4e7"/>
      <stop offset=".28" stop-color="#fafafb"/>
      <stop offset=".62" stop-color="#f3f4f5"/>
      <stop offset="1"   stop-color="#d5d8dc"/>
    </linearGradient>
    <linearGradient id="tintGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:.85"/>
      <stop offset=".5"  style="stop-color:var(--c);stop-opacity:1"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:.92"/>
    </linearGradient>
    <radialGradient id="innerGrad" cx="50%" cy="42%" r="62%">
      <stop offset="0"   stop-color="#fff" stop-opacity=".32"/>
      <stop offset=".4"  style="stop-color:var(--c);stop-opacity:.35"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="shadeGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#000" stop-opacity=".22"/>
      <stop offset=".16" stop-color="#fff" stop-opacity=".12"/>
      <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".8"  stop-color="#000" stop-opacity=".04"/>
      <stop offset="1"   stop-color="#000" stop-opacity=".26"/>
    </linearGradient>
    <linearGradient id="rimGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#e9ebee"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="openGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#e3e5e8"/>
      <stop offset="1" stop-color="#b3b7bd"/>
    </linearGradient>
    <radialGradient id="flameGrad" cx="50%" cy="100%" r="80%">
      <stop offset="0"   stop-color="#fff"/>
      <stop offset=".4"  style="stop-color:var(--c);stop-opacity:1"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:.55"/>
    </radialGradient>
    <linearGradient id="baseGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#cfd2d6"/>
      <stop offset=".3"  stop-color="#fbfbfc"/>
      <stop offset=".65" stop-color="#f2f3f4"/>
      <stop offset="1"   stop-color="#bec2c7"/>
    </linearGradient>
    <linearGradient id="baseShade" x1="0" x2="0" y1="0" y2="1">
      <stop offset=".35" stop-color="#000" stop-opacity="0"/>
      <stop offset="1"   stop-color="#000" stop-opacity=".14"/>
    </linearGradient>
    <linearGradient id="spillGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:.45"/>
      <stop offset=".55" style="stop-color:var(--c);stop-opacity:0"/>
    </linearGradient>
    <clipPath id="cupClip"><path d="${PBC_CUP}"/></clipPath>
  </defs>

  <!-- Lichtschein + Bodenschatten -->
  <g class="lit"><circle class="glow" cx="100" cy="105" r="118" fill="url(#glowGrad)"/></g>
  <ellipse cx="100" cy="224" rx="64" ry="5" fill="#000" opacity=".16"/>

  <!-- Milchglas-Becher -->
  <path d="${PBC_CUP}" fill="url(#cupGrad)"/>
  <g class="lit">
    <path class="tint" d="${PBC_CUP}" fill="url(#tintGrad)"/>
    <g clip-path="url(#cupClip)">
      <ellipse class="inner" cx="100" cy="100" rx="96" ry="98" fill="url(#innerGrad)"/>
    </g>
  </g>
  <path d="${PBC_CUP}" fill="url(#shadeGrad)"/>
  <!-- Glanzlichter -->
  <path d="M38 32 C28 65 24 100 25 132" fill="none" stroke="#fff" stroke-opacity=".12"
        stroke-width="9" stroke-linecap="round"/>
  <path d="M163 31 C171 60 175 95 175 125 C175 145 173 160 170 171" fill="none" stroke="#fff"
        stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/>

  <!-- Öffnung oben: Rand + Innenwand mit LED-Licht -->
  <ellipse cx="100" cy="20" rx="76" ry="12" fill="url(#rimGrad)"/>
  <g class="lit"><ellipse class="tint" cx="100" cy="20" rx="76" ry="12" style="fill:var(--c)" opacity=".5"/></g>
  <ellipse cx="100" cy="21" rx="71" ry="10.2" fill="url(#openGrad)"/>
  <g class="lit">
    <ellipse class="flame" cx="100" cy="21" rx="71" ry="10.2"/>
    <ellipse class="core" cx="100" cy="28.5" rx="22" ry="2.6"/>
  </g>
  <ellipse cx="100" cy="20" rx="76" ry="12" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1"/>

  <!-- Sockel -->
  <path d="${PBC_BASE}" fill="url(#baseGrad)"/>
  <path d="${PBC_BASE}" fill="url(#baseShade)"/>
  <g class="lit"><path class="tint" d="${PBC_BASE}" fill="url(#spillGrad)"/></g>
  <path d="M14 174 C35 188 165 188 186 174" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="1"/>
  <path d="M16 177 C37 190.5 163 190.5 184 177" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1"/>
  <text x="100" y="206" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="8.5" fill="#5f646b"><tspan font-weight="700" letter-spacing=".5">PLAYBULB</tspan><tspan dx="3">candle</tspan></text>
</svg>`;

class PlaybulbCandleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._timer = null;
    this._hue = 0;
    this._rainbowStep = 0;
    this._effectKey = "";
    this._dragB = false;
    this._dragC = false;
  }

  static getConfigElement() {
    return document.createElement("playbulb-candle-card-editor");
  }

  static getStubConfig(hass, entities) {
    const list = entities || Object.keys((hass && hass.states) || {});
    const e =
      list.find((x) => x.startsWith("light.playbulb")) ||
      list.find((x) => x.startsWith("light."));
    return { entity: e || "light.playbulb_candle" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Bitte 'entity' angeben, z. B. light.playbulb_candle");
    }
    if (!String(config.entity).startsWith("light.")) {
      throw new Error("'entity' muss eine light.-Entität sein");
    }
    const c = { ...PBC_DEFAULTS, ...pbcMigrate(config) };
    for (const [key, def] of Object.entries(PBC_ACTION_DEFAULTS)) {
      const v = c[key];
      c[key] = !v ? { action: def } : typeof v === "string" ? { action: v } : v;
    }
    if (c.layout !== "horizontal") c.layout = "vertical";
    this._config = c;
    this._built = false;
    if (this._hass) {
      this._build();
      this._update();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._build();
    this._update();
  }

  // Masonry-Ansicht: eine Einheit ≈ 50 px
  getCardSize() {
    const c = this._config || PBC_DEFAULTS;
    const compact = c.layout === "horizontal";
    let n = compact ? 2 : 5 + (c.show_name || c.show_state ? 1 : 0);
    if (c.show_brightness) n += 1;
    if (c.show_color_picker) n += compact ? 4 : 5;
    if (c.show_effects) n += 1;
    return n;
  }

  // Sections-Ansicht: volle Abschnittsbreite, Höhe nach Inhalt
  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  connectedCallback() { if (this._built) this._update(); }
  disconnectedCallback() { this._stopRainbow(); this._closeEff(false); }

  _isSet(key) {
    const a = this._config[key];
    return !!a && a.action !== "none";
  }

  _hasActions(prefix) {
    return ["tap_action", "hold_action", "double_tap_action"].some((k) => this._isSet(prefix + k));
  }

  _build() {
    const c = this._config;
    const lampAct = this._hasActions("icon_");
    const cardAct = this._hasActions("");
    const showInfo = c.show_name || c.show_state || c.show_battery;
    const showLine = c.show_state || c.show_battery;
    this.shadowRoot.innerHTML = `
      <style>${PBC_STYLE}</style>
      <ha-card class="${cardAct ? "actionable" : ""} ${c.layout === "horizontal" ? "compact" : ""}"
               ${cardAct ? 'tabindex="0"' : ""}>
        <div class="root off lay-${c.layout}">
          <div class="head">
            <div class="lampbox${lampAct ? " actionable" : ""}" id="lamp"
                 ${lampAct ? 'role="button" tabindex="0" aria-label="Lampe"' : ""}>${PBC_SVG}</div>
            ${showInfo ? `
            <div class="info">
              ${c.show_name ? '<div class="name" id="name"></div>' : ""}
              ${showLine ? `
              <div class="stline">
                ${c.show_state ? '<div class="state" id="state"></div>' : ""}
                ${c.show_battery ? `
                <span class="batt hidden" id="batt" role="img">${PBC_BATT_SVG}<span id="battval"></span></span>` : ""}
              </div>` : ""}
            </div>` : ""}
          </div>
          ${c.show_brightness ? `
          <div class="csw ctl" id="brightwrap">
            <div class="cs" id="bright" role="slider" tabindex="0" aria-label="Helligkeit"
                 aria-valuemin="1" aria-valuemax="100" aria-valuenow="0">
              <div class="cs-bar"></div>
            </div>
            <span class="cs-tip" id="btip">0 %</span>
          </div>` : ""}
          ${c.show_color_picker ? `
          <div class="wheel ctl" id="wheel" role="slider" tabindex="0" aria-label="Farbe">
            <div class="mk"></div>
          </div>` : ""}
          ${c.show_effects ? `
          <div class="eff ctl" id="effrow">
            <button class="eff-btn" id="effect" type="button"
                    aria-haspopup="listbox" aria-expanded="false">
              <svg class="eff-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${PBC_ICON_FX}"/></svg>
              <span class="eff-txt">
                <span class="eff-lbl">Effekt</span>
                <span class="eff-val" id="effval"></span>
              </span>
              <svg class="eff-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7,10L12,15L17,10H7Z"/></svg>
            </button>
            <div class="eff-menu" id="effmenu" role="listbox" aria-label="Effekt" popover="manual"></div>
          </div>` : ""}
        </div>
      </ha-card>`;

    const $ = (id) => this.shadowRoot.getElementById(id);
    this._card = this.shadowRoot.querySelector("ha-card");
    this._root = this.shadowRoot.querySelector(".root");
    this._elLamp = $("lamp");
    this._elName = $("name");
    this._elState = $("state");
    this._elBright = $("bright");
    this._elBrightWrap = $("brightwrap");
    this._elBtip = $("btip");
    this._elWheel = $("wheel");
    this._elEffect = $("effect");
    this._elEffVal = $("effval");
    this._elEffMenu = $("effmenu");
    this._elEffRow = $("effrow");
    this._elBatt = $("batt");
    this._elBattFill = $("battfill");
    this._elBattVal = $("battval");
    this._battKey = null;
    this._battCls = "";
    this._effList = [];
    this._effCur = null;
    this._effectKey = "";
    this._rootClass = "";
    this._bVal = 0;
    this._hs = [30, 0.5];
    this._dragB = false;
    this._dragC = false;

    if (lampAct) {
      pbcGestures(this._elLamp, {
        canHold: () => this._isSet("icon_hold_action"),
        canDouble: () => this._isSet("icon_double_tap_action"),
        onAction: (a) => this._action("icon_", a),
      });
    }
    if (cardAct) {
      // Bedienelemente (und die Lampe, wenn sie eigene Aktionen hat) lösen keine Kartenaktion aus
      const lamp = this._elLamp;
      pbcGestures(this._card, {
        canHold: () => this._isSet("hold_action"),
        canDouble: () => this._isSet("double_tap_action"),
        ignore: (ev) => ev.composedPath().some((n) =>
          (n.classList && n.classList.contains("ctl")) || (lampAct && n === lamp)),
        onAction: (a) => this._action("", a),
      });
    }
    if (this._elBright) this._bindBrightness();
    if (this._elWheel) this._bindWheel();
    if (this._elEffect) this._bindEffect();
    this._built = true;
  }

  // Aktion an Home Assistant übergeben (wie bei den Standardkarten):
  // more-info, toggle, navigate, url, perform-action, assist … inkl. Bestätigung
  _action(prefix, action) {
    const c = this._config;
    const conf = {
      entity: c.entity,
      tap_action: c[prefix + "tap_action"],
      hold_action: c[prefix + "hold_action"],
      double_tap_action: c[prefix + "double_tap_action"],
    };
    const a = conf[action + "_action"];
    if (!a || a.action === "none") return;
    const st = this._hass && this._hass.states[c.entity];
    if (a.action === "toggle" && (!st || st.state === "unavailable")) return;
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true, composed: true, detail: { config: conf, action },
    }));
  }

  /* ---- Effekt-Menü (wie ha-control-select-menu im Detail-Dialog) ---- */
  _bindEffect() {
    const btn = this._elEffect;
    const menu = this._elEffMenu;
    btn.addEventListener("click", () => {
      if (this._effOpen) this._closeEff(true);
      else this._openEff();
    });
    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        this._openEff();
      }
    });
    menu.addEventListener("click", (ev) => {
      const item = ev.composedPath().find((n) => n.classList && n.classList.contains("eff-item"));
      if (item) this._pickEff(item);
    });
    menu.addEventListener("keydown", (ev) => {
      const items = [...menu.children];
      if (!items.length) return;
      const i = items.indexOf(this.shadowRoot.activeElement);
      let n = null;
      if (ev.key === "ArrowDown") n = (i + 1) % items.length;
      else if (ev.key === "ArrowUp") n = (i - 1 + items.length) % items.length;
      else if (ev.key === "Home") n = 0;
      else if (ev.key === "End") n = items.length - 1;
      else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (i >= 0) this._pickEff(items[i]);
        return;
      } else if (ev.key === "Escape" || ev.key === "Tab") {
        ev.preventDefault();
        this._closeEff(true);
        return;
      } else return;
      ev.preventDefault();
      items[n].focus();
    });
    // Schließen bei Klick außerhalb, Scrollen (außer im Menü) und Größenänderung
    this._effOutside = (ev) => {
      const p = ev.composedPath();
      if (!p.includes(menu) && !p.includes(btn)) this._closeEff(false);
    };
    this._effScroll = (ev) => { if (ev.target !== menu) this._closeEff(false); };
    this._effResize = () => this._closeEff(false);
  }

  _openEff() {
    if (this._effOpen || this._unavail || !this._effList.length) return;
    const btn = this._elEffect;
    const menu = this._elEffMenu;
    this._effOpen = true;
    btn.setAttribute("aria-expanded", "true");
    menu.classList.add("open");
    if (menu.showPopover) { try { menu.showPopover(); } catch (e) { /* bereits offen */ } }

    // Position: unter dem Button, bei zu wenig Platz darüber; im Viewport halten
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 4, edge = 8;
    const w = Math.min(Math.max(r.width, 200), vw - 2 * edge);
    menu.style.width = w + "px";
    menu.style.maxHeight = "";
    const h = menu.scrollHeight + 2;
    const below = vh - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    const up = h > below && above > below;
    const maxH = Math.max(80, up ? above : below);
    menu.style.maxHeight = maxH + "px";
    const mh = Math.min(h, maxH);
    menu.style.top = (up ? r.top - gap - mh : r.bottom + gap) + "px";
    menu.style.left = pbcClamp(r.left + (r.width - w) / 2, edge, vw - w - edge) + "px";
    menu.classList.toggle("up", up);
    menu.classList.toggle("down", !up);

    const sel = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
    if (sel) {
      sel.focus({ preventScroll: true });
      sel.scrollIntoView({ block: "nearest" });
    }
    window.addEventListener("pointerdown", this._effOutside, true);
    window.addEventListener("scroll", this._effScroll, true);
    window.addEventListener("resize", this._effResize);
  }

  _closeEff(refocus) {
    if (!this._effOpen) return;
    this._effOpen = false;
    const menu = this._elEffMenu;
    window.removeEventListener("pointerdown", this._effOutside, true);
    window.removeEventListener("scroll", this._effScroll, true);
    window.removeEventListener("resize", this._effResize);
    if (menu) {
      if (menu.hidePopover) { try { menu.hidePopover(); } catch (e) { /* bereits zu */ } }
      menu.classList.remove("open");
    }
    if (this._elEffect) {
      this._elEffect.setAttribute("aria-expanded", "false");
      if (refocus) this._elEffect.focus();
    }
  }

  _pickEff(item) {
    const effect = this._effList[Number(item.dataset.i)];
    this._closeEff(true);
    if (effect == null) return;
    this._effCur = effect;
    this._markEff();
    this._call("turn_on", { effect });
  }

  // Auswahl im Menü und Wert im Button anzeigen
  _markEff() {
    const cur = this._effCur;
    [...this._elEffMenu.children].forEach((el) => {
      el.setAttribute("aria-selected", String(this._effList[Number(el.dataset.i)] === cur));
    });
    this._elEffVal.textContent = cur || "";
  }

  /* ---- Helligkeitsregler ---- */
  _bindBrightness() {
    const el = this._elBright;
    const fromEvent = (ev) => {
      const r = el.getBoundingClientRect();
      return Math.round(pbcClamp((ev.clientX - r.left) / r.width, 0, 1) * 99) + 1;
    };
    const commit = (v) => this._call("turn_on", { brightness_pct: v });
    const stop = () => {
      this._dragB = false;
      el.classList.remove("drag");
      this._elBrightWrap.classList.remove("tip");
    };
    el.addEventListener("pointerdown", (ev) => {
      if (this._unavail || ev.button !== 0) return;
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* synthetischer Zeiger */ }
      this._dragB = true;
      el.classList.add("drag");
      this._elBrightWrap.classList.add("tip");
      this._setBrightUi(fromEvent(ev));
    });
    el.addEventListener("pointermove", (ev) => {
      if (this._dragB) this._setBrightUi(fromEvent(ev));
    });
    el.addEventListener("pointerup", () => {
      if (!this._dragB) return;
      stop();
      commit(this._bVal);
    });
    // Browser übernimmt (senkrechtes Scrollen): nichts senden, Ist-Wert zeigen
    el.addEventListener("pointercancel", () => {
      if (!this._dragB) return;
      stop();
      this._update();
    });
    el.addEventListener("keydown", (ev) => {
      if (this._unavail) return;
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[ev.key];
      let v = this._bVal;
      if (step) v = pbcClamp(v + step, 1, 100);
      else if (ev.key === "Home") v = 1;
      else if (ev.key === "End") v = 100;
      else return;
      ev.preventDefault();
      this._setBrightUi(v);
      clearTimeout(this._keyTimer);
      this._keyTimer = setTimeout(() => commit(v), 400);
    });
  }

  _setBrightUi(pct) {
    this._bVal = pct;
    this._elBright.style.setProperty("--p", (pct / 100).toFixed(3));
    this._elBright.toggleAttribute("data-zero", pct <= 0);
    this._elBright.setAttribute("aria-valuenow", pct);
    this._elBrightWrap.style.setProperty("--p", (pct / 100).toFixed(3));
    this._elBtip.textContent = pct + " %";
  }

  /* ---- Farbrad ---- */
  _bindWheel() {
    const el = this._elWheel;
    const fromEvent = (ev) => {
      const r = el.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width * 2 - 1;
      const y = (ev.clientY - r.top) / r.height * 2 - 1;
      const h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      return [h, pbcClamp(Math.sqrt(x * x + y * y), 0, 1)];
    };
    const commit = () => this._call("turn_on", {
      hs_color: [Math.round(this._hs[0]), Math.round(this._hs[1] * 100)],
    });
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* synthetischer Zeiger */ }
      this._dragC = true;
      el.classList.add("drag");
      el.classList.remove("nomk");
      this._setWheelUi(fromEvent(ev));
    });
    el.addEventListener("pointermove", (ev) => {
      if (this._dragC) this._setWheelUi(fromEvent(ev));
    });
    const end = () => {
      if (!this._dragC) return;
      this._dragC = false;
      el.classList.remove("drag");
      commit();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", (ev) => {
      let [h, s] = this._hs;
      if (ev.key === "ArrowRight") h = (h + 5) % 360;
      else if (ev.key === "ArrowLeft") h = (h + 355) % 360;
      else if (ev.key === "ArrowUp") s = pbcClamp(s + 0.05, 0, 1);
      else if (ev.key === "ArrowDown") s = pbcClamp(s - 0.05, 0, 1);
      else return;
      ev.preventDefault();
      this._setWheelUi([h, s]);
      clearTimeout(this._keyTimerC);
      this._keyTimerC = setTimeout(commit, 400);
    });
  }

  _setWheelUi([h, s]) {
    this._hs = [h, s];
    const rad = h * Math.PI / 180;
    const st = this._elWheel.style;
    st.setProperty("--x", (50 + Math.cos(rad) * s * 50).toFixed(2) + "%");
    st.setProperty("--y", (50 + Math.sin(rad) * s * 50).toFixed(2) + "%");
    const rgb = pbcHsv(h, s, 1);
    st.setProperty("--mc", `rgb(${rgb.map(Math.round).join(",")})`);
  }

  _call(service, data) {
    if (!this._hass) return;
    this._hass.callService("light", service, {
      entity_id: this._config.entity,
      ...data,
    });
  }

  // Anzeigefarbe aus rgbw_color / rgb_color / hs_color; immer auf volle Intensität normiert
  _rgb(a) {
    const w = this._config.white_color || PBC_WARM_WHITE;
    let r = 0, g = 0, b = 0;
    if (Array.isArray(a.rgbw_color)) {
      const [R, G, B, W] = a.rgbw_color;
      const k = (W || 0) / 255;
      r = R + k * w[0]; g = G + k * w[1]; b = B + k * w[2];
    } else if (Array.isArray(a.rgb_color)) {
      [r, g, b] = a.rgb_color;
    } else if (Array.isArray(a.hs_color)) {
      [r, g, b] = pbcHsv(a.hs_color[0], a.hs_color[1] / 100, 1);
    } else {
      [r, g, b] = w;
    }
    const m = Math.max(r, g, b);
    if (m <= 0) return w.slice();
    return [r, g, b].map((v) => Math.round((v * 255) / m));
  }

  // Position im Farbrad (Weißkanal zählt als Weiß -> Richtung Mitte)
  _hsFromAttrs(a) {
    if (Array.isArray(a.hs_color)) return [a.hs_color[0], a.hs_color[1] / 100];
    if (Array.isArray(a.rgbw_color)) {
      const [R, G, B, W] = a.rgbw_color;
      return pbcRgbToHs([R + W, G + W, B + W]);
    }
    if (Array.isArray(a.rgb_color)) return pbcRgbToHs(a.rgb_color);
    return null;
  }

  _startRainbow(step) {
    if (this._timer && this._rainbowStep === step) return;
    this._stopRainbow();
    this._rainbowStep = step;
    this._timer = setInterval(() => {
      this._hue = (this._hue + step) % 360;
      if (this._root) this._root.style.setProperty("--c", `hsl(${this._hue} 100% 50%)`);
    }, 80);
  }

  _stopRainbow() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._rainbowStep = 0;
  }

  _update() {
    if (!this._built || !this._hass) return;
    const st = this._hass.states[this._config.entity];

    if (!st) {
      this._stopRainbow();
      this._unavail = true;
      this._setClass(`root unavail off lay-${this._config.layout}`);
      if (this._elName) this._elName.textContent = this._config.name || this._config.entity;
      if (this._elState) this._elState.textContent = "Entität nicht gefunden";
      this._updateBattery();
      return;
    }

    const a = st.attributes || {};
    const on = st.state === "on";
    const unavail = st.state === "unavailable" || st.state === "unknown";
    this._unavail = unavail;
    const eff = String(a.effect || "").toLowerCase();

    let fx = "";
    let rainbowStep = 0;
    if (on) {
      if (/regenbogen|rainbow/.test(eff)) {
        fx = "rainbow";
        rainbowStep = /sanft|fade|soft|smooth/.test(eff) ? 1.2 : 5;
      } else if (/blitz|flash|strobe/.test(eff)) fx = "flash";
      else if (/puls/.test(eff)) fx = "pulse";
      else if (/kerze|candle|flacker|flicker/.test(eff)) fx = "candle";
    }

    this._setClass(
      "root " + (on ? "on" : "off") + (unavail ? " unavail" : "") + (fx ? " fx-" + fx : "") +
      " lay-" + this._config.layout
    );

    const bri = on ? pbcClamp((a.brightness == null ? 255 : a.brightness) / 255, 0, 1) : 0;
    const rgb = this._rgb(a);
    const rs = this._root.style;
    rs.setProperty("--glow", (0.3 + 0.7 * bri).toFixed(3));
    rs.setProperty("--tint", (0.45 + 0.5 * bri).toFixed(3));
    rs.setProperty("--flame", (0.55 + 0.45 * bri).toFixed(3));

    if (fx === "rainbow") {
      this._startRainbow(rainbowStep);
    } else {
      this._stopRainbow();
      rs.setProperty("--c", `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    }

    // Texte
    const name = this._config.name || a.friendly_name || this._config.entity;
    if (this._elName) this._elName.textContent = name;
    if (this._elLamp && this._elLamp.hasAttribute("role")) this._elLamp.setAttribute("aria-label", name);
    if (this._elState) {
      let stateText = this._hass.formatEntityState
        ? this._hass.formatEntityState(st)
        : st.state;
      if (on && a.brightness != null) stateText += ` · ${Math.round(bri * 100)} %`;
      if (on && a.effect && !/^(kein|none|no effect)/i.test(a.effect)) stateText += ` · ${a.effect}`;
      this._elState.textContent = stateText;
    }

    // Regler (nicht überschreiben, solange der Nutzer sie bedient)
    if (this._elBright && !this._dragB) {
      this._setBrightUi(Math.round(bri * 100));
      this._elBright.setAttribute("aria-disabled", unavail);
    }
    if (this._elWheel) {
      this._elWheel.classList.toggle("disabled", unavail);
      if (!this._dragC) {
        const hs = this._hsFromAttrs(a);
        if (hs) this._setWheelUi(hs);
        this._elWheel.classList.toggle("nomk", !hs || fx === "rainbow");
      }
    }
    if (this._elEffect) {
      const list = Array.isArray(a.effect_list) ? a.effect_list : [];
      const key = list.join("|");
      if (key !== this._effectKey) {
        this._effectKey = key;
        this._effList = list;
        this._closeEff(false);
        this._elEffMenu.innerHTML = "";
        list.forEach((e, i) => {
          const o = document.createElement("div");
          o.className = "eff-item";
          o.setAttribute("role", "option");
          o.tabIndex = -1;
          o.dataset.i = i;
          o.textContent = e;
          this._elEffMenu.appendChild(o);
        });
      }
      this._elEffRow.classList.toggle("hidden", list.length === 0);
      let cur = list.includes(a.effect) ? a.effect : null;
      if (cur == null) cur = list.find((e) => /^(kein|none|no effect|off|aus)/i.test(e)) || null;
      this._effCur = cur;
      this._markEff();
      this._elEffect.disabled = unavail;
      if (unavail || list.length === 0) this._closeEff(false);
    }
    this._updateBattery();
  }

  /* ---- Batteriestand ---- */
  // Batterie-Sensor: aus der Konfiguration oder automatisch über das Gerät der Lampe
  _batteryEntity() {
    const c = this._config;
    if (c.battery_entity) return c.battery_entity;
    const h = this._hass;
    const reg = h.entities;
    if (!reg) return null;
    // Sensoren desselben Geräts nur neu suchen, wenn sich die Registry ändert
    if (this._battKey !== reg) {
      this._battKey = reg;
      const dev = reg[c.entity] && reg[c.entity].device_id;
      this._battCand = dev
        ? Object.values(reg)
            .filter((e) => e.device_id === dev && e.entity_id.startsWith("sensor."))
            .map((e) => e.entity_id)
        : [];
    }
    return this._battCand.find((id) => {
      const s = h.states[id];
      return s && s.attributes && s.attributes.device_class === "battery";
    }) || null;
  }

  _updateBattery() {
    const el = this._elBatt;
    if (!el) return;
    const id = this._hass.states[this._config.entity] ? this._batteryEntity() : null;
    const s = id && this._hass.states[id];
    if (!s) {
      el.classList.add("hidden");
      this._battCls = "";
      return;
    }
    const v = parseFloat(s.state);
    const ok = Number.isFinite(v);
    const c = this._config;
    const num = (x, d) => (x === "" || x == null || !Number.isFinite(Number(x)) ? d : Number(x));
    const warn = num(c.battery_warning, PBC_DEFAULTS.battery_warning);
    const crit = num(c.battery_critical, PBC_DEFAULTS.battery_critical);
    const lvl = !ok ? "" : v <= crit ? "low" : v <= warn ? "mid" : "good";
    const cls = "batt" + (lvl ? " " + lvl : "");
    if (cls !== this._battCls) {
      this._battCls = cls;
      el.className = cls;
    }
    const p = ok ? pbcClamp(v, 0, 100) / 100 : 0;
    // Bei fast leerer Batterie mindestens einen schmalen roten Strich zeigen
    const w = ok ? Math.max(p * PBC_BATT_W, 1.5) : 0;
    this._elBattFill.setAttribute("width", w.toFixed(2));
    const txt = ok ? Math.round(v) + " %" : "–";
    this._elBattVal.textContent = txt;
    const label = "Batterie " + txt;
    el.setAttribute("aria-label", label);
    el.title = label;
  }

  _setClass(cls) {
    if (cls !== this._rootClass) {
      this._rootClass = cls;
      this._root.className = cls;
    }
  }
}

/* ---------- Visueller Editor ---------- */

const PBC_LABELS = {
  entity: "Entität (Licht)",
  name: "Name (optional)",
  layout: "Darstellung",
  display: "Anzeige",
  show_name: "Name",
  show_state: "Status",
  show_brightness: "Helligkeitsregler",
  show_color_picker: "Farbrad",
  show_effects: "Effekt-Auswahl",
  show_battery: "Batteriestand",
  battery_entity: "Batterie-Sensor (optional)",
  battery_warning: "Gelb ab (%)",
  battery_critical: "Rot ab (%)",
  white_color: "Farbe des Weißkanals",
  icon_interactions: "Interaktionen: Lampe",
  icon_tap_action: "Tippen auf die Lampe",
  icon_hold_action: "Halten der Lampe",
  icon_double_tap_action: "Doppeltippen auf die Lampe",
  card_interactions: "Interaktionen: Karte",
  tap_action: "Tippen auf die Karte",
  hold_action: "Halten der Karte",
  double_tap_action: "Doppeltippen auf die Karte",
};

const PBC_HELPERS = {
  layout: "Kompakt: kleine Lampe neben Name und Status, braucht auf dem Handy deutlich weniger Höhe.",
  white_color: "Nur für die Anzeige: In diesem Farbton stellt die Karte den Weißkanal (W) der Kerze dar.",
  tap_action: "Gilt für die Kartenfläche außerhalb der Lampe und der Bedienelemente.",
  battery_entity: "Leer lassen: Der Sensor wird automatisch über das Gerät der Lampe gefunden.",
  battery_critical: "Grün über „Gelb ab“, gelb bis „Gelb ab“, rot bis „Rot ab“.",
};

// Material-Design-Icons (24×24) für die aufklappbaren Bereiche
const PBC_ICON_EYE =
  "M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 " +
  "12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 " +
  "21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z";
const PBC_ICON_TAP =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5" +
  "C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3," +
  "17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 " +
  "14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";
const PBC_ICON_CARD =
  "M4,5H20A2,2 0 0,1 22,7V17A2,2 0 0,1 20,19H4A2,2 0 0,1 2,17V7A2,2 0 0,1 4,5M4,7V17H20V7H4Z";

const pbcActionField = (name, def) => ({ name, selector: { ui_action: { default_action: def } } });

const PBC_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "light" } } },
  { name: "name", selector: { text: {} } },
  {
    name: "layout",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "vertical", label: "Standard (große Lampe)" },
          { value: "horizontal", label: "Kompakt (Lampe neben Name)" },
        ],
      },
    },
  },
  {
    name: "display",
    title: PBC_LABELS.display,
    type: "expandable",
    flatten: true,
    iconPath: PBC_ICON_EYE,
    schema: [
      {
        name: "",
        type: "grid",
        schema: [
          { name: "show_name", selector: { boolean: {} } },
          { name: "show_state", selector: { boolean: {} } },
          { name: "show_brightness", selector: { boolean: {} } },
          { name: "show_color_picker", selector: { boolean: {} } },
          { name: "show_effects", selector: { boolean: {} } },
          { name: "show_battery", selector: { boolean: {} } },
        ],
      },
      { name: "battery_entity", selector: { entity: { domain: "sensor", device_class: "battery" } } },
      {
        name: "",
        type: "grid",
        schema: [
          { name: "battery_warning", selector: { number: { min: 0, max: 100, step: 1, mode: "box" } } },
          { name: "battery_critical", selector: { number: { min: 0, max: 100, step: 1, mode: "box" } } },
        ],
      },
      { name: "white_color", selector: { color_rgb: {} } },
    ],
  },
  {
    name: "icon_interactions",
    title: PBC_LABELS.icon_interactions,
    type: "expandable",
    flatten: true,
    iconPath: PBC_ICON_TAP,
    schema: Object.keys(PBC_ACTION_DEFAULTS)
      .filter((k) => k.startsWith("icon_"))
      .map((k) => pbcActionField(k, PBC_ACTION_DEFAULTS[k])),
  },
  {
    name: "card_interactions",
    title: PBC_LABELS.card_interactions,
    type: "expandable",
    flatten: true,
    iconPath: PBC_ICON_CARD,
    schema: Object.keys(PBC_ACTION_DEFAULTS)
      .filter((k) => !k.startsWith("icon_"))
      .map((k) => pbcActionField(k, PBC_ACTION_DEFAULTS[k])),
  },
];

// ha-form wird von HA nachgeladen; ggf. über den Editor einer eingebauten Karte anstoßen
let pbcFormLoading = null;
function pbcLoadHaForm() {
  if (customElements.get("ha-form")) return Promise.resolve();
  if (!pbcFormLoading) {
    pbcFormLoading = (async () => {
      try {
        const helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null;
        const tile = helpers && (await helpers.createCardElement({ type: "tile", entity: "sun.sun" }));
        if (tile && tile.constructor.getConfigElement) await tile.constructor.getConfigElement();
      } catch (e) { /* ignorieren, unten wird trotzdem gewartet */ }
      await Promise.race([
        customElements.whenDefined("ha-form"),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    })();
  }
  return pbcFormLoading;
}

class PlaybulbCandleCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = pbcMigrate(config || {});
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  connectedCallback() { this._render(); }

  _render() {
    if (!this._config) return;
    if (!customElements.get("ha-form")) {
      pbcLoadHaForm().then(() => { if (customElements.get("ha-form")) this._render(); });
      return;
    }
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => PBC_LABELS[s.name] || s.title || s.name;
      this._form.computeHelper = (s) => PBC_HELPERS[s.name];
      this._form.addEventListener("value-changed", (ev) => {
        const config = { ...ev.detail.value };
        Object.keys(config).forEach((k) => config[k] === undefined && delete config[k]);
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config }, bubbles: true, composed: true,
        }));
      });
      this.appendChild(this._form);
    }
    if (this._hass) this._form.hass = this._hass;
    this._form.schema = PBC_SCHEMA;
    // Aktionen ohne Standardwert lassen: der Auswähler zeigt dann "Standard (…)"
    this._form.data = { ...PBC_DEFAULTS, white_color: PBC_WARM_WHITE, ...this._config };
  }
}

if (!customElements.get("playbulb-candle-card")) {
  customElements.define("playbulb-candle-card", PlaybulbCandleCard);
  customElements.define("playbulb-candle-card-editor", PlaybulbCandleCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "playbulb-candle-card",
  name: "Playbulb Candle Card",
  description: "Zeigt eine MIPOW Playbulb Candle als SVG in ihrer aktuellen Farbe.",
  preview: true,
});

console.info(
  `%c PLAYBULB-CANDLE-CARD %c v${PBC_VERSION} `,
  "color:#fff;background:#e8a33d;font-weight:700;border-radius:3px 0 0 3px",
  "color:#e8a33d;background:#333;font-weight:700;border-radius:0 3px 3px 0"
);
