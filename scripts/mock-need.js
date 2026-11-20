/**
 * 设计验收：mock「背景提问」链路（不写库、不调 LLM）
 * /interpret  → 发 1/2 步 + need_input(step3) 后结束
 * /resume     → 发 3..9 步 + verdict + done
 */
(async () => {
  const CAST = {"method": "number3", "school": {"movingYao": "mod", "addHour": false}, "formula": [{"label": "上卦", "expr": "67 ÷ 8 = 8 … 3", "remainder": 3, "mapped": "li", "note": "→ 离(3)"}, {"label": "下卦", "expr": "83 ÷ 8 = 10 … 3", "remainder": 3, "mapped": "li", "note": "→ 离(3)"}, {"label": "动爻（取模派·不含时）", "expr": "336 ÷ 6 = 56 … 0 → 6", "remainder": 0, "mapped": 6, "note": "→ 6爻动"}, {"label": "本卦", "expr": "离为火"}, {"label": "互卦", "expr": "泽风大过（互见兑(2)、巽(5)）"}, {"label": "变卦", "expr": "雷火丰"}, {"label": "体用", "expr": "动爻在上，上卦为用，下卦为体"}], "ben": {"lines": [7, 8, 7, 7, 8, 7], "upper": "li", "lower": "li", "name": "离为火", "kingwen": 30}, "hu": {"upper": "dui", "lower": "xun", "name": "泽风大过"}, "bian": {"lines": [7, 8, 7, 7, 8, 8], "upper": "zhen", "lower": "li", "name": "雷火丰", "kingwen": 55}, "movingYao": 6, "ti": "li", "yong": "li", "tiYongNote": "动爻在上，上卦为用，下卦为体"};
  const enc = new TextEncoder();
  const json = (o) =>
    new Response(JSON.stringify(o), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const frame = (ev, data) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
  const step = (stepId, conclusion) => ({
    stepId,
    status: 'confirmed',
    conclusion,
    sources: [],
    updatedAt: new Date().toISOString(),
  });
  const S12 = [
    step(1, '排盘：本卦' + CAST.ben.name + '，动爻' + CAST.movingYao + '。'),
    step(2, '卦名：' + CAST.ben.name + '，象在蓄与止。'),
  ];
  const S39 = [
    step(3, '定体用：' + CAST.tiYongNote + '。'),
    step(4, '生克：用' + CAST.yong + '对体' + CAST.ti + '。'),
    step(5, '衰旺：按月建看体卦。'),
    step(6, '卦辞爻辞：取本卦与动爻。'),
    step(7, '类象：落到所问之事。'),
    step(8, '互变：互看过程、变看结果。'),
    step(9, '应期：给一个粗时间窗。'),
  ];
  const verdict = {
    grade: 'good',
    summary: '这一问不必急。先按原计划走完手头这一步，等对方先动，事就顺了。',
    advice: ['按原计划推进'],
    risks: ['临时改期容易搅乱顺局'],
    timing: '戌亥月内可见回音',
    basedOnSteps: [3, 4, 5],
    poem: { lines: ['疑云渐散见青山', '静待春来事自成'], source: 'rule' },
  };
  let bodyNeed = '';
  for (const st of S12) bodyNeed += frame('step_done', st);
  bodyNeed += frame('need_input', {
    stepId: 3,
    question: '大约何时不见？是常用物还是偶然带的？',
    options: ['今日', '近日', '很久了', '跳过'],
  });
  let bodyDone = '';
  for (const st of S39) bodyDone += frame('step_done', st);
  bodyDone += frame('verdict', verdict);
  bodyDone += frame('done', { caseId: 'mock-case', sessionId: 'mock-session' });

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
    const sse = (body) => {
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
    };
    if (/^\/api\/cases\/[^/]+\/interpret$/.test(u)) return sse(bodyNeed);
    if (/^\/api\/cases\/[^/]+\/resume$/.test(u)) return sse(bodyDone);
    return orig(url, init);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (t) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim() === t,
    );
    if (b) b.click();
    return !!b;
  };
  click('起卦');
  await sleep(500);
  click('解卦');
  await sleep(700);
  // 再点一次「解卦」，验证守卫：不应产生第二条提问
  const again = [...document.querySelectorAll('button')].find(
    (x) => x.textContent.trim() === '解卦' || x.textContent.trim() === '等待补充',
  );
  if (again && !again.disabled) again.click();
  await sleep(500);
  const phaseNow =
    document.querySelector('.flow-step.current')?.textContent?.trim() ?? '';
  const needBubbles = document.querySelectorAll('.bubble.assistant.need').length;
  const chat = document.querySelector('.col.right');
  const chatVisible = chat ? getComputedStyle(chat).display !== 'none' : false;
  const stop = [...document.querySelectorAll('button')].some(
    (b) => b.textContent.trim() === '停止解卦',
  );
  return JSON.stringify({ phaseNow, needBubbles, chatVisible, stop });
})();
