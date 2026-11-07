/*!
 * playbulb-candle-card
 * Home-Assistant-Karte für MIPOW Playbulb Candle (Integration "playbulb_candle").
 * Zeigt die Lampe als SVG in der aktuellen Farbe. Eine Datei, kein Build.
 *
 * YAML:
 *   type: custom:playbulb-candle-card
 *   entity: light.playbulb_candle
 */

const PBC_VERSION = "1.2.0";
const PBC_WARM_WHITE = [255, 196, 120]; // Farbton des Weißkanals der Kerze

const pbcClamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pbcHex = (rgb) =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

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

const PBC_STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; overflow: hidden; height: 100%; box-sizing: border-box; }
  .root {
    --c: rgb(255,196,120); --glow: 0; --tint: 0; --flame: 1;
    --sc: var(--c);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .root.off { --sc: var(--state-inactive-color, #9e9e9e); }
  .root.unavail { opacity: .5; }
  .lampbox {
    width: 100%; max-width: 210px; cursor: pointer; user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  svg { display: block; width: 100%; height: auto; overflow: visible; }
  .lit { transition: opacity .5s ease; }
  .root.off .lit, .root.unavail .lit { opacity: 0; }
  .glow  { opacity: var(--glow); }
  .tint  { opacity: var(--tint); }
  .inner { opacity: var(--flame); }
  .flame { fill: url(#flameGrad); opacity: var(--flame);
           transform-box: fill-box; transform-origin: 50% 100%; }
  .core  { fill: #fff; opacity: .85;
           transform-box: fill-box; transform-origin: 50% 100%; }

  .root.fx-candle .flame { animation: pbc-flicker 1.3s ease-in-out infinite; }
  .root.fx-candle .core  { animation: pbc-flicker 1.1s ease-in-out infinite reverse; }
  .root.fx-candle .inner { animation: pbc-glowflicker 1.7s ease-in-out infinite; }
  .root.fx-pulse  .lit   { animation: pbc-pulse 1.8s ease-in-out infinite; }
  .root.fx-flash  .lit   { animation: pbc-flash .9s linear infinite; }
  @keyframes pbc-flicker {
    0%,100% { transform: scale(1,1) rotate(0); }
    15% { transform: scale(.92,1.08) rotate(-2deg); }
    35% { transform: scale(1.04,.94) rotate(1.5deg); }
    55% { transform: scale(.96,1.05) rotate(-1deg); }
    75% { transform: scale(1.03,.96) rotate(2deg); }
  }
  @keyframes pbc-glowflicker {
    0%,100% { opacity: var(--flame); } 30% { opacity: calc(var(--flame) * .8); }
    60% { opacity: calc(var(--flame) * .95); } 80% { opacity: calc(var(--flame) * .75); }
  }
  @keyframes pbc-pulse { 0%,100% { opacity: 1; } 50% { opacity: .15; } }
  @keyframes pbc-flash { 0%,40% { opacity: 1; } 45%,70% { opacity: .04; } 75%,100% { opacity: 1; } }

  .info { text-align: center; }
  .name { font-size: 1.1em; font-weight: 500; color: var(--primary-text-color); }
  .state { font-size: .9em; color: var(--secondary-text-color); }

  /* --- Helligkeit: Stil wie ha-control-slider (Kachel-Feature) --- */
  .csw { position: relative; width: 100%; }
  .cs {
    --p: 0; position: relative; height: 42px; border-radius: 12px; overflow: hidden;
    cursor: pointer; outline: none; touch-action: none; user-select: none;
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
    --x: 50%; --y: 50%; position: relative; width: 100%; max-width: 240px; aspect-ratio: 1;
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
  .wheel.drag .mk { width: 40px; height: 40px; }
  .wheel:focus-visible .mk { box-shadow: 0 0 0 2px var(--primary-color, #03a9f4), 0 2px 6px rgba(0,0,0,.35); }
  .wheel.nomk .mk { display: none; }
  .wheel.disabled { pointer-events: none; opacity: .5; }

  /* --- Effekt: Stil wie ha-select (filled) --- */
  .sel {
    position: relative; width: 100%; box-sizing: border-box;
    background: var(--input-fill-color, color-mix(in srgb, var(--primary-text-color, #000) 6%, transparent));
    border-radius: 4px 4px 0 0;
    border-bottom: 1px solid var(--input-idle-line-color, rgba(0,0,0,.42));
  }
  .sel:focus-within { border-bottom: 2px solid var(--primary-color, #03a9f4); }
  .sel label {
    position: absolute; left: 16px; top: 8px; font-size: 12px; line-height: 16px;
    color: var(--secondary-text-color); pointer-events: none;
  }
  .sel:focus-within label { color: var(--primary-color, #03a9f4); }
  .sel::after {
    content: ""; position: absolute; right: 16px; top: 50%; margin-top: -2px;
    border: 5px solid transparent; border-top-color: var(--secondary-text-color);
    border-bottom: 0; pointer-events: none;
  }
  .sel select {
    display: block; width: 100%; height: 56px; padding: 22px 40px 6px 16px; margin: 0;
    font: inherit; font-size: 16px; color: var(--primary-text-color);
    background: transparent; border: none; outline: none; cursor: pointer;
    -webkit-appearance: none; appearance: none;
  }
  .sel select option { background: var(--card-background-color, #fff); color: var(--primary-text-color); }
  .sel select:disabled { cursor: default; opacity: .6; }
  .hidden { display: none !important; }
`;

const PBC_GLASS =
  "M24 30 C17 75 17 122 32 152 C38 163 46 170 56 172 L144 172 C154 170 162 163 168 152 " +
  "C183 122 183 75 176 30 A76 9 0 0 0 24 30 Z";
const PBC_BASE =
  "M28 161 C60 170 140 170 172 161 C175 180 168 196 148 202 C134 205 118 206 100 206 " +
  "C82 206 66 205 52 202 C32 196 25 180 28 161 Z";

const PBC_SVG = `
<svg viewBox="0 0 200 215" role="img" aria-label="Playbulb Candle">
  <defs>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:.7"/>
      <stop offset=".5"  style="stop-color:var(--c);stop-opacity:.25"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="glassGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#d4d7db"/>
      <stop offset=".3"  stop-color="#f3f4f5"/>
      <stop offset=".65" stop-color="#eceef0"/>
      <stop offset="1"   stop-color="#c8ccd1"/>
    </linearGradient>
    <linearGradient id="tintGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:.55"/>
      <stop offset=".55" style="stop-color:var(--c);stop-opacity:.85"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:1"/>
    </linearGradient>
    <radialGradient id="innerGrad" cx="50%" cy="62%" r="60%">
      <stop offset="0"   stop-color="#fff" stop-opacity=".95"/>
      <stop offset=".2"  style="stop-color:var(--c);stop-opacity:.9"/>
      <stop offset=".6"  style="stop-color:var(--c);stop-opacity:.3"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="shadeGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#000" stop-opacity=".16"/>
      <stop offset=".22" stop-color="#fff" stop-opacity=".16"/>
      <stop offset=".5"  stop-color="#fff" stop-opacity="0"/>
      <stop offset="1"   stop-color="#000" stop-opacity=".2"/>
    </linearGradient>
    <linearGradient id="baseGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#cfd2d6"/>
      <stop offset=".3"  stop-color="#fafafa"/>
      <stop offset=".65" stop-color="#f1f2f3"/>
      <stop offset="1"   stop-color="#bfc3c8"/>
    </linearGradient>
    <radialGradient id="flameGrad" cx="50%" cy="80%" r="75%">
      <stop offset="0"   stop-color="#fff"/>
      <stop offset=".5"  style="stop-color:var(--c);stop-opacity:.95"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:.2"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.4"/>
    </filter>
    <clipPath id="glassClip"><path d="${PBC_GLASS}"/></clipPath>
  </defs>

  <!-- Lichtschein -->
  <g class="lit"><circle class="glow" cx="100" cy="105" r="112" fill="url(#glowGrad)"/></g>
  <ellipse cx="100" cy="207" rx="74" ry="6" fill="#000" opacity=".15"/>

  <!-- Milchglas-Becher -->
  <path d="${PBC_GLASS}" fill="url(#glassGrad)" opacity=".92"/>
  <g class="lit">
    <path class="tint" d="${PBC_GLASS}" fill="url(#tintGrad)"/>
    <g clip-path="url(#glassClip)">
      <ellipse class="inner" cx="100" cy="122" rx="95" ry="100" fill="url(#innerGrad)"/>
    </g>
  </g>

  <!-- LED-Teelicht im Inneren -->
  <path d="M70 146 V152 C70 156 84 159 100 159 C116 159 130 156 130 152 V146 Z" fill="#fff" opacity=".35"/>
  <ellipse cx="100" cy="146" rx="30" ry="5" fill="#fff" opacity=".55"/>
  <path d="M97 146 V134 C97 132 103 132 103 134 V146 Z" fill="#fff" opacity=".45"/>
  <g class="lit" filter="url(#soft)">
    <path class="flame" d="M100 92 C106 104 115 114 113 126 C112 134 107 139 100 139 C93 139 88 134 87 126 C85 114 94 104 100 92 Z"/>
    <path class="core"  d="M100 112 C103.5 118 107.5 123 106.5 129 C106 133 103.5 136 100 136 C96.5 136 94 133 93.5 129 C92.5 123 96.5 118 100 112 Z"/>
  </g>

  <!-- Glas-Schattierung, Glanz, Öffnung -->
  <path d="${PBC_GLASS}" fill="url(#shadeGrad)"/>
  <path d="M36 44 C32 80 33 116 42 142" fill="none" stroke="#fff" stroke-opacity=".35"
        stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="100" cy="30" rx="76" ry="9" fill="#fff" fill-opacity=".18"
           stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>
  <path d="M28 33 C60 41 140 41 172 33" fill="none" stroke="#000" stroke-opacity=".06" stroke-width="1"/>

  <!-- Sockel -->
  <path d="${PBC_BASE}" fill="url(#baseGrad)"/>
  <path d="M28 161 C60 170 140 170 172 161" fill="none" stroke="#fff" stroke-width="1.5" stroke-opacity=".9"/>
  <path d="M30 186 C36 196 50 202 70 204 L130 204 C150 202 164 196 170 186 C166 198 152 204 132 205.5
           L68 205.5 C48 204 34 198 30 186 Z" fill="#000" opacity=".06"/>
  <text x="100" y="187" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="9.5" font-weight="600" letter-spacing="1.6" fill="#6f747b">PLAYBULB</text>
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
    this._config = {
      show_name: true,
      show_state: true,
      show_brightness: true,
      show_effects: true,
      show_color_picker: true,
      tap_action: "toggle",
      ...config,
    };
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

  getCardSize() {
    const c = this._config || {};
    return 5 + (c.show_brightness ? 1 : 0) + (c.show_color_picker ? 5 : 0) + (c.show_effects ? 1 : 0);
  }
  getGridOptions() { return { columns: 6, min_columns: 3 }; }

  connectedCallback() { if (this._built) this._update(); }
  disconnectedCallback() { this._stopRainbow(); }

  _build() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${PBC_STYLE}</style>
      <ha-card>
        <div class="root off">
          <div class="lampbox" id="lamp">${PBC_SVG}</div>
          <div class="info">
            <div class="name${c.show_name ? "" : " hidden"}" id="name"></div>
            <div class="state${c.show_state ? "" : " hidden"}" id="state"></div>
          </div>
          ${c.show_brightness ? `
          <div class="csw" id="brightwrap">
            <div class="cs" id="bright" role="slider" tabindex="0" aria-label="Helligkeit"
                 aria-valuemin="1" aria-valuemax="100" aria-valuenow="0">
              <div class="cs-bar"></div>
            </div>
            <span class="cs-tip" id="btip">0 %</span>
          </div>` : ""}
          ${c.show_color_picker ? `
          <div class="wheel" id="wheel" role="slider" tabindex="0" aria-label="Farbe">
            <div class="mk"></div>
          </div>` : ""}
          ${c.show_effects ? `
          <div class="sel" id="effrow">
            <label for="effect">Effekt</label>
            <select id="effect"></select>
          </div>` : ""}
        </div>
      </ha-card>`;

    const $ = (id) => this.shadowRoot.getElementById(id);
    this._root = this.shadowRoot.querySelector(".root");
    this._elName = $("name");
    this._elState = $("state");
    this._elBright = $("bright");
    this._elBrightWrap = $("brightwrap");
    this._elBtip = $("btip");
    this._elWheel = $("wheel");
    this._elEffect = $("effect");
    this._elEffRow = $("effrow");
    this._effectKey = "";
    this._rootClass = "";
    this._bVal = 0;
    this._hs = [30, 0.5];

    $("lamp").addEventListener("click", () => this._tap());
    if (this._elBright) this._bindBrightness();
    if (this._elWheel) this._bindWheel();
    if (this._elEffect) {
      this._elEffect.addEventListener("change", () => {
        this._call("turn_on", { effect: this._elEffect.value });
      });
    }
    this._built = true;
  }

  /* ---- Helligkeitsregler ---- */
  _bindBrightness() {
    const el = this._elBright;
    const fromEvent = (ev) => {
      const r = el.getBoundingClientRect();
      return Math.round(pbcClamp((ev.clientX - r.left) / r.width, 0, 1) * 99) + 1;
    };
    const commit = (v) => this._call("turn_on", { brightness_pct: v });
    el.addEventListener("pointerdown", (ev) => {
      if (this._unavail) return;
      el.setPointerCapture(ev.pointerId);
      this._dragB = true;
      el.classList.add("drag");
      this._elBrightWrap.classList.add("tip");
      this._setBrightUi(fromEvent(ev));
    });
    el.addEventListener("pointermove", (ev) => {
      if (this._dragB) this._setBrightUi(fromEvent(ev));
    });
    const end = () => {
      if (!this._dragB) return;
      this._dragB = false;
      el.classList.remove("drag");
      this._elBrightWrap.classList.remove("tip");
      commit(this._bVal);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
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
      el.setPointerCapture(ev.pointerId);
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

  _tap() {
    const st = this._hass && this._hass.states[this._config.entity];
    if (!st || st.state === "unavailable") return;
    if (this._config.tap_action === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        bubbles: true, composed: true,
        detail: { entityId: this._config.entity },
      }));
    } else {
      this._call("toggle", {});
    }
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
      this._setClass("root unavail off");
      this._elName.textContent = this._config.name || this._config.entity;
      this._elState.textContent = "Entität nicht gefunden";
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
      "root " + (on ? "on" : "off") + (unavail ? " unavail" : "") + (fx ? " fx-" + fx : "")
    );

    const bri = on ? pbcClamp((a.brightness == null ? 255 : a.brightness) / 255, 0, 1) : 0;
    const rgb = this._rgb(a);
    const rs = this._root.style;
    rs.setProperty("--glow", (0.3 + 0.7 * bri).toFixed(3));
    rs.setProperty("--tint", (0.3 + 0.55 * bri).toFixed(3));
    rs.setProperty("--flame", (0.55 + 0.45 * bri).toFixed(3));

    if (fx === "rainbow") {
      this._startRainbow(rainbowStep);
    } else {
      this._stopRainbow();
      rs.setProperty("--c", `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    }

    // Texte
    this._elName.textContent = this._config.name || a.friendly_name || this._config.entity;
    let stateText = this._hass.formatEntityState
      ? this._hass.formatEntityState(st)
      : st.state;
    if (on && a.brightness != null) stateText += ` · ${Math.round(bri * 100)} %`;
    if (on && a.effect && !/^(kein|none|no effect)/i.test(a.effect)) stateText += ` · ${a.effect}`;
    this._elState.textContent = stateText;

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
        this._elEffect.innerHTML = "";
        list.forEach((e) => {
          const o = document.createElement("option");
          o.value = e; o.textContent = e;
          this._elEffect.appendChild(o);
        });
      }
      this._elEffRow.classList.toggle("hidden", list.length === 0);
      if (this.shadowRoot.activeElement !== this._elEffect) {
        let idx = list.indexOf(a.effect);
        if (idx < 0) idx = list.findIndex((e) => /^(kein|none|no effect|off|aus)/i.test(e));
        this._elEffect.selectedIndex = idx;
      }
      this._elEffect.disabled = unavail;
    }
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
  tap_action: "Tippen auf die Lampe",
  show_name: "Name anzeigen",
  show_state: "Status anzeigen",
  show_brightness: "Helligkeitsregler",
  show_effects: "Effekt-Auswahl",
  show_color_picker: "Farbrad",
};

const PBC_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "light" } } },
  { name: "name", selector: { text: {} } },
  {
    name: "tap_action",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "toggle", label: "Ein/Aus schalten" },
          { value: "more-info", label: "Details öffnen" },
        ],
      },
    },
  },
  { name: "show_name", selector: { boolean: {} } },
  { name: "show_state", selector: { boolean: {} } },
  { name: "show_brightness", selector: { boolean: {} } },
  { name: "show_effects", selector: { boolean: {} } },
  { name: "show_color_picker", selector: { boolean: {} } },
];

class PlaybulbCandleCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => PBC_LABELS[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: ev.detail.value }, bubbles: true, composed: true,
        }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = PBC_SCHEMA;
    this._form.data = {
      show_name: true, show_state: true, show_brightness: true,
      show_effects: true, show_color_picker: true, tap_action: "toggle",
      ...this._config,
    };
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
