const { open } = require('./lib.cjs');
(async () => {
  const { browser, page: p, bb, shot, save } = await open();
  await p.goto('http://localhost:5173/#/create', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  await shot('a0-blank');
  await bb('addText', p.getByRole('button', { name: '+ Text' }));
  await p.getByRole('button', { name: '+ Text' }).click(); await p.waitForTimeout(700);
  await shot('a1-text');
  const content = p.locator('.create-inspector .create-input').first();
  await bb('content', content);
  await content.click();
  for (const [k, t] of [['t1','W'],['t2','Wel'],['t3','Welco'],['t4','Welcome']]) { await content.fill(t); await shot('a2-' + k, 1000); }
  const slider = p.locator('.create-inspector input[type=range]').first();
  await bb('height', slider);
  const setR = (v) => slider.evaluate((el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  console.log('range', await slider.evaluate((el) => [el.min, el.max, el.value]));
  // wait for the cut preview to settle (the new font loads and the "≈N% stays" drops)
  const settle = async () => { let last = '', same = 0; for (let i = 0; i < 8 && same < 3; i++) { await p.waitForTimeout(350); const v = await p.getByText(/stays/).first().innerText().catch(() => ''); const n = parseInt((v.match(/(\d+)%/) || [])[1] || '0'); if (v === last && n < 10) same++; else same = 0; last = v; } };
  const font = p.locator('.create-font').nth(2);
  await bb('fontScript', font);
  await font.click(); await settle(); await shot('a3-font');
  for (const [k, v] of [['h1', 25], ['h2', 30], ['h3', 34]]) { await setR(String(v)); await settle(); await shot('a3-' + k); }
  await p.mouse.click(500, 780); await shot('a4-done', 500);
  await bb('continue', p.getByRole('button', { name: /Continue to Prepare/ }));
  console.log(await p.locator('.sidepanel').innerText().then((t) => t.slice(0, 300)));
  await p.locator('.sidepanel').evaluate(() => 0);
  console.log(await p.locator('.sidepanel').innerText().then((t) => t.slice(0, 400)));
  // ===== B: prepare =====
  await p.getByRole('button', { name: /Continue to Prepare/ }).click(); await p.waitForTimeout(3500);
  await shot('b0-prepare');
  await bb('play', p.getByRole('button', { name: /Play toolpath/ }));
  await bb('detailed', p.locator('button', { hasText: 'Detailed' }));
  await bb('btn3d', p.getByRole('button', { name: '3D', exact: true }));
  await bb('contPos', p.getByRole('button', { name: /Continue to Position/ }));
  await bb('pill', p.locator('.pill--button'));
  await p.getByRole('button', { name: /Play toolpath/ }).click();
  for (let i = 1; i <= 6; i++) await shot('b1-play' + i, 450);
  await p.waitForTimeout(4000); await shot('b1-playend');
  await p.getByRole('button', { name: '3D', exact: true }).click(); await shot('b2-3d', 1500);
  // ===== C: connect =====
  await p.locator('.pill--button').click(); await p.waitForTimeout(800);
  await shot('c0-wiz');
  await bb('cables', p.getByRole('button', { name: 'Show me the cables' }));
  await p.getByRole('button', { name: 'Show me the cables' }).click(); await p.waitForTimeout(500);
  let i = 0;
  while (await p.locator('.cw__tick').count()) {
    await shot('c1-step' + i, 300);
    const ticks = await p.locator('.cw__tick input').all();
    for (let j = 0; j < ticks.length; j++) { await bb('tick' + i + '_' + j, p.locator('.cw__tick').nth(j)); await ticks[j].check({ force: true }); await shot('c1-step' + i + '-t' + j, 150); }
    await bb('next' + i, p.locator('.cw__nav .btn--primary'));
    await p.locator('.cw__nav .btn--primary').click(); await p.waitForTimeout(450); i++;
  }
  await p.waitForTimeout(1500);
  // video only: the simulator card becomes the detected USB port (the simulator runs underneath)
  await p.evaluate(() => {
    const ports = document.querySelector('.cw__ports');
    [...ports.querySelectorAll('.cw__port:not(.cw__port--sim)')].forEach((e) => e.remove());
    const sim = ports.querySelector('.cw__port--sim');
    sim.classList.remove('cw__port--sim');
    sim.querySelector('.cw__port-name').textContent = 'STM32 (SuperLongBoard)';
    const sub = sim.querySelector('.cw__port-sub'); sub.textContent = 'USB · COM3'; sub.classList.add('mono');
    sim.querySelector('svg').outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="1"/><circle cx="4" cy="20" r="1"/><path d="M4.7 19.3 19 5"/><path d="m21 3-3 1 2 2Z"/><path d="M9.26 7.68 5 12l2 5"/><path d="m10 14 5 2 3.5-3.5"/><path d="m18 12 1-1 1 1-1 1Z"/></svg>';
    const dot = document.createElement('span'); dot.className = 'cw__port-dot'; sim.appendChild(dot);
    sim.id = 'fakeport';
  });
  await shot('c2-ports');
  await bb('port', p.locator('#fakeport'));
  await p.locator('#fakeport').click(); await shot('c2-pick', 300);
  await bb('connect', p.locator('.cw__nav .btn--primary'));
  await p.locator('.cw__nav .btn--primary').click();
  await shot('c3-connecting', 500);
  await p.waitForTimeout(2200);
  await p.evaluate(() => window.__machine.setState({ speedup: 3 }));
  await shot('c4-verify');
  await bb('moveUp', p.getByRole('button', { name: /Move up 2 mm/ }));
  await p.getByRole('button', { name: /Move up 2 mm/ }).click(); await p.waitForTimeout(500);
  await bb('yes1', p.getByRole('button', { name: 'Yes' }).first());
  await p.getByRole('button', { name: 'Yes' }).first().click(); await shot('c5-yes1');
  await bb('spin', p.getByRole('button', { name: /Spin for 3 s/ }));
  await p.getByRole('button', { name: /Spin for 3 s/ }).click(); await shot('c6-spinning', 700);
  await p.waitForTimeout(3000);
  await bb('yes2', p.getByRole('button', { name: 'Yes' }).nth(1));
  await p.getByRole('button', { name: 'Yes' }).nth(1).click(); await shot('c7-ok');
  await bb('allgood', p.getByRole('button', { name: /All good/ }));
  await p.getByRole('button', { name: /All good/ }).click(); await p.waitForTimeout(900);
  await shot('c8-connected');
  // ===== D: position + carve =====
  await p.goto('http://localhost:5173/#/position'); await p.waitForTimeout(1800);
  await shot('d0-home');
  const prim = () => p.locator('.sidepanel .btn--primary.btn--lg').first();
  await bb('prim', prim());
  await prim().click(); await shot('d1-homing', 700); await p.waitForTimeout(1500); await shot('d1-homed');
  await prim().click(); await p.waitForTimeout(800); await shot('d2-plate');
  await bb('touch', p.locator('button', { hasText: 'Use touch plate' }));
  await p.locator('button', { hasText: 'Use touch plate' }).first().click(); await shot('d3-touch', 400);
  await prim().click(); await shot('d4-probing', 600); await p.waitForTimeout(1500); await shot('d4-probed');
  await prim().click(); await p.waitForTimeout(600); await shot('d5-zero');
  await prim().click(); await p.waitForTimeout(1400); await shot('d6-check');
  for (const label of ["It's in", "It's on"]) { const x = p.locator('button', { hasText: label }); if (await x.count()) { await bb('chk' + label.slice(5), x); await x.first().click(); await shot('d6-check-' + label.slice(5), 300); } }
  await bb('start', prim());
  await prim().click();
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__machine.setState({ speedup: 7 }));
  for (let k = 1; k <= 30; k++) { await shot('e-run' + String(k).padStart(2, '0'), 450); if (/Done/.test(await p.locator('.pill').first().innerText())) break; }
  await p.evaluate(() => window.__machine.setState({ speedup: 200 }));
  for (let k = 0; k < 60; k++) { if (/Done|Change bit/.test(await p.locator('.pill').first().innerText())) break; await p.waitForTimeout(1000); }
  await shot('e-done', 1200);
  await bb('btn3dDone', p.getByRole('button', { name: '3D', exact: true }));
  save(); await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
