// 依存パッケージの監査ゲート（開発用を含む全依存）。
// high / critical の勧告が 1 件でもあれば失敗する。ただし ACCEPTED に理由付きで載せた勧告だけは通す。
// ACCEPTED に載せてよいのは「修正版がまだ存在せず、本番の実行時には含まれない」と確認できたものだけ。
// 本番の依存は CI の別ステップ（npm audit --omit=dev --audit-level=high）が例外なしで検査する。
// 使い方: 監査したい package-lock.json があるディレクトリで `node <このファイル>` を実行する。
import { execSync } from 'node:child_process';

// 例: ['GHSA-xxxx-xxxx-xxxx', '修正版が無い理由と、開発用ツールだけで使われる根拠'],
// 2026-11-18: GHSA-fc5q-39xc-vjpf（picomatch）は GitHub が勧告を取り下げたため削除した。
const ACCEPTED = new Map([]);

let report;
try {
  report = JSON.parse(execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch (e) {
  report = JSON.parse(e.stdout); // 脆弱性があると npm audit は 0 以外で終わる
}

const blocking = new Map();
const accepted = new Map();
for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = String(via.url ?? '').split('/').pop();
    (ACCEPTED.has(id) ? accepted : blocking).set(id, `${via.name} ${via.range} — ${via.title}`);
  }
}

for (const [id, what] of accepted) console.log(`許容（理由付き）: ${id} ${what}\n  理由: ${ACCEPTED.get(id)}`);
if (blocking.size) {
  for (const [id, what] of blocking) console.error(`要対応: ${id} ${what}`);
  console.error(
    '\nhigh 以上の脆弱性があります。直し方: npm audit で修正版を確認して更新する。修正版が無く、開発用ツールだけで使われると' +
      '確認できた場合に限り、.github/scripts/audit-gate.mjs の ACCEPTED に勧告 ID と理由を追加する。',
  );
  process.exit(1);
}
console.log('audit gate: OK');
