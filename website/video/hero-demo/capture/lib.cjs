const { chromium } = require('playwright');
const fs = require('fs');
// Seed state for the app's persisted stores. Keys and ids (e.g. 'reta-1-8-upcut', spec.largura) must match
// gsender-ui's stored schema exactly, so they follow whatever names the app uses.
const WS = JSON.stringify({ state: { onboarded: true, machines: [{ id: 'longmill-mk3-30x30', head: 'autospin-t1' }], active: 0, bits: ['reta-1-8-upcut','vbit-60-15mm','reta-1-16-downcut'], trackDone: [], mode: 'simple', panel: 'off', wired: [], link: {} }, version: 1 });
async function open() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((ws) => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x','1'); localStorage.setItem('gsender-workshop', ws);
    localStorage.setItem('gsender-design', JSON.stringify({ state: { design: { name: 'Front door sign', material: 'MDF', spec: { tipo: 'placa', largura: 200, altura: 120, espessura: 15, material: 'mdf', texto: [], borda: { tipo: 'arredondada', raio: 8 }, moldura: 0 }, bit: 'reta-1-8-upcut', useBit2: false, tabs: { count: 4, height: 3 } } }, version: 1 })); }
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.simbar{display:none!important}'; document.head.appendChild(st); });
  }, WS);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const T = {};
  const bb = async (n, loc) => { const b = await loc.first().boundingBox(); if (!b) throw new Error('no bbox ' + n); T[n] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; return T[n]; };
  const shot = async (n, wait = 250) => { await page.waitForTimeout(wait); await page.screenshot({ path: `shots/${n}.jpg`, type: 'jpeg', quality: 86 }); console.log('shot', n); };
  const save = () => fs.writeFileSync('targets.json', JSON.stringify(T, null, 1));
  return { browser, page, T, bb, shot, save };
}
module.exports = { open };
