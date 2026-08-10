import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import { WaveformEditor } from './WaveformEditor'
import { ImportView } from './ImportView'
import { SequenceView } from './SequenceView'
import { saveProject, loadProject } from '../audio/project-io'

export function WaveformPanel(): React.JSX.Element {
  const panelView = useProjectStore((s) => s.panelView)

  const [isLoading, setIsLoading] = useState(false)
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const saveMenuRef = useRef<HTMLDivElement>(null)

  // Close save dropdown when clicking outside
  useEffect(() => {
    if (!showSaveMenu) return
    function onMouseDown(e: MouseEvent): void {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setShowSaveMenu(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showSaveMenu])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleImportClick(): void {
    useProjectStore.getState().setImportMode('multi')
  }

  function handleNew(): void {
    const { pads, clearAll } = useProjectStore.getState()
    if (pads.some((p) => p !== null)) {
      if (!window.confirm('Start a new project? Unsaved changes will be lost.')) return
    }
    clearAll()
  }

  async function handleOpen(): Promise<void> {
    const { pads } = useProjectStore.getState()
    if (pads.some((p) => p !== null)) {
      if (!window.confirm('Open a project? The current project will be lost.')) return
    }
    const folderPath = await window.api.openProjectDialog()
    if (!folderPath) return
    setIsLoading(true)
    try {
      const result = await loadProject(folderPath)
      if (!result) {
        alert('No project found in this folder.')
        return
      }
      const { loadPads, setProjectPath, setProjectName } = useProjectStore.getState()
      loadPads(result.pads)
      setProjectPath(folderPath)
      setProjectName(result.name)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave(forceDialog = false): Promise<void> {
    setShowSaveMenu(false)
    const { pads, projectPath } = useProjectStore.getState()
    const savedPath = await saveProject(pads, forceDialog ? null : projectPath)
    if (savedPath) {
      const { setProjectPath, setProjectName } = useProjectStore.getState()
      const name = savedPath.replace(/\/$/, '').split('/').filter(Boolean).pop() ?? 'Untitled'
      setProjectPath(savedPath)
      setProjectName(name)
    }
  }

  // ── Menu event listeners ───────────────────────────────────────────────────

  useEffect(() => {
    const unsubs = [
      window.api.onMenuEvent('menu:new-project', handleNew),
      window.api.onMenuEvent('menu:open-project', () => void handleOpen()),
      window.api.onMenuEvent('menu:save-project', () => void handleSave(false)),
      window.api.onMenuEvent('menu:save-project-as', () => void handleSave(true))
    ]
    return () => unsubs.forEach((u) => u())
    // handleNew/handleOpen/handleSave use getState() — always fresh, safe with [] deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  let title = ''
  switch (panelView) {
    case 'overview':
    case 'sequence':
      title = 'Project'
      break
    case 'editor':
      title = 'Editor'
      break
    case 'import':
      title = 'Import'
      break
  }

  return (
    <div className="waveform-panel" data-tour="waveform-panel">
      <div className="waveform-panel__header">
        <span className="waveform-panel__title">{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="btn-sm" onClick={handleNew}>
            New
          </button>
          <button className="btn-sm" onClick={() => void handleOpen()} disabled={isLoading}>
            Open
          </button>

          {/* Split Save button */}
          <div ref={saveMenuRef} style={{ position: 'relative', display: 'flex' }}>
            <button
              className="btn-sm"
              style={{ borderRadius: '4px 0 0 4px', borderRight: 'none' }}
              onClick={() => void handleSave(false)}
              disabled={isLoading}
            >
              Save
            </button>
            <button
              className="btn-sm"
              style={{ borderRadius: '0 4px 4px 0', padding: '4px 5px', fontSize: 9 }}
              onClick={() => setShowSaveMenu((v) => !v)}
              disabled={isLoading}
              aria-label="Save options"
            >
              ▾
            </button>
            {showSaveMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 2,
                  background: 'var(--color-surface-light)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  zIndex: 100,
                  minWidth: 100,
                  overflow: 'hidden'
                }}
              >
                <button
                  className="btn-sm"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 0,
                    border: 'none'
                  }}
                  onClick={() => void handleSave(true)}
                >
                  Save As…
                </button>
              </div>
            )}
          </div>

          {panelView !== 'import' && (
            <button className="btn-import" onClick={handleImportClick}>
              Import
            </button>
          )}
        </div>
      </div>

      <div className="waveform-panel__content">
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12
            }}
          >
            Loading…
          </div>
        ) : (
          <>
            {(panelView === 'overview' || panelView === 'sequence') && <SequenceView />}
            {panelView === 'editor' && <WaveformEditor />}
            {panelView === 'import' && <ImportView />}
          </>
        )}
      </div>
    </div>
  )
}
