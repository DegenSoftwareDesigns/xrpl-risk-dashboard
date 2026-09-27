# XRPL Risk Dashboard — Plan

## Objetivo

Responder de un vistazo a una sola pregunta: **¿es momento de risk-on o risk-off?**
La portada da el veredicto en claro. Debajo, tarjetas con números que se pueden abrir para ver el gráfico y entender el motivo.

## Estructura de la página

```
┌─────────────────────────────────────────────────────┐
│ VEREDICTO: RISK-ON / NEUTRAL / RISK-OFF   [EN|ES]   │
│ Una frase con el motivo principal + 2 sub-scores:    │
│ Macro 0–100 · Meme Heat 0–100                        │
├─────────────────────────────────────────────────────┤
│ MACRO                                                │
│ [BTC/USD] [XRP/USD] [XRP/BTC]   ← tarjetas           │
│  precio · score 0–100 · tendencia · RSI · MACD       │
│  ▸ Mostrar gráfico (precio + 3 MAs, RSI, MACD)       │
├─────────────────────────────────────────────────────┤
│ XRPL MEME HEAT                                       │
│ Score 0–100 + zona + cambio 7d/30d                   │
│  ▸ Mostrar gráfico histórico                         │
│ Qué empuja el índice     [ Valor | Gráfico ]         │
│ [Vol FL] [Trades FL] [Pools nuevos]                  │
│ [Traders únicos] [Rotación] [Minorista]              │
├─────────────────────────────────────────────────────┤
│ Volumen por plataforma (plegado por defecto)         │
│ Footer: Data by xrpl.to · Binance · no es consejo    │
└─────────────────────────────────────────────────────┘
```

- **Tarjetas plegables**: cada tarjeta muestra números; un botón "Show chart" la despliega. Plegadas por defecto, para que la portada sea corta en el móvil.
- **Segmented control `Value | Chart`** en "Qué empuja el índice": cambia las 6 tarjetas a la vez entre percentil 0–100 (número grande + flecha de cambio a 7d) y mini-gráfico.
- **Idioma**: inglés por defecto, selector EN/ES. Textos en un diccionario `i18n`; la elección se recuerda en `localStorage` (con try/catch).
- **Volumen por plataforma**: añadir escala logarítmica; ahora el pico del 2 dic 2024 (84M XRP) aplasta el resto.

## Datos

| Fuente | Llamadas/día | Qué da |
|---|---|---|
| xrpl.to `/token/analytics/market` | 1 | Métricas diarias del mercado XRPL (ya funciona) |
| xrpl.to `/stats/marketcap-history` | 1 | Market cap diario (ya funciona) |
| Binance `/api/v3/klines` BTCUSDT, XRPUSDT, XRPBTC, `1d`, `limit=1000` | 3 | OHLC diario desde ene 2024, sin key (probado) |

Total: 5 llamadas al día. TradingView no tiene API pública gratuita; Binance sí y basta. Kraken (`/0/public/OHLC`) queda como alternativa si Binance falla.

## Síntesis técnica (por par)

Medias móviles diarias:
- **EMA 21**: tendencia corta, la que marca el ritmo de un degen.
- **SMA 50**: tendencia media.
- **SMA 200**: régimen de mercado (alcista/bajista).

Score técnico 0–100 por par, suma de puntos (pesos en `weights.json`):

| Bloque | Condición | Puntos |
|---|---|---|
| Tendencia (40) | Precio > SMA 200 | 15 |
| | SMA 50 > SMA 200 | 10 |
| | Precio > EMA 21 | 10 |
| | EMA 21 con pendiente positiva (vs hace 5 días) | 5 |
| Momentum (35) | MACD (12,26,9) > señal | 15 |
| | Histograma MACD creciendo | 10 |
| | MACD > 0 | 10 |
| RSI 14 (25) | 50–70: fuerza sana | 25 |
| | 40–50 o 70–80 | 12 |
| | < 40 o > 80 (debilidad o sobrecompra) | 0 |

Cada tarjeta enseña el score y los hechos que lo forman en texto corto ("Above 200D", "MACD bullish cross", "RSI 63").

**Macro score** = 0,40 × BTC/USD + 0,35 × XRP/USD + 0,25 × XRP/BTC.
XRP/BTC pesa porque dice si el dinero rota hacia XRP (y de ahí al ecosistema XRPL) o huye a BTC.

## Veredicto

Cruza Macro score con Meme Heat Index:

