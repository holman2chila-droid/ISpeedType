<div align="center">

# ⌨️ ISpeedType

**Test de mecanografía de código abierto para medir y mejorar tu velocidad de escritura.**

[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-7c5cfc.svg)](LICENSE)
![HTML5](https://img.shields.io/badge/HTML5-e34f26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572b6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=black)

**[▶ Jugar ahora](https://holman2chila-droid.github.io/ISpeedType/)** · **[▶ Play in English](https://holman2chila-droid.github.io/ISpeedType/?lang=en)** · [Read in English](README.en.md)

![Vista previa de ISpeedType](assets/preview.png)

</div>

---

## ✨ Características

- **Mide tu velocidad y precisión** en tiempo real: WPM, precisión, tiempo y errores.
- **Modos de juego únicos** que convierten la práctica en un reto.
- **Modo Aprendizaje** para aprender a colocar los dedos desde cero, en 6 niveles progresivos con teclado y manos guía.
- **53 logros** repartidos en 6 categorías, con escalones graduales de dificultad.
- **Panel de Estadísticas** con historial, gráficas, récords y tus teclas más falladas.
- **Bilingüe: Español e Inglés** 🌎 con un selector accesible (ES / EN) en la cabecera. Cada idioma tiene sus propios textos de práctica, y en inglés la categoría «Sin tildes» pasa a ser «No apostrophes» (sin apóstrofos).
- **5 temas visuales**: oscuro, claro, violeta, rosa y verde.
- **Sin instalación ni servidores**: todo corre en tu navegador y tus datos se guardan en tu equipo.
- **Responsive**: funciona en escritorio y móvil.

## 🎮 Modos de juego

| Modo | Descripción |
|---|---|
| ⌨️ **Clásico** | Escribe el texto lo más rápido y preciso que puedas. |
| ❤️ **Vidas** | Cada error cuesta una vida. 4 dificultades: 10, 5, 3 o 1 vida (Hardcore). |
| 👻 **Desvanecimiento** | El texto se desvanece mientras escribes: ¡no te dejes alcanzar! 4 velocidades (20 a 80 WPM). |
| ⚡ **Tormenta Eléctrica** | Cada pocos segundos varias letras se transforman en símbolos (`@`, `#`, `$`, `*`). 4 intensidades. |
| 🔒 **Punto Muerto** | Algunas teclas se "rompen" y debes saltarlas con `[Espacio]`. De 2 a 5 teclas rotas. |
| 🎯 **Asedio** | Modo infinito tipo roguelike: las palabras llegan desde los bordes hacia tu núcleo; escríbelas y pulsa `[Espacio]`/`[Enter]` para destruirlas. Oleadas cada vez más rápidas, con palabras blindadas (`v3locid@d`) y ráfagas masivas. 5 vidas. |
| 🎓 **Aprendizaje** | Curso guiado de mecanografía desde cero, con 6 niveles. |

También puedes **pegar tu propio texto** o elegir una categoría (corto, sin tildes / sin apóstrofos en inglés, filosofía, romance, dichos y refranes, cuento clásico, largo...).

## 🏆 Logros

53 logros en 6 categorías:

- 🔥 **Rachas**: palabras seguidas sin errores (de 10 a 1000).
- ⚡ **Velocidad**: de 30 WPM hasta *Ultra Instinto* (más de 110 WPM).
- 🎯 **Precisión**: textos largos con 100% de acierto.
- ❤️ **Supervivencia**: un logro por cada dificultad del Modo Vidas, más retos especiales.
- 🎮 **Modos**: un logro por cada dificultad de Desvanecimiento, Tormenta y Punto Muerto.
- 👑 **Persistencia**: de 1 a 1000 pruebas completadas y rachas de días seguidos.

## 📊 Estadísticas

Un panel completo con tu progreso a lo largo del tiempo:

- Resumen general: partidas, mejor WPM, WPM medio, precisión, tiempo jugado, errores.
- **Consistencia** y **tendencia** de tu velocidad.
- Gráfica de evolución del WPM y la precisión.
- Rendimiento por modo.
- Mapa de actividad y horarios en los que más practicas.
- Distribución de tu velocidad.
- Teclas más falladas y récords personales.

> Todo se guarda localmente en tu navegador (`localStorage`). Nada se envía a ningún servidor.

## 🚀 Ejecutar en local

No requiere dependencias ni compilación.

```bash
git clone https://github.com/holman2chila-droid/ISpeedType.git
cd ISpeedType
```

Abre `index.html` en tu navegador, o sírvelo con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego visita http://localhost:8000
```

## 🗂️ Estructura del proyecto

```
ISpeedType/
├── index.html      # Estructura de la página y metadatos SEO
├── styles.css      # Estilos, temas y animaciones
├── app.js          # Lógica del juego, modos, logros y navegación
├── stats.js        # Historial y panel de Estadísticas
├── texts.js        # Banco de textos de práctica en español
├── texts-en.js     # Banco de textos de práctica en inglés (originales)
├── i18n/           # Traducciones: i18n.js (motor), es.js y en.js (diccionarios)
├── favicon.svg     # Icono de la pestaña
├── assets/         # Imagen de vista previa para redes sociales
├── sitemap.xml     # Mapa del sitio para buscadores
└── LICENSE         # Licencia MIT
```

## 🌐 Idiomas

El idioma se elige con el selector **ES / EN** de la cabecera (se recuerda entre visitas) o con `?lang=en` en la URL. Para añadir o corregir una traducción edita `i18n/es.js` y `i18n/en.js` (las claves deben coincidir); los textos de práctica están en `texts.js` y `texts-en.js`.

## 🤝 Contribuir

¡Las sugerencias y mejoras son bienvenidas!

1. Haz un fork del repositorio.
2. Crea una rama: `git checkout -b mi-mejora`.
3. Haz tus cambios y un commit: `git commit -m "Describe tu mejora"`.
4. Sube la rama y abre un *Pull Request*.

¿Encontraste un error? [Abre un issue](https://github.com/holman2chila-droid/ISpeedType/issues).

## 📄 Licencia

Distribuido bajo la **licencia MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.

---

<div align="center">

Hecho con ❤️ por **Holman Chila**

</div>
