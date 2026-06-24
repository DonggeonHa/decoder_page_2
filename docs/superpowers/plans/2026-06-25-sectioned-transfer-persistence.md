# Sectioned Transfer Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 100-frame transfer sections and browser persistence so large QR transfers can be completed section by section.

**Architecture:** Keep the FILE:V2 payload unchanged. The decoder continues collecting one global file stream, while protocol helpers derive 100-frame section summaries and missing ranges from the global collector. Browser state is saved to IndexedDB after each accepted chunk and restored on page load.

**Tech Stack:** Plain JavaScript modules, IndexedDB, JSP/Tomcat, existing Node tests, existing Maven JSP compile check.

---

### Task 1: Protocol Helpers

**Files:**
- Modify: `protocol.js`
- Modify: `tests/protocol.test.mjs`

- [ ] Add failing tests for `getSectionSummaries`, `serializeFileCollector`, and `hydrateFileCollector`.
- [ ] Implement helpers without changing FILE:V2 parsing or assembly behavior.
- [ ] Run `npm test -- tests/protocol.test.mjs`.

### Task 2: Decoder UI and Persistence

**Files:**
- Create: `storage.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/static-app.test.mjs`

- [ ] Add failing static tests for `sectionList`, `restoreState`, `saveCollectorState`, and `clearCollectorState`.
- [ ] Add section dashboard markup and persistence module.
- [ ] Save collector state after each accepted scan, restore on page load, and clear on reset/download completion only when reset is explicit.
- [ ] Run `npm test -- tests/static-app.test.mjs`.

### Task 3: JSP Section Send Mode

**Files:**
- Modify: `artifacts/file-qr-sender.jsp`
- Modify: `tests/jsp-generator.test.mjs`

- [ ] Add failing tests for `section` send mode, `sectionNumber`, and `SECTION_SIZE`.
- [ ] Add JSP helpers to build a 100-frame section range.
- [ ] Add form controls and generated summary for section mode.
- [ ] Run `npm test -- tests/jsp-generator.test.mjs`.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run `npm test`.
- [ ] Run `mvn -q -f tools/jsp-dev-server/pom.xml compile`.
- [ ] POST to local JSP with section mode and verify a 100-frame response.
- [ ] Smoke test decoder in Chrome with local server and verify section UI plus IndexedDB restore.
- [ ] Commit and push only tracked source/test/docs changes.
