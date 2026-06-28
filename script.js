/**
 * ═══════════════════════════════════════════════════════════════
 *  SKYGLASS — Weather App   |   script.js
 * ───────────────────────────────────────────────────────────────
 *  APIs used (both 100% free, no API key required):
 *    • Open-Meteo Geocoding  → city name → lat/lng/timezone
 *      https://open-meteo.com/en/docs/geocoding-api
 *    • Open-Meteo Weather    → lat/lng → current + 5-day forecast
 *      https://open-meteo.com/en/docs
 *
 *  Features:
 *    • City search with geocoding
 *    • Current: temp, feels like, humidity, wind speed, pressure
 *    • 5-day forecast with daily high / low
 *    • WMO weather-code → emoji + description
 *    • Dark / Light mode (persisted in localStorage)
 *    • Keyboard-accessible (Enter to search)
 *    • Graceful error handling & loading states
 * ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIGURATION ──────────────────────────────────────────────── */
const CONFIG = {
  // Open-Meteo Geocoding API – converts city name → coordinates
  GEO_URL: 'https://geocoding-api.open-meteo.com/v1/search',

  // Open-Meteo Weather API – coordinates → weather data
  WEATHER_URL: 'https://api.open-meteo.com/v1/forecast',

  // Open-Meteo Air Quality API – free, no key required
  AQI_URL: 'https://air-quality-api.open-meteo.com/v1/air-quality',

  // Display units
  TEMP_UNIT:  '°C',
  SPEED_UNIT: 'km/h',
};


/* ── DOM REFERENCES ─────────────────────────────────────────────── */
const DOM = {
  cityInput:    document.getElementById('cityInput'),
  searchBtn:    document.getElementById('searchBtn'),
  searchError:  document.getElementById('searchError'),
  loading:      document.getElementById('loading'),
  results:      document.getElementById('results'),
  emptyState:   document.getElementById('emptyState'),
  themeToggle:  document.getElementById('themeToggle'),

  // Current weather fields
  cityName:     document.getElementById('cityName'),
  countryCode:  document.getElementById('countryCode'),
  currentDate:  document.getElementById('currentDate'),
  currentEmoji: document.getElementById('currentEmoji'),
  currentTemp:  document.getElementById('currentTemp'),
  currentDesc:  document.getElementById('currentDesc'),
  feelsLike:    document.getElementById('feelsLike'),
  humidity:     document.getElementById('humidity'),
  windSpeed:    document.getElementById('windSpeed'),
  pressure:     document.getElementById('pressure'),

  // 5-day forecast container
  forecastGrid: document.getElementById('forecastGrid'),

  // AQI card elements
  aqiCard:       document.getElementById('aqiCard'),
  aqiBadge:      document.getElementById('aqiBadge'),
  aqiIndex:      document.getElementById('aqiIndex'),
  aqiLabel:      document.getElementById('aqiLabel'),
  aqiGaugeFill:  document.getElementById('aqiGaugeFill'),
  aqiGaugeNeedle:document.getElementById('aqiGaugeNeedle'),
  aqiPollutants: document.getElementById('aqiPollutants'),
  healthTipsList:document.getElementById('healthTipsList'),
};


/* ── WMO WEATHER CODE MAPS ──────────────────────────────────────── */
/**
 * WMO Weather Interpretation Codes used by Open-Meteo.
 * Reference: https://open-meteo.com/en/docs#weathervariables
 *
 * Each entry: [emoji (day), emoji (night), description]
 */
