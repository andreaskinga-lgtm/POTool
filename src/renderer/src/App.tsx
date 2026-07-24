import { WaveformPanel } from './components/WaveformPanel'
import { PadGrid } from './components/PadGrid'
import { TransportBar } from './components/TransportBar'
import './styles/theme.css'

function App(): React.JSX.Element {
  return (
    <div className="app">
      <WaveformPanel />
      <PadGrid />
      <TransportBar />
    </div>
  )
}

export default App

