# ISpeedType — backend online

Ranking global y partidas 1v1 con **servidor autoritativo**. El frontend sigue en GitHub Pages; esto es un
Cloudflare Worker con Durable Objects (plan gratuito).

## Cómo evita las trampas

| Ataque | Defensa |
|---|---|
| Editar `localStorage` / mandar `wpm: 999` | El cliente nunca manda su WPM: manda las pulsaciones y el servidor las reproduce contra el texto que **él** eligió |
| Inventar un log rápido | El servidor exige que haya pasado de verdad el tiempo que dice el log (`clock-mismatch`), tope de 250 WPM |
| Bots / autotyper | Chequeo de ritmo: intervalos demasiado constantes (`robotic-timing`) o ráfagas imposibles (`burst-timing`) |
| Reusar una carrera buena | Cada `raceId` sirve una sola vez y caduca a los 15 min |
| 1v1: falsear el tiempo | Cada tecla llega en vivo y el servidor la sella con su reloj; arrancar antes del "¡ya!" descalifica |
| Suplantar a otro jugador | Cada jugador tiene un secreto (solo se guarda su hash) y los nicks son únicos |
| Usar la API desde otro sitio | Solo acepta los orígenes de `ALLOWED_ORIGINS` |

Límite honesto: un bot que imite tiempos humanos con jitter aleatorio puede pasar. Eso solo se frena con
detección estadística más fina o revisión manual de marcas altas.

## Estructura

- `src/validate.js` — replay de pulsaciones + chequeos (misma fórmula de WPM que `app.js`)
- `src/leaderboard.js` — jugadores, carreras en solitario, ranking WPM y ELO (SQLite)
- `src/matchmaker.js` — cola de emparejamiento por WebSocket
- `src/room.js` — sala 1v1 (`mm-…` cuentan ELO; códigos de 6 letras = salas privadas sin ELO)
- `src/texts.js` — generado desde `../texts.js` y `../texts-en.js` con `npm run build:texts`
- Frontend: `../online.js`, `../online.css` y unos ganchos mínimos en `../app.js` (`window.ISpeedTypeOnline`)

## Probar en local

```bash
cd server
npm install
npm test                      # pruebas del validador
npm run dev                   # API en http://127.0.0.1:8787
# en otra terminal, desde la raíz del repo:
python -m http.server 8080    # sitio en http://localhost:8080 (online.js usa la API local solo)
BASE=http://127.0.0.1:8787 node test/e2e.mjs   # prueba end-to-end completa
```

## Desplegar (una vez)

```bash
cd server
npm install
npx wrangler login            # abre el navegador para autorizar tu cuenta de Cloudflare
npm run deploy                # imprime la URL: https://ispeedtype-api.<tu-subdominio>.workers.dev
```

Luego, en `../online.js`, reemplaza `TU-SUBDOMINIO` en `PROD_API` por el subdominio que imprimió el deploy
y sube el cambio a GitHub Pages.

Si el sitio se sirve desde otro dominio (por ejemplo un fork en `https://<usuario>.github.io`), agrégalo a
`ALLOWED_ORIGINS` en `wrangler.toml` y vuelve a hacer `npm run deploy`.

Si se cambian los textos del sitio: `npm run build:texts` y `npm run deploy`.