const WMO_MAP = {
  0:  ['☀️',  '🌙',  'Clear sky'],
  1:  ['🌤️', '🌤️', 'Mainly clear'],
  2:  ['⛅',  '⛅',  'Partly cloudy'],
  3:  ['☁️',  '☁️',  'Overcast'],
  45: ['🌫️', '🌫️', 'Foggy'],
  48: ['🌫️', '🌫️', 'Icy fog'],
  51: ['🌦️', '🌧️', 'Light drizzle'],
  53: ['🌦️', '🌧️', 'Moderate drizzle'],
  55: ['🌧️', '🌧️', 'Dense drizzle'],
  56: ['🌨️', '🌨️', 'Freezing drizzle'],
  57: ['🌨️', '🌨️', 'Heavy freezing drizzle'],
  61: ['🌧️', '🌧️', 'Slight rain'],
  63: ['🌧️', '🌧️', 'Moderate rain'],
  65: ['🌧️', '🌧️', 'Heavy rain'],
  66: ['🌨️', '🌨️', 'Freezing rain'],
  67: ['🌨️', '🌨️', 'Heavy freezing rain'],
  71: ['🌨️', '🌨️', 'Slight snowfall'],
  73: ['❄️',  '❄️',  'Moderate snowfall'],
  75: ['❄️',  '❄️',  'Heavy snowfall'],
  77: ['🌨️', '🌨️', 'Snow grains'],
  80: ['🌦️', '🌧️', 'Slight showers'],
  81: ['🌧️', '🌧️', 'Moderate showers'],
  82: ['⛈️',  '⛈️',  'Violent showers'],
  85: ['🌨️', '🌨️', 'Slight snow showers'],
  86: ['❄️',  '❄️',  'Heavy snow showers'],
  95: ['⛈️',  '🌩️', 'Thunderstorm'],
  96: ['⛈️',  '🌩️', 'Thunderstorm with hail'],
  99: ['⛈️',  '🌩️', 'Thunderstorm with heavy hail'],
};

/**
 * Looks up a WMO weather code and returns the right emoji + description.
 * @param {number}  code   - WMO weather interpretation code
 * @param {boolean} isDay  - true if daytime (open-meteo provides is_day field)
 * @returns {{ emoji: string, desc: string }}
 */
function wmoToDisplay(code, isDay = true) {
  const entry = WMO_MAP[code];
  if (!entry) return { emoji: '🌡️', desc: 'Unknown' };
  return {
    emoji: isDay ? entry[0] : entry[1],
    desc:  entry[2],
  };
}


/* ── THEME MANAGEMENT ───────────────────────────────────────────── */
const STORAGE_KEY_THEME = 'skyglass-theme';

/** Reads saved theme (default: dark) and applies it. */
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME) ?? 'dark';
  applyTheme(saved);
}

/**
 * Sets the theme on <html> and persists the choice.
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  DOM.themeToggle.setAttribute('aria-pressed', String(theme === 'light'));
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

/** Flips between dark and light. */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

DOM.themeToggle.addEventListener('click', toggleTheme);


/* ── UI STATE HELPERS ───────────────────────────────────────────── */

function showLoading() {
  DOM.loading.hidden    = false;
  DOM.results.hidden    = true;
  DOM.emptyState.hidden = true;
  hideError();
}

function hideLoading() {
  DOM.loading.hidden = true;
}

function showResults() {
  DOM.results.hidden    = false;
  DOM.emptyState.hidden = true;

  // Re-trigger entrance animations on the temp number
  const tempEl = DOM.currentTemp;
  tempEl.classList.remove('re-animate', 'go');
  void tempEl.offsetWidth; // reflow
  tempEl.classList.add('re-animate');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => tempEl.classList.add('go'));
  });
}

function showError(message) {
  DOM.searchError.textContent = message;
  DOM.searchError.hidden      = false;
}

function hideError() {
  DOM.searchError.hidden      = true;
  DOM.searchError.textContent = '';
}

function showEmptyState() {
  DOM.results.hidden    = true;
  DOM.emptyState.hidden = false;
}


/* ── DATE / TIME UTILITIES ──────────────────────────────────────── */

/**
 * Formats a date string (YYYY-MM-DD or ISO) into a long readable date.
 * @param {string} dateStr  - e.g. "2026-06-26"
 * @param {string} [tz]     - IANA timezone string
 * @returns {string}        - e.g. "Friday, 26 June 2026"
 */
