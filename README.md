# Playbulb Candle Card

Lovelace-Karte für MIPOW Playbulb Candle (Integration `playbulb_candle`). Die Lampe wird als SVG in der aktuellen Farbe dargestellt (RGB + Weißkanal, Helligkeit als Leuchtstärke). Die Effekte Kerzenlicht, Pulsieren, Blitz und Regenbogen werden animiert.

Bedienung im Home-Assistant-Standardstil: Helligkeitsregler wie bei der Kachel-Karte, Farbrad wie im Detail-Dialog (Mitte = Weiß) und Effekt-Auswahl als Aufklapp-Menü wie im Detail-Dialog. Tippen, Doppeltippen und Halten lassen sich für die Lampe und für die Karte getrennt belegen, wie bei den HA-Standardkarten.

**Alle Optionen sind im visuellen Karten-Editor einstellbar.** YAML ist nicht nötig.

## Installation (HACS)

1. HACS → Dashboard → Menü → *Benutzerdefinierte Repositories* → Repo-URL, Typ **Dashboard**.
2. Karte installieren, Browser-Cache leeren.

Manuell: `playbulb-candle-card.js` nach `/config/www/` kopieren und unter *Einstellungen → Dashboards → Ressourcen* als JavaScript-Modul `/local/playbulb-candle-card.js` eintragen.

## Konfiguration

```yaml
type: custom:playbulb-candle-card
entity: light.playbulb_candle
```

### Allgemein und Anzeige

| Option | Standard | Beschreibung |
|---|---|---|
| `entity` | – | Licht-Entität (Pflicht) |
| `name` | Friendly Name | Anzeigename |
| `layout` | `vertical` | `vertical` = große Lampe, `horizontal` = kompakt (kleine Lampe neben Name und Status, spart auf dem Handy viel Höhe) |
| `show_name` / `show_state` | `true` | Name bzw. Status anzeigen |
| `show_brightness` | `true` | Helligkeitsregler |
| `show_color_picker` | `true` | Farbrad |
| `show_effects` | `true` | Effekt-Auswahl |
| `show_battery` | `true` | Batteriesymbol mit Prozentwert in der Statuszeile |
| `battery_entity` | automatisch | Batterie-Sensor. Leer lassen: Die Karte sucht den Sensor mit `device_class: battery` am Gerät der Lampe |
| `battery_warning` | `50` | Bis zu diesem Wert (einschließlich) ist das Symbol gelb |
| `battery_critical` | `20` | Bis zu diesem Wert (einschließlich) ist das Symbol rot |
| `white_color` | `[255,196,120]` | Farbton, in dem der Weißkanal dargestellt wird (nur Anzeige) |

Batteriesymbol mit den Standardwerten: **grün** über 50 %, **gelb** von 21 bis 50 %, **rot** ab 20 % und weniger. Die Füllung des Symbols zeigt den Ladestand. Wird kein Batterie-Sensor gefunden, bleibt das Symbol ausgeblendet. Ist der Sensor nicht erreichbar, zeigt die Karte ein leeres Symbol mit „–“.

### Aktionen

Die Werte sind normale Home-Assistant-Aktionen (`more-info`, `toggle`, `navigate`, `url`, `perform-action`, `assist`, `none`, jeweils auch mit `confirmation`).

| Option | Standard | Wirkt auf |
|---|---|---|
| `icon_tap_action` | `toggle` | Tippen auf die Lampe |
| `icon_hold_action` | `more-info` | Halten der Lampe |
| `icon_double_tap_action` | `none` | Doppeltippen auf die Lampe |
| `tap_action` | `none` | Tippen auf die Kartenfläche |
| `hold_action` | `none` | Halten der Kartenfläche |
| `double_tap_action` | `none` | Doppeltippen auf die Kartenfläche |

Die Kartenaktionen gelten nur für die freie Kartenfläche (Name, Status, Hintergrund). Regler, Farbrad und Effekt-Auswahl lösen keine Kartenaktion aus. Hat die Lampe keine eigene Aktion (alle `none`), gehört sie zur Kartenfläche.

Beispiel:

```yaml
type: custom:playbulb-candle-card
entity: light.playbulb_candle
layout: horizontal
show_color_picker: false
icon_double_tap_action:
  action: perform-action
  perform_action: light.turn_on
  target:
    entity_id: light.playbulb_candle
  data:
    effect: Kerzenlicht
tap_action:
  action: more-info
```

### Umstieg von Version 1.3 und älter

Früher war `tap_action: toggle` bzw. `tap_action: more-info` ein einfacher Text und galt für die Lampe. Diese Schreibweise wird automatisch als `icon_tap_action` übernommen. Beim nächsten Speichern im Editor wird die Konfiguration auf das neue Format umgestellt.

## Layout

In der Sections-Ansicht nimmt die Karte standardmäßig die volle Abschnittsbreite ein, die Höhe richtet sich nach dem Inhalt. Breite und Höhe lassen sich im Editor unter *Layout* ändern. Bei fester Höhe bleibt der Inhalt innerhalb der Karte und überdeckt keine Nachbarkarten.
