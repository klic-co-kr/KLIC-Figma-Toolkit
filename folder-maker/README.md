# Folder Maker

CSV 목록으로 통합사업 폴더를 일괄 생성하는 Windows용 도구입니다.

## CSV 형식

기본 컬럼:

```csv
템플릿번호,학교명,시스템아이디
T001,충남고등학교,SYS001
T001,천안중학교,SYS002
```

기본 폴더명:

```text
템플릿번호_학교명_시스템아이디
```

## 실행

Figma 플러그인 버튼에서 열려면 로컬 브리지를 먼저 실행합니다.

```bat
folder-maker\folder-maker-bridge.cmd
```

브리지는 `http://localhost:39573`에서 대기합니다.
Figma 플러그인 `Command Center`에서 `폴더 생성기 열기`를 누르면 이 로컬 브리지가 GUI를 엽니다.
Figma 보안 샌드박스 때문에 플러그인이 로컬 폴더를 직접 만들 수는 없습니다. GUI에서 `Select CSV`로 CSV를 업로드하고 `Preview` 또는 `Create Folders` 버튼으로 현재 `Create-Folders.ps1` 스크립트를 실행합니다.

버튼으로 실행:

```bat
folder-maker\folder-maker-gui.cmd
```

한글 파일명 실행도 지원합니다.

```bat
folder-maker\폴더생성-GUI.cmd
```

미리보기만 실행:

```bat
folder-maker\folder-create.cmd --csv folder-maker\sample.csv --out D:\사업폴더\충남학교통합
```

실제 생성:

```bat
folder-maker\folder-create.cmd --csv folder-maker\sample.csv --out D:\사업폴더\충남학교통합 --execute
```

템플릿번호별 상위 폴더를 나눠서 생성:

```bat
folder-maker\folder-create.cmd --csv folder-maker\sample.csv --out D:\사업폴더\충남학교통합 --group-by-template --execute
```

각 폴더에 Figma 템플릿 파일도 같이 복사:

```bat
folder-maker\folder-create.cmd --csv folder-maker\sample.csv --out D:\사업폴더\충남학교통합 --copy-file D:\템플릿\기본.fig --rename-copy-to-folder --execute
```

`--rename-copy-to-folder`를 쓰면 복사된 파일명이 폴더명과 같아집니다.
예: `T001_충남고등학교_SYS001\T001_충남고등학교_SYS001.fig`

## 로그

실행 결과는 출력 폴더 아래 `_folder-maker-logs`에 저장됩니다.

- `preview-*.csv`
- `created-*.csv`
- `failed-*.csv`

## 안전장치

- 기본은 dry-run입니다. `--execute` 없이는 폴더를 만들지 않습니다.
- `sample.csv`는 Excel에서 한글이 깨지지 않도록 UTF-8 BOM으로 저장되어 있습니다.
- UTF-8 BOM, UTF-8, UTF-16, Windows 기본 ANSI/CP949 계열 CSV를 자동 판별합니다.
- 쉼표, 탭, 세미콜론, 파이프 구분자를 자동 추정합니다.
- 헤더가 없으면 앞 3개 컬럼을 `템플릿번호,학교명,시스템아이디`로 간주합니다.
- `template`, `template no`, `school`, `school name`, `system id`, `sysid` 같은 영문 헤더도 자동 매핑합니다.
- Windows 금지 문자 `\ / : * ? " < > |`는 `_`로 바꿉니다.
- `--copy-file`로 지정한 Figma/template 파일을 각 폴더에 복사할 수 있습니다.
- 기본은 기존 파일을 덮어쓰지 않고 `FILE_EXISTS`로 기록합니다. 덮어쓰려면 `--overwrite-copy`를 추가합니다.
- 같은 실행 목록 안의 중복은 `DUPLICATE_IN_CSV`로 막습니다.
- 이미 존재하는 폴더는 `EXISTS`로 기록하고 건너뜁니다.
- 필수 컬럼이 비어 있으면 `MISSING_REQUIRED_FIELD`로 기록합니다.

## CSV가 더 지저분한 경우

헤더명이 완전히 다르면 컬럼명을 직접 지정할 수 있습니다.

```bat
folder-maker\folder-create.cmd --csv input.csv --out D:\사업폴더\충남학교통합 --TemplateColumn 양식번호 --SchoolColumn 기관명 --SystemColumn 시스템코드 --execute
```

파서/생성 테스트:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File folder-maker\Test-FolderMaker.ps1
```

## GUI 버튼

- `Select CSV`: CSV/TSV 파일을 선택합니다.
- `Select Folder`: 폴더를 만들 상위 폴더를 선택합니다.
- `Select File`: 각 폴더에 복사할 Figma/template 파일을 선택합니다.
- `Open sample CSV`: 예제 CSV를 엽니다.
- `Use sample CSV`: 예제 CSV를 입력값으로 넣습니다.
- `Save sample as`: 예제 CSV를 원하는 위치에 복사하고 바로 엽니다.
- `Preview`: 폴더를 만들지 않고 결과와 실패 항목을 미리 봅니다.
- `Create Folders`: 실제 폴더를 생성합니다.
- `Open output folder`: 생성 결과 폴더를 엽니다.

프로토콜 fallback을 쓰고 싶으면 한 번 등록할 수 있습니다.

```bat
folder-maker\install-protocol.cmd
```

프로토콜 등록을 제거하려면:

```bat
folder-maker\uninstall-protocol.cmd
```