function formatFullDate(dateStr, tz) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday:  'long',
    day:      'numeric',
    month:    'long',
    year:     'numeric',
    timeZone: tz ?? 'UTC',
  });
}

/**
 * Formats a date string into a short weekday name.
 * @param {string} dateStr  - e.g. "2026-06-27"
 * @param {string} [tz]     - IANA timezone string
 * @returns {string}        - e.g. "Sat"
 */
function formatShortDay(dateStr, tz) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday:  'short',
    timeZone: tz ?? 'UTC',
  });
}

/** Returns today's date as "YYYY-MM-DD" in the given timezone. */
function todayString(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz ?? 'UTC' });
}


/* ── API CALLS ──────────────────────────────────────────────────── */

/**
 * Geocodes a city name using Open-Meteo's free geocoding API.
 * Returns the best match with name, country, lat, lng, and timezone.
 *
 * @param {string} city
 * @returns {Promise<{ name: string, country: string, lat: number, lng: number, timezone: string }>}
 */
async function geocodeCity(city) {
  const url = new URL(CONFIG.GEO_URL);
  url.searchParams.set('name',     city);
  url.searchParams.set('count',    '1');       // only need the top result
  url.searchParams.set('language', 'en');
  url.searchParams.set('format',   'json');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status}). Please try again.`);
  }

  const data = await response.json();

  // Open-Meteo returns { results: [...] } or { results: undefined } for no match
  if (!data.results || data.results.length === 0) {
    throw new Error(`City "${city}" not found. Check the spelling and try again.`);
  }

  const place = data.results[0];
  return {
    name:     place.name,
    country:  place.country_code?.toUpperCase() ?? '',
    lat:      place.latitude,
    lng:      place.longitude,
    timezone: place.timezone ?? 'UTC',   // full IANA string e.g. "Europe/London"
  };
}

/**
 * Fetches current conditions and a 7-day daily forecast from Open-Meteo.
 * We request every variable we need in one call so it's just a single HTTP request.
 *
 * @param {{ lat: number, lng: number, timezone: string }} location
 * @returns {Promise<Object>} Raw Open-Meteo response
 */
async function fetchWeather({ lat, lng, timezone }) {
  const url = new URL(CONFIG.WEATHER_URL);

  url.searchParams.set('latitude',   lat);
  url.searchParams.set('longitude',  lng);
  url.searchParams.set('timezone',   timezone);
  url.searchParams.set('forecast_days', '7');  // today + 6 ahead (we'll take 5 future days)

  // ── Current conditions ──────────────────────────────────────────
  // Note: `time` and `interval` are returned automatically by Open-Meteo —
  // do NOT include them in the current= list or the API returns 400.
  url.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',   // feels like
    'relative_humidity_2m',
    'wind_speed_10m',
    'surface_pressure',
    'weather_code',
    'is_day',
  ].join(','));

  // ── Daily forecast ──────────────────────────────────────────────
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
  ].join(','));

  // Units
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit',  'kmh');

  const response = await fetch(url);
  if (!response.ok) {
    // Open-Meteo includes a human-readable `reason` field in 400 error bodies
    let reason = `Weather fetch failed (${response.status}). Try again later.`;
    try {
      const errBody = await response.json();
      if (errBody.reason) reason = `Weather API: ${errBody.reason}`;
    } catch (_) { /* ignore JSON parse errors on non-400 responses */ }
    throw new Error(reason);
  }

  return response.json();
}


/* ── AQI DATA TABLES ────────────────────────────────────────────── */

/**
 * Open-Meteo uses the European AQI scale (1–5).
 * We map it to WHO/EU-style labels, colors, and health guidance.
 *
 * Index: 1=Good · 2=Fair · 3=Moderate · 4=Poor · 5=Very Poor
 */
const AQI_LEVELS = [
  null, // placeholder so index aligns with 1-based values
  {
    label:  'Good',
    color:  '#22c55e',   // green
    bg:     'rgba(34,197,94,0.15)',
    pct:    10,          // gauge fill %
    tips: [
      '✅ Air quality is excellent — enjoy outdoor activities freely.',
      '🏃 Great day for a run, cycling, or any outdoor sport.',
      '🪟 Open your windows to ventilate your home naturally.',
      '🌱 Perfect conditions for gardening or outdoor work.',
    ],
  },
  {
    label:  'Fair',
    color:  '#a3e635',   // lime
    bg:     'rgba(163,230,53,0.15)',
    pct:    30,
    tips: [
      '🟡 Air quality is acceptable for most people.',
      '👶 Unusually sensitive individuals may want to limit prolonged outdoor exertion.',
      '🪟 Ventilation is generally fine — windows can stay open.',
      '🤧 If you have allergies, monitor your symptoms outdoors.',
    ],
  },
  {
    label:  'Moderate',
    color:  '#facc15',   // yellow
    bg:     'rgba(250,204,21,0.15)',
    pct:    55,
    tips: [
      '⚠️ Sensitive groups (children, elderly, asthma sufferers) should reduce prolonged outdoor exertion.',
      '😷 Consider wearing an N95 mask if you're in a high-risk group.',
      '🏠 Keep windows partially closed during peak traffic hours.',
      '💧 Stay well-hydrated — it helps your respiratory system.',
      '🐾 Limit your pets' time outdoors if they have respiratory issues.',
    ],
  },
  {
    label:  'Poor',
    color:  '#f97316',   // orange
    bg:     'rgba(249,115,22,0.15)',
    pct:    75,
    tips: [
      '🚫 Avoid strenuous outdoor activities, especially for sensitive groups.',
      '😷 Everyone should consider wearing an N95 or KN95 mask outdoors.',
      '🏠 Keep windows and doors closed; use air purifiers if available.',
      '🌬️ Avoid using candles, fireplaces, or anything that adds indoor smoke.',
      '💊 If you have asthma or heart disease, keep medication accessible.',
      '🧴 Rinse your face and hands after being outdoors.',
    ],
  },
  {
    label:  'Very Poor',
    color:  '#ef4444',   // red
    bg:     'rgba(239,68,68,0.15)',
    pct:    95,
    tips: [
      '🚨 Health alert — everyone may experience serious health effects.',
      '🏠 Stay indoors as much as possible; seal gaps with damp towels if necessary.',
      '😷 Wear an N95 mask if you must go outside — a surgical mask is not enough.',
      '🚗 Keep car windows closed and use recirculated air mode.',
      '🏥 People with heart or lung conditions should contact a healthcare provider.',
      '📵 Avoid exercising outdoors entirely until conditions improve.',
    ],
  },
];

/**
 * Fetches current air quality data from Open-Meteo's Air Quality API.
 * Returns hourly current_hour data for PM2.5, PM10, NO2, ozone, and European AQI.
 *
 * @param {{ lat: number, lng: number }} location
 * @returns {Promise<Object|null>}  null if the fetch fails (AQI is non-critical)
 */
async function fetchAirQuality({ lat, lng }) {
  try {
    const url = new URL(CONFIG.AQI_URL);
    url.searchParams.set('latitude',  lat);
    url.searchParams.set('longitude', lng);
    // Request hourly variables — we'll pick the current hour's value
    url.searchParams.set('hourly', [
      'pm2_5',
      'pm10',
      'nitrogen_dioxide',
      'ozone',
      'european_aqi',
    ].join(','));
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    // Find the index of the current hour in the hourly time array
    const now = new Date();
    const currentHourISO = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()
    ).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"

    const idx = data.hourly.time.findIndex(t => t.startsWith(currentHourISO));
    const i = idx >= 0 ? idx : 0;

    return {
      aqi:   data.hourly.european_aqi[i]    ?? null,
      pm25:  data.hourly.pm2_5[i]           ?? null,
      pm10:  data.hourly.pm10[i]            ?? null,
      no2:   data.hourly.nitrogen_dioxide[i] ?? null,
      ozone: data.hourly.ozone[i]           ?? null,
    };
  } catch (_) {
    return null;   // AQI is supplementary — never block the main UI
  }
}

/**
 * Renders the AQI card with gauge, pollutant pills, and health tips.
 * @param {Object|null} aqiData
 */
function renderAQI(aqiData) {
  const card = DOM.aqiCard;
  if (!card) return;

  // If AQI data unavailable, show a graceful fallback
  if (!aqiData || aqiData.aqi === null) {
    DOM.aqiIndex.textContent = 'N/A';
    DOM.aqiLabel.textContent = 'Unavailable';
    DOM.aqiBadge.style.setProperty('--aqi-color', 'var(--text-secondary)');
    DOM.aqiBadge.style.setProperty('--aqi-bg', 'var(--stat-bg)');
    DOM.aqiGaugeFill.style.width = '0%';
    DOM.aqiGaugeNeedle.style.left = '0%';
    DOM.aqiPollutants.innerHTML = '<p class="aqi-unavailable">Air quality data not available for this location.</p>';
    DOM.healthTipsList.innerHTML = '<li class="health-tip">General tip: check local air quality apps for your area.</li>';
    return;
  }

  // European AQI is 0–500+ but the API categorises it 1–5 as well.
  // We use european_aqi integer (0-500+) for display and derive category (1-5).
  const rawAqi = Math.round(aqiData.aqi);
  // Derive category 1-5 from raw AQI value
  let category;
  if      (rawAqi <= 20)  category = 1;
  else if (rawAqi <= 40)  category = 2;
  else if (rawAqi <= 60)  category = 3;
  else if (rawAqi <= 80)  category = 4;
  else                    category = 5;

  const level = AQI_LEVELS[category];

  // ── Badge ──
  DOM.aqiIndex.textContent = rawAqi;
  DOM.aqiLabel.textContent = level.label;
  DOM.aqiBadge.style.setProperty('--aqi-color', level.color);
  DOM.aqiBadge.style.setProperty('--aqi-bg',    level.bg);

  // ── Gauge ──
  // Drive the ::after overlay via CSS custom property; animate needle position
  const track = DOM.aqiGaugeFill?.closest('.aqi-gauge__track');
  if (track) track.style.setProperty('--gauge-pct', '0%');
  if (DOM.aqiGaugeNeedle) DOM.aqiGaugeNeedle.style.left = '0%';
  DOM.aqiGaugeNeedle.style.borderColor = level.color;
  DOM.aqiGaugeNeedle.style.boxShadow = `0 0 0 3px rgba(0,0,0,0.3), 0 0 12px ${level.color}`;
  setTimeout(() => {
    if (track) track.style.setProperty('--gauge-pct', `${level.pct}%`);
    if (DOM.aqiGaugeNeedle) DOM.aqiGaugeNeedle.style.left = `${level.pct}%`;
  }, 300);

  // ── Pollutant pills ──
  const pollutants = [
    { label: 'PM₂.₅', value: aqiData.pm25,  unit: 'μg/m³', warn: aqiData.pm25  > 25 },
    { label: 'PM₁₀',  value: aqiData.pm10,  unit: 'μg/m³', warn: aqiData.pm10  > 50 },
    { label: 'NO₂',   value: aqiData.no2,   unit: 'μg/m³', warn: aqiData.no2   > 40 },
    { label: 'O₃',    value: aqiData.ozone, unit: 'μg/m³', warn: aqiData.ozone > 100 },
  ];

  DOM.aqiPollutants.innerHTML = pollutants.map(p => `
    <div class="pollutant-pill ${p.warn ? 'pollutant-pill--warn' : ''}" role="listitem">
      <span class="pollutant-pill__label">${p.label}</span>
      <span class="pollutant-pill__value">${p.value !== null ? p.value.toFixed(1) : '—'}</span>
      <span class="pollutant-pill__unit">${p.unit}</span>
      ${p.warn ? '<span class="pollutant-pill__dot" aria-label="elevated" title="Above WHO guideline"></span>' : ''}
    </div>
  `).join('');

  // ── Health tips ── (pick 3-4 relevant ones for the category)
  const tips = level.tips.slice(0, category <= 2 ? 3 : 4);
  DOM.healthTipsList.innerHTML = tips.map(tip =>
    `<li class="health-tip">${tip}</li>`
  ).join('');

  // ── Pass AQI color to CSS variables on the card (for health tips border) ──
  card.style.setProperty('--aqi-color', level.color);
  card.style.setProperty('--aqi-bg', level.bg);

  // ── Animate the card in ──
  card.classList.remove('aqi-card--loaded');
  void card.offsetWidth; // reflow to re-trigger animation
  card.classList.add('aqi-card--loaded');
}


/* ── UI RENDERERS ───────────────────────────────────────────────── */

/**
 * Fills the current-weather card.
 *
 * @param {Object} current   - Open-Meteo `current` object
 * @param {Object} location  - { name, country, timezone }
 */
function renderCurrentWeather(current, location) {
  // Location & date
  DOM.cityName.textContent    = location.name;
  DOM.countryCode.textContent = location.country;
  DOM.currentDate.textContent = formatFullDate(current.time, location.timezone);

  // Emoji & description
  const { emoji, desc } = wmoToDisplay(current.weather_code, current.is_day === 1);
  DOM.currentEmoji.textContent = emoji;
  DOM.currentEmoji.setAttribute('aria-label', desc);

  // Temperature
  DOM.currentTemp.textContent = `${Math.round(current.temperature_2m)}${CONFIG.TEMP_UNIT}`;
  DOM.currentDesc.textContent = desc;

  // Stats
  DOM.feelsLike.textContent = `${Math.round(current.apparent_temperature)}${CONFIG.TEMP_UNIT}`;
  DOM.humidity.textContent  = `${current.relative_humidity_2m}%`;
  DOM.windSpeed.textContent = `${Math.round(current.wind_speed_10m)} ${CONFIG.SPEED_UNIT}`;
  DOM.pressure.textContent  = `${Math.round(current.surface_pressure)} hPa`;

  // ── Dynamic condition styling ──────────────────────────────────
  const scene = resolveConditionName(current.weather_code, current.is_day === 1);

  // Set data-condition on the card for CSS accent border / emoji tweaks
  const card = document.getElementById('currentCard');
  if (card) card.setAttribute('data-condition', scene);

  // Set data-weather on body for orb color shift
  document.body.setAttribute('data-weather', scene);

  // Activate canvas particle scene
  const cnv = document.getElementById('weatherCanvas');
  if (cnv) {
    // Small delay so the card is visible before the canvas fades in
    setTimeout(() => cnv.classList.add('is-active'), 200);
  }
  if (window.WeatherCanvas) {
    window.WeatherCanvas.start(current.weather_code, current.is_day === 1);
  }
}

/**
 * Maps a WMO code + isDay flag to a short condition name
 * matching the data-condition / data-weather CSS hooks.
 * @param {number}  code
 * @param {boolean} isDay
 * @returns {string}
 */
function resolveConditionName(code, isDay) {
  if ([95, 96, 99].includes(code))                    return 'thunder';
  if ([71, 73, 75, 77, 85, 86].includes(code))        return 'snow';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([51, 53, 55, 56, 57].includes(code))            return 'drizzle';
  if ([45, 48].includes(code))                        return 'fog';
  if ([2, 3].includes(code))                          return 'cloudy';
  if ([0, 1].includes(code))                          return isDay ? 'sunny' : 'night';
  return isDay ? 'sunny' : 'night';
}

/**
 * Fills the 5-day forecast grid.
 *
 * @param {Object} daily      - Open-Meteo `daily` object
 * @param {string} timezone   - IANA timezone string
 * @param {number} isDay      - current is_day value (used to seed day/night for today)
 */
function renderForecast(daily, timezone, isDay) {
  DOM.forecastGrid.innerHTML = '';

  const today = todayString(timezone);

  // daily.time is an array of "YYYY-MM-DD" strings, parallel with the other arrays
  const futureDays = daily.time
    .map((date, i) => ({ date, i }))
    .filter(({ date }) => date > today)  // exclude today
    .slice(0, 5);                         // up to 5 future days

  for (const { date, i } of futureDays) {
    const code = daily.weather_code[i];
    const high = Math.round(daily.temperature_2m_max[i]);
    const low  = Math.round(daily.temperature_2m_min[i]);

    // Assume daytime for forecast cards (is_day = true)
    const { emoji, desc } = wmoToDisplay(code, true);

    const card = document.createElement('article');
    card.className = 'forecast-card';
    card.setAttribute('role', 'listitem');

    card.innerHTML = `
      <span class="forecast-card__day">${formatShortDay(date, timezone)}</span>
      <span class="forecast-card__emoji" role="img" aria-label="${desc}">${emoji}</span>
      <span class="forecast-card__desc">${desc}</span>
      <div class="forecast-card__temps">
        <span class="forecast-card__high">${high}${CONFIG.TEMP_UNIT}</span>
        <span class="forecast-card__low">${low}${CONFIG.TEMP_UNIT}</span>
      </div>
    `;

    DOM.forecastGrid.appendChild(card);
  }
}


/* ── MAIN SEARCH HANDLER ────────────────────────────────────────── */

/**
 * Full search flow:
 *   1. Validate input
 *   2. Geocode city → lat/lng/timezone
 *   3. Fetch weather (current + daily) in one API call
 *   4. Render results
 *   5. Handle errors
 */
async function handleSearch() {
  const city = DOM.cityInput.value.trim();

  if (!city) {
    showError('Please enter a city name.');
    DOM.cityInput.focus();
    return;
  }

  showLoading();

  // Reset canvas & condition state for clean re-render
  const prevCanvas = document.getElementById('weatherCanvas');
  if (prevCanvas) prevCanvas.classList.remove('is-active');
  document.getElementById('currentCard')?.removeAttribute('data-condition');
  document.body.removeAttribute('data-weather');
  if (window.WeatherCanvas) window.WeatherCanvas.stop();

  try {
    // Step 1: Geocode
    const location = await geocodeCity(city);

    // Step 2: Fetch weather + AQI in parallel (AQI is non-blocking)
    const [weather, aqiData] = await Promise.all([
      fetchWeather(location),
      fetchAirQuality(location),
    ]);

    // Step 3: Render weather
    renderCurrentWeather(weather.current, location);
    renderForecast(weather.daily, location.timezone, weather.current.is_day);

    // Step 4: Render AQI (always renders — shows fallback if data unavailable)
    renderAQI(aqiData);

    hideLoading();
    showResults();

  } catch (err) {
    hideLoading();
    showEmptyState();
    showError(err.message ?? 'Something went wrong. Please try again.');
    console.error('[Skyglass] Error:', err);
  }
}


/* ── EVENT LISTENERS ────────────────────────────────────────────── */

DOM.searchBtn.addEventListener('click', handleSearch);

DOM.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch();
  }
});

DOM.cityInput.addEventListener('input', () => {
  if (!DOM.searchError.hidden) hideError();
});


/* ── INITIALISATION ─────────────────────────────────────────────── */

function init() {
  initTheme();
  showEmptyState();
  DOM.cityInput.focus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
