# 일괄 자동 수리 (Batch Auto-Fix) — 설계

작성일: 2026-06-30
대상: KLIC Figma Toolkit · Command Center

## 1. 배경 & 목표

Command Center는 현재 디자인 시스템 이슈를 **탐지(detect)** 만 한다 — KWCAG 2.2/KRDS 접근성 감사, 토큰 거버넌스(중복 색상값·평면 명명), Component QA, 원시 색상(미바인딩 채우기) 탐지. 단 하나의 수리 경로 `applyColorBindings`(rgb-exact 바인딩, oklch opt-in)만 존재한다.

이 프로젝트는 **detect → fix** 루프를 닫는다. 기존 색상 바인딩을 일반화한 **통합 Fix 큐**로, 안전 등급에 따라 일괄 또는 항목별로 수리를 적용한다.

이 문서는 Design Ops 로드맵 중 첫 번째 후속 작업이다. 후속: (2) 개발자 핸드오프, (4) 팀 배포 — 각각 별도 스펙.

## 2. 범위

### 포함
- 감사 결과에 부착되는 fix provider 카탈로그 (아래 §4)
- provider 레지스트리 + 큐 수집/프리뷰/적용 엔진 (`src/code/15-fix-engine.js`)
- 안전 등급 기반 적용 정책: **A+B 일괄, C 항목별**
- Command Center 인스펙터 Fix 섹션 (집계 프리뷰 + 일괄/개별 적용)
- EN/KO i18n, 테스트 회귀, 통합 계약 갱신

### 범위 외 (YAGNI)
- 명시적 revert 버튼 — Figma 네이티브 undo로 충분
- 외부 스크립트 기반 수리 — Figma 변경은 플러그인 컨텍스트에서만 가능
- A+B+C 전체 일괄 옵션 — C는 디자인 변경이라 항목별 승인 고정

## 3. 안전 등급 정책

수리가 "무엇을 바꿔도 되는가"를 세 등급으로 구분한다. 기존 OKLCH opt-in 철학(안전한 것은 기본, 위험한 것은 명시 동의)과 일관.

| 등급 | 정의 | 적용 방식 |
|---|---|---|
| **A — 무변화/안전** | 캔버스 픽셀 변화 0 | 일괄 |
| **B — 결정적·가시적** | 캔버스 불변이나 레이어/변수 패널 변화. 결정적(judgment 불요) | 일괄 |
| **C — 디자인 변경/판단** | 시각·UX·구조를 바꾸거나 판단이 개입 | 항목별 승인 (프리뷰 before/after 후 개별 적용) |

> **KRDS 명명 분리 결정**: 공공데이터 표준 용어 기반 레이어/프레임 리네임은 "명명"이지만 용어 매핑에 판단이 개입해 오역 위험이 있다. 일괄로 적용하면 틀린 용어가 파일 전체에 박힌다. 따라서 KRDS 명명은 결정적 B 등급이 아니라 **C·제안(suggestion)** 으로 분류하여 항목별 승인을 강제한다. 기계적 명명 수정(기본명·공백)과 스타일가이드 토큰명 정규화만 B 등급 일괄에 포함한다.

## 4. Fix Provider 카탈로그

| 등급 | providerId | 동작 | 소스 감사 |
|---|---|---|---|
| A | `bindRawColor` | 원시 SOLID 색상 → rgb-exact 토큰 바인딩 (*기존 `applyColorBindings` 로직 편입*) | paint 분석 |
| A | `trimNodeName` | 노드명 앞뒤 공백·중복 공백 제거 | 거버넌스/명명 |
| B | `renameDefaultName` | `Frame 123`·`Rectangle 5` 등 Figma 기본명 → 컨텍스트 기반 의미명 | 거버넌스/명명 |
| B | `normalizeTokenCase` | style-guide-viewer_ver2.md 정규 토큰명 컨벤션에 맞춰 케이스/구분자 통일 | 거버넌스 |
| B | `consolidateDuplicateToken` | 중복 색상값 변수 → 정규 토큰에 재바인딩 후 중복 변수 삭제 | `runTokenGovernance` |
| C | `fixContrast` | 대비 미달 → KRDS/KWCAG 통과 최근접 명도로 보정 (델타 프리뷰) | `runKwcagKrdsAudit` |
| C | `addFocusState` | 누락 포커스 상태 variant 추가 | `runComponentQa` |
| C | `fixTargetSize` | 타깃 크기 미달 → 최소 권장 크기로 보정 | `runKwcagKrdsAudit` |
| C·제안 | `suggestKrdsName` | 공공데이터 표준 용어 기반 레이어/프레임명 **제안** (오역 위험 → 일괄 금지) | 거버넌스/명명 |

## 5. 아키텍처

### Fix 디스크립터
각 감사 함수는 fixable issue item에 선택적 `fix` 디스크립터를 부착한다. 감사 로직 자체는 변경하지 않고 디스크립터 부착만 추가한다.

```js
// 감사 결과 item.fix
{
  providerId: 'bindRawColor',
  tier: 'A',                      // 'A' | 'B' | 'C'
  targetId: '4106:1822',          // 대상 노드/변수 id
  label: 'Bind to KLIC Smoke Test/Smoke/Primary',
  preview: { before: '#7426EB raw', after: 'var → Brand/Primary' },
  // apply 는 엔진이 providerId 로 디스패치 (디스크립터에 함수 직렬화 금지)
  payload: { /* provider-specific 적용 인자 */ }
}
```

