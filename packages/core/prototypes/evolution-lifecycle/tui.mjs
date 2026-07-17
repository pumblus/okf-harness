/**
 * THROWAWAY PROTOTYPE — terminal shell only. All logic lives in ./lifecycle.mjs.
 * Run: pnpm proto:evolution
 */

import {
  CATALOG,
  STAGES,
  currency,
  history,
  initialState,
  lineageSuspicion,
  reduce,
  seal,
} from './lifecycle.mjs';

const b = (s) => `\x1b[1m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;

let state = initialState();

function render() {
  const out = [];
  const s = seal(state);
  const cur = currency(state);

  out.push(b('  OKF Harness — 源演化生命周期原型') + d('   （一次性；issue #60）'));
  out.push('');

  // --- the cycle ---
  out.push(b('  循环'));
  if (!state.cycle) {
    out.push(d('    空闲 —— 磁盘上没有任何循环状态，因为压根不存在提案实体'));
  } else {
    const line = STAGES.map((st) =>
      st.key === state.cycle.stage ? b(`[${st.label}]`) : d(st.label),
    ).join(d(' → '));
    out.push('    ' + line);
  }
  out.push('');

  // --- stored vs computed, the split under test ---
  out.push(b('  已存储') + d('  （只存无法从基底重算的东西）'));
  out.push(
    '    manifest    ' +
      (state.manifest.valid ? g('有效') : r('已损坏')) +
      d(`   ${state.manifest.sources.length} 个源`),
  );
  for (const row of state.manifest.sources) {
    const disk = state.disk[row.source_id];
    const phys = !disk ? r('文件缺失') : disk.hash !== row.sha256 ? r(`哈希漂移 ${disk.hash}`) : g('正常');
    out.push(d(`      ${row.source_id}  ${row.original}  #${row.sha256}  `) + phys);
  }
  out.push(
    '    血缘        ' +
      (state.lineage.length ? state.lineage.map((l) => `${l.to} 修订 ${l.from}`).join('，') : d('—')) +
      d('   （纯寻址，无意义）'),
  );
  out.push(
    '    调和悬空    ' +
      (state.dangling.length ? y(state.dangling.join('，')) : d('—')) +
      d('   （Harness 升起，只有 Agent 能落下）'),
  );
  out.push('    检查点      ' + (state.checkpoints.length ? String(state.checkpoints.length) : d('—')));
  out.push('');

  out.push(b('  实时计算') + d('  （从不存储；是基底的纯函数）'));
  const susp = lineageSuspicion(state);
  out.push(
    '    血缘怀疑    ' +
      (susp.length ? y(susp.map((x) => `${x.original}：${x.a} vs ${x.b}`).join('，')) : d('无')),
  );
  if (s.scope === 'none') {
    out.push('    封印        ' + g('无封印'));
  } else {
    out.push(
      '    封印        ' +
        r(s.scope === 'workspace' ? '全工作区' : '链条') +
        d(`   ${s.conditions.map((c) => c.code ?? c).join(', ')}`),
    );
    for (const f of s.files) out.push(d('      已封：') + r(f));
    out.push(d('      未封：wiki/concepts/入职.md  （第三跳——依托的是散文，不是源）'));
  }
  out.push('    时效性      ' + (cur.current ? g('答案已反映每一个源') : y(cur.why)));
  out.push('');

  // --- the answer layer ---
  out.push(b('  答案层') + d('  （自然语言；承载全部意义）'));
  const rw = state.wiki.concepts.find((c) => c.file === 'wiki/concepts/远程办公.md');
  if (rw.claims.length === 0) out.push(d('    wiki/concepts/远程办公.md —— 空'));
  for (const c of rw.claims) out.push(d('    • ') + c);
  out.push('');

  // --- the open stop ---
  if (state.cycle?.stop) {
    const stop = state.cycle.stop;
    out.push('  ' + y(b('▲ Agent 停顿')) + d('  —— 之所以允许停，是因为这件事只存在于你脑子里'));
    const q = state.cycle.investigated && stop.sharpened ? stop.sharpened : stop.question;
    out.push('    ' + q);
    out.push(
      state.cycle.investigated
        ? d('    （已调查过——这是剩下的残余）')
        : d('    [i] 我先去读一遍源，带着更锋利的问题回来'),
    );
    out.push('');
  }

  // --- what the user last saw ---
  if (state.log.length) {
    out.push(b('  对话记录'));
    for (const l of state.log) out.push(d('    ' + l));
    out.push('');
  }

  // --- keys ---
  out.push(d('  ──────────────────────────────────────────────────────────────────────────'));
  if (state.cycle?.stop) {
    out.push(
      `  ${b('[y]')} ${d('回答：是')}   ${b('[n]')} ${d('回答：否')}   ${b('[i]')} ${d('先去调查')}   ${b('[q]')} ${d('退出')}`,
    );
  } else {
    out.push(
      `  ${b('[1]')} ${d('交出制度 v1')}  ${b('[2]')} ${d('交出 v2（同名）')}  ${b('[3]')} ${d('交出 v2（改名）')}`,
    );
    out.push(
      `  ${b('[空格]')} ${d('推进一个阶段')}   ${b('[l]')} ${d('声明血缘')}   ${b('[s]')} ${d(`纸面读法：${state.scopedReading ? '开' : '关'}`)}`,
    );
    out.push(
      `  ${b('[a]')} ${d('提问：远程办公')}  ${b('[o]')} ${d('提问：入职（第三跳）')}  ${b('[h]')} ${d('看历史')}  ${b('[u]')} ${d('退回一步')}`,
    );
    out.push(
      `  ${b('[x]')} ${d('腐蚀 v1 字节')}  ${b('[d]')} ${d('删除 v1 文件')}  ${b('[m]')} ${d('砸坏 manifest')}  ${b('[f]')} ${d('修复')}  ${b('[q]')} ${d('退出')}`,
    );
  }

  console.clear();
  console.log('\n' + out.join('\n') + '\n');
}

