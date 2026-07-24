# Copilot Instructions

## Project Overview

POTool is an Electron desktop app (React + TypeScript, built with electron-vite) that functions as a 16-pad audio sampler — think Teenage Engineering Pocket Operator. Users import audio files, assign them to pads, trim in/out points, and export a single merged WAV.

## Commands

```bash
npm run dev              # Start dev server (hot reload)
npm run build            # Typecheck + build (production)
npm run build:mac        # macOS distributable
npm run build:win        # Windows distributable
npm run lint             # ESLint
npm run typecheck        # Both node + web typechecks
npm run typecheck:node   # Main process only
npm run typecheck:web    # Renderer only
npm run format           # Prettier
```

There are no automated tests.

## Architecture

Three Electron processes, each with its own tsconfig:

- **`src/main/index.ts`** — Main process. Creates the window (fixed 600×920 aspect ratio, scaled via `setZoomFactor`), registers native menus, and handles all IPC via `ipcMain.handle`. All filesystem and dialog access lives here.
- **`src/preload/index.ts`** — Exposes `window.api` to the renderer via `contextBridge`. This is the only bridge between renderer and Node.js. Its types are declared in `src/preload/index.d.ts`.
- **`src/renderer/src/`** — React app. No Node.js access; all file I/O goes through `window.api`.

### Renderer structure

```
stores/project-store.ts   ← single Zustand store (all app state)
types/index.ts            ← shared types (PadSlice, ProjectData, etc.)
audio/
  audio-engine.ts         ← Web Audio API playback (module-level singleton)
  buffer-utils.ts         ← decode, trim, merge AudioBuffers
  wav-export.ts           ← encode AudioBuffer → WAV ArrayBuffer
  project-io.ts           ← save/load project folders
  transient-detector.ts   ← auto-slice detection
components/
  App.tsx                 ← root: <WaveformPanel> + <PadGrid> + <TransportBar>
  WaveformPanel.tsx       ← panel router (overview/editor/import/sequence views)
  WaveformEditor.tsx      ← in/out point trimming with wavesurfer.js
  PadGrid.tsx             ← 16 pads, drag-and-drop, keyboard triggers
  ImportView.tsx          ← single/multi-file import flow
  SequenceView.tsx        ← full-sequence playback with timeline cursor
  TransportBar.tsx        ← play/stop, count-in, export, output device
hooks/
  use-waveform-canvas.ts  ← canvas waveform rendering hook
styles/theme.css          ← all CSS custom properties (single file)
```

## Key Conventions

### IPC pattern
Every main-process capability goes through the `window.api` bridge. Main registers with `ipcMain.handle('channel', handler)`, preload exposes it as a typed method, renderer calls `await window.api.method()`. Never add Node.js imports in the renderer.

### State management
All app state lives in the single Zustand store (`useProjectStore`). Inside React event handlers, use `useProjectStore.getState()` for immediate reads rather than stale closure values — see the `handleNew`/`handleOpen`/`handleSave` pattern in `WaveformPanel.tsx`.

### Core domain types (`src/renderer/src/types/index.ts`)
- **`PadSlice`** — live pad: holds an `AudioBuffer` + `inPoint`/`outPoint` in samples, `filePath`, `volume` (0–1).
- **`SerializedPadSlice`** — disk format: no `AudioBuffer`, uses `localFile` (basename inside project folder).
- **`PanelView`** — `'overview' | 'editor' | 'import' | 'sequence'` — controls which subview renders in `WaveformPanel`.
- **`ImportMode`** — `'single'` (one pad target) or `'multi'` (bulk import).

### Project save/load
Projects are folders. `project.json` stores serialized pad data; audio files are copied in alongside it. Merged pads (no source file path) are exported as `merged-{id}.wav`. On load, audio files are decoded once and cached by filename (`bufferCache` map in `project-io.ts`).

### Audio engine
`audio-engine.ts` is a module-level singleton (not React state). Always obtain the context via `getAudioContext()` — it lazily creates one AudioContext at 44100 Hz and resumes it if suspended. Call `stopPlayback()` before starting new playback to clean up scheduled sources.

### Pad keyboard mapping
Pads 0–15 map to keyboard rows `1234`, `qwer`, `asdf`, `zxcv` (matching a hardware grid layout). The mapping is defined in `PAD_KEYS` in `PadGrid.tsx`.

### Styling
All design tokens are CSS custom properties in `src/renderer/src/styles/theme.css`. Use `var(--color-*)`, `var(--radius-*)`, `var(--font-*)` — no hardcoded hex values in components. Class naming follows a BEM-ish convention (e.g., `pad`, `pad--loaded`, `pad--selected`).

### TypeScript config split
- `tsconfig.node.json` — main + preload (Node.js environment)
- `tsconfig.web.json` — renderer (browser environment)
- Run the matching typecheck script when editing each layer.
