declare module 'audiobuffer-to-wav' {
  export default function toWav(buffer: AudioBuffer, options?: { float32?: boolean }): ArrayBuffer
}
