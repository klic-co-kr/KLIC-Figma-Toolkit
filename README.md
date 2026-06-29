<div align="center">

<br/>

# KLIC Figma Toolkit

<p>
  <img src="https://img.shields.io/badge/Figma_Plugin-v0.1.0-7426EB?style=for-the-badge&logo=figma&logoColor=white" alt="Figma Plugin"/>
  <img src="https://img.shields.io/badge/API-1.0.0-0B204B?style=for-the-badge" alt="API 1.0.0"/>
  <img src="https://img.shields.io/badge/언어-EN_·_한국어-FAB937?style=for-the-badge" alt="한국어/영어"/>
  <img src="https://img.shields.io/badge/네트워크-오프라인_전용-555?style=for-the-badge" alt="오프라인"/>
</p>

<br/>

**메뉴 페이지 · 스타일 가이드 · 테이블 · 진단 센터**<br/>
네 가지 Design Ops 도구를 하나의 Figma 플러그인으로

<br/>

</div>

---

## 개요

KLIC Figma Toolkit은 디자이너와 개발자가 Figma 내에서 반복 작업을 줄이고, 디자인 시스템의 일관성을 유지할 수 있도록 만든 사내 전용 플러그인입니다.

기존에 분리 운영되던 세 가지 플러그인(메뉴 페이지 생성기, 스타일 가이드 변수 생성기, 테이블 생성기)을 단일 인터페이스로 통합하고, **Command Center** — 파일 진단·색상 토큰 바인딩·핸드오프 내보내기를 담당하는 허브 — 를 추가했습니다.

외부 네트워크 접근 없이 완전히 오프라인으로 동작합니다.

---

## 도구

| | 모듈 | 역할 |
|---|---|---|
| 🎯 | **Command Center** | 파일 진단, 색상 변수 바인딩, 토큰 내보내기, 리포트 생성 |
| 📄 | **Menu Page Generator** | CSV·URL·HTML 입력으로 메뉴 계층 페이지 일괄 생성 |
| 🎨 | **Style Guide Generator** | 디자인 토큰 변수 생성, 스타일 가이드 보드 드로잉, 컴포넌트 자동화 |
| 📊 | **Table Builder** | 변수 기반 스타일 적용 테이블 생성 (통합·분리·HTML 입력) |

<br/>

### 🎯 Command Center

파일 상태를 한눈에 파악하고 교정합니다.

- **파일 스캔** — 선택 영역 또는 현재 페이지의 모든 노드를 분석해 원시 색상(바인딩되지 않은 채우기), 명도 대비 위험, 명명 문제를 집계
- **색상 토큰 바인딩** — RGB 정확 일치(즉시 적용 가능)와 OKLCH 지각적 근사(델타 미리보기 후 명시적 동의 필요)를 구분하여 제안
- **토큰 내보내기** — CSS 변수 + JSON + **DTCG/W3C Design Tokens** 포맷으로 핸드오프 패키지 생성 (감사 지표·출처 요약 포함)
- **접근성 감사 (KWCAG 2.2 · KRDS)** — 텍스트/비텍스트 명도 대비, 타깃 크기 등 한국형 웹접근성 지침 점검
- **Component QA** — variant 커버리지, 명명, 포커스 상태, 오토레이아웃 위생 점검
- **토큰 거버넌스** — 중복 색상값, 평면적 명명 등 토큰 리스크 감사
- **리포트 생성** — 캔버스에 `KLIC Design System Report` 보드를 직접 생성
- **런타임 스모크 테스트** — 변수 API, 노드 바인딩, 컴포넌트 variant, pluginData 영속성을 검증하고 복사 가능한 증거 JSON 출력

> **매칭 정책**: 반투명 페인트(opacity < 1.0)는 자동 바인딩하지 않습니다. OKLCH 제안은 디자이너가 델타 수치를 확인한 뒤 명시적으로 적용해야 합니다.

<br/>

### 📄 Menu Page Generator

CSV 또는 수동 입력으로 다단계 메뉴 구조를 Figma 페이지로 변환합니다.

- 최대 4단계 계층 지원 (`1차` ~ `4차` 열 자동 감지, fill-down 적용)
- `분류` 열 기준으로 생성 대상 행 필터링
- URL·HTML·CSV 세 가지 입력 방식 지원
- 기본 제공 샘플 CSV(`메뉴샘플.csv`) 로드 기능 포함

