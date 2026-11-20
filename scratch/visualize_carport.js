import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

// Rozměry a souřadnice (v metrech, v lokálním CAD zobrazení)
// Orientace: Vpravo = Východ (Vjezd/ulice), Vlevo = Západ (Zahrada)
// Nahoře = Sever (Dílna), Dole = Jih (Rodinný dům)

const scale = 120; // 120 px na 1 metr
const originX = 140;
const originY = 80;

// Carport: 6.5 m délka (X: 0 až 6.5 m), 6.0 m šířka (Y: 0 až 6.0 m)
// Severní stěna dílny je nahoře (Y = 0)
// Jižní stěna domu je dole (Y = 6.0)
// Západ (Zahrada) je vlevo (X = 0)
// Východ (Vjezd) je vpravo (X = 6.5)

const svgW = 1200;
const svgH = 1100;

function toSvg(x, y) {
  return [originX + x * scale, originY + y * scale];
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <pattern id="grid" width="${scale/2}" height="${scale/2}" patternUnits="userSpaceOnUse">
      <path d="M ${scale/2} 0 L 0 0 0 ${scale/2}" fill="none" stroke="#e2e8f0" stroke-width="1"/>
    </pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#ef4444"/>
    </marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#10b981"/>
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#3b82f6"/>
    </marker>
  </defs>

  <!-- Mřížka -->
  <rect width="100%" height="100%" fill="url(#grid)" />

  <!-- Záhlaví -->
  <text x="50" y="45" font-size="22" font-weight="700" fill="#0f172a">PROSTOROVÁ ANALÝZA KRYTÉHO STÁNÍ (6,5 × 6,0 m) A VARIANTY UMÍSTĚNÍ WALLBOXU</text>
  <text x="50" y="70" font-size="14" fill="#64748b">Zkouška parkování VW ID. Buzz (4,71 × 1,99 m) + Peugeot e-208 (4,06 × 1,75 m) a dosahu nabíjecích kabelů</text>

  <!-- SEVERNÍ DÍLNA (Y: -2.0 až 0) -->
  <g id="workshop">
    <rect x="${originX}" y="${originY - 140}" width="${6.5 * scale}" height="140" fill="#dcfce7" stroke="#16a34a" stroke-width="2.5" />
    <text x="${originX + 3.25 * scale}" y="${originY - 70}" font-size="16" font-weight="700" fill="#15803d" text-anchor="middle">ZÁHRADNÍ DÍLNA (6,5 × 4,0 m · 26 m²)</text>
    <text x="${originX + 3.25 * scale}" y="${originY - 45}" font-size="12" fill="#166534" text-anchor="middle">Zděná stěna dílny tl. 240 mm</text>
    <!-- Vstupní dvoukřídlé dveře D1 1.4m -->
    <rect x="${originX + 2.55 * scale}" y="${originY - 8}" width="${1.4 * scale}" height="12" fill="#334155" />
    <text x="${originX + 3.25 * scale}" y="${originY - 14}" font-size="11" font-weight="600" fill="#0f172a" text-anchor="middle">Dveře D1 (1400 mm)</text>
  </g>

  <!-- JIŽNÍ DŮM (Y: 6.0 až 7.5) -->
  <g id="house">
    <rect x="${originX}" y="${originY + 6.0 * scale}" width="${6.5 * scale}" height="180" fill="#ffedd5" stroke="#ea580c" stroke-width="2.5" />
    <text x="${originX + 3.25 * scale}" y="${originY + 6.0 * scale + 80}" font-size="16" font-weight="700" fill="#c2410c" text-anchor="middle">RODINNÝ DŮM – 1.02 TECHNICKÁ MÍSTNOST &amp; ZÁDVEŘÍ</text>
    <text x="${originX + 3.25 * scale}" y="${originY + 6.0 * scale + 105}" font-size="12" fill="#9a3412" text-anchor="middle">Severní obvodová stěna domu (240 mm cihla + 140 mm ETICS)</text>
    <!-- Dveře TM 1.02 -->
    <rect x="${originX + 5.1 * scale}" y="${originY + 6.0 * scale - 4}" width="${0.9 * scale}" height="12" fill="#475569" />
    <text x="${originX + 5.55 * scale}" y="${originY + 6.0 * scale + 24}" font-size="11" font-weight="600" fill="#0f172a" text-anchor="middle">Dveře TM (900 mm)</text>
  </g>

  <!-- KRYTÉ STÁNÍ (6.5 × 6.0 m) -->
  <rect x="${originX}" y="${originY}" width="${6.5 * scale}" height="${6.0 * scale}" fill="#ffffff" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />

  <!-- SLOUPY STÁNÍ (6 ks: 220×220 mm) -->
  <!-- Východní sloupy (vpravo u vjezdu) -->
  <rect x="${originX + 6.5 * scale - 26}" y="${originY + 4}" width="26" height="26" fill="#1e293b" />
  <rect x="${originX + 6.5 * scale - 26}" y="${originY + 3.0 * scale - 13}" width="26" height="26" fill="#1e293b" />
  <rect x="${originX + 6.5 * scale - 26}" y="${originY + 6.0 * scale - 30}" width="26" height="26" fill="#1e293b" />

  <!-- Západní sloupy (vlevo u zahrady) -->
  <rect x="${originX}" y="${originY + 4}" width="26" height="26" fill="#1e293b" />
  <rect x="${originX}" y="${originY + 3.0 * scale - 13}" width="26" height="26" fill="#1e293b" />
  <rect x="${originX}" y="${originY + 6.0 * scale - 30}" width="26" height="26" fill="#1e293b" />

  <!-- KÓTY STÁNÍ -->
  <!-- Vodorovná kóta délky (6.50 m) -->
  <line x1="${originX}" y1="${originY + 6.0 * scale + 40}" x2="${originX + 6.5 * scale}" y2="${originY + 6.0 * scale + 40}" stroke="#64748b" stroke-width="1.5" />
  <text x="${originX + 3.25 * scale}" y="${originY + 6.0 * scale + 35}" font-size="13" font-weight="700" fill="#334155" text-anchor="middle">DÉLKA STÁNÍ: 6,50 m</text>

  <!-- Svislá kóta šířky (6.00 m) -->
  <line x1="${originX - 50}" y1="${originY}" x2="${originX - 50}" y2="${originY + 6.0 * scale}" stroke="#64748b" stroke-width="1.5" />
  <text x="${originX - 60}" y="${originY + 3.0 * scale}" font-size="13" font-weight="700" fill="#334155" text-anchor="middle" transform="rotate(-90 ${originX - 60} ${originY + 3.0 * scale})">ŠÍŘKA STÁNÍ: 6,00 m (2 × 3,00 m)</text>

  <!-- OBRYS VOZU 1: VW ID. BUZZ (Severní stání, parkuje nosem na západ nebo nacouvá) -->
  <!-- Buzz: 4.71 m délka, 1.99 m šířka. Pozice: X = 0.9 m až 5.61 m, Y = 0.5 m až 2.49 m -->
  <g id="car-buzz">
    <!-- Karoserie Buzz -->
    <rect x="${originX + 1.0 * scale}" y="${originY + 0.5 * scale}" width="${4.71 * scale}" height="${1.99 * scale}" rx="20" fill="#fef3c7" stroke="#d97706" stroke-width="2.5" />
    <!-- Čelní sklo a kabina -->
    <rect x="${originX + 1.3 * scale}" y="${originY + 0.62 * scale}" width="${2.8 * scale}" height="${1.75 * scale}" rx="10" fill="#fde68a" stroke="#b45309" stroke-width="1.5" />
    <!-- Zrcátka (šířka 2.21 m) -->
    <rect x="${originX + 1.7 * scale}" y="${originY + 0.5 * scale - 12}" width="20" height="12" fill="#d97706" rx="3" />
    <rect x="${originX + 1.7 * scale}" y="${originY + 2.49 * scale}" width="20" height="12" fill="#d97706" rx="3" />
    <!-- Text popisku -->
    <text x="${originX + 3.35 * scale}" y="${originY + 1.4 * scale}" font-size="15" font-weight="800" fill="#92400e" text-anchor="middle">VOLKSWAGEN ID. BUZZ</text>
    <text x="${originX + 3.35 * scale}" y="${originY + 1.62 * scale}" font-size="12" fill="#b45309" text-anchor="middle">4,71 × 1,99 m (baterie 77 kWh)</text>
    <text x="${originX + 1.2 * scale}" y="${originY + 1.5 * scale}" font-size="11" font-weight="700" fill="#d97706">PŘEDEK ◄</text>

    <!-- NABÍJECÍ PORT ID. BUZZ (VPRAVO VZADU) -->
    <circle cx="${originX + 5.3 * scale}" cy="${originY + 0.5 * scale}" r="9" fill="#2563eb" stroke="#ffffff" stroke-width="2" />
    <text x="${originX + 5.3 * scale}" y="${originY + 0.35 * scale}" font-size="11" font-weight="700" fill="#1d4ed8" text-anchor="middle">Port Buzz (vpravo vzadu)</text>
  </g>

  <!-- OBRYS VOZU 2: PEUGEOT e-208 (Jižní stání u domu) -->
  <!-- e-208: 4.06 m délka, 1.75 m šířka. Pozice: X = 1.3 m až 5.36 m, Y = 3.5 m až 5.25 m -->
  <g id="car-e208">
    <!-- Karoserie e-208 -->
    <rect x="${originX + 1.3 * scale}" y="${originY + 3.5 * scale}" width="${4.06 * scale}" height="${1.75 * scale}" rx="18" fill="#dbeafe" stroke="#2563eb" stroke-width="2.5" />
    <!-- Kabina -->
    <rect x="${originX + 2.1 * scale}" y="${originY + 3.62 * scale}" width="${2.2 * scale}" height="${1.51 * scale}" rx="8" fill="#bfdbfe" stroke="#1d4ed8" stroke-width="1.5" />
    <!-- Zrcátka (šířka 1.96 m) -->
    <rect x="${originX + 2.1 * scale}" y="${originY + 3.5 * scale - 12}" width="18" height="12" fill="#2563eb" rx="3" />
    <rect x="${originX + 2.1 * scale}" y="${originY + 5.25 * scale}" width="18" height="12" fill="#2563eb" rx="3" />
    <!-- Text popisku -->
    <text x="${originX + 3.35 * scale}" y="${originY + 4.3 * scale}" font-size="15" font-weight="800" fill="#1e40af" text-anchor="middle">PEUGEOT e-208</text>
    <text x="${originX + 3.35 * scale}" y="${originY + 4.52 * scale}" font-size="12" fill="#1d4ed8" text-anchor="middle">4,06 × 1,75 m (baterie 50 kWh)</text>
    <text x="${originX + 1.5 * scale}" y="${originY + 4.4 * scale}" font-size="11" font-weight="700" fill="#2563eb">PŘEDEK ◄</text>

    <!-- NABÍJECÍ PORT e-208 (VLEVO VZADU) -->
    <circle cx="${originX + 5.0 * scale}" cy="${originY + 5.25 * scale}" r="9" fill="#16a34a" stroke="#ffffff" stroke-width="2" />
    <text x="${originX + 5.0 * scale}" y="${originY + 5.55 * scale}" font-size="11" font-weight="700" fill="#15803d" text-anchor="middle">Port e-208 (vlevo vzadu)</text>
  </g>

  <!-- STŘEDNÍ PRŮCHOZÍ ULIČKA MEZI AUTY (cca 1,01 m) -->
  <line x1="${originX + 3.35 * scale}" y1="${originY + 2.49 * scale}" x2="${originX + 3.35 * scale}" y2="${originY + 3.5 * scale}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="${originX + 3.35 * scale + 10}" y="${originY + 3.05 * scale}" font-size="12" font-weight="600" fill="#475569">Ulička: 1,01 m</text>

  <!-- ================= VARIANTY UMÍSTĚNÍ WALLBOXU ================= -->

  <!-- VARIANTA 1: PŮVODNÍ NA FASÁDĚ DOMU (Červená - problematická) -->
  <g id="var1">
    <rect x="${originX + 4.2 * scale}" y="${originY + 6.0 * scale - 8}" width="36" height="16" fill="#ef4444" rx="3" stroke="#b91c1c" stroke-width="1.5"/>
    <text x="${originX + 4.2 * scale + 18}" y="${originY + 6.0 * scale + 24}" font-size="11" font-weight="700" fill="#dc2626" text-anchor="middle">VAR. 1: Fasáda domu</text>
    <!-- Trasa kabelu k e-208 (krátká) -->
    <path d="M ${originX + 4.2 * scale + 18} ${originY + 6.0 * scale - 8} Q ${originX + 4.6 * scale} ${originY + 5.6 * scale} ${originX + 5.0 * scale} ${originY + 5.25 * scale}" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="4 3"/>
    <!-- Trasa kabelu k ID. Buzz (KOLIZNÍ: musí jít přes e-208 nebo po zemi přes celou šířku!) -->
    <path d="M ${originX + 4.2 * scale + 18} ${originY + 6.0 * scale - 8} C ${originX + 5.8 * scale} ${originY + 4.5 * scale}, ${originX + 5.8 * scale} ${originY + 2.0 * scale}, ${originX + 5.3 * scale} ${originY + 0.5 * scale}" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="6 4" marker-end="url(#arrow)"/>
    <text x="${originX + 6.0 * scale}" y="${originY + 3.0 * scale}" font-size="11" font-weight="700" fill="#b91c1c">Délka 6 m! Táhne se za zády e-208</text>
  </g>

  <!-- VARIANTA 2: STROPNÍ ZÁVĚSNÉ RAMENO / NAVÍJEČ (Modrá) -->
  <g id="var2">
    <circle cx="${originX + 3.35 * scale}" cy="${originY + 3.0 * scale}" r="16" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2.5" />
    <circle cx="${originX + 3.35 * scale}" cy="${originY + 3.0 * scale}" r="6" fill="#ffffff" />
    <text x="${originX + 3.35 * scale}" y="${originY + 2.7 * scale}" font-size="13" font-weight="800" fill="#1d4ed8" text-anchor="middle">VAR. 2: STROPNÍ VÝVOD / RAMENO</text>
    <text x="${originX + 3.35 * scale}" y="${originY + 2.85 * scale}" font-size="11" fill="#2563eb" text-anchor="middle">(V ose mezi auty, výška 2,65 m)</text>
    <!-- Dosah k oběma autům -->
    <line x1="${originX + 3.35 * scale}" y1="${originY + 3.0 * scale}" x2="${originX + 5.0 * scale}" y2="${originY + 5.25 * scale}" stroke="#3b82f6" stroke-width="2.5" stroke-dasharray="4 3" marker-end="url(#arrow-blue)"/>
    <line x1="${originX + 3.35 * scale}" y1="${originY + 3.0 * scale}" x2="${originX + 5.3 * scale}" y2="${originY + 0.5 * scale}" stroke="#3b82f6" stroke-width="2.5" stroke-dasharray="4 3" marker-end="url(#arrow-blue)"/>
  </g>

  <!-- VARIANTA 3: ZÁPADNÍ ZÁSTĚNA DO ZAHRADY (Zelená - IDEÁLNÍ!) -->
  <g id="var3">
    <!-- Konstrukce zástěny mezi sloupy Z1, Z2, Z3 -->
    <rect x="${originX - 12}" y="${originY + 1.2 * scale}" width="24" height="${3.6 * scale}" fill="#0f766e" rx="4" stroke="#134e4a" stroke-width="2"/>
    <text x="${originX - 25}" y="${originY + 3.0 * scale}" font-size="13" font-weight="800" fill="#0f766e" text-anchor="middle" transform="rotate(-90 ${originX - 25} ${originY + 3.0 * scale})">ZÁPADNÍ LAMELOVÁ ZÁSTĚNA (3,6 m)</text>

    <!-- Wallbox na zástěně (u středního sloupu Z2) -->
    <rect x="${originX + 14}" y="${originY + 3.0 * scale - 18}" width="22" height="36" fill="#10b981" rx="4" stroke="#047857" stroke-width="2"/>
    <circle cx="${originX + 25}" cy="${originY + 3.0 * scale}" r="5" fill="#ffffff" />
    <text x="${originX + 50}" y="${originY + 3.0 * scale - 24}" font-size="13" font-weight="800" fill="#047857">VAR. 3: WALLBOX NA ZÁSTĚNĚ</text>
    <text x="${originX + 50}" y="${originY + 3.0 * scale - 8}" font-size="11" fill="#065f46">V čele středové uličky, krytý před zahradou</text>

    <!-- Průchod do zahrady nahoře a dole -->
    <text x="${originX + 30}" y="${originY + 0.6 * scale}" font-size="12" font-weight="700" fill="#059669">◄ Volný průchod do zahrady (1,2 m)</text>
    <text x="${originX + 30}" y="${originY + 5.6 * scale}" font-size="12" font-weight="700" fill="#059669">◄ Volný průchod k domu (1,2 m)</text>
  </g>

  <!-- LEGENDA A SHRNUTÍ DOLE -->
  <rect x="50" y="${svgH - 220}" width="${svgW - 100}" height="190" fill="#ffffff" rx="10" stroke="#cbd5e1" stroke-width="1.5" />
  <text x="70" y="${svgH - 190}" font-size="16" font-weight="700" fill="#0f172a">VYHODNOCENÍ VARIANT UMÍSTĚNÍ WALLBOXU:</text>

  <text x="70" y="${svgH - 160}" font-size="13" font-weight="700" fill="#dc2626">1. Fasáda domu (severní):</text>
  <text x="250" y="${svgH - 160}" font-size="13" fill="#475569">Skvělé pro e-208 (1,5 m kabelu), ale KRITICKÉ pro Buzz: kabel délky 6 m se musí táhnout za autem e-208 po zemi nebo přes kapotu!</text>

  <text x="70" y="${svgH - 130}" font-size="13" font-weight="700" fill="#2563eb">2. Stropní vývod / otočné rameno:</text>
  <text x="250" y="${svgH - 130}" font-size="13" fill="#475569">Kabel visí ze stropu (výška 2,65 m) v ose mezi auty. Žádný kabel na zemi, dosáhne na obě auta. Vyžaduje balancér/pružinový navíječ.</text>

  <text x="70" y="${svgH - 100}" font-size="13" font-weight="700" fill="#059669">3. Částečná zástěna do zahrady (DOPORUČENO):</text>
  <text x="380" y="${svgH - 100}" font-size="13" fill="#475569">Dřevěná lamelová zástěna (šířka 3,6 m) mezi západními sloupy. Clona do zahrady před auty + Wallbox v čele uličky!</text>
  <text x="70" y="${svgH - 75}" font-size="12" fill="#64748b">Zůstávají 2 průchody do zahrady (u dílny i u domu). Kabel 4 m pohodlně obslouží obě auta středem bez křížení karoserií.</text>
</svg>
`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 2000 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
});
const pngBuffer = resvg.render().asPng();

const outDir = '/Users/milan/src/house/test/output';
fs.writeFileSync(path.join(outDir, 'stani-auta-overeni.svg'), svg);
fs.writeFileSync(path.join(outDir, 'stani-auta-overeni.png'), pngBuffer);
console.log('Rasterized successfully to test/output/stani-auta-overeni.png');