> `apply`는 디스크립터에 함수로 담지 않는다(메시지 직렬화 불가). 엔진이 `providerId`로 provider 구현을 디스패치하고 `payload`를 전달한다.

### Fix 엔진 — `src/code/15-fix-engine.js` (신규)
- **provider 레지스트리**: `providerId → { tier, apply(payload) }` 맵
- **수집**: `command-collect-fixes` 수신 → 스캔(기존 selection/page 범위·scanLimit 재사용) → 감사 실행 → fix 디스크립터 수집 → `command-fixes-preview` 응답(등급별 집계 + 항목 목록)
- **일괄 적용**: `command-apply-fixes { tier: 'AB' }` → A+B provider를 단일 작업으로 적용, `command-fixes-applied` 응답
- **개별 적용**: `command-apply-fixes { ids: [...] }` → 지정 C 항목 적용
- **안전 가드**: `tier: 'AB'` 경로는 C 및 C·제안 provider를 절대 포함하지 않음 (회귀 테스트로 강제)

`applyColorBindings`는 `bindRawColor` provider로 이전한다. 기존 메시지(`command-apply-color-bindings`)는 호환을 위해 유지하되 내부적으로 엔진을 호출한다.

### 빌드 순서
`build-toolkit.mjs`의 `codeSources` 배열에 `src/code/15-fix-engine.js`를 `10-command-center.js`와 `20-menu-generator.js` 사이에 삽입한다.

## 6. 데이터 흐름 & Undo

1. 사용자가 Fix 섹션에서 스캔 트리거 → `command-collect-fixes`
2. 엔진이 감사 실행, fix 디스크립터 수집 → `command-fixes-preview` (등급별 집계: *"리네임 11 · 재바인딩 4 · 중복통합 2 · [C] 검토 3"*)
3. **A+B 일괄**: 사용자가 "일괄 수리" 클릭 → `command-apply-fixes {tier:'AB'}` → 엔진이 전체를 **하나의 Figma 작업**으로 적용 → 한 번의 Ctrl+Z로 전체 롤백. KLIC 변경 로그(인스펙터 undo log)에 요약 기록
4. **C 항목별**: 각 항목 카드에 before/after·델타 프리뷰 + 개별 "적용" 버튼 → `command-apply-fixes {ids:[id]}`

복구 모델: **프리뷰 + Figma 네이티브 undo.** 적용 전 집계 프리뷰로 확인하고, 적용 후에는 네이티브 undo가 단일 단위로 롤백. 별도 영속 revert 저장은 하지 않는다.

## 7. UI

Command Center 인스펙터에 **Fix** 섹션 추가:
- 등급별 카운트 칩 (A/B 합산 + C 검토 필요 수)
- 1차 액션: **"A+B 일괄 수리"** 버튼 (활성 시 적용 대상 수 표시)
- C 항목 리스트: 항목별 before/after 프리뷰 + 개별 적용 버튼, KRDS 제안은 별도 그룹으로 "제안" 라벨 표기
- 적용 후 결과 토스트: *"수리 17건 적용 — Ctrl+Z로 전체 취소"*
- 모든 문자열 EN/KO i18n. 기존 프리뷰/undo log/severity 패턴 재사용.

## 8. 테스트

기존 검증 규율(로컬 프리플라이트 → 실 Figma 스모크 증거)을 따른다.

### `run-smoke-test-mock.mjs` 회귀
- `bindRawColor` 일괄 적용이 boundVariables 설정
- `renameDefaultName` 이 `Frame 123` → 의미명 변환, 기본명 아닌 이름은 미변경
- `consolidateDuplicateToken` 이 중복 변수 삭제 + 노드 재바인딩
- `fixContrast` 가 통과 명도 산출 (항목별 경로)
- **안전 가드**: `tier:'AB'` 적용이 `fixContrast`·`suggestKrdsName` 등 C provider를 절대 적용하지 않음
- A+B 일괄이 단일 작업으로 묶이는지(undo 단위) 검증

### `verify-integration.mjs`
- 신규 메시지 계약: `command-collect-fixes`, `command-fixes-preview`, `command-apply-fixes`, `command-fixes-applied`
- 신규 함수: 엔진 등록/수집/적용, 각 provider
- 신규 i18n 키 EN/KO 양쪽 존재
- `build-toolkit.mjs` codeSources에 `15-fix-engine.js` 포함

### 게이트
- `node build-toolkit.mjs --check` 통과
- `run-local-verification.mjs` 전체 통과
- 실 Figma 데스크탑에서 일괄 수리 실행 → 스모크 증거 JSON 갱신 → `run-completion-audit.mjs --runtime-evidence` 통과

## 9. 모듈 경계 요약

| 단위 | 역할 | 의존 |
|---|---|---|
| `15-fix-engine.js` | provider 레지스트리, 큐 수집·프리뷰·적용, 안전 가드 | 감사 함수(읽기), Figma API 래퍼 |
| 각 감사 함수 (`10-command-center.js`) | fix 디스크립터 부착 (로직 불변) | — |
| `src/ui/app.js` Fix 섹션 | 프리뷰 렌더, 일괄/개별 적용 트리거 | i18n, 메시지 |

각 provider는 독립적으로 테스트 가능하고, 새 감사가 추가되면 fix 디스크립터만 부착하면 엔진이 자동 수용한다.