<br/>

### 🎨 Style Guide Generator

`style-guide-viewer_ver2.md` 형식의 마크다운 파일을 읽어 Figma 변수와 보드를 자동 생성합니다.

```
[Pretendard]

## Colors
- **Brand Colors**: Primary(`#7426EB`), Secondary(`#0B204B`), Accent(`#FAB937`)
- **Semantic/Danger**: Base(`#DE3412`), BG(`#FDEFEC`), ...

## Typography
## Spacing & Radius
## Button / Input
```

- **변수 생성** — Brand, Semantic, Spacing, Radius 등 89개 토큰을 Figma 로컬 변수로 등록
- **보드 드로잉** — 색상 스워치, 타이포그래피 스케일, 스페이싱 시각화
- **컴포넌트 생성** — 버튼(S·M·L / Primary·Secondary·Gray·States), 인풋(S·M)
- **JSON 가져오기/내보내기** — 토큰 라운드트립 지원 (MD 원본 + 메타 포함)

<br/>

### 📊 Table Builder

로컬 변수를 활용한 Figma 테이블을 빠르게 생성합니다.

- 통합 셀 / 분리 셀 / HTML 테이블 세 가지 입력 모드
- 생성 시 현재 파일의 로컬 COLOR 변수를 자동으로 불러와 적용

---

## 시작하기

### 요구사항

- Figma 데스크탑 앱
- Node.js (로컬 검증 스크립트 실행용)

### 플러그인 설치

1. Figma 데스크탑 앱 실행
2. **Plugins → Development → Import plugin from manifest...**
3. `klic-figma-toolkit/manifest.json` 선택
4. 플러그인 메뉴에서 **KLIC Figma Toolkit** 실행

> Figma에서 실행하기 전에 아래 로컬 검증을 먼저 통과시키세요.

---

## 개발자 가이드

### 로컬 검증

빌드 시스템 없이 Node.js 스크립트로 모든 검증이 이루어집니다.

```bash
# 커밋 전 필수 — 전체 프리플라이트
node klic-figma-toolkit/run-local-verification.mjs
```

프리플라이트는 다음 게이트를 순서대로 실행합니다:

| 스크립트 | 검증 항목 |
|---|---|
| `verify-integration.mjs` | 메시지 타입 계약, i18n 키 완전성, 임베드 MD 일치 여부 |
| `run-ui-roundtrip-smoke.mjs` | 스타일 가이드 JSON 내보내기/가져오기 라운드트립, EN/KO DOM |
| `run-smoke-test-mock.mjs` | 변수 API 비동기 래퍼, OKLCH 정책, 출처 요약, 핸드오프 내보내기 |
| `validate-smoke-evidence.mjs` | 런타임 스모크 증거 JSON 구조 검증 |
| `validate-style-token-json.mjs` | 내보낸 스타일 토큰 JSON 구조 검증 |

```bash
# 개별 게이트 실행
node klic-figma-toolkit/verify-integration.mjs
node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs
node klic-figma-toolkit/run-smoke-test-mock.mjs

# 내보낸 파일 검증
node klic-figma-toolkit/validate-smoke-evidence.mjs path/to/smoke-evidence.json
node klic-figma-toolkit/validate-style-token-json.mjs path/to/tokens.json

