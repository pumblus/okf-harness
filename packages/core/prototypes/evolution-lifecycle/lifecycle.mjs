/**
 * THROWAWAY PROTOTYPE — not production code. See ./README.md.
 *
 * QUESTION (issue #60): does a small public two-source evolution scenario make the
 * proposed lifecycle, automatic path, stop behavior, source lineage, and final answer
 * surface understandable and usable through one prompt-first entrypoint?
 *
 * This module is the pure half: a reducer plus derived selectors. No I/O, no terminal.
 * The state model encodes the decisions from #55 (six stages), #57 (stop contract,
 * two-hop seal), #58 (zero proposal state, checkpoint on stage 5), #59 (three axes),
 * and #66 (three zero-semantics verbs).
 *
 * The load-bearing split under test: STORED state is only what cannot be reproduced
 * from the substrate. Everything else is a selector computed on demand.
 *
 * User-facing strings are Chinese; code comments stay English because they cite the
 * decisions on the map.
 */

export const STAGES = [
  { key: 'capture', label: '捕获' },
  { key: 'revision-identity', label: '修订身份' },
  { key: 'impact-analysis', label: '影响分析' },
  { key: 'reconcile-write', label: '调和与写入' },
  { key: 'verify-complete', label: '校验与完成' },
  { key: 'currency-seal', label: '时效封印' },
];

// ---------------------------------------------------------------------------
// The public two-source scenario. Fictional, generic, disposable.
// ---------------------------------------------------------------------------

const SOURCE_A = {
  source_id: 'src_a1f3',
  original: '远程办公制度.md',
  sha256: 'a1f3',
  claims: ['远程办公每周上限 2 天。', '远程办公需经理批准。', '办公室周五闭馆。'],
};

const SOURCE_B = {
  source_id: 'src_b7c9',
  original: '远程办公制度.md', // same basename, different hash -> suspicion fires
  sha256: 'b7c9',
  claims: [
    '远程办公每周上限 3 天。',
    '远程办公需经理批准。',
    '团队负责人须公布每周驻场日。',
    // silent on Fridays
  ],
};

/** B handed over under a new name: lineage suspicion goes quiet (the false negative). */
const SOURCE_B_RENAMED = { ...SOURCE_B, original: '远程办公制度-v2.md' };

export const CATALOG = { A: SOURCE_A, B: SOURCE_B, B_RENAMED: SOURCE_B_RENAMED };

// ---------------------------------------------------------------------------
// Findings produced by stage 3. Each carries #59 axis-3 coordinates.
//   signal present + readable   -> automatic
//   signal present + unreadable -> stop is possible
//   signal absent               -> cannot stop; report only
// ---------------------------------------------------------------------------

