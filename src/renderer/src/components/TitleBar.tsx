import { useState, useEffect } from 'react'

export function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const platform = window.api.platform
  const showControls = platform === 'win32' || platform === 'linux'

  useEffect(() => {
    if (!showControls) return
    window.api.windowIsMaximized().then(setIsMaximized)
    const offMax = window.api.onMenuEvent('window:maximized', () => setIsMaximized(true))
    const offUnmax = window.api.onMenuEvent('window:unmaximized', () => setIsMaximized(false))
    return () => {
      offMax()
      offUnmax()
    }
  }, [showControls])

  return (
    <div className={`title-bar${platform === 'darwin' ? ' title-bar--mac' : ''}`}>
      <span className="title-bar__title">POTool</span>
      {showControls && (
        <div className="title-bar__controls">
          <button
            className="title-bar__btn title-bar__btn--minimize"
            onClick={() => window.api.windowMinimize()}
            title="Minimize"
          >
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <rect width="10" height="1.5" y="0.25" fill="currentColor" />
            </svg>
          </button>
          <button
            className="title-bar__btn title-bar__btn--maximize"
            onClick={() => window.api.windowMaximize()}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="2" y="0" width="8" height="8" stroke="currentColor" strokeWidth="1.2" />
                <rect
                  x="0"
                  y="2"
                  width="8"
                  height="8"
                  fill="var(--color-surface)"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect
                  x="0.6"
                  y="0.6"
                  width="8.8"
                  height="8.8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            )}
          </button>
          <button
            className="title-bar__btn title-bar__btn--close"
            onClick={() => window.api.windowClose()}
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line
                x1="1"
                y1="1"
                x2="9"
                y2="9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="9"
                y1="1"
                x2="1"
                y2="9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
