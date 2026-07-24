export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}): React.JSX.Element {
  return (
    <>
      <button className="btn-zoom" onClick={onZoomIn} title="Zoom in">
        +
      </button>
      <button className="btn-zoom" onClick={onZoomReset} title="Reset zoom">
        ⊙
      </button>
      <button className="btn-zoom" onClick={onZoomOut} title="Zoom out">
        −
      </button>
    </>
  )
}
