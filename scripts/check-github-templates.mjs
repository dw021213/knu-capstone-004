// scripts/check-github-templates.mjs
// .github 템플릿과 프론트 CI가 정한 모양을 지키는지 확인한다. 저장소 루트에서 실행한다.
// YAML은 Ruby 기본 라이브러리(Psych)로 읽는다. npm 의존성 없이 돌리기 위해서다.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ISSUE_SECTIONS = ['## 작업 개요', '## 할 일', '## 완료 기준', '## 참고'];
const CI_STEPS = ['npm ci', 'npm run typecheck', 'npm run lint', 'npm run format:check', 'npm run test', 'npm run build'];

const must = {
  '.github/ISSUE_TEMPLATE/feature.md': ['name:', 'title: "[FEAT] "', 'labels:', ...ISSUE_SECTIONS],
  '.github/ISSUE_TEMPLATE/bug.md': ['name:', 'title: "[BUG] "', 'labels:', ...ISSUE_SECTIONS, '## 버그 설명', '## 재현 방법', '## 기대 결과', '## 실제 결과'],
  '.github/ISSUE_TEMPLATE/task.md': ['name:', 'title: "[TASK] "', 'labels:', ...ISSUE_SECTIONS],
  '.github/ISSUE_TEMPLATE/config.yml': ['blank_issues_enabled: false'],
  '.github/pull_request_template.md': ['## 관련 이슈', 'Closes #', '## 변경 사항', '## 테스트', '## 스크린샷', '## 체크리스트'],
  '.github/workflows/frontend-ci.yml': ["'frontend/**'", 'node-version: 22', ...CI_STEPS],
  'CONTRIBUTING.md': ['## 브랜치', '## 커밋 메시지', '## PR'],
};

let fail = 0;
const err = (...a) => { console.error(...a); fail++; };

for (const [f, keys] of Object.entries(must)) {
  if (!existsSync(f)) { err('없음', f); continue; }
  const s = readFileSync(f, 'utf8');
  for (const k of keys) if (!s.includes(k)) err(f, '에 없음:', k);
}

// 마크다운을 `## 제목` 단위로 나눈다. 키는 제목 줄 그대로('## 할 일').
function sections(text) {
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^(## .+?)\s*$/);
    if (h) { cur = h[1]; out[cur] = ''; continue; }
    if (cur) out[cur] += line + '\n';
  }
  return out;
}

// YAML 파서로 읽기
function parseYaml(text, label) {
  const r = spawnSync('ruby', ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(STDIN.read))'], { input: text, encoding: 'utf8' });
  if (r.error) { err('ruby를 실행할 수 없어 YAML 검사를 못 함:', r.error.message); return undefined; }
  if (r.status !== 0) { err(label, 'YAML 파싱 실패:', r.stderr.trim()); return undefined; }
  return JSON.parse(r.stdout);
}

const filled = (v) => typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null;

// 이슈 템플릿: front matter와 할 일 체크박스
for (const f of ['feature', 'bug', 'task'].map((n) => `.github/ISSUE_TEMPLATE/${n}.md`)) {
  if (!existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { err(f, ': front matter 없음'); continue; }
  const fm = parseYaml(m[1], f);
  if (fm) for (const k of ['name', 'title', 'labels']) if (!filled(fm[k])) err(f, ': front matter', k, '비어 있음');
  const todo = sections(text.slice(m[0].length))['## 할 일'];
  if (todo !== undefined && !/^\s*- \[ \]/m.test(todo)) err(f, ': ## 할 일 절에 체크박스(- [ ]) 없음');
}

const configPath = '.github/ISSUE_TEMPLATE/config.yml';
if (existsSync(configPath)) {
  const c = parseYaml(readFileSync(configPath, 'utf8'), configPath);
  if (c && c.blank_issues_enabled !== false) err(configPath, ': blank_issues_enabled가 false가 아님');
}

// 프론트 CI
const ciPath = '.github/workflows/frontend-ci.yml';
if (existsSync(ciPath)) {
  const ci = parseYaml(readFileSync(ciPath, 'utf8'), ciPath);
  if (ci) {
    // YAML 1.1에서는 `on` 키가 true로 읽힌다
    const on = ci.on ?? ci.true;
    if (!on || typeof on !== 'object' || Array.isArray(on)) err(ciPath, ': on이 트리거별 설정 형태가 아님');
    else {
      for (const t of Object.keys(on)) {
        if (t !== 'pull_request' && t !== 'push') err(ciPath, ': 허용하지 않는 트리거:', t);
      }
      for (const t of ['pull_request', 'push']) {
        const paths = on[t]?.paths;
        if (!Array.isArray(paths) || paths.length !== 1 || paths[0] !== 'frontend/**') {
          err(ciPath, `: ${t}.paths가 ['frontend/**'] 하나가 아님:`, JSON.stringify(paths));
        }
        if (on[t]?.['paths-ignore']) err(ciPath, `: ${t}에 paths-ignore가 있음`);
      }
    }
    const job = ci.jobs?.check;
    if (!job) err(ciPath, ': jobs.check 없음');
    else {
      if ('if' in job) err(ciPath, ': jobs.check에 if 조건이 있음');
      if (job['continue-on-error']) err(ciPath, ': jobs.check에 continue-on-error가 있음');
      if (job.defaults?.run?.['working-directory'] !== 'frontend') err(ciPath, ': working-directory가 frontend가 아님');
      const steps = job.steps ?? [];
      const node = steps.find((s) => String(s.uses ?? '').startsWith('actions/setup-node'));
      if (!node || node.with?.['node-version'] != 22) err(ciPath, ': setup-node node-version 22 없음');
      for (const cmd of CI_STEPS) {
        const step = steps.find((s) => s.run === cmd);
        if (!step) { err(ciPath, ': run 단계 없음:', cmd); continue; }
        if ('if' in step) err(ciPath, ': run 단계에 if 조건이 있음:', cmd);
        if (step['continue-on-error']) err(ciPath, ': run 단계에 continue-on-error가 있음:', cmd);
      }
    }
  }
}

// CONTRIBUTING: 절마다 핵심 내용
const contribPath = 'CONTRIBUTING.md';
if (existsSync(contribPath)) {
  const sec = sections(readFileSync(contribPath, 'utf8'));
  const branch = sec['## 브랜치'] ?? '';
  const commit = sec['## 커밋 메시지'] ?? '';
  const pr = sec['## PR'] ?? '';
  if (!branch.includes('feat/')) err(contribPath, ': ## 브랜치 절에 feat/ 규칙 없음');
  if (!branch.split('\n').some((l) => l.includes('main') && l.includes('직접 푸시'))) err(contribPath, ': ## 브랜치 절에 main 직접 푸시 금지 없음');
  for (const t of ['feat', 'fix', 'docs', 'refactor', 'test', 'chore']) {
    if (!commit.includes('`' + t + '`')) err(contribPath, ': ## 커밋 메시지 절 type 목록에 없음:', t);
  }
  if (!/`(feat|fix|docs|style|refactor|test|chore)\((frontend|backend|repo)\): [^`]+`/.test(commit)) err(contribPath, ': ## 커밋 메시지 절에 예시 한 줄 없음');
  if (!pr.includes('Closes #')) err(contribPath, ': ## PR 절에 Closes # 없음');
  if (!pr.split('\n').some((l) => l.includes('CI') && l.includes('통과'))) err(contribPath, ': ## PR 절에 CI 통과 조건 없음');
}

if (fail) process.exit(1);
console.log('템플릿 검사 통과');
