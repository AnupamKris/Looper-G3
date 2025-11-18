
export enum TrackStatus {
  EMPTY = 'EMPTY',
  ARMED = 'ARMED', // Waiting for next loop start to record
  RECORDING = 'RECORDING',
  PLAYING = 'PLAYING',
  STOPPED = 'STOPPED', // Has data but not playing
}

export interface TrackData {
  id: number;
  status: TrackStatus;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  isLooping: boolean; // Toggle for repeating buffer within the loop duration
  buffer: AudioBuffer | null;
  color: string;
}

export interface LooperSettings {
  bpm: number;
  beatsPerBar: number; // Time Signature (numerator)
  bars: number;
  metronomeActive: boolean;
  metronomeVolume: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentBeat: number; // 1-N based on time signature
  currentBar: number; // 1 to N
  progress: number; // 0.0 to 1.0 of the full loop
  totalTime: number;
}

export type DrumInstrument = 'KICK' | 'SNARE' | 'HIHAT' | 'CLAP' | 'TOM' | 'SHAKER' | 'COWBELL' | 'CRASH';

export interface DrumPattern {
  [key: string]: boolean[]; // Key is instrument name, value is array of steps
}

export interface DrumTrack {
  id: number;
  name: string;
  pattern: DrumPattern;
  volume: number;
  isMuted: boolean;
}
