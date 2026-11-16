/**
 * Manages the Sun & Season Simulator tab UI and binds it to SunSystem.
 */
export function initSunController(store, sunSystem) {
  const sunSlider = document.getElementById('sun-slider');
  const monthSelect = document.getElementById('month-select');
  const btnSeasonSummer = document.getElementById('season-summer');
  const btnSeasonEquinox = document.getElementById('season-equinox');
  const btnSeasonWinter = document.getElementById('season-winter');

  const sunValEl = document.getElementById('sun-time-val');
  const elevEl = document.getElementById('sun-elevation-badge');
  const azimEl = document.getElementById('sun-azimuth-badge');
  const statusEl = document.getElementById('solar-analysis-text');

  function setDay(dayOfYear) {
    const { hour, latitude } = store.getState().sun;
    sunSystem.update(dayOfYear, hour, latitude);
  }

  btnSeasonSummer?.addEventListener('click', () => setDay(172));
  btnSeasonEquinox?.addEventListener('click', () => setDay(80));
  btnSeasonWinter?.addEventListener('click', () => setDay(355));

  monthSelect?.addEventListener('change', (e) => {
    setDay(parseInt(e.target.value, 10));
  });

  sunSlider?.addEventListener('input', (e) => {
    const { dayOfYear, latitude } = store.getState().sun;
    sunSystem.update(dayOfYear, parseFloat(e.target.value), latitude);
  });

  function render({ sun }) {
    [btnSeasonSummer, btnSeasonEquinox, btnSeasonWinter].forEach((b) =>
      b?.classList.remove('btn-primary')
    );
    if (sun.dayOfYear === 172) btnSeasonSummer?.classList.add('btn-primary');
    if (sun.dayOfYear === 80 || sun.dayOfYear === 266) btnSeasonEquinox?.classList.add('btn-primary');
    if (sun.dayOfYear === 355) btnSeasonWinter?.classList.add('btn-primary');

    if (monthSelect && monthSelect.value !== String(sun.dayOfYear)) {
      monthSelect.value = String(sun.dayOfYear);
    }
    if (sunSlider && parseFloat(sunSlider.value) !== sun.hour) {
      sunSlider.value = String(sun.hour);
    }

    const h = Math.floor(sun.hour);
    const m = Math.round((sun.hour - h) * 60);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (sunValEl) sunValEl.textContent = timeStr;

    if (elevEl) {
      if (sun.isDay) {
        elevEl.textContent = `Výška: ${sun.elevationDeg.toFixed(1)}°`;
        elevEl.style.color = sun.elevationDeg > 45 ? '#fbbf24' : '#60a5fa';
      } else {
        elevEl.textContent = 'Výška: < 0° (Noc)';
        elevEl.style.color = '#9ca3af';
      }
    }

    if (azimEl) {
      azimEl.textContent = `Azimut: ${Math.round(sun.azimuthDeg)}° (${sun.directionName})`;
    }

    if (statusEl) {
      statusEl.textContent = sun.summaryText;
      statusEl.style.color = sun.summaryColor;
    }
  }

  store.subscribe(['sun'], (state) => render(state));
  // Trigger initial solar telemetry calculation
  const { dayOfYear, hour, latitude } = store.getState().sun;
  sunSystem.update(dayOfYear, hour, latitude);
}