function dispatch(key) {
  if (state.cycle?.stop) {
    if (key === 'y') state = reduce(state, { type: 'ANSWER_STOP', answer: 'yes' });
    else if (key === 'n') state = reduce(state, { type: 'ANSWER_STOP', answer: 'no' });
    else if (key === 'i') state = reduce(state, { type: 'INVESTIGATE' });
    // an identity stop answered yes -> the Agent declares lineage
    const done = state.cycle?.findings?.find((f) => f.id === 'identity' && f.resolution === 'yes');
    if (done && state.lineage.length === 0) state = reduce(state, { type: 'DECLARE_LINEAGE', pair: done.pair });
    return;
  }

  switch (key) {
    case '1':
      state = reduce(state, { type: 'HANDOVER', which: 'A' });
      break;
    case '2':
      state = reduce(state, { type: 'HANDOVER', which: 'B' });
      break;
    case '3':
      state = reduce(state, { type: 'HANDOVER', which: 'B_RENAMED' });
      break;
    case ' ':
      state = reduce(state, { type: 'ADVANCE' });
      break;
    case 'l': {
      const su = lineageSuspicion(state)[0];
      if (su) state = reduce(state, { type: 'DECLARE_LINEAGE', pair: [su.a, su.b] });
      break;
    }
    case 's':
      state = reduce(state, { type: 'TOGGLE_SCOPED' });
      break;
    case 'a':
      state = reduce(state, { type: 'ASK', file: 'wiki/concepts/远程办公.md' });
      break;
    case 'o':
      state = reduce(state, { type: 'ASK', file: 'wiki/concepts/入职.md' });
      break;
    case 'h': {
      const h = history(state);
      state = {
        ...state,
        log: h.length
          ? h.map((e) => `#${e.id} 不再送出：${e.report.length ? e.report.join(' / ') : '（无损失）'}`)
          : ['还没有任何循环完成过。'],
      };
      break;
    }
    case 'u':
      state = reduce(state, {
        type: 'RESTORE',
        index: state.checkpoints.length - 2 >= 0 ? state.checkpoints.length - 2 : 0,
      });
      break;
    case 'x':
      state = reduce(state, { type: 'CORRUPT', index: 0 });
      break;
    case 'd':
      state = reduce(state, { type: 'DELETE_FILE', index: 0 });
      break;
    case 'm':
      state = reduce(state, { type: 'BREAK_MANIFEST' });
      break;
    case 'f':
      state = reduce(state, { type: 'REPAIR' });
      break;
  }
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (key) => {
  if (key === 'q' || key === '') {
    console.clear();
    process.exit(0);
  }
  dispatch(key);
  render();
});

render();
