import { chromium } from '@playwright/test';
const [,, out, circ, theme, cx, cy, w, h, wait='4000'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 3 });
await p.addInitScript((t) => localStorage.setItem('circuitjs-next.settings.v2', JSON.stringify({ showFields: true, themeId: t })), theme);
await p.goto(`http://localhost:4173/?startCircuit=${circ}`);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out, clip: { x: +cx, y: +cy, width: +w, height: +h } });
await b.close();
