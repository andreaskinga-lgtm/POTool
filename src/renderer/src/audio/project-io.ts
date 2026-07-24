import { PadSlice, ProjectData, SerializedPadSlice } from '../types'
import { decodeAudioFile, trimBuffer } from './buffer-utils'
import { encodeWav } from './wav-export'

// ── Path helpers (no Node.js path module available in renderer) ──────────────

function joinPath(folder: string, file: string): string {
  return folder.replace(/\/$/, '') + '/' + file
}

function folderName(folderPath: string): string {
  return folderPath.replace(/\/$/, '').split('/').filter(Boolean).pop() ?? 'Untitled'
}

function fileBasename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
}

// ── Save ─────────────────────────────────────────────────────────────────────

/**
 * Saves the current project to disk.
 *
 * - If `projectPath` is null, opens a folder-picker dialog (Save As flow).
 * - Audio files are copied into the project folder using their original basenames.
 * - Duplicate source files are copied only once.
 *
 * Returns the saved folder path, or null if the user cancelled.
 */
export async function saveProject(
  pads: (PadSlice | null)[],
  projectPath: string | null
): Promise<string | null> {
  let folderPath = projectPath

  // No saved path → open "choose folder" dialog
  if (!folderPath) {
    folderPath = await window.api.saveProjectAsDialog()
    if (!folderPath) return null

    // Warn if the folder has files but no project.json (likely not a project folder)
    const files = await window.api.readDir(folderPath)
    if (files.length > 0 && !files.includes('project.json')) {
      const name = folderName(folderPath)
      const ok = window.confirm(
        `"${name}" already contains files and doesn't appear to be a POTool project.\n\nSave here anyway?`
      )
      if (!ok) return null
    }
  }

  // Build serialized pad list, deduplicated file copy list, and merged-pad WAV exports
  const serializedPads: (SerializedPadSlice | null)[] = []
  const filesToCopy: { src: string; dest: string }[] = []
  const rawWrites: { data: ArrayBuffer; dest: string }[] = []
  const seenDests = new Set<string>()

  for (const pad of pads) {
    if (!pad) {
      serializedPads.push(null)
      continue
    }

    if (!pad.filePath) {
      // Merged pad — no source file on disk; export AudioBuffer slice to WAV
      const localFile = `merged-${pad.id}.wav`
      const sliced = trimBuffer(pad.audioBuffer, pad.inPoint, pad.outPoint)
      rawWrites.push({ data: encodeWav(sliced), dest: localFile })
      serializedPads.push({
        id: pad.id,
        fileName: pad.fileName,
        inPoint: 0,
        outPoint: sliced.length,
        localFile,
        volume: pad.volume ?? 1.0
      })
      continue
    }

    const localFile = fileBasename(pad.filePath)
    serializedPads.push({
      id: pad.id,
      fileName: pad.fileName,
      inPoint: pad.inPoint,
      outPoint: pad.outPoint,
      localFile,
      volume: pad.volume ?? 1.0
    })

    if (!seenDests.has(localFile)) {
      seenDests.add(localFile)
      filesToCopy.push({ src: pad.filePath, dest: localFile })
    }
  }

  const now = new Date().toISOString()
  const projectData: ProjectData = {
    name: folderName(folderPath),
    pads: serializedPads,
    createdAt: now,
    modifiedAt: now
  }

  await window.api.saveProject(folderPath, JSON.stringify(projectData, null, 2), filesToCopy)

  // Write merged-pad WAV files (project folder is guaranteed to exist after saveProject)
  for (const { data, dest } of rawWrites) {
    await window.api.writeProjectFile(folderPath, dest, data)
  }

  return folderPath
}

// ── Load ─────────────────────────────────────────────────────────────────────

/**
 * Loads a project from a folder.
 *
 * - Reads project.json; returns null if not found (invalid folder).
 * - Decodes each unique audio file once (shared AudioBuffer for sliced pads).
 * - Sets pad.filePath to the absolute path inside the project folder so
 *   re-saving works transparently without re-reading from the original location.
 * - Shows an alert listing any pads whose audio files could not be found.
 *
 * Returns `{ name, pads }` on success, or null if no project.json exists.
 */
export async function loadProject(
  folderPath: string
): Promise<{ name: string; pads: (PadSlice | null)[] } | null> {
  const raw = (await window.api.loadProject(folderPath)) as ProjectData | null
  if (!raw) return null

  const bufferCache = new Map<string, AudioBuffer>()
  const pads: (PadSlice | null)[] = Array(16).fill(null)
  const missingPads: string[] = []

  for (let i = 0; i < raw.pads.length; i++) {
    const padData = raw.pads[i]
    if (!padData) continue

    // Legacy / failed save produced an empty localFile — skip gracefully
    if (!padData.localFile) {
      missingPads.push(`Pad ${padData.id} — ${padData.fileName} (merged pad not saved)`)
      continue
    }

    const filePath = joinPath(folderPath, padData.localFile)

    let audioBuffer = bufferCache.get(padData.localFile)
    if (!audioBuffer) {
      try {
        const arrayBuffer = await window.api.readFile(filePath)
        audioBuffer = await decodeAudioFile(arrayBuffer)
        bufferCache.set(padData.localFile, audioBuffer)
      } catch {
        missingPads.push(`Pad ${padData.id} — ${padData.fileName}`)
        continue
      }
    }

    pads[i] = {
      id: padData.id,
      filePath,
      fileName: padData.fileName,
      audioBuffer,
      inPoint: padData.inPoint,
      outPoint: padData.outPoint,
      volume: padData.volume ?? 1.0
    }
  }

  if (missingPads.length > 0) {
    alert(
      `Could not load the following pads (audio files missing):\n\n${missingPads.join('\n')}`
    )
  }

  return { name: folderName(folderPath), pads }
}
