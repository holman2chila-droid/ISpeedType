<div align="center">

# ⌨️ ISpeedType

**An open-source typing test to measure and improve your typing speed.**

[![MIT License](https://img.shields.io/badge/license-MIT-7c5cfc.svg)](LICENSE)

**[▶ Play in English](https://holman2chila-droid.github.io/ISpeedType/?lang=en)** · [Leer en español](README.md)

![ISpeedType preview](assets/preview.png)

</div>

---

## ✨ Features

- **Live WPM, accuracy, time and error tracking.**
- **Unique game modes**: Lives, Fade, Lightning Storm, Dead Zone, Siege (endless roguelike waves of words flying at your core), plus a Classic mode.
- **Learning Mode**: 6 progressive levels with an on-screen keyboard and hands guide (US layout in English).
- **53 achievements** in 6 categories, from *Warming Up* to *Ultra Instinct* (110+ WPM).
- **Statistics panel** with history, charts, records and your most-missed keys.
- **Fully bilingual (Spanish / English)** with an accessible ES / EN switch. Each language has its own original practice texts; in English, the "No apostrophes" category replaces Spanish "Sin tildes".
- **5 themes**, responsive layout, and no servers: your data stays in your browser (`localStorage`).

## 🚀 Run locally

```bash
git clone https://github.com/holman2chila-droid/ISpeedType.git
cd ISpeedType
python3 -m http.server 8000   # then visit http://localhost:8000
```

Add `?lang=en` to the URL to open it in English.

## 🌐 Translating

Dictionaries live in `i18n/es.js` and `i18n/en.js` (keys must match). Practice texts live in `texts.js` (Spanish) and `texts-en.js` (English).

## 📄 License

Released under the **MIT License** — see [LICENSE](LICENSE).

---

<div align="center">

Made with ❤️ by **Holman Chila**

</div>
