import { useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { WaveformPanel } from './components/WaveformPanel'
import { PadGrid } from './components/PadGrid'
import { TransportBar } from './components/TransportBar'
import { TourOverlay } from './components/tutorial/TourOverlay'
import { useTutorialStore } from './stores/tutorial-store'
import './styles/theme.css'

function App(): React.JSX.Element {
  useEffect(() => {
    useTutorialStore
      .getState()
      .init()
      .then(() => {
        useTutorialStore.getState().start('general')
      })

    const unsubscribe = window.api.onMenuEvent('menu:replay-tutorials', () => {
      void useTutorialStore.getState().replay()
    })
    return unsubscribe
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="app__main">
        <WaveformPanel />
        <PadGrid />
        <TransportBar />
      </div>
      <TourOverlay />
    </div>
  )
}

export default App