# 최종 완료 감사 (실제 Figma 런타임 증거 필요)
node klic-figma-toolkit/run-completion-audit.mjs --runtime-evidence path/to/smoke-evidence.json
```

런타임 수용 절차는 [`RUNTIME_CHECKLIST.md`](klic-figma-toolkit/RUNTIME_CHECKLIST.md)를 참고하세요.

<br/>

### 아키텍처

```
klic-figma-toolkit/
├── manifest.json          # Figma 플러그인 선언 (networkAccess: "*", documentAccess: dynamic-page)
├── build-toolkit.mjs      # src/ → code.js + ui.html 번들 빌드
├── src/
│   ├── code/              # 플러그인 백엔드 소스 (Figma 샌드박스 — Node.js API 없음)
│   │   ├── 00-bootstrap.js        # showUI + 메시지 라우터
│   │   ├── 10-command-center.js   # 진단·바인딩·내보내기·접근성 감사
│   │   ├── 20-menu-generator.js
│   │   ├── 30-style-guide.js
│   │   └── 40-table-builder.js
│   └── ui/                # 플러그인 UI 소스 (브라우저 iframe)
│       ├── index.html · styles.css · i18n.js · app.js
├── code.js                # ⚙️ 생성된 번들 — 직접 수정 금지
└── ui.html                # ⚙️ 생성된 번들 — 직접 수정 금지
```

> **소스는 `src/`** — `code.js`·`ui.html`은 `build-toolkit.mjs`가 생성하는 번들입니다.
> 백엔드는 `src/code/`, UI는 `src/ui/`를 수정한 뒤 빌드하세요.
>
> ```bash
> node klic-figma-toolkit/build-toolkit.mjs          # 번들 재생성
> node klic-figma-toolkit/build-toolkit.mjs --check  # 번들 동기화 검증 (CI 게이트)
> ```

**메시지 통신 구조**

```
ui.html                               code.js (Figma 샌드박스)
─────────────────────                 ─────────────────────────────
parent.postMessage(pluginMessage) ──→ figma.ui.onmessage
window.onmessage               ←──── figma.ui.postMessage
```

**메시지 네임스페이스**

| 접두사 | 담당 모듈 |
|---|---|
| `command-*` | Command Center |
| `menu-*` | Menu Page Generator |
| `style-*` | Style Guide Generator |
| `table-*` | Table Builder |

**주요 제약**

- `code.js`·`ui.html`은 생성된 번들 — 직접 수정 금지. `src/`를 고치고 `build-toolkit.mjs`로 재빌드 (`run-source-split-check.mjs`가 동기화 강제)
- `src/code/`는 Figma 샌드박스 대상 — 기존 스타일(`var`, 일반 함수 선언) 유지. `src/ui/`는 브라우저 iframe이라 최신 JS 사용 가능
- Figma 변수·페이지 API는 반드시 `src/code/`의 비동기 래퍼 함수(`commandGetLocalVariables` 등)를 통해 호출 — `dynamic-page` 모드에서 동기 API는 예외 발생
- `style-guide-viewer_ver2.md`와 `메뉴샘플.csv`는 `src/ui/app.js`에 리터럴로 임베드 — 파일 수정 시 임베드 값도 동기화 (`verify-integration.mjs`가 바이트 단위 일치 검증)

---

## 디자인 시스템

플러그인이 생성하는 Figma 변수의 기준이 되는 KLIC 디자인 시스템 토큰 요약입니다.

**타이포그래피** — Pretendard

| 역할 | 크기 | 굵기 |
|---|---|---|
| 타이틀1 | 40px | 800 |
| 타이틀2 | 32px | 700 |
| 타이틀3 | 24px | 700 |
| 본문강조 | 20px | 600 |
| 본문 | 18px | 400 |
| 최소 | 16px | 400 |

**색상**

| 역할 | 색상 | Hex |
|---|---|---|
| Brand Primary | 🟣 | `#7426EB` |
| Brand Secondary | 🔵 | `#0B204B` |
| Brand Accent | 🟡 | `#FAB937` |
| Semantic Danger | 🔴 | `#DE3412` |
| Semantic Warning | 🟠 | `#9E6A00` |
| Semantic Success | 🟢 | `#228738` |
| Semantic Info | 🔷 | `#0B78CB` |

**간격** — 최소 2px, 4px / 기본 8px~120px (8의 배수)

**모서리** — 최소 2px, 4px / 기본 8px~40px (8의 배수) / 최대 99999px (pill)

---

## 출처 추적

플러그인이 생성하는 모든 최상위 노드에는 `pluginData('klic.meta')` 태그가 기록됩니다.

```json
{
  "tool": "menu | style | table",
  "version": "0.1.0",
  "generatedAt": "2026-06-30T00:00:00.000Z",
  "sourceName": "메뉴샘플.csv",
  "selectedCategories": ["콘텐츠"],
  "rowCount": 14
}
```

Command Center의 스냅샷 및 핸드오프 내보내기는 이 데이터를 기반으로 출처 요약을 구성합니다.

---

<div align="center">

<br/>

© KLIC · Internal Design Ops Tooling · [klic-figma-toolkit/RUNTIME_CHECKLIST.md](klic-figma-toolkit/RUNTIME_CHECKLIST.md)

<br/>

</div>