function findingsForB(scopedReading) {
  return [
    {
      id: 'addition',
      kind: '补充',
      signal: true,
      readable: true,
      claim: '团队负责人须公布每周驻场日。',
      note: '全新主张，不顶替任何东西。',
    },
    {
      id: 'cap',
      kind: scopedReading ? '取代' : '矛盾',
      signal: true,
      readable: scopedReading,
      claim: '远程办公上限从 2 天变为 3 天。',
      note: scopedReading
        ? 'v2 明说自己整体取代 v1，读法就写在纸面上。'
        : '纸面上没有任何文字说明 v2 是取代 v1，还是适用于不同人群。',
      displaces: '远程办公每周上限 2 天。',
      question: 'v2 把上限提到 3 天。它是取代了 2 天上限，还是两者并存？',
      sharpened:
        'v2 只改了上限那一行，既无适用范围限定、也无生效日期、更没提到 v1。' +
        '这读起来像是直接取代——是吗？',
    },
    {
      id: 'fridays',
      kind: '疑似删除',
      signal: true,
      readable: false,
      claim: 'v2 对"办公室周五闭馆"只字未提。',
      note: '沉默有三种读法：已删除、已挪走、或只是没重复。',
      displaces: '办公室周五闭馆。',
      question: 'v2 完全没提周五。这条制度是被取消了吗？',
      sharpened:
        'v2 是同一份文档的全文重写，不是增量补丁，且其适用范围一节仍然覆盖办公时间——' +
        '所以这个沉默不太像是遗漏。周五闭馆是被取消了吗？',
    },
    {
      // #59's sharpest case: coexistence that exists only in the user's head.
      // No signal at all -> the Agent cannot see a question, so it cannot stop.
      // The only remaining defense is the completion report.
      id: 'unsignalled',
      kind: '无人写下的并存',
      signal: false,
      readable: false,
      claim: '2 天上限被静默覆盖。',
      note: '你知道客服团队仍按旧上限执行。但磁盘上没有任何地方写着这件事。',
      displaces: '远程办公每周上限 2 天（客服团队豁免）。',
    },
  ];
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function initialState() {
  return {
    // --- STORED: manifest rows (the map used to compute every chain) ---
    manifest: { valid: true, sources: [] },

    // --- STORED: physical bytes on disk, immutable by construction ---
    disk: {},

    // --- STORED: the answer layer. Prose only; carries all meaning. ---
    wiki: {
      references: [], // { file, source_id }
      concepts: [
        {
          file: 'wiki/concepts/远程办公.md',
          cites: ['wiki/references/远程办公制度.md'], // hop 2
          claims: [],
        },
        {
          file: 'wiki/concepts/入职.md',
          cites: ['wiki/concepts/远程办公.md'], // hop 3 — never sealed by Harness
          claims: ['新人在入职第一周会被告知远程办公制度。'],
        },
      ],
    },

    // --- STORED: pure addressing, written only by Harness, declared by the Agent ---
    lineage: [], // { from: source_id, to: source_id }

    // --- STORED: the one bit #58 keeps. Harness raises; only the Agent lowers. ---
    dangling: [],

    // --- STORED: git stand-in. Each entry holds ONLY the non-reproducible judgment. ---
    checkpoints: [],

    // --- SESSION-ONLY: the cycle lives in Agent context, never on disk (#58 §1) ---
    cycle: null,

    scopedReading: false, // toggle: is the cap change readable on the page?
    log: [],
  };
}

function say(state, line) {
  return { ...state, log: [...state.log.slice(-6), line] };
}

// ---------------------------------------------------------------------------
// SELECTORS — reproducible facts. Computed on demand, never stored (#59 axis 1).
// ---------------------------------------------------------------------------

/** "Same basename, different hash" — a pure function of the manifest. */
export function lineageSuspicion(state) {
  const out = [];
  const rows = state.manifest.sources;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].original === rows[j].original && rows[i].sha256 !== rows[j].sha256) {
        out.push({ a: rows[i].source_id, b: rows[j].source_id, original: rows[i].original });
      }
    }
  }
  return out;
}

/** #57: Harness seals what it can prove. Anchored -> two hops. Unanchored -> workspace. */
export function seal(state) {
  if (!state.manifest.valid) {
    return {
      scope: 'workspace',
      conditions: ['MANIFEST_INVALID'],
      files: state.wiki.concepts.map((c) => c.file),
      why: 'manifest 是用来算链条的那张地图。它坏了，任何"只有这些文件受影响"的说法都没有依据。',
    };
  }

  const conditions = [];
  const anchors = [];

  for (const row of state.manifest.sources) {
    const bytes = state.disk[row.source_id];
    if (!bytes) {
      conditions.push({ code: 'SOURCE_MISSING', source_id: row.source_id });
      anchors.push(row.source_id);
    } else if (bytes.hash !== row.sha256) {
      conditions.push({
        code: 'SOURCE_HASH_DRIFT',
        source_id: row.source_id,
        expected: row.sha256,
        actual: bytes.hash,
      });
      anchors.push(row.source_id);
    }
  }
  for (const ref of state.wiki.references) {
    if (!state.manifest.sources.some((s) => s.source_id === ref.source_id)) {
      conditions.push({ code: 'REFERENCE_SOURCE_MISSING', source_id: ref.source_id });
      anchors.push(ref.source_id);
    }
  }

  if (conditions.length === 0) return { scope: 'none', conditions: [], files: [] };

  const files = new Set();
  for (const id of anchors) {
    const hop1 = state.wiki.references.filter((r) => r.source_id === id);
    for (const ref of hop1) {
      files.add(ref.file);
      for (const c of state.wiki.concepts) {
        if (c.cites.includes(ref.file)) files.add(c.file); // hop 2 — the last physically-backed hop
      }
    }
  }
  return {
    scope: 'chain',
    conditions,
    files: [...files],
    why: '一个概念引用另一个概念时，它依托的是同辈的散文，而非源本身。第三跳是意义。',
  };
}

