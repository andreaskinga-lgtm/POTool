import { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import {
  playSequence,
  stopPlayback,
  getOutputDevices,
  setOutputDevice
} from '../audio/audio-engine'
import { exportCombinedWav } from '../audio/wav-export'

export function TransportBar(): React.JSX.Element {
  const pads = useProjectStore((s) => s.pads)
  const playbackState = useProjectStore((s) => s.playbackState)
  const countInEnabled = useProjectStore((s) => s.countInEnabled)
  const totalDuration = useProjectStore((s) => s.totalDuration)
  const isOverBudget = useProjectStore((s) => s.isOverBudget)
  const setPlaybackState = useProjectStore((s) => s.setPlaybackState)
  const setCurrentPlayingPad = useProjectStore((s) => s.setCurrentPlayingPad)
  const setCountInEnabled = useProjectStore((s) => s.setCountInEnabled)
  const setPanelView = useProjectStore((s) => s.setPanelView)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')

  const hasLoadedPads = pads.some((p) => p !== null)
  const duration = totalDuration()

  useEffect(() => {
    loadDevices()
  }, [])

  async function loadDevices(): Promise<void> {
    try {
      // Need to request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        stream.getTracks().forEach((t) => t.stop())
      })
      const outputDevices = await getOutputDevices()
      setDevices(outputDevices)
      if (outputDevices.length > 0 && !selectedDevice) {
        setSelectedDevice(outputDevices[0].deviceId)
      }
    } catch {
      // Permission denied or no devices
    }
  }

  async function handleDeviceChange(deviceId: string): Promise<void> {
    setSelectedDevice(deviceId)
    await setOutputDevice(deviceId)
  }

  function handlePlay(): void {
    if (playbackState === 'playing') {
      stopPlayback()
      setPlaybackState('idle')
      setCurrentPlayingPad(null)
      return
    }

    setPanelView('sequence')
    setPlaybackState('playing')

    playSequence(pads, countInEnabled, {
      onPadStart: (padIndex) => {
        setCurrentPlayingPad(padIndex)
      },
      onComplete: () => {
        setPlaybackState('idle')
        setCurrentPlayingPad(null)
      }
    })
  }

  async function handleExport(): Promise<void> {
    const wavData = exportCombinedWav(pads)
    if (!wavData) return
    await window.api.saveWav(wavData)
  }

  return (
    <div className="transport-bar">
      <button
        className={`transport-bar__btn ${playbackState === 'playing' ? 'transport-bar__btn--active' : ''}`}
        onClick={handlePlay}
        disabled={!hasLoadedPads}
        title={playbackState === 'playing' ? 'Stop' : 'Play All'}
      >
        {playbackState === 'playing' ? '■' : '▶'}
      </button>

      <div className="transport-bar__divider" />

      <select
        className="transport-bar__select"
        value={selectedDevice}
        onChange={(e) => handleDeviceChange(e.target.value)}
      >
        {devices.length === 0 && <option value="">Default</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Device ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>

      <label className="transport-bar__checkbox">
        <input
          type="checkbox"
          checked={countInEnabled}
          onChange={(e) => setCountInEnabled(e.target.checked)}
        />
        Count-in
      </label>

      <div className="transport-bar__spacer" />

      <span className={`transport-bar__time ${isOverBudget() ? 'transport-bar__time--over' : ''}`}>
        {duration.toFixed(1)}s / 40s
      </span>

      <div className="transport-bar__divider" />

      <button className="btn-export" onClick={handleExport} disabled={!hasLoadedPads}>
        Export
      </button>
    </div>
  )
}
