/**
 * 设计验收：不调真 LLM，注入假 SSE 让「解卦 / 断语 / 签」整章可截图。
 * 用法：node scripts/shot.mjs --url http://localhost:5173/ --out x.png --script-file scripts/mock-interpret.js ...
 * 前提：页面已起卦（有 caseId 且已 cast）。
 */
(() => {
  const enc = new TextEncoder();
  const frame = (ev, data) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;

  const steps = [
    [1, '排盘：本卦山天大畜，互雷泽归妹，变山泽损；动爻在三。'],
    [2, '卦名：大畜者，蓄也。山下有天，蓄势待发之象。'],
    [3, '体用：动爻在下卦，下卦为用（艮土），上卦为体（乾金）。'],
    [4, '生克：用艮土对体乾金 —— 土生金，体生用，主耗散。'],
    [5, '衰旺：戌月土旺，体卦乾金失令而衰，气虚。'],
    [6, '卦辞：「利贞，不家食吉，利涉大川。」宜守正待时。'],
    [7, '类象：艮为山为止，乾为天为健；事在停蓄，不宜急进。'],
    [8, '互变：互见震兑，动而说；之卦山泽损，去有余以补不足。'],
    [9, '应期：以土金相生之数推，约在戌亥月或一旬之内见信。'],
  ].map(([stepId, conclusion]) => ({
    stepId,
    status: 'confirmed',
    conclusion,
    evidence: '',
    sources: [],
    updatedAt: new Date().toISOString(),
  }));

  const verdict = {
    grade: 'good',
    summary:
      '这一问不必急。眼下你准备得比自认为的充分，卡住的多半只是时机；先按原计划走完手头这一步，等对方先动，事就顺了。',
    advice: ['按原计划推进，不做临时改动', '把材料再对一遍，避免低级错'],
    risks: ['临时改期或换方向，容易把顺局搅乱'],
    timing: '戌亥月内可见回音',
    basedOnSteps: [3, 4, 5, 7],
    poem: {
      lines: ['疑云渐散见青山', '静待春来事自成'],
      source: 'rule',
    },
  };

  let body = '';
  for (const st of steps) {
    body += frame('step_start', { stepId: st.stepId, status: 'running' });
    body += frame('step_done', st);
  }
  body += frame('verdict', verdict);
  body += frame('done', { caseId: 'mock', sessionId: 'mock' });

  const orig = window.fetch;
  window.fetch = (url, init) => {
    if (String(url).includes('/interpret')) {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(body));
          c.close();
        },
      });
      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      );
    }
    return orig(url, init);
  };

  const btn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === '解卦',
  );
  if (!btn) return 'no-interpret-btn';
  btn.click();
  return 'mocked-interpret';
})();
