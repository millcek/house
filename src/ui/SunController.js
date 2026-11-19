/**
 * Manages the Sun & Season Simulator UI (sidebar tab + floating non-modal quick bar)
 * and binds controls to SunSystem.
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

  // Floating non-modal Sun Quick Bar
  const sunQuickBar = document.getElementById('sun-quick-bar');
  const quickSunSlider = document.getElementById('quick-sun-slider');
  const btnQuickSummer = document.getElementById('quick-season-summer');
  const btnQuickEquinox = document.getElementById('quick-season-equinox');
  const btnQuickWinter = document.getElementById('quick-season-winter');
  const quickSunValEl = document.getElementById('quick-sun-time-val');
  const quickElevEl = document.getElementById('quick-sun-elevation');
  const quickAzimEl = document.getElementById('quick-sun-azimuth');
  const quickStatusEl = document.getElementById('quick-sun-status');
  const btnCloseSunBar = document.getElementById('btn-close-sun-bar');
  const btnSunMoreDetails = document.getElementById('btn-sun-more-details');

  function setDay(dayOfYear) {
    const { hour, latitude } = store.getState().sun;
    sunSystem.update(dayOfYear, hour, latitude);
  }

  btnSeasonSummer?.addEventListener('click', () => setDay(172));
  btnSeasonEquinox?.addEventListener('click', () => setDay(80));
  btnSeasonWinter?.addEventListener('click', () => setDay(355));

  btnQuickSummer?.addEventListener('click', () => setDay(172));
  btnQuickEquinox?.addEventListener('click', () => setDay(80));
  btnQuickWinter?.addEventListener('click', () => setDay(355));

  monthSelect?.addEventListener('change', (e) => {
    setDay(parseInt(e.target.value, 10));
  });

  const onSliderInput = (e) => {
    const { dayOfYear, latitude } = store.getState().sun;
    sunSystem.update(dayOfYear, parseFloat(e.target.value), latitude);
  };

  sunSlider?.addEventListener('input', onSliderInput);
  quickSunSlider?.addEventListener('input', onSliderInput);

  btnCloseSunBar?.addEventListener('click', () => {
    store.setState({ sunBarOpen: false });
  });

  btnSunMoreDetails?.addEventListener('click', () => {
    store.setState({
      sunBarOpen: false,
      sidebarOpen: true,
      activeTab: 'sun',
    });
  });

  function render({ sun, sunBarOpen, drawings }) {
    const isQuickBarVisible = Boolean(sunBarOpen) && !drawings?.isOpen;
    sunQuickBar?.classList.toggle('open', isQuickBarVisible);
    sunQuickBar?.setAttribute('aria-hidden', isQuickBarVisible ? 'false' : 'true');

    [
      btnSeasonSummer,
      btnSeasonEquinox,
      btnSeasonWinter,
      btnQuickSummer,
      btnQuickEquinox,
      btnQuickWinter,
    ].forEach((b) => b?.classList.remove('btn-primary'));

    if (sun.dayOfYear === 172) {
      btnSeasonSummer?.classList.add('btn-primary');
      btnQuickSummer?.classList.add('btn-primary');
    } else if (sun.dayOfYear === 80 || sun.dayOfYear === 266) {
      btnSeasonEquinox?.classList.add('btn-primary');
      btnQuickEquinox?.classList.add('btn-primary');
    } else if (sun.dayOfYear === 355) {
      btnSeasonWinter?.classList.add('btn-primary');
      btnQuickWinter?.classList.add('btn-primary');
    }

    if (monthSelect && monthSelect.value !== String(sun.dayOfYear)) {
      monthSelect.value = String(sun.dayOfYear);
    }
    if (sunSlider && parseFloat(sunSlider.value) !== sun.hour) {
      sunSlider.value = String(sun.hour);
    }
    if (quickSunSlider && parseFloat(quickSunSlider.value) !== sun.hour) {
      quickSunSlider.value = String(sun.hour);
    }

    const h = Math.floor(sun.hour);
    const m = Math.round((sun.hour - h) * 60);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (sunValEl) sunValEl.textContent = timeStr;
    if (quickSunValEl) quickSunValEl.textContent = timeStr;

    if (elevEl) {
      if (sun.isDay) {
        elevEl.textContent = `Výška: ${sun.elevationDeg.toFixed(1)}°`;
        elevEl.style.color = sun.elevationDeg > 45 ? '#fbbf24' : '#60a5fa';
      } else {
        elevEl.textContent = 'Výška: < 0° (Noc)';
        elevEl.style.color = '#9ca3af';
      }
    }
    if (quickElevEl) {
      if (sun.isDay) {
        quickElevEl.textContent = `Výška: ${sun.elevationDeg.toFixed(1)}°`;
        quickElevEl.style.color = sun.elevationDeg > 45 ? '#fbbf24' : '#60a5fa';
      } else {
        quickElevEl.textContent = 'Noc (< 0°)';
        quickElevEl.style.color = '#9ca3af';
      }
    }

    if (azimEl) {
      azimEl.textContent = `Azimut: ${Math.round(sun.azimuthDeg)}° (${sun.directionName})`;
    }
    if (quickAzimEl) {
      quickAzimEl.textContent = `${Math.round(sun.azimuthDeg)}° (${sun.directionName})`;
    }

    if (statusEl) {
      statusEl.textContent = sun.summaryText;
      statusEl.style.color = sun.summaryColor;
    }
    if (quickStatusEl) {
      quickStatusEl.textContent = sun.summaryText;
      quickStatusEl.style.color = sun.summaryColor;
    }
  }

  store.subscribe(['sun', 'sunBarOpen', 'drawings'], (state) => render(state));
  // Trigger initial solar telemetry calculation
  const { dayOfYear, hour, latitude } = store.getState().sun;
  sunSystem.update(dayOfYear, hour, latitude);
}
