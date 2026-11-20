#!/usr/bin/env node
/*
 * Ek besin dosyalarını (FOODS_EXTRA + ALIAS_FIXES) foods.js'e katar.
 *   node tools/merge-extra.js part-x.js part-y.js ...   (argümansız: yalnızca foods.js'i yeniden yazar)
 * Kurallar: id'ler korunur (yinelenen id atlanır); ALIAS_FIXES'teki alias her besinden silinip hedefe eklenir;
 * her alias (katlanmış hâliyle) tek bir besine ait olur: çakışmada önce gelen (eski) besin kazanır,
 * besin adı ise her zaman kendi besinine aittir.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../parser.js');
const FILE = path.join(__dirname, '..', 'foods.js');
const src = fs.readFileSync(FILE, 'utf8');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(src, ctx);
let foods = ctx.window.FOODS;
const extras = process.argv.slice(2);
const keyCache = new Map();
const key = a => { let k = keyCache.get(a); if (k === undefined) { k = P.foldTokens(a).join(' '); keyCache.set(a, k); } return k; };
const report = { added: 0, dupIds: [], fixes: 0, fixMissing: [], dropped: 0 };
if (extras.length) {
  const ectx = { window: {} }; vm.createContext(ectx);
  extras.forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ectx));
  const ids = new Set(foods.map(f => f.id));
  (ectx.window.FOODS_EXTRA || []).forEach(f => {
    if (ids.has(f.id)) { report.dupIds.push(f.id); return; }
    ids.add(f.id); foods.push(f); report.added++;
  });
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const fixes = ectx.window.ALIAS_FIXES || {};
  const holders = new Map(); // katlanmış alias -> onu taşıyan besinler
  foods.forEach(f => (f.aliases || []).forEach(a => { const k = key(a); if (!holders.has(k)) holders.set(k, new Set()); holders.get(k).add(f); }));
  Object.keys(fixes).forEach(alias => {
    const t = byId[fixes[alias]];
    if (!t) { report.fixMissing.push(alias + '->' + fixes[alias]); return; }
    const k = key(alias);
    (holders.get(k) || []).forEach(f => { if (f !== t) f.aliases = (f.aliases || []).filter(a => key(a) !== k); });
    if (!holders.has(k)) holders.set(k, new Set());
    holders.get(k).add(t);
    if (!(t.aliases || []).some(a => key(a) === k)) (t.aliases = t.aliases || []).push(alias);
    t.__fixed = t.__fixed || new Set(); t.__fixed.add(k);
    report.fixes++;
  });
}
// tekillik: adlar kendi besinine; alias'larda önce gelen kazanır (ALIAS_FIXES hedefi her zaman kazanır)
const owner = new Map();
foods.forEach(f => { const k = key(f.name); if (k && !owner.has(k)) owner.set(k, f); });
foods.forEach(f => (f.__fixed || []).forEach(k => owner.set(k, f)));
foods.forEach(f => {
  const seen = new Set();
  f.aliases = (f.aliases || []).filter(a => {
    const k = key(a);
    if (!k) return false;
    if (seen.has(a)) { report.dropped++; return false; }
    const o = owner.get(k);
    if (o && o !== f) { report.dropped++; return false; }
    owner.set(k, f); seen.add(a); return true;
  });
  delete f.__fixed;
});
const ORDER = ['id', 'name', 'aliases', 'cat', 'kcal', 'p', 'c', 'f'];
function ser(o) {
  const keys = Object.keys(o).filter(k => o[k] !== undefined);
  keys.sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  return '{' + keys.map(k => k + ':' + val(o[k])).join(',') + '}';
}
function val(v) {
  if (Array.isArray(v)) return '[' + v.map(val).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).map(k => JSON.stringify(k) + ':' + val(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const head = src.slice(0, src.indexOf('window.FOODS = ['));
const out = head.replace(/\/\/ \d+ items\./, '// ' + foods.length + ' items.') + 'window.FOODS = [\n' + foods.map(ser).join(',\n') + '\n];\n';
fs.writeFileSync(FILE, out);
console.log(JSON.stringify(report).slice(0, 2000), 'toplam', foods.length);
