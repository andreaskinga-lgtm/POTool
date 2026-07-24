import { useProjectStore } from '../stores/project-store'

export function ProjectOverview(): React.JSX.Element {
  const projectName = useProjectStore((s) => s.projectName)
  const pads = useProjectStore((s) => s.pads)
  const totalDuration = useProjectStore((s) => s.totalDuration)
  const isOverBudget = useProjectStore((s) => s.isOverBudget)

  const duration = totalDuration()
  const loadedCount = pads.filter((p) => p !== null).length
  const percentage = Math.min(100, (duration / 40) * 100)

  return (
    <div className="project-overview">
      <div className="project-overview__name">{projectName}</div>
      <div className="project-overview__stats">
        {loadedCount} / 16 pads loaded
      </div>
      <div className="time-bar">
        <div
          className={`time-bar__fill ${isOverBudget() ? 'time-bar__fill--over' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={`project-overview__stats ${isOverBudget() ? 'transport-bar__time--over' : ''}`}>
        {duration.toFixed(1)}s / 40.0s
      </div>
    </div>
  )
}
