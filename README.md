# Playbulb Candle Card

Lovelace-Karte für MIPOW Playbulb Candle (Integration `playbulb_candle`). Die Lampe wird als SVG in der aktuellen Farbe dargestellt (RGB + Weißkanal, Helligkeit als Leuchtstärke). Die Effekte Kerzenlicht, Pulsieren, Blitz und Regenbogen werden animiert.

Bedienung im Home-Assistant-Standardstil: Tippen auf die Kerze schaltet ein/aus, darunter ein Helligkeitsregler wie bei der Kachel-Karte, ein Farbrad wie im Detail-Dialog (Mitte = Weiß) und die Effekt-Auswahl.

## Installation (HACS)

1. HACS → Dashboard → Menü → *Benutzerdefinierte Repositories* → Repo-URL, Typ **Dashboard**.
2. Karte installieren, Browser-Cache leeren.

Manuell: `playbulb-candle-card.js` nach `/config/www/` kopieren und unter *Einstellungen → Dashboards → Ressourcen* als JavaScript-Modul `/local/playbulb-candle-card.js` eintragen.

## Konfiguration

```yaml
type: custom:playbulb-candle-card
entity: light.playbulb_candle
```

| Option | Standard | Beschreibung |
|---|---|---|
| `entity` | – | Licht-Entität (Pflicht) |
| `name` | Friendly Name | Anzeigename |
| `tap_action` | `toggle` | `toggle` oder `more-info` |
| `show_name` / `show_state` | `true` | Texte unter der Lampe |
| `show_brightness` | `true` | Helligkeitsregler |
| `show_effects` | `true` | Effekt-Auswahl |
| `show_color_picker` | `true` | Farbrad |
| `white_color` | `[255,196,120]` | Farbton des Weißkanals für die Darstellung |