/** #66 §3: history is computed from the substrate and lives OUTSIDE the evidence pipeline. */
export function history(state) {
  return state.checkpoints.map((c) => ({ id: c.id, report: c.report }));
}

/** The currency seal (#55 stage 6): is every registered source reconciled into the answer layer? */
export function currency(state) {
  if (state.dangling.length > 0) {
    return { current: false, why: `尚未调和：${state.dangling.join(', ')}` };
  }
  const unsynthesized = state.manifest.sources.filter(
    (s) => !state.wiki.references.some((r) => r.source_id === s.source_id),
  );
  if (unsynthesized.length > 0) {
    return {
      current: false,
      why: `已注册但未综合：${unsynthesized.map((s) => s.source_id).join(', ')}`,
    };
  }
  return { current: true };
}

// ---------------------------------------------------------------------------
// REDUCER
// ---------------------------------------------------------------------------

export function reduce(state, action) {
  switch (action.type) {
    case 'HANDOVER': {
      const src = CATALOG[action.which];
      if (state.manifest.sources.some((s) => s.source_id === src.source_id)) {
        return say(state, `已经注册过了：${src.original}`);
      }
      // Stage 1 — capture. The only Harness ERROR here is physical.
      const next = {
        ...state,
        manifest: {
          ...state.manifest,
          sources: [
            ...state.manifest.sources,
            { source_id: src.source_id, original: src.original, sha256: src.sha256 },
          ],
        },
        disk: { ...state.disk, [src.source_id]: { hash: src.sha256, claims: src.claims } },
        cycle: {
          stage: 'capture',
          sourceId: src.source_id,
          findings: [],
          stop: null,
          investigated: false,
          report: [],
        },
      };
      return say(next, `已捕获 ${src.original}，登记为不可变快照（#${src.sha256}）。`);
    }

    case 'ADVANCE': {
      if (!state.cycle) return say(state, '当前没有进行中的循环。先交出一个源。');
      if (state.cycle.stop) return say(state, '有一个停顿未答复，必须先回答它。');
      return advance(state);
    }

    case 'INVESTIGATE': {
      const stop = state.cycle?.stop;
      if (!stop) return state;
      if (state.cycle.investigated) return say(state, '能读的都读完了。剩下的残余只有你能判断。');
      // #57 §6: investigating never repairs. It returns with a SHARPER question.
      return say({ ...state, cycle: { ...state.cycle, investigated: true } }, '读完了源，问题已收窄。');
    }

    case 'ANSWER_STOP': {
      const stop = state.cycle?.stop;
      if (!stop) return state;
      const finding = state.cycle.findings.find((f) => f.id === stop.findingId);
      const resolved = state.cycle.findings.map((f) =>
        f.id === stop.findingId ? { ...f, resolution: action.answer } : f,
      );
      let next = {
        ...state,
        cycle: { ...state.cycle, findings: resolved, stop: null, investigated: false },
      };
      next = say(next, `你回答了「${action.answer === 'yes' ? '是' : '否'}」——${finding.question}`);
      return nextStopOrStage(next);
    }

    case 'DECLARE_LINEAGE': {
      // Harness owns the write; the Agent owns the judgment (#58 §2).
      const [from, to] = action.pair;
      return say(
        {
          ...state,
          lineage: [...state.lineage, { from, to }],
          dangling: [...new Set([...state.dangling, to])], // Harness raises
        },
        `已声明：${to} 修订 ${from}。Harness 升起了"调和悬空"标记位。`,
      );
    }

    case 'ASK': {
      const s = seal(state);
      const concept = state.wiki.concepts.find((c) => c.file === action.file);
      if (s.files.includes(action.file)) {
        return say(state, `拒答（${action.file}）——物理受损的知识永不作为答案送出。`);
      }
      if (!concept || concept.claims.length === 0) {
        return say(state, `送达（${action.file}）——但这里还没有综合出任何内容。`);
      }
      return say(state, `送达（${action.file}）：「${concept.claims[0]}」`);
    }

    // --- physical damage, to exercise the seal ---
    case 'CORRUPT': {
      const id = state.manifest.sources[action.index]?.source_id;
      if (!id) return state;
      return say(
        { ...state, disk: { ...state.disk, [id]: { ...state.disk[id], hash: 'dead' } } },
        `${id} 的字节在 manifest 底下被改动了。`,
      );
    }
    case 'DELETE_FILE': {
      const id = state.manifest.sources[action.index]?.source_id;
      if (!id) return state;
      const disk = { ...state.disk };
      delete disk[id];
      return say({ ...state, disk }, `快照 ${id} 已从磁盘上消失。`);
    }
    case 'BREAK_MANIFEST':
      return say(
        { ...state, manifest: { ...state.manifest, valid: !state.manifest.valid } },
        state.manifest.valid ? 'manifest 已损坏。' : 'manifest 已修好。',
      );
    case 'REPAIR': {
      const disk = {};
      for (const row of state.manifest.sources) {
        disk[row.source_id] = {
          hash: row.sha256,
          claims: CATALOG[row.sha256 === 'a1f3' ? 'A' : 'B'].claims,
        };
      }
      return say({ ...state, disk }, '物理损坏已修复。');
    }

    case 'TOGGLE_SCOPED':
      return say(
        { ...state, scopedReading: !state.scopedReading },
        !state.scopedReading
          ? 'v2 现在明说自己取代 v1——上限变更变得可读了。'
          : 'v2 不再说明自己与 v1 的关系——上限变更变得不可读了。',
      );

    case 'RESTORE': {
      // #66: the Agent relays. It judges WHICH completion, never WHETHER.
      const cp = state.checkpoints[action.index];
      if (!cp) return say(state, '没有这个完成点。');
      return say(
        {
          ...state,
          wiki: cp.wikiSnapshot,
          checkpoints: state.checkpoints.slice(0, action.index + 1),
          cycle: null,
        },
        `已退回到那次完成，它当时报告：「${cp.report[0] ?? '（无知识损失）'}」`,
      );
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Stage machine
// ---------------------------------------------------------------------------

function advance(state) {
  const i = STAGES.findIndex((s) => s.key === state.cycle.stage);
  const nextStage = STAGES[i + 1];
  if (!nextStage) return { ...state, cycle: null };

  const cycle = { ...state.cycle, stage: nextStage.key };
  let next = { ...state, cycle };

  switch (nextStage.key) {
    case 'revision-identity': {
      const suspicion = lineageSuspicion(next).find(
        (s) => s.b === cycle.sourceId || s.a === cycle.sourceId,
      );
      if (!suspicion) {
        return say(next, '阶段 2：没有同名碰撞。读起来像一个全新的源。（假阴性？）');
      }
      if (next.lineage.length === 0) {
        // Identity in doubt: the answer lives only in the user's head (#57 §4).
        return {
          ...say(next, '阶段 2：两个同名文件，内容不同。'),
          cycle: {
            ...cycle,
            stop: {
              kind: 'agent',
              findingId: 'identity',
              question: `有两个都叫 ${suspicion.original} 的文件，内容不一样。新的这个是旧的那个的修订版吗？`,
              sharpened: `新的 ${suspicion.original} 保留了 v1 的标题和章节顺序，只改了三行。它看着像同一份文档的下一版——是吗？`,
            },
            findings: [
              ...cycle.findings,
              {
                id: 'identity',
                question: `${suspicion.b} 是 ${suspicion.a} 的修订版吗？`,
                pair: [suspicion.a, suspicion.b],
              },
            ],
          },
        };
      }
      return say(next, '阶段 2：血缘已声明。');
    }

    case 'impact-analysis': {
      if (
        next.cycle.sourceId !== CATALOG.B.source_id &&
        next.cycle.sourceId !== CATALOG.B_RENAMED.source_id
      ) {
        return say(next, '阶段 3：没有既有知识可比对。一切都是新增。');
      }
      const findings = findingsForB(next.scopedReading);
      next = { ...next, cycle: { ...next.cycle, findings: [...next.cycle.findings, ...findings] } };
      next = say(next, `阶段 3：${findings.length} 条发现。可读的自动处理，不可读的才停。`);
      return nextStopOrStage(next);
    }

    case 'reconcile-write': {
      // The Agent overwrites prose. The wiki records the present, not its own past (#59).
      const src = state.disk[next.cycle.sourceId];
      const refFile = 'wiki/references/远程办公制度.md';
      const references = next.wiki.references.some((r) => r.source_id === next.cycle.sourceId)
        ? next.wiki.references
        : [
            ...next.wiki.references.filter((r) => r.file !== refFile),
            { file: refFile, source_id: next.cycle.sourceId },
          ];

      const concepts = next.wiki.concepts.map((c) =>
        c.file === 'wiki/concepts/远程办公.md' ? { ...c, claims: [...(src?.claims ?? [])] } : c,
      );

      // Every finding that displaces a prior claim owes the report a line (#59).
      const report = next.cycle.findings
        .filter((f) => f.displaces)
        .filter((f) => f.resolution !== 'no')
        .map((f) => f.displaces);

      return say(
        { ...next, wiki: { references, concepts }, cycle: { ...next.cycle, report } },
        '阶段 4：散文由 Agent 直接覆写。不存在任何暂存区。',
      );
    }

    case 'verify-complete': {
      const s = seal(next);
      if (s.scope !== 'none') {
        return say(
          next,
          `阶段 5：check 发现物理损坏（${s.conditions.map((c) => c.code ?? c).join(', ')}）。不封存检查点。`,
        );
      }
      // The Agent lowers the dangling bit by declaring reconciliation done.
      const dangling = next.dangling.filter((d) => d !== next.cycle.sourceId);
      const cp = {
        id: next.checkpoints.length + 1,
        report: next.cycle.report,
        wikiSnapshot: next.wiki,
      };
      return say(
        { ...next, dangling, checkpoints: [...next.checkpoints, cp] },
        '阶段 5：check 通过。检查点已封存——而它本身就是下一轮的恢复点。',
      );
    }

    case 'currency-seal': {
      const c = currency(next);
      next = say(
        next,
        c.current ? '阶段 6：答案现已反映该修订。不再送出任何陈旧主张。' : `阶段 6：未达成时效（${c.why}）。`,
      );
      return { ...next, cycle: null };
    }
  }
  return next;
}

/** Open the next stop the axis-3 rules permit, or fall through to the next stage. */
function nextStopOrStage(state) {
  const pending = state.cycle.findings.find((f) => f.signal && !f.readable && !f.resolution && f.question);
  if (pending) {
    return {
      ...state,
      cycle: {
        ...state.cycle,
        stop: {
          kind: 'agent',
          findingId: pending.id,
          question: pending.question,
          sharpened: pending.sharpened,
        },
      },
    };
  }
  return state;
}
