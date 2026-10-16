// scripts/check-github-templates.mjs
// .github 템플릿과 프론트 CI가 정한 모양을 지키는지 확인한다. 저장소 루트에서 실행한다.
// YAML은 Ruby 기본 라이브러리(Psych)로 읽는다. npm 의존성 없이 돌리기 위해서다.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const must = {
  '.github/ISSUE_TEMPLATE/feature.md': ['name:', 'title: "[FEAT] "', 'labels:', '## 작업 개요', '## 할 일', '## 완료 기준', '## 참고'],
  '.github/ISSUE_TEMPLATE/bug.md': ['name:', 'title: "[BUG] "', 'labels:', '## 버그 설명', '## 재현 방법', '## 기대 결과', '## 실제 결과', '## 할 일', '## 완료 기준', '## 참고'],
  '.github/ISSUE_TEMPLATE/task.md': ['name:', 'title: "[TASK] "', 'labels:', '## 작업 개요', '## 할 일', '## 완료 기준', '## 참고'],
  '.github/ISSUE_TEMPLATE/config.yml': ['blank_issues_enabled: false'],
  '.github/pull_request_template.md': ['## 관련 이슈', 'Closes #', '## 변경 사항', '## 테스트', '## 스크린샷', '## 체크리스트'],
  '.github/workflows/frontend-ci.yml': ["'frontend/**'", 'node-version: 22', 'npm ci', 'npm run typecheck', 'npm run lint', 'npm run format:check', 'npm run test', 'npm run build'],
  'CONTRIBUTING.md': ['커밋 메시지', '브랜치', 'PR'],
};

let fail = 0;
const err = (...a) => { console.error(...a); fail++; };

for (const [f, keys] of Object.entries(must)) {
  if (!existsSync(f)) { err('없음', f); continue; }
  const s = readFileSync(f, 'utf8');
  for (const k of keys) if (!s.includes(k)) err(f, '에 없음:', k);
}

// YAML 파서로 읽기
function parseYaml(text, label) {
  const r = spawnSync('ruby', ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(STDIN.read))'], { input: text, encoding: 'utf8' });
  if (r.error) { err('ruby를 실행할 수 없어 YAML 검사를 못 함:', r.error.message); return undefined; }
  if (r.status !== 0) { err(label, 'YAML 파싱 실패:', r.stderr.trim()); return undefined; }
  return JSON.parse(r.stdout);
}

const filled = (v) => typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null;

for (const f of ['feature', 'bug', 'task'].map((n) => `.github/ISSUE_TEMPLATE/${n}.md`)) {
  if (!existsSync(f)) continue;
  const m = readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { err(f, ': front matter 없음'); continue; }
  const fm = parseYaml(m[1], f);
  if (!fm) continue;
  for (const k of ['name', 'title', 'labels']) if (!filled(fm[k])) err(f, ': front matter', k, '비어 있음');
}

const configPath = '.github/ISSUE_TEMPLATE/config.yml';
if (existsSync(configPath)) {
  const c = parseYaml(readFileSync(configPath, 'utf8'), configPath);
  if (c && c.blank_issues_enabled !== false) err(configPath, ': blank_issues_enabled가 false가 아님');
}

const ciPath = '.github/workflows/frontend-ci.yml';
if (existsSync(ciPath)) {
  const ci = parseYaml(readFileSync(ciPath, 'utf8'), ciPath);
  if (ci) {
    // YAML 1.1에서는 `on` 키가 true로 읽힌다
    const on = ci.on ?? ci.true ?? {};
    if (!on.pull_request?.paths?.includes('frontend/**')) err(ciPath, ': pull_request.paths에 frontend/** 없음');
    if (!on.push?.paths?.includes('frontend/**')) err(ciPath, ': push.paths에 frontend/** 없음');
    const job = ci.jobs?.check;
    if (!job) err(ciPath, ': jobs.check 없음');
    else {
      if (job.defaults?.run?.['working-directory'] !== 'frontend') err(ciPath, ': working-directory가 frontend가 아님');
      const steps = job.steps ?? [];
      const node = steps.find((s) => String(s.uses ?? '').startsWith('actions/setup-node'));
      if (!node || node.with?.['node-version'] != 22) err(ciPath, ': setup-node node-version 22 없음');
      const runs = steps.map((s) => s.run).filter(Boolean);
      for (const cmd of ['npm ci', 'npm run typecheck', 'npm run lint', 'npm run format:check', 'npm run test', 'npm run build']) {
        if (!runs.includes(cmd)) err(ciPath, ': run 단계 없음:', cmd);
      }
    }
  }
}

if (fail) process.exit(1);
console.log('템플릿 검사 통과');
