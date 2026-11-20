/** 签面 Canvas 导出「摹」· 见 docs/v2.0/00-规格/视觉设计语言.md §4.14.7 */
export type SignExportData = {
  gradeLabel: string;
  guaName: string;
  movingLabel?: string;
  yaoRows: { pos: number; yang: boolean; moving: boolean }[];
  upper?: string;
  lower?: string;
  legacySingle?: string;
  brief?: string;
  showDisclaimer?: boolean;
  disclaimer?: string;
  /** 落款（干支年·季），可选 */
  colophon?: string;
  /** 签号（第 N 签），可选 */
  signNo?: number;
};

const PAPER = '#f6f0e4';
const INK = '#1c1814';
const CINNABAR = '#b23a2e';
const GOLD = '#8a6b2f';
const FONT_SERIF = "'Songti SC','STSong','SimSun','Noto Serif SC',serif";

function sanitizeFilePart(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24) || '签';
}

function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  top: number,
  fontSize: number,
  color: string,
): void {
  ctx.save();
  ctx.font = `500 ${fontSize}px ${FONT_SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const gap = fontSize * 1.28;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, cx, top + fontSize / 2 + i * gap);
  });
  ctx.restore();
}

/** 将签面绘入 canvas 并触发下载 */
export async function exportSignPng(data: SignExportData): Promise<void> {
  const W = 360;
  const H = 680;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.scale(scale, scale);

  // 纸
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W * 0.3, H * 0.22, 10, W * 0.3, H * 0.22, 180);
  wash.addColorStop(0, 'rgba(217,203,180,0.22)');
  wash.addColorStop(1, 'rgba(217,203,180,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // 外框：墨 + 金双线（收藏级）
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  // 压角「梅」印
  const sealSize = 28;
  const mx = W - 40 - sealSize;
  const my = H - 48 - sealSize;
  ctx.strokeStyle = CINNABAR;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(mx, my, sealSize, sealSize);
  ctx.font = `600 14px ${FONT_SERIF}`;
  ctx.fillStyle = CINNABAR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('梅', mx + sealSize / 2, my + sealSize / 2 + 1);

  // 签头印（居中）
  const seal = 64;
  const sx = W / 2 - seal / 2;
  const sy = 36;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(sx, sy, seal, seal);
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 5, sy + 5, seal - 10, seal - 10);
  ctx.font = `600 26px ${FONT_SERIF}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.gradeLabel, W / 2, sy + seal / 2 + 1);

  // 卦心
  const yaoW = W * 0.62;
  const yaoX = (W - yaoW) / 2;
  const yaoH = 11;
  const gap = 10;
  const groupH = 6 * yaoH + 5 * gap;
  const groupTop = 170;
  const ringRx = 120;
  const ringRy = 76;
  const ringCx = W / 2;
  const ringCy = groupTop + groupH / 2;

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(28,24,20,0.12)';
  ctx.lineWidth = 1;
  ctx.ellipse(ringCx, ringCy, ringRx, ringRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.setLineDash([2, 7]);
  ctx.strokeStyle = 'rgba(28,24,20,0.1)';
  ctx.ellipse(ringCx, ringCy, ringRx - 10, ringRy - 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  data.yaoRows.forEach((row, i) => {
    const y = groupTop + i * (yaoH + gap);
    ctx.fillStyle = row.moving ? CINNABAR : INK;
    if (row.yang) {
      ctx.fillRect(yaoX, y, yaoW, yaoH);
    } else {
      const seg = yaoW * 0.42;
      ctx.fillRect(yaoX, y, seg, yaoH);
      ctx.fillRect(yaoX + yaoW - seg, y, seg, yaoH);
    }
  });

  // 卦名 + 金线
  const nameY = groupTop + groupH + 28;
  ctx.font = `600 22px ${FONT_SERIF}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.guaName || '—', W / 2, nameY);
  if (data.movingLabel) {
    const nameW = ctx.measureText(data.guaName || '—').width;
    const tag = data.movingLabel;
    ctx.font = `600 11px ${FONT_SERIF}`;
    const tw = ctx.measureText(tag).width + 12;
    const tx = Math.min(W - 40 - tw, W / 2 + nameW / 2 + 10);
    const ty = nameY - 11;
    ctx.strokeStyle = CINNABAR;
    ctx.fillStyle = 'rgba(178,58,46,0.10)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(tx, ty, tw, 22);
    ctx.strokeRect(tx, ty, tw, 22);
    ctx.fillStyle = CINNABAR;
    ctx.textAlign = 'center';
    ctx.fillText(tag, tx + tw / 2, ty + 12);
    ctx.textAlign = 'center';
    ctx.font = `600 22px ${FONT_SERIF}`;
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(W / 2 - 40, nameY + 18, 80, 1.5);

  // 诗（右→左竖排）
  const poemTop = nameY + 48;
  const upper = data.legacySingle || data.upper || '';
  const lower = !data.legacySingle ? data.lower || '' : '';
  const fs = 22;
  if (upper) {
    const cxUpper = lower ? W / 2 + 36 : W / 2;
    drawVerticalText(ctx, upper, cxUpper, poemTop, fs, INK);
  }
  if (lower) {
    drawVerticalText(ctx, lower, W / 2 - 36, poemTop, fs, INK);
    ctx.fillStyle = CINNABAR;
    ctx.fillRect(W / 2 - 9, poemTop + 40, 18, 18);
    ctx.font = `600 11px ${FONT_SERIF}`;
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('诗', W / 2, poemTop + 49);
  }

  // 跋
  const footY = H - 56;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, footY);
  ctx.lineTo(W - 28, footY);
  ctx.stroke();
  if (data.colophon) {
    ctx.font = `10px ${FONT_SERIF}`;
    ctx.fillStyle = '#8a8175';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      data.signNo ? `${data.colophon} · 第${data.signNo}签` : data.colophon,
      W - 30,
      footY + 21,
    );
    ctx.textAlign = 'left';
  }
  if (data.brief) {
    ctx.fillStyle = CINNABAR;
    ctx.fillRect(32, footY + 12, 18, 18);
    ctx.font = `600 11px ${FONT_SERIF}`;
    ctx.fillStyle = CINNABAR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('问', 41, footY + 21);
    ctx.font = `12px ${FONT_SERIF}`;
    ctx.fillStyle = '#5c554c';
    ctx.textAlign = 'left';
    ctx.fillText(data.brief, 58, footY + 21);
  }
  if (data.showDisclaimer && data.disclaimer) {
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#b7ad9e';
    ctx.textAlign = 'center';
    ctx.fillText(data.disclaimer, W / 2, H - 22);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('export-failed');
  const date = new Date();
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const name = `梅花签-${sanitizeFilePart(data.guaName)}-${ymd}.png`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
