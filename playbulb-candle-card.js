/*!
 * playbulb-candle-card
 * Home-Assistant-Karte für MIPOW Playbulb Candle (Integration "playbulb_candle").
 * Zeigt die Lampe als SVG in der aktuellen Farbe. Eine Datei, kein Build.
 *
 * YAML:
 *   type: custom:playbulb-candle-card
 *   entity: light.playbulb_candle
 */

const PBC_VERSION = "1.1.0";
const PBC_WARM_WHITE = [255, 196, 120]; // Farbton des Weißkanals der Kerze

const PBC_SWATCHES = [
  { name: "Warmweiß", rgb: PBC_WARM_WHITE, white: true },
  { name: "Rot", rgb: [255, 30, 30] },
  { name: "Orange", rgb: [255, 120, 0] },
  { name: "Gelb", rgb: [255, 215, 0] },
  { name: "Grün", rgb: [20, 220, 70] },
  { name: "Türkis", rgb: [0, 210, 230] },
  { name: "Blau", rgb: [30, 80, 255] },
  { name: "Violett", rgb: [150, 40, 255] },
  { name: "Pink", rgb: [255, 40, 160] },
];

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

function pbcRgbToHue([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

const pbcDist = (a, b) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const PBC_STYLE = `
  :host { display: block; }
  ha-card { padding: 14px 16px 16px; overflow: hidden; }
  .root {
    --c: rgb(255,196,120); --glow: 0; --tint: 0; --flame: 1;
    --pbc-track: color-mix(in srgb, var(--primary-text-color, #000) 10%, transparent);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .root.unavail { opacity: .5; }
  .lampbox {
    width: 100%; max-width: 200px; cursor: pointer; user-select: none;
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
  .core  { fill: #fff; opacity: .8;
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
  .row { width: 100%; display: flex; align-items: center; gap: 10px; margin-top: 2px; }
  .row ha-icon { color: var(--secondary-text-color); --mdc-icon-size: 20px; flex: none; }
  .pct {
    flex: none; min-width: 3.4em; text-align: center; font-size: .85em; font-weight: 500;
    padding: 4px 8px; border-radius: 999px; background: var(--pbc-track);
    color: var(--primary-text-color); font-variant-numeric: tabular-nums;
  }

  /* --- Schieberegler --- */
  .slider {
    --p: 0; --thumb: #fff; --ring: var(--c);
    -webkit-appearance: none; appearance: none; flex: 1; min-width: 0;
    height: 18px; margin: 0; border-radius: 999px; cursor: pointer; outline: none;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--c) 35%, transparent), var(--c))
        0 0 / calc(11px + (100% - 22px) * var(--p)) 100% no-repeat,
      var(--pbc-track);
    box-shadow: inset 0 1px 2px rgba(0,0,0,.12);
  }
  .slider.hue {
    background: linear-gradient(90deg,
      hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%),
      hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%));
    --ring: #fff;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 26px; height: 26px; border-radius: 50%;
    background: var(--thumb); border: 3px solid var(--ring);
    box-shadow: 0 2px 6px rgba(0,0,0,.3); transition: transform .15s ease;
  }
  .slider::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--thumb); border: 3px solid var(--ring);
    box-shadow: 0 2px 6px rgba(0,0,0,.3); transition: transform .15s ease;
  }
  .slider::-moz-range-track { background: transparent; }
  .slider:hover::-webkit-slider-thumb { transform: scale(1.08); }
  .slider:active::-webkit-slider-thumb { transform: scale(1.18); }
  .slider:hover::-moz-range-thumb { transform: scale(1.08); }
  .slider:active::-moz-range-thumb { transform: scale(1.18); }
  .slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 40%, transparent); }
  .slider:disabled { cursor: default; opacity: .5; }

  /* --- Effekt-Auswahl --- */
  select {
    flex: 1; min-width: 0; padding: 9px 36px 9px 14px; font: inherit; font-size: .95em;
    color: var(--primary-text-color); background-color: var(--pbc-track);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center; background-size: 20px;
    border: none; border-radius: 999px; -webkit-appearance: none; appearance: none;
    cursor: pointer; outline: none;
  }
  select:focus-visible { box-shadow: 0 0 0 2px var(--c); }
  select option { background: var(--card-background-color, #fff); color: var(--primary-text-color); }

  /* --- Farbwahl --- */
  .colors { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
  .swatches { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .sw {
    position: relative; width: 30px; height: 30px; flex: none; padding: 0; margin: 0;
    border: none; border-radius: 50%; cursor: pointer; background: var(--sw);
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.18);
    transition: transform .15s ease, box-shadow .2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .sw:hover { transform: scale(1.12); }
  .sw:active { transform: scale(.94); }
  .sw.white { background: radial-gradient(circle at 35% 35%, #fff, var(--sw) 75%); }
  .sw.active {
    box-shadow: 0 0 0 2px var(--card-background-color, #fff), 0 0 0 4px var(--sw),
                0 2px 8px color-mix(in srgb, var(--sw) 60%, transparent);
  }
  .sw.active::after {
    content: ""; position: absolute; inset: 0; margin: auto; width: 8px; height: 8px;
    border-radius: 50%; background: #fff; box-shadow: 0 0 2px rgba(0,0,0,.4);
  }
  .sw.custom {
    background: conic-gradient(hsl(0 100% 55%), hsl(60 100% 55%), hsl(120 100% 50%),
      hsl(180 100% 50%), hsl(240 100% 60%), hsl(300 100% 55%), hsl(360 100% 55%));
    overflow: hidden;
  }
  .sw.custom::before {
    content: "+"; position: absolute; inset: 4px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: var(--card-background-color, #fff); color: var(--primary-text-color);
    font-size: 17px; line-height: 1; font-weight: 500;
  }
  .sw.custom.active { --sw: var(--c); }
  .sw.custom.active::before { background: var(--c); content: ""; }
  .sw.custom input {
    position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0;
    padding: 0; border: none; cursor: pointer;
  }
  .disabled .sw { pointer-events: none; opacity: .5; }
  .hidden { display: none !important; }
`;

const PBC_SVG = `
<svg viewBox="0 0 200 250" role="img" aria-label="Playbulb Candle">
  <defs>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:.75"/>
      <stop offset=".45" style="stop-color:var(--c);stop-opacity:.28"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="bodyGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#d9dbdf"/>
      <stop offset=".3"  stop-color="#fdfdfd"/>
      <stop offset=".6"  stop-color="#f4f5f6"/>
      <stop offset="1"   stop-color="#c3c7cc"/>
    </linearGradient>
    <linearGradient id="shadeGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#000" stop-opacity=".14"/>
      <stop offset=".3"  stop-color="#fff" stop-opacity=".18"/>
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1"   stop-color="#000" stop-opacity=".2"/>
    </linearGradient>
    <linearGradient id="tintGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0"   style="stop-color:var(--c);stop-opacity:1"/>
      <stop offset=".6"  style="stop-color:var(--c);stop-opacity:.55"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:.2"/>
    </linearGradient>
    <radialGradient id="innerGrad" cx="50%" cy="20%" r="75%">
      <stop offset="0"   stop-color="#fff" stop-opacity=".9"/>
      <stop offset=".18" style="stop-color:var(--c);stop-opacity:.95"/>
      <stop offset=".6"  style="stop-color:var(--c);stop-opacity:.35"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="topGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#eceef0"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <radialGradient id="hollowGrad" cx="50%" cy="25%" r="80%">
      <stop offset="0" stop-color="#b9bdc3"/>
      <stop offset="1" stop-color="#e6e8eb"/>
    </radialGradient>
    <radialGradient id="hollowLit" cx="50%" cy="60%" r="60%">
      <stop offset="0"  stop-color="#fff"/>
      <stop offset=".35" style="stop-color:var(--c)"/>
      <stop offset="1"  style="stop-color:var(--c);stop-opacity:.5"/>
    </radialGradient>
    <radialGradient id="flameGrad" cx="50%" cy="80%" r="75%">
      <stop offset="0"   stop-color="#fff"/>
      <stop offset=".45" style="stop-color:var(--c);stop-opacity:.95"/>
      <stop offset="1"   style="stop-color:var(--c);stop-opacity:.15"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
    <clipPath id="bodyClip">
      <path d="M50 70 V216 C50 224 72 230 100 230 C128 230 150 224 150 216 V70 Z"/>
    </clipPath>
  </defs>

  <!-- Lichtschein -->
  <g class="lit"><circle class="glow" cx="100" cy="100" r="102" fill="url(#glowGrad)"/></g>
  <ellipse cx="100" cy="232" rx="60" ry="7" fill="#000" opacity=".14"/>

  <!-- Zylinderkörper -->
  <path d="M50 70 V216 C50 224 72 230 100 230 C128 230 150 224 150 216 V70 Z" fill="url(#bodyGrad)"/>
  <g class="lit">
    <path class="tint" d="M50 70 V216 C50 224 72 230 100 230 C128 230 150 224 150 216 V70 Z" fill="url(#tintGrad)"/>
    <g clip-path="url(#bodyClip)">
      <ellipse class="inner" cx="100" cy="112" rx="64" ry="96" fill="url(#innerGrad)"/>
    </g>
  </g>
  <path d="M50 70 V216 C50 224 72 230 100 230 C128 230 150 224 150 216 V70 Z" fill="url(#shadeGrad)"/>
  <!-- Bodenkante -->
  <path d="M50 211 V216 C50 224 72 230 100 230 C128 230 150 224 150 216 V211 C150 219 128 225 100 225 C72 225 50 219 50 211 Z"
        fill="#000" opacity=".07"/>

  <!-- Geschmolzener Wachsrand mit Tropfen -->
  <path d="M50 70 A50 12 0 0 0 150 70 L150 76 C150 82 144 86 137 88 C135 96 134 104 131 104 C128 104 127 97 126 91
           C117 93 109 94 100 94 C93 94 88 93 82 92 C81 101 79 112 75 112 C71 112 70 101 69 90 C59 87 50 82 50 76 Z"
        fill="url(#bodyGrad)" stroke="#000" stroke-opacity=".07" stroke-width="1"/>
  <g class="lit">
    <path class="tint" d="M50 70 A50 12 0 0 0 150 70 L150 76 C150 82 144 86 137 88 C135 96 134 104 131 104 C128 104 127 97 126 91
           C117 93 109 94 100 94 C93 94 88 93 82 92 C81 101 79 112 75 112 C71 112 70 101 69 90 C59 87 50 82 50 76 Z"
          fill="url(#tintGrad)"/>
  </g>
  <path d="M50 70 A50 12 0 0 0 150 70 L150 76 C150 82 144 86 137 88 C135 96 134 104 131 104 C128 104 127 97 126 91
           C117 93 109 94 100 94 C93 94 88 93 82 92 C81 101 79 112 75 112 C71 112 70 101 69 90 C59 87 50 82 50 76 Z"
        fill="url(#shadeGrad)"/>

  <!-- Oberseite mit Mulde -->
  <path d="M50 70 C50 63 58 59 66 58.5 C74 56 86 57.5 96 57 C108 56.5 118 58 128 58 C140 59 150 63 150 70
           C150 77 128 82 100 82 C72 82 50 77 50 70 Z" fill="url(#topGrad)" stroke="#000" stroke-opacity=".06"/>
  <ellipse cx="100" cy="71" rx="39" ry="8" fill="url(#hollowGrad)"/>
  <g class="lit">
    <ellipse class="inner" cx="100" cy="71" rx="39" ry="8" fill="url(#hollowLit)"/>
  </g>
  <ellipse cx="100" cy="72" rx="4" ry="1.6" fill="#6f747b" opacity=".55"/>

  <!-- LED-Flämmchen -->
  <g class="lit" filter="url(#soft)">
    <path class="flame" d="M100 42 C104 51 111 58 109 66 C108 71 104.5 74 100 74 C95.5 74 92 71 91 66 C89 58 96 51 100 42 Z"/>
    <path class="core"  d="M100 57 C102.5 61 105.5 65 104.5 69 C104 71.5 102 73 100 73 C98 73 96 71.5 95.5 69 C94.5 65 97.5 61 100 57 Z"/>
  </g>
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

  getCardSize() { return 5; }
  getGridOptions() { return { columns: 6, rows: 5, min_columns: 3, min_rows: 3 }; }

  connectedCallback() { if (this._built) this._update(); }
  disconnectedCallback() { this._stopRainbow(); }

  _build() {
    const c = this._config;
    const swatches = PBC_SWATCHES.map((s, i) =>
      `<button class="sw${s.white ? " white" : ""}" data-i="${i}" title="${s.name}"
               aria-label="${s.name}" style="--sw:${pbcHex(s.rgb)}"></button>`
    ).join("");

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
          <div class="row">
            <ha-icon icon="mdi:brightness-6"></ha-icon>
            <input type="range" class="slider" id="bright" min="0" max="100" step="1" value="0"
                   aria-label="Helligkeit">
            <span class="pct" id="bval">0 %</span>
          </div>` : ""}
          ${c.show_effects ? `
          <div class="row" id="effrow">
            <ha-icon icon="mdi:creation"></ha-icon>
            <select id="effect" aria-label="Effekt"></select>
          </div>` : ""}
          ${c.show_color_picker ? `
          <div class="colors" id="colors">
            <div class="swatches">
              ${swatches}
              <label class="sw custom" title="Eigene Farbe" id="custom">
                <input type="color" id="color" aria-label="Eigene Farbe" value="#ffc478">
              </label>
            </div>
            <div class="row">
              <ha-icon icon="mdi:palette"></ha-icon>
              <input type="range" class="slider hue" id="hue" min="0" max="360" step="1" value="30"
                     aria-label="Farbton">
            </div>
          </div>` : ""}
        </div>
      </ha-card>`;

    const $ = (id) => this.shadowRoot.getElementById(id);
    this._root = this.shadowRoot.querySelector(".root");
    this._elName = $("name");
    this._elState = $("state");
    this._elBright = $("bright");
    this._elBval = $("bval");
    this._elEffect = $("effect");
    this._elEffRow = $("effrow");
    this._elColors = $("colors");
    this._elColor = $("color");
    this._elCustom = $("custom");
    this._elHue = $("hue");
    this._elSwatches = Array.from(this.shadowRoot.querySelectorAll(".sw[data-i]"));
    this._effectKey = "";
    this._rootClass = "";

    $("lamp").addEventListener("click", () => this._tap());

    if (this._elBright) {
      this._elBright.addEventListener("input", () => {
        this._setBrightUi(Number(this._elBright.value));
      });
      this._elBright.addEventListener("change", () => {
        const v = Number(this._elBright.value);
        if (v <= 0) this._call("turn_off", {});
        else this._call("turn_on", { brightness_pct: v });
      });
    }
    if (this._elEffect) {
      this._elEffect.addEventListener("change", () => {
        this._call("turn_on", { effect: this._elEffect.value });
      });
    }
    this._elSwatches.forEach((el) => {
      el.addEventListener("click", () => this._pickSwatch(PBC_SWATCHES[Number(el.dataset.i)]));
    });
    if (this._elColor) {
      this._elColor.addEventListener("change", () => {
        const h = this._elColor.value;
        const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        this._call("turn_on", { rgb_color: rgb });
      });
    }
    if (this._elHue) {
      this._elHue.addEventListener("input", () => this._setHueUi(Number(this._elHue.value)));
      this._elHue.addEventListener("change", () => {
        this._call("turn_on", { hs_color: [Number(this._elHue.value), 100] });
      });
    }
    this._built = true;
  }

  _setBrightUi(pct) {
    this._elBright.style.setProperty("--p", (pct / 100).toFixed(3));
    this._elBval.textContent = pct + " %";
  }

  _setHueUi(h) {
    this._elHue.style.setProperty("--thumb", `hsl(${h} 100% 50%)`);
  }

  _pickSwatch(s) {
    if (s.white) {
      const st = this._hass && this._hass.states[this._config.entity];
      const modes = (st && st.attributes.supported_color_modes) || [];
      if (modes.includes("rgbw")) return this._call("turn_on", { rgbw_color: [0, 0, 0, 255] });
      if (modes.includes("color_temp")) return this._call("turn_on", { color_temp_kelvin: 2700 });
    }
    this._call("turn_on", { rgb_color: s.rgb.slice() });
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

  // Index des passenden Farbchips (-1 = keiner)
  _matchSwatch(a, rgb) {
    if (Array.isArray(a.rgbw_color)) {
      const [R, G, B, W] = a.rgbw_color;
      if (W > 0 && Math.max(R, G, B) < 20) return 0;
    }
    if (a.color_mode === "color_temp" || a.color_mode === "white") return 0;
    let best = -1, bestD = 70;
    PBC_SWATCHES.forEach((s, i) => {
      const d = pbcDist(s.rgb, rgb);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
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
      this._setClass("root unavail off");
      this._elName.textContent = this._config.name || this._config.entity;
      this._elState.textContent = "Entität nicht gefunden";
      return;
    }

    const a = st.attributes || {};
    const on = st.state === "on";
    const unavail = st.state === "unavailable" || st.state === "unknown";
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
    rs.setProperty("--tint", (0.1 + 0.35 * bri).toFixed(3));
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
    const focus = this.shadowRoot.activeElement;
    if (this._elBright && focus !== this._elBright) {
      const pct = Math.round(bri * 100);
      this._elBright.value = pct;
      this._setBrightUi(pct);
      this._elBright.disabled = unavail;
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
      if (focus !== this._elEffect) {
        let idx = list.indexOf(a.effect);
        if (idx < 0) idx = list.findIndex((e) => /^(kein|none|no effect|off|aus)/i.test(e));
        this._elEffect.selectedIndex = idx;
      }
      this._elEffect.disabled = unavail;
    }
    if (this._elColors) {
      this._elColors.classList.toggle("disabled", unavail);
      const idx = on && fx !== "rainbow" ? this._matchSwatch(a, rgb) : -1;
      this._elSwatches.forEach((el, i) => el.classList.toggle("active", i === idx));
      this._elCustom.classList.toggle("active", on && fx !== "rainbow" && idx === -1);
      if (focus !== this._elColor && on) this._elColor.value = pbcHex(rgb);
      if (focus !== this._elHue) {
        if (on && idx !== 0) this._elHue.value = pbcRgbToHue(rgb);
        this._setHueUi(Number(this._elHue.value));
      }
      this._elHue.disabled = unavail;
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
  show_color_picker: "Farbwahl",
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
