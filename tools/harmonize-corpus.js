#!/usr/bin/env node
// Aynı sorgu için derlemler farklı beklenen yazmışsa (veri ekipleri arası çelişki) hepsinde beklenenler birleştirilir.
// Tek besinli satırlarda alternatifler "a|b" olarak birleşir; "-" ile çelişen ya da çok besinli satırlara dokunulmaz.
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'tests', 'corpus');
const files = ['corpus-x.tsv', 'corpus-y.tsv', 'corpus-z.tsv'];
const key = q => q.toLocaleLowerCase('tr-TR').trim();
const all = {};
const data = files.map(f => fs.readFileSync(path.join(DIR, f), 'utf8').split('\n'));
data.forEach(lines => lines.forEach(l => { const [q, e] = l.split('\t'); if (e == null) return; (all[key(q)] = all[key(q)] || []).push(e.trim()); }));
let changed = 0;
data.forEach((lines, k) => {
  const out = lines.map(l => {
    const [q, e] = l.split('\t'); if (e == null) return l;
    const ex = all[key(q)];
    if (new Set(ex).size < 2 || ex.some(x => x === '-' || x.includes(','))) return l;
    const alts = [...new Set(ex.flatMap(x => x.split('|').map(s => s.trim())))].join('|');
    if (alts !== e.trim()) { changed++; return q + '\t' + alts; }
    return l;
  });
  fs.writeFileSync(path.join(DIR, files[k]), out.join('\n'));
});
console.log('birleştirilen satır:', changed);

// Kullanıcı kuralı (sade ürün adı -> temel besin): sorgu bir besinin parantezsiz adıyla birebir aynıysa o besin de kabul edilir.
{
  const vm = require('vm'), P = require('../parser.js');
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
  const plain = {};
  ctx.window.FOODS.forEach(f => { if (!/[()+]/.test(f.name)) plain[P.foldTokens(f.name).join(' ')] = f.id; });
  let added = 0;
  files.forEach(f => {
    const fp = path.join(DIR, f);
    const out = fs.readFileSync(fp, 'utf8').split('\n').map(l => {
      const [q, e] = l.split('\t'); if (e == null || e.trim() === '-' || e.includes(',')) return l;
      const id = plain[P.foldTokens(q).join(' ')];
      if (!id || e.split('|').map(s => s.split(':')[0].trim()).includes(id)) return l;
      added++; return q + '\t' + e.trim() + '|' + id;
    });
    fs.writeFileSync(fp, out.join('\n'));
  });
  console.log('temel besin alternatifi eklenen satır:', added);
}
