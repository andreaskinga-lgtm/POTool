import type { TourId } from '../types'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TourStep {
  /** data-tour value of the element this step points at; omit for a centered card */
  target?: string
  title: string
  body: string
  placement?: TourPlacement
}

export const TOUR_STEPS: Record<TourId, TourStep[]> = {
  general: [
    {
      title: 'Welcome to POTool',
      body: 'POTool is a 16-pad sampler designed to make it easy to manage your samples on the PO-33 KO. Load audio onto pads, trim each slice, then play, sequence, and export them as one merged WAV. This quick tour covers the basics.',
      placement: 'center'
    },
    {
      target: 'waveform-panel',
      title: 'The waveform panel',
      body: 'This panel shows your project overview, and switches to the waveform editor whenever a pad is selected. Use New / Open / Save to manage project folders, and Import to load a file containing multiple samples \u2014 you\u2019ll slice it into pieces and drop them onto pads.',
      placement: 'bottom'
    },
    {
      target: 'pad-grid',
      title: 'The pad grid',
      body: 'Click an empty pad to import audio onto it. Loaded pads can be clicked to play, dragged onto each other to move/copy/swap/merge, and are also triggered from your keyboard (1234 / qwer / asdf / zxcv).',
      placement: 'top'
    },
    {
      target: 'transport-play',
      title: 'Play the full sequence',
      body: 'Play runs through all loaded pads back-to-back. Enable Count-in for a lead-in beat. The Lofi checkbox enables a bitcrushed/downsampled sound that replicates the sounds of the PO-33 itself. Keep in mind that checking this box will also affect the sound of exported WAV files, so you may want to uncheck it before exporting unless you want to double compress the audio when you load it onto your PO.',
      placement: 'top'
    },
    {
      target: 'transport-export',
      title: 'Export your project',
      body: 'When you\u2019re happy with your pads, Export renders everything into a single merged WAV file.',
      placement: 'top'
    }
  ],
  import: [
    {
      target: 'import-autoslice',
      title: 'Auto-Slice',
      body: 'Automatically detects transients in the file and slices it into up to 16 regions for you.',
      placement: 'bottom'
    },
    {
      target: 'import-sensitivity',
      title: 'Sensitivity & slice count',
      body: 'Sensitivity controls how aggressively Auto-Slice looks for transients. Slices caps how many regions it will create.',
      placement: 'bottom'
    },
    {
      target: 'import-op1-slices',
      title: 'OP-1 embedded slices',
      body: 'Some files (like those downloaded from OP1.fun) embed their own slice markers. When detected, this button loads those exact slices instead of guessing.',
      placement: 'bottom'
    },
    {
      target: 'import-gain',
      title: 'Gain',
      body: 'Amplifies the waveform display (not the audio itself) so you can see quiet transients more clearly while slicing.',
      placement: 'bottom'
    },
    {
      target: 'import-zoom',
      title: 'Zoom',
      body: 'Zoom in on the waveform for more precise slice placement, or reset to see the whole file.',
      placement: 'bottom'
    },
    {
      target: 'import-wavesurfer',
      title: 'Manual slicing',
      body: 'Double-click to start a new slice, click again to set its end (right-click to cancel). Right click on an existing slice to delete it. Drag existing slice regions or their edges to adjust them. When you\u2019re happy with your slices, click Import to drop them onto the pads.',
      placement: 'top'
    }
  ],
  padEditing: [
    {
      target: 'editor-wavesurfer',
      title: 'In/out points',
      body: 'Drag the highlighted region or its edges to change where this pad starts and stops playing.',
      placement: 'bottom'
    },
    {
      target: 'editor-gain',
      title: 'Gain',
      body: 'Amplifies the waveform display so quiet parts of the sample are easier to see \u2014 this doesn\u2019t change playback volume.',
      placement: 'bottom'
    },
    {
      target: 'editor-zoom',
      title: 'Zoom',
      body: 'Zoom in for precise trimming, or reset to view the entire sample.',
      placement: 'bottom'
    },
    {
      target: 'editor-volume',
      title: 'Volume',
      body: 'Sets this pad\u2019s playback level. Double-click the slider to reset it to 100%.',
      placement: 'top'
    },
    {
      target: 'editor-speed',
      title: 'Speed',
      body: 'Changes this pad\u2019s playback rate/pitch. Double-click the slider to reset it to 1x.',
      placement: 'top'
    },
    {
      target: 'editor-delete',
      title: 'Delete',
      body: 'Removes the sample from this pad entirely, leaving it empty.',
      placement: 'left'
    }
  ]
}
