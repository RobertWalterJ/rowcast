const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, colorScheme: process.env.SCHEME || 'light' });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8766/test.html' + (process.env.HASH || ''), { waitUntil: 'networkidle' });
  if (process.env.INIT) await p.evaluate(process.env.INIT);
  await p.waitForTimeout(6000);
  for (const s of process.argv.slice(2)) {
    if (s.startsWith('click:')) { await p.click(s.slice(6)); await p.waitForTimeout(1800); }
    else if (s.startsWith('eval:')) { await p.evaluate(s.slice(5)); await p.waitForTimeout(2500); }
    else await p.screenshot({ path: 'shots/' + s + '.png' });
  }
  console.log(errs.slice(0, 15).join('\n'));
  await b.close();
})();
