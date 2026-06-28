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

    // Step 2: Fetch weather (single API call for all data)
    const weather = await fetchWeather(location);

    // Step 3: Render
    renderCurrentWeather(weather.current, location);
    renderForecast(weather.daily, location.timezone, weather.current.is_day);

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
