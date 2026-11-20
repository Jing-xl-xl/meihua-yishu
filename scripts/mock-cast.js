/**
 * 设计验收：全程 mock，不写数据库、不调 LLM。
 * 拦截 createSession / createCase / cast / interpret 四个接口，
 * 自动点「起卦」→「解卦」，用于断章/签章截图。
 */
(async () => {
  const CAST = {"method": "number3", "school": {"movingYao": "mod", "addHour": false}, "formula": [{"label": "上卦", "expr": "67 ÷ 8 = 8 … 3", "remainder": 3, "mapped": "li", "note": "→ 离(3)"}, {"label": "下卦", "expr": "83 ÷ 8 = 10 … 3", "remainder": 3, "mapped": "li", "note": "→ 离(3)"}, {"label": "动爻（取模派·不含时）", "expr": "336 ÷ 6 = 56 … 0 → 6", "remainder": 0, "mapped": 6, "note": "→ 6爻动"}, {"label": "本卦", "expr": "离为火"}, {"label": "互卦", "expr": "泽风大过（互见兑(2)、巽(5)）"}, {"label": "变卦", "expr": "雷火丰"}, {"label": "体用", "expr": "动爻在上，上卦为用，下卦为体"}], "ben": {"lines": [7, 8, 7, 7, 8, 7], "upper": "li", "lower": "li", "name": "离为火", "kingwen": 30}, "hu": {"upper": "dui", "lower": "xun", "name": "泽风大过"}, "bian": {"lines": [7, 8, 7, 7, 8, 8], "upper": "zhen", "lower": "li", "name": "雷火丰", "kingwen": 55}, "movingYao": 6, "ti": "li", "yong": "li", "tiYongNote": "动爻在上，上卦为用，下卦为体"};
  const enc = new TextEncoder();
  const json = (obj) =>
    new Response(JSON.stringify(obj), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const frame = (ev, data) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;

  const steps = [
    [1, '排盘：本卦' + CAST.ben.name + '，互' + (CAST.hu.name || '—') + '，变' + CAST.bian.name + '；动爻在' + CAST.movingYao + '。'],
    [2, '卦名：' + CAST.ben.name + '，象在蓄与止；先看卦名再论吉凶。'],
    [3, '体用：' + CAST.tiYongNote + '。'],
    [4, '生克：用' + CAST.yong + '对体' + CAST.ti + '，按生克得断语一句。'],
    [5, '衰旺：按月建看体卦旺衰，再与生克相参。'],
    [6, '卦辞爻辞：取本卦卦辞与动爻，观其吉凶所指。'],
    [7, '类象：把卦象落到你所问的事上，只取相关类目。'],
    [8, '互变：互卦看过程，变卦看结果，二者合参。'],
    [9, '应期：按卦气与动爻推一个粗时间窗。'],
  ].map(([stepId, conclusion]) => ({
    stepId,
    status: 'confirmed',
    conclusion,
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
    poem: { lines: ['疑云渐散见青山', '静待春来事自成'], source: 'rule' },
  };

  let body = '';
  for (const st of steps) {
    body += frame('step_start', { stepId: st.stepId, status: 'running' });
    body += frame('step_done', st);
  }
  body += frame('verdict', verdict);
  body += frame('done', { caseId: 'mock-case', sessionId: 'mock-session' });

  const orig = window.fetch;
  window.fetch = (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u === '/api/sessions' && method === 'POST') {
      return Promise.resolve(json({ session: { id: 'mock-session' } }));
    }
    if (/^\/api\/sessions\/[^/]+\/cases$/.test(u) && method === 'POST') {
      return Promise.resolve(json({ case: { id: 'mock-case' } }));
    }
    if (/^\/api\/cases\/[^/]+\/cast$/.test(u) && method === 'POST') {
      return Promise.resolve(json({ cast: CAST }));
    }
    if (/^\/api\/cases\/[^/]+\/interpret$/.test(u)) {
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (text) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim() === text,
    );
    if (b) b.click();
    return !!b;
  };
  click('起卦');
  await sleep(600);
  return 'mock-cast-done';
})();
