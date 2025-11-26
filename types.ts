export interface TranscriptItem {
  id: string;
  source: 'user' | 'model';
  text: string;
  language?: string;
  isFinal: boolean;
  timestamp: Date;
}

export interface AudioStreamConfig {
  sampleRate: number;
}