| Macro | Meme Heat | Veredicto |
|---|---|---|
| ≥ 60 | 40–85 | **Risk-On** |
| ≥ 60 | > 85 | **Risk-On, late stage**: euforia, tomar beneficios |
| ≥ 60 | < 40 | **Neutral, early**: macro fuerte, memes aún fríos; vigilar |
| 40–60 | cualquiera | **Neutral** |
| < 40 | cualquiera | **Risk-Off** |

Umbrales configurables. La frase del veredicto se genera con el factor que más pesa ("BTC below 200D, meme activity cooling").

## Archivos

- `ingest.py`: añadir las 3 llamadas a Binance → `raw/btcusdt.json`, etc.
- `heat.py`: sin cambios de lógica.
- `macro.py` (nuevo): indicadores (EMA/SMA/RSI/MACD) y scores → tabla `macro_daily` en SQLite.
- `build.py` (nuevo): lee SQLite, calcula el veredicto, escribe `data.js` y el HTML de un solo archivo para publicar.
- `index.html`: rehecho con la estructura de arriba.

## Validación

Antes de fiarse del veredicto, dibujarlo sobre el precio de XRP desde 2024 y comprobar:
- ¿Marcó Risk-On durante nov 2024 – ene 2025 (el gran rally de XRP y memes)?
- ¿Pasó a Risk-Off en las caídas largas de 2025–2026?
Si no, ajustar pesos y umbrales. Añadir al dashboard una franja de color con el veredicto histórico bajo el gráfico de XRP, para que se vea cuándo acertó y cuándo no.

## Actualización diaria

El artifact actual es una foto fija. Opciones:
1. **GitHub Pages + GitHub Action diaria** (recomendada): el Action ejecuta los scripts, hace commit de `data.js` y la página se actualiza sola. Accesible desde el móvil sin depender del PC.
2. Tarea programada de Windows + republicar el artifact a mano.

## Arquitectura para escalar (repo público, despliegue en VPS)

- **Sitio estático puro.** Se publica `dist/` (HTML, JS, CSS, JSON). Sin backend ni puertos. Sirve GitHub Pages o cualquier nginx/Caddy. Todas las rutas son relativas, así funciona en `/` y en un subpath.
- **Datos separados del código.** El pipeline genera `data/*.json` con `schema_version`; el frontend los carga con `fetch`. SQLite es historial interno y no se publica.
- **Tema por tokens.** Todo el aspecto vive en `web/theme.css` con nombres semánticos (`--bg`, `--surface`, `--text`, `--accent`, `--pos`, `--neg`, `--warn`, tipografías, radios, espaciados). Ningún componente lleva colores a mano; los gráficos leen los tokens con `getComputedStyle`. Aplicar un Design.md futuro = reescribir `theme.css` (o enlazar uno compartido en `/shared/theme.css` para todas las apps del VPS).
- **Textos y configuración fuera del código.** `web/locales/en.json` y `es.json` (inglés por defecto); pesos y umbrales en `config.json`.
- **Contrato de despliegue.** `DEPLOY.md` (comandos, carpeta servida, frecuencia), `Dockerfile` mínimo (nginx sirviendo `dist/`) y README corto, para que otro agente pueda publicarlo en el VPS sin leer el código.
- **Reglas.** Ninguna API key en el frontend (variables de entorno solo en el pipeline). Atribución "Data by xrpl.to" siempre visible. No se re-sirven los datos de xrpl.to como API.

```
pipeline/    ingest, heat, macro, verdict, update (Python, solo stdlib)
web/         sitio estático que se publica tal cual (index.html, app.js, app.css, theme.css, locales/)
web/data/    JSON generados por el pipeline
config.json  pesos y umbrales
DEPLOY.md · README.md · .github/workflows/pages.yml
```

Comandos: `python pipeline/update.py` (descarga y recalcula, 5 llamadas) y `python pipeline/update.py --offline` (recalcula sin llamar a APIs). Sin paso de build: se sirve `web/`. SQLite descartado: todo se recalcula desde `raw/` en cada ejecución.

**Estado (2026-09-27):** fases 1 y 2 hechas. El score macro del veredicto usa la media de 7 días (sin ella cambiaba casi a diario). Validación rápida: Risk-On en nov 2024–ene 2025 y jul 2025; Risk-Off dominante oct 2025–jul 2026.

## Fases

1. Macro (Binance + indicadores + tarjetas).
2. Rediseño de portada: veredicto, tarjetas plegables, segmented control, i18n.
3. Validación histórica y ajuste de pesos.
4. Actualización diaria automática.
5. (Más adelante) Watchlist de tokens: cuadrante agotamiento vs riesgo, snapshot diario de `/tokens`.

La herramienta es una heurística para ordenar información, no consejo de inversión.
