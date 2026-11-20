#!/usr/bin/env node
/*
 * Cümle derlemi testi: tests/corpus/*.tsv  (satır: sorgu<TAB>beklenen)
 *   beklenen: "id"  |  "a|b" (herhangi biri)  |  "id:raw" / "id:cooked" (çiğ/pişmiş hâli)  |  "a,b" (çok besinli cümle, sıra önemsiz)
 *             "-"  = uygulama sormalı (hiçbir kalem ≥0.8 güvenle eklenmemeli)
 *   node tests/corpus.test.js [dosya.tsv ...] [--min=0.97] [--show=40]
 * holdout.tsv ayar için kullanılmaz; yalnızca raporlanır (eşik uygulanmaz).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../parser.js');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
const FOODS = ctx.window.FOODS;
const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const MIN = Number(opt('min') || 0.97), SHOW = Number(opt('show') || 25);
let files = args.filter(a => !a.startsWith('--'));
const DIR = path.join(__dirname, 'corpus');
if (!files.length) files = fs.readdirSync(DIR).filter(f => f.endsWith('.tsv')).sort().map(f => path.join(DIR, f));

/** bir kalem beklenen alternatiflerden birine uyuyor mu */
function fits(it, alt) {
  return alt.split('|').some(a => {
    const [id, st] = a.trim().split(':');
    return it.foodId === id && (!st || it.state === st);
  });
}
function judge(r, exp) {
  if (exp === '-') return !r.items.some(i => i.confidence >= 0.8);
  if (r.unmatched.length) return false;
  const want = exp.split(',').map(s => s.trim()).filter(Boolean);
  if (want.length !== r.items.length) return false;
  // sırasız eşleme (küçük listeler: açgözlü + geri izleme)
  const used = new Array(r.items.length).fill(false);
  function go(k) {
    if (k === want.length) return true;
    for (let i = 0; i < r.items.length; i++) if (!used[i] && fits(r.items[i], want[k])) { used[i] = true; if (go(k + 1)) return true; used[i] = false; }
    return false;
  }
  return go(0);
}
const show = r => r.items.map(i => i.foodId + (i.state ? ':' + i.state : '') + '@' + i.confidence).join(',') + (r.unmatched.length ? ' ?' + r.unmatched.map(u => u.text).join('/') : '');

let allOk = true, tot = 0, totHit = 0;
files.forEach(file => {
  const name = path.basename(file);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  let hit = 0, confWrong = 0; const miss = [];
  const t0 = Date.now();
  lines.forEach(l => {
    const [q, exp] = l.split('\t');
    if (exp == null) return;
    const r = P.parse(q, FOODS);
    if (judge(r, exp.trim())) hit++;
    else {
      if (exp.trim() !== '-' && r.items.some(i => i.confidence >= 0.8) && !r.items.some(i => exp.split(/[,|]/).some(a => a.split(':')[0].trim() === i.foodId))) confWrong++;
      miss.push(q + '  =>  ' + show(r) + '   (beklenen ' + exp.trim() + ')');
    }
  });
  const rate = hit / lines.length, held = /holdout/.test(name);
  console.log(name + ': ' + hit + '/' + lines.length + ' = ' + (rate * 100).toFixed(1) + '% · emin-yanlış ' + confWrong + ' · ' + (Date.now() - t0) + ' ms' + (held ? ' (held-out, eşik yok)' : ''));
  miss.slice(0, SHOW).forEach(m => console.log('    ✗ ' + m));
  if (!held) { tot += lines.length; totHit += hit; }
});
const rate = tot ? totHit / tot : 1;
console.log('\nToplam (held-out hariç): ' + totHit + '/' + tot + ' = ' + (rate * 100).toFixed(2) + '% (eşik ' + (MIN * 100) + '%)');
if (rate < MIN) allOk = false;
process.exit(allOk ? 0 : 1);
