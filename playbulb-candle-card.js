/*!
 * playbulb-candle-card
 * Home-Assistant-Karte für MIPOW Playbulb Candle (Integration "playbulb_candle").
 * Zeigt die Lampe als SVG in der aktuellen Farbe. Eine Datei, kein Build.
 *
 * YAML:
 *   type: custom:playbulb-candle-card
 *   entity: light.playbulb_candle
 */

const PBC_VERSION = "1.0.0";
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

const PBC_STYLE = `
  :host { display: block; }
  ha-card { padding: 12px 14px 14px; overflow: hidden; }
  .root {
    --c: rgb(255,196,120); --glow: 0; --tint: 0; --flame: 1;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
  }
  .root.unavail { opacity: .5; }
  .lampbox {
    width: 100%; max-width: 220px; cursor: pointer; user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  svg { display: block; width: 100%; height: auto; overflow: visible; }
  .lit { transition: opacity .5s ease; }
  .root.off .lit, .root.unavail .lit { opacity: 0; }
  .glow { opacity: var(--glow); }
  .tint { opacity: var(--tint); }
  .flame { fill: url(#flameGrad); opacity: var(--flame);
           transform-box: fill-box; transform-origin: 50% 100%; }
  .core  { fill: #fff; opacity: .55;
           transform-box: fill-box; transform-origin: 50% 100%; }
  .flame-off { fill: #9aa0a6; opacity: .3; transition: opacity .5s ease; }
  .root.on .flame-off { opacity: 0; }

  .root.fx-candle .flame { animation: pbc-flicker 1.3s ease-in-out infinite; }
  .root.fx-candle .core  { animation: pbc-flicker 1.1s ease-in-out infinite reverse; }
  .root.fx-pulse  .lit   { animation: pbc-pulse 1.8s ease-in-out infinite; }
  .root.fx-flash  .lit   { animation: pbc-flash .9s linear infinite; }
  @keyframes pbc-flicker {
    0%,100% { transform: scale(1,1) rotate(0); }
    15% { transform: scale(.95,1.06) rotate(-1.5deg); }
    35% { transform: scale(1.03,.95) rotate(1deg); }
    55% { transform: scale(.97,1.04) rotate(-.8deg); }
    75% { transform: scale(1.02,.97) rotate(1.4deg); }
  }
  @keyframes pbc-pulse { 0%,100% { opacity: 1; } 50% { opacity: .15; } }
  @keyframes pbc-flash { 0%,40% { opacity: 1; } 45%,70% { opacity: .04; } 75%,100% { opacity: 1; } }

  .info { text-align: center; }
  .name { font-size: 1.1em; font-weight: 500; color: var(--primary-text-color); }
  .state { font-size: .9em; color: var(--secondary-text-color); }
  .row { width: 100%; display: flex; align-items: center; gap: 10px; margin-top: 4px; }
  .row .lbl { min-width: 3.2em; text-align: right; font-size: .9em;
              color: var(--secondary-text-color); }
  input[type=range] { flex: 1; accent-color: var(--c); min-width: 0; }
  select {
    flex: 1; min-width: 0; padding: 7px 8px; font: inherit;
    color: var(--primary-text-color); background: var(--card-background-color);
    border: 1px solid var(--divider-color); border-radius: 8px;
  }
  input[type=color] { width: 40px; height: 34px; padding: 0; border: none;
                      background: none; cursor: pointer; }
  .hidden { display: none; }
`;

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

  getCardSize() { return 4; }
  getGridOptions() { return { columns: 6, rows: 4, min_columns: 3, min_rows: 3 }; }

  connectedCallback() { if (this._built) this._update(); }
  disconnectedCallback() { this._stopRainbow(); }

  _build() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${PBC_STYLE}</style>
      <ha-card>
        <div class="root off">
          <div class="lampbox" id="lamp">
            <svg viewBox="0 0 200 270" role="img" aria-label="Playbulb Candle">
              <defs>
                <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0"   style="stop-color:var(--c);stop-opacity:.85"/>
                  <stop offset=".45" style="stop-color:var(--c);stop-opacity:.35"/>
                  <stop offset="1"   style="stop-color:var(--c);stop-opacity:0"/>
                </radialGradient>
                <linearGradient id="bodyGrad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0"   stop-color="#cdd0d5"/>
                  <stop offset=".35" stop-color="#fbfbfc"/>
                  <stop offset=".7"  stop-color="#e8eaed"/>
                  <stop offset="1"   stop-color="#b6bac1"/>
                </linearGradient>
                <linearGradient id="tintGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0"   style="stop-color:var(--c);stop-opacity:1"/>
                  <stop offset="1"   style="stop-color:var(--c);stop-opacity:.25"/>
                </linearGradient>
                <linearGradient id="shadeGrad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0"   stop-color="#000" stop-opacity=".16"/>
                  <stop offset=".35" stop-color="#fff" stop-opacity="0"/>
                  <stop offset="1"   stop-color="#000" stop-opacity=".22"/>
                </linearGradient>
                <radialGradient id="flameGrad" cx="50%" cy="78%" r="70%">
                  <stop offset="0"   stop-color="#fff" stop-opacity=".85"/>
                  <stop offset=".5"  style="stop-color:var(--c)"/>
                  <stop offset="1"   style="stop-color:var(--c)"/>
                </radialGradient>
              </defs>

              <g class="lit"><circle class="glow" cx="100" cy="88" r="98" fill="url(#glowGrad)"/></g>

              <ellipse cx="100" cy="254" rx="52" ry="8" fill="#000" opacity=".12"/>
              <rect x="62" y="108" width="76" height="142" rx="10" fill="url(#bodyGrad)"/>
              <g class="lit"><rect class="tint" x="62" y="108" width="76" height="142" rx="10" fill="url(#tintGrad)"/></g>
              <rect x="62" y="108" width="76" height="142" rx="10" fill="url(#shadeGrad)"/>
              <rect x="56" y="238" width="88" height="14" rx="6" fill="#8d9299"/>
              <rect x="56" y="238" width="88" height="5" rx="2.5" fill="#fff" opacity=".25"/>
              <rect x="94" y="102" width="12" height="10" rx="3" fill="#b6bac1"/>

              <path class="flame-off"
                d="M100 18 C108 40 134 62 126 90 C122 104 112 110 100 110 C88 110 78 104 74 90 C66 62 92 40 100 18 Z"/>
              <g class="lit">
                <path class="flame"
                  d="M100 18 C108 40 134 62 126 90 C122 104 112 110 100 110 C88 110 78 104 74 90 C66 62 92 40 100 18 Z"/>
                <path class="core"
                  d="M100 58 C105 72 116 84 111 98 C108 105 104 108 100 108 C96 108 92 105 89 98 C84 84 95 72 100 58 Z"/>
              </g>
            </svg>
          </div>
          <div class="info">
            <div class="name${c.show_name ? "" : " hidden"}" id="name"></div>
            <div class="state${c.show_state ? "" : " hidden"}" id="state"></div>
          </div>
          ${c.show_brightness ? `
          <div class="row">
            <span class="lbl" id="bval">0 %</span>
            <input type="range" id="bright" min="0" max="100" step="1" value="0"
                   aria-label="Helligkeit">
          </div>` : ""}
          ${(c.show_effects || c.show_color_picker) ? `
          <div class="row">
            ${c.show_effects ? `<select id="effect" aria-label="Effekt"></select>` : ""}
            ${c.show_color_picker ? `<input type="color" id="color" aria-label="Farbe" value="#ffc478">` : ""}
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
    this._elColor = $("color");
    this._effectKey = "";
    this._rootClass = "";

    $("lamp").addEventListener("click", () => this._tap());

    if (this._elBright) {
      this._elBright.addEventListener("input", () => {
        this._elBval.textContent = this._elBright.value + " %";
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
    if (this._elColor) {
      this._elColor.addEventListener("change", () => {
        const h = this._elColor.value;
        const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        this._call("turn_on", { rgb_color: rgb });
      });
    }
    this._built = true;
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
    rs.setProperty("--tint", (0.12 + 0.43 * bri).toFixed(3));
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
      this._elBval.textContent = pct + " %";
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
      this._elEffect.classList.toggle("hidden", list.length === 0);
      if (focus !== this._elEffect) {
        const idx = list.indexOf(a.effect);
        this._elEffect.selectedIndex = idx;
      }
      this._elEffect.disabled = unavail;
    }
    if (this._elColor) {
      if (focus !== this._elColor && on) this._elColor.value = pbcHex(rgb);
      this._elColor.disabled = unavail;
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
  show_color_picker: "Farbwähler",
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
