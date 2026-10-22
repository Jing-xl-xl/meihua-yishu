/**
 * validate-knowledge：D-1 硬校验。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HEXAGRAM_TABLE } from '@meihua/shared';
import type { Gua, HexagramData, JieqiMonthKey } from '@meihua/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../knowledge');

const ZHI: JieqiMonthKey[] = [
  '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑',
];

const errors: string[] = [];

function err(msg: string): void {
  errors.push(msg);
}

function readJson(rel: string): unknown {
  const p = join(OUT, rel);
  if (!existsSync(p)) {
    err(`missing file: ${rel}`);
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const meta = readJson('meta.json') as { version?: string } | null;
if (!meta?.version) err('meta.version required');

const hexDoc = readJson('structured/hexagrams.json') as {
  hexagrams?: HexagramData[];
} | null;
const hexagrams = hexDoc?.hexagrams ?? [];

if (hexagrams.length !== 64) {
  err(`hexagrams count ${hexagrams.length} != 64`);
}

const byKw = new Map(HEXAGRAM_TABLE.map((h) => [h.kingwen, h]));
for (const h of hexagrams) {
  const ref = byKw.get(h.kingwen);
  if (!ref) {
    err(`${h.fullName}: bad kingwen`);
    continue;
  }
  if (h.fullName !== ref.name) {
    err(`${h.kingwen}: fullName ${h.fullName} != ${ref.name}`);
  }
  if (h.upper !== ref.upper || h.lower !== ref.lower) {
    err(`${h.kingwen}: upper/lower mismatch`);
  }
  if (!h.gloss || h.gloss.length < 1) {
    err(`${h.fullName}: gloss empty`);
  }
  if (!h.guaCi) err(`${h.fullName}: guaCi empty`);
  if (!h.lines || h.lines.length !== 6) {
    err(`${h.fullName}: lines != 6`);
  } else {
    for (const ln of h.lines) {
      const wantYang = ln.label.includes('九');
      if (ln.yang !== wantYang) {
        err(`${h.fullName} ${ln.label}: yang flag mismatch`);
      }
    }
  }
  if (h.kingwen === 1 || h.kingwen === 2) {
    if (!h.yongYao) err(`${h.fullName}: yongYao required`);
  }
}

// shared name coverage
const names = new Set(hexagrams.map((h) => h.fullName));
for (const t of HEXAGRAM_TABLE) {
  if (!names.has(t.name)) err(`missing in json: ${t.name}`);
}

const ws = readJson('structured/wangshuai.json') as {
  entries?: Record<string, { strong: Gua[]; weak: Gua[] }>;
} | null;
const entries = ws?.entries ?? {};
for (const z of ZHI) {
  if (!entries[z]) err(`wangshuai missing key ${z}`);
}

const dy = readJson('structured/duanyu.json') as Record<string, unknown> | null;
if (!dy?.shengTi || !dy?.keTi) err('duanyu missing shengTi/keTi');

const ty = readJson('structured/tiyong.json') as Record<string, unknown> | null;
for (const k of ['sheng', 'ke', 'bi_he', 'xie', 'bei_ke']) {
  if (!ty?.[k]) err(`tiyong missing ${k}`);
}

const sb = readJson('structured/shibazhan.json') as {
  categories?: string[];
} | null;
if ((sb?.categories?.length ?? 0) < 18) err('shibazhan need 18 categories');

if (existsSync(join(OUT, 'graph/wuxing.json'))) {
  err('graph/wuxing.json should not exist (use shared)');
}

if (errors.length) {
  console.error('knowledge validate FAILED:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('knowledge validate OK', meta?.version);
