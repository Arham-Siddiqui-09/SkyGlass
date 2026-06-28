/**
 * ═══════════════════════════════════════════════════════════════
 *  SKYGLASS — Weather Canvas Animations   |   weather-canvas.js
 * ───────────────────────────────────────────────────────────────
 *  Draws a live particle scene inside the current-weather card
 *  that changes based on the WMO weather code:
 *
 *    clear day   → rotating sun rays + lens-flare sparkles
 *    clear night → drifting stars + shooting star
 *    cloudy      → slow-drifting cloud wisps
 *    fog/mist    → horizontal fog streaks
 *    drizzle     → light angled rain
 *    rain        → heavier angled rain + ripple splashes
 *    snow        → tumbling snowflakes
 *    thunderstorm→ rain + random lightning flashes
 *
 *  Exposed global: window.WeatherCanvas.start(wmoCode, isDay)
 * ═══════════════════════════════════════════════════════════════ */

'use strict';

window.WeatherCanvas = (() => {

  /* ── Internal state ──────────────────────────────────────────── */
  let canvas, ctx, raf, particles = [], extras = [], frameCount = 0;
  let currentScene = null;
  let W = 0, H = 0;

  /* ── Scene type resolver ─────────────────────────────────────── */
  function resolveScene(code, isDay) {
    if ([95, 96, 99].includes(code))               return 'thunder';
    if ([71, 73, 75, 77, 85, 86].includes(code))   return 'snow';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([51, 53, 55, 56, 57].includes(code))       return 'drizzle';
    if ([45, 48].includes(code))                   return 'fog';
    if ([2, 3].includes(code))                     return 'cloudy';
    if ([0, 1].includes(code))                     return isDay ? 'sunny' : 'night';
    return isDay ? 'sunny' : 'night';
  }

  /* ── Canvas setup ────────────────────────────────────────────── */
  function setup() {
    canvas = document.getElementById('weatherCanvas');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    return true;
  }

  function resize() {
    if (!canvas) return;
    const card = canvas.closest('.card--current');
    W = canvas.width  = card ? card.offsetWidth  : window.innerWidth;
    H = canvas.height = card ? card.offsetHeight : 260;
  }

  /* ── Particle factories ──────────────────────────────────────── */

  function makeRainDrop(heavy) {
    const speed = heavy ? rand(8, 16) : rand(4, 9);
    return {
      type: 'rain',
      x: rand(-W * 0.2, W * 1.2),
      y: rand(-H, 0),
      len: heavy ? rand(14, 26) : rand(8, 16),
      speed,
      vx: speed * 0.25,
      alpha: rand(0.3, 0.65),
    };
  }

  function makeSnowflake() {
    return {
      type: 'snow',
      x: rand(0, W),
      y: rand(-20, -5),
      r: rand(2, 6),
      speed: rand(0.8, 2.4),
      drift: rand(-0.4, 0.4),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.01, 0.03),
      alpha: rand(0.5, 0.95),
    };
  }

  function makeFogStreak() {
    return {
      type: 'fog',
      x: rand(-200, W + 200),
      y: rand(0, H),
      w: rand(160, 380),
      h: rand(18, 48),
      speed: rand(0.15, 0.55),
      alpha: rand(0.04, 0.12),
    };
  }

  function makeCloudWisp() {
    return {
      type: 'cloud',
      x: rand(-120, W + 120),
      y: rand(10, H * 0.65),
      w: rand(80, 200),
      h: rand(30, 70),
      speed: rand(0.08, 0.22),
      alpha: rand(0.04, 0.10),
    };
  }

  function makeStar() {
    return {
      type: 'star',
      x: rand(0, W),
      y: rand(0, H * 0.85),
      r: rand(0.5, 2.2),
      twinklePhase: rand(0, Math.PI * 2),
      twinkleSpeed: rand(0.02, 0.06),
      alpha: rand(0.4, 1.0),
    };
  }

  function makeSparkle() {
    return {
      type: 'sparkle',
      x: rand(0, W),
      y: rand(0, H * 0.7),
      r: rand(0.8, 2.5),
      life: 0,
      maxLife: rand(40, 90),
      alpha: rand(0.4, 0.9),
    };
  }

  /* ── Scene initialisers ──────────────────────────────────────── */

  function initScene(scene) {
    particles = [];
    extras = { lightningTimer: 0, lightningAlpha: 0, shootingStarTimer: rand(120, 400) };

    if (scene === 'rain' || scene === 'thunder') {
      for (let i = 0; i < 90; i++) particles.push(makeRainDrop(true));
    } else if (scene === 'drizzle') {
      for (let i = 0; i < 55; i++) particles.push(makeRainDrop(false));
    } else if (scene === 'snow') {
      for (let i = 0; i < 70; i++) {
        const p = makeSnowflake();
        p.y = rand(0, H); // pre-spread on init
        particles.push(p);
      }
    } else if (scene === 'fog') {
      for (let i = 0; i < 18; i++) particles.push(makeFogStreak());
    } else if (scene === 'cloudy') {
      for (let i = 0; i < 12; i++) particles.push(makeCloudWisp());
    } else if (scene === 'night') {
      for (let i = 0; i < 80; i++) particles.push(makeStar());
    } else if (scene === 'sunny') {
      for (let i = 0; i < 14; i++) particles.push(makeSparkle());
    }
  }

  /* ── Particle updaters / drawers ─────────────────────────────── */

  function updateDraw(p, scene) {
    if (p.type === 'rain') {
      p.x += p.vx; p.y += p.speed;
      if (p.y > H + 30) { Object.assign(p, makeRainDrop(scene === 'rain' || scene === 'thunder')); }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.strokeStyle = '#a5c8ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 1.5, p.y + p.len);
      ctx.stroke();
      ctx.restore();
    }

    else if (p.type === 'snow') {
      p.wobble += p.wobbleSpeed;
      p.x += Math.sin(p.wobble) * p.drift + p.drift * 0.5;
      p.y += p.speed;
      if (p.y > H + 20) Object.assign(p, makeSnowflake());
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#e0f0ff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    else if (p.type === 'fog') {
      p.x += p.speed;
      if (p.x > W + 300) { p.x = -p.w - 100; p.y = rand(0, H); }
      const grd = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      grd.addColorStop(0,   'rgba(200,220,255,0)');
      grd.addColorStop(0.3, `rgba(200,220,255,${p.alpha})`);
      grd.addColorStop(0.7, `rgba(200,220,255,${p.alpha})`);
      grd.addColorStop(1,   'rgba(200,220,255,0)');
      ctx.save();
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(p.x + p.w / 2, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    else if (p.type === 'cloud') {
      p.x += p.speed;
      if (p.x > W + 200) { p.x = -p.w - 100; p.y = rand(10, H * 0.65); }
      const grd = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      grd.addColorStop(0,   'rgba(180,200,240,0)');
      grd.addColorStop(0.3, `rgba(180,200,240,${p.alpha})`);
      grd.addColorStop(0.7, `rgba(180,200,240,${p.alpha})`);
      grd.addColorStop(1,   'rgba(180,200,240,0)');
      ctx.save();
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(p.x + p.w / 2, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    else if (p.type === 'star') {
      p.twinklePhase += p.twinkleSpeed;
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(p.twinklePhase));
      ctx.save();
      ctx.globalAlpha = p.alpha * twinkle;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#c0d8ff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    else if (p.type === 'sparkle') {
      p.life++;
      if (p.life > p.maxLife) Object.assign(p, makeSparkle());
      const progress = p.life / p.maxLife;
      const a = p.alpha * Math.sin(progress * Math.PI);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fffbe0';
      ctx.shadowColor = '#ffd060';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── Scene-level overlays ────────────────────────────────────── */

  function drawSun() {
    const cx = W * 0.82, cy = H * 0.22, r = Math.min(W, H) * 0.10;
    const t = frameCount * 0.003;

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.5);
    glow.addColorStop(0,   'rgba(255,220,80,0.18)');
    glow.addColorStop(0.5, 'rgba(255,200,60,0.07)');
    glow.addColorStop(1,   'rgba(255,180,40,0)');
    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rays
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t);
    ctx.strokeStyle = 'rgba(255,220,80,0.3)';
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const len = r * (0.55 + 0.45 * Math.sin(frameCount * 0.04 + i));
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (r * 1.3), Math.sin(angle) * (r * 1.3));
      ctx.lineTo(Math.cos(angle) * (r * 1.3 + len), Math.sin(angle) * (r * 1.3 + len));
      ctx.stroke();
    }
    ctx.restore();

    // Disc
    const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    disc.addColorStop(0,   'rgba(255,248,180,0.30)');
    disc.addColorStop(0.6, 'rgba(255,220,80,0.18)');
    disc.addColorStop(1,   'rgba(255,180,40,0.08)');
    ctx.save();
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMoon() {
    const cx = W * 0.82, cy = H * 0.22, r = Math.min(W, H) * 0.09;
    // Glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3);
    glow.addColorStop(0,   'rgba(160,180,255,0.15)');
    glow.addColorStop(1,   'rgba(100,120,255,0)');
    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3, 0, Math.PI * 2);
    ctx.fill();
    // Crescent
    ctx.fillStyle = 'rgba(210,225,255,0.20)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.38, cy - r * 0.12, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShootingStar() {
    if (!extras) return;
    extras.shootingStarTimer--;
    if (extras.shootingStarTimer > 0) return;

    // Trigger a new one
    if (!extras.shootingStar) {
      extras.shootingStar = {
        x: rand(W * 0.1, W * 0.7), y: rand(0, H * 0.3),
        vx: rand(4, 8), vy: rand(2, 5),
        len: rand(60, 120), life: 0, maxLife: 30,
      };
      extras.shootingStarTimer = rand(300, 700);
    }

    const s = extras.shootingStar;
    s.life++;
    s.x += s.vx; s.y += s.vy;
    const progress = s.life / s.maxLife;
    const a = Math.sin(progress * Math.PI);
    const grd = ctx.createLinearGradient(s.x - s.vx * 8, s.y - s.vy * 8, s.x, s.y);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, `rgba(255,255,255,${a * 0.85})`);
    ctx.save();
    ctx.strokeStyle = grd;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x - s.len * (s.vx / 10), s.y - s.len * (s.vy / 10));
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.restore();
    if (s.life >= s.maxLife) extras.shootingStar = null;
  }

  function drawLightning() {
    if (!extras) return;
    extras.lightningTimer--;
    if (extras.lightningTimer <= 0) {
      extras.lightningTimer = rand(80, 200);
      extras.lightningAlpha = 0.85;
    }

    if (extras.lightningAlpha > 0.01) {
      // Flash the whole canvas briefly
      ctx.save();
      ctx.globalAlpha = extras.lightningAlpha * 0.18;
      ctx.fillStyle = '#c8d8ff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Bolt
      if (extras.lightningAlpha > 0.5) {
        const bx = rand(W * 0.2, W * 0.8);
        ctx.save();
        ctx.globalAlpha = extras.lightningAlpha * 0.7;
        ctx.strokeStyle = '#d0e8ff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        let cy2 = 0;
        while (cy2 < H * 0.7) {
          cy2 += rand(12, 28);
          ctx.lineTo(bx + rand(-22, 22), cy2);
        }
        ctx.stroke();
        ctx.restore();
      }
      extras.lightningAlpha *= 0.72;
    }
  }

  /* ── Main render loop ────────────────────────────────────────── */

  function loop() {
    frameCount++;
    ctx.clearRect(0, 0, W, H);

    const scene = currentScene;

    // Scene-level background overlays
    if (scene === 'sunny') drawSun();
    if (scene === 'night') { drawMoon(); drawShootingStar(); }
    if (scene === 'thunder') drawLightning();

    // Particles
    for (const p of particles) updateDraw(p, scene);

    raf = requestAnimationFrame(loop);
  }

  /* ── Public API ──────────────────────────────────────────────── */

  function start(wmoCode, isDay) {
    if (!ctx && !setup()) return;   // canvas not in DOM yet
    const scene = resolveScene(wmoCode, isDay);
    if (scene === currentScene) return;   // no-op if same scene
    currentScene = scene;
    cancelAnimationFrame(raf);
    resize();
    initScene(scene);
    loop();
  }

  function stop() {
    cancelAnimationFrame(raf);
    if (ctx) ctx.clearRect(0, 0, W, H);
    currentScene = null;
  }

  /* ── Utilities ───────────────────────────────────────────────── */
  function rand(min, max) { return Math.random() * (max - min) + min; }

  return { start, stop };

})();
