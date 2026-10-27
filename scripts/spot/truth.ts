import fs from 'node:fs';
import path from 'node:path';
import {
  SfxPlanFile,
  SfxOffsetsFile,
  SfxGainsFile,
  SfxFadesFile,
  SfxDucksFile,
  MixFile,
  MusicFile,
  SfxTypingFile,
  SyncFile,
  VoiceFile,
} from '../../src/shared/types.js';

export interface FilmAudioTruth {
  plan: SfxPlanFile;
  offsets: SfxOffsetsFile;
  gains: SfxGainsFile;
  fades: SfxFadesFile;
  ducks: SfxDucksFile;
  mix: MixFile;
  music: MusicFile;
  typing: SfxTypingFile;
  sync: SyncFile;
  /** 口播（可选：只有需要口播的片子才有 voice.json） */
  voice?: VoiceFile;
}

/**
 * 磁盘真值读写管理器：
 * 1. 严格使用 fs.readFileSync/writeFileSync 磁盘实时读写（彻底规避 ESM 模块缓存 bug）
 * 2. 写入时采用临时文件 + rename 原子写，避免并发损坏
 */
export class TruthManager {
  private audioDir: string;

  constructor(filmId: string) {
    const projectRoot = process.cwd();
    this.audioDir = path.join(projectRoot, 'src', 'films', filmId, 'audio');
    if (!fs.existsSync(this.audioDir)) {
      throw new Error(`[truth] 找不到影片声音目录: ${this.audioDir}`);
    }
  }

  // 实时读取九张真值 JSON
  readAll(): FilmAudioTruth {
    return {
      plan: this.readJson<SfxPlanFile>('sfxPlan.json'),
      offsets: this.readJson<SfxOffsetsFile>('sfxOffsets.json'),
      gains: this.readJson<SfxGainsFile>('sfxGains.json'),
      fades: this.readJson<SfxFadesFile>('sfxFades.json'),
      ducks: this.readJson<SfxDucksFile>('sfxDucks.json'),
      mix: this.readJson<MixFile>('mix.json'),
      music: this.readJson<MusicFile>('music.json'),
      typing: this.readJson<SfxTypingFile>('sfxTyping.json'),
      sync: this.readJson<SyncFile>('sync.json'),
      ...(fs.existsSync(path.join(this.audioDir, 'voice.json')) ? { voice: this.readJson<VoiceFile>('voice.json') } : {}),
    };
  }

  // 毫秒级写入单张真值
  writeJson<T>(filename: string, data: T): void {
    const targetPath = path.join(this.audioDir, filename);
    const tempPath = `${targetPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, targetPath);
  }

  write<K extends keyof FilmAudioTruth>(key: K, data: FilmAudioTruth[K]): void {
    const map: Record<keyof FilmAudioTruth, string> = {
      plan: 'sfxPlan.json',
      offsets: 'sfxOffsets.json',
      gains: 'sfxGains.json',
      fades: 'sfxFades.json',
      ducks: 'sfxDucks.json',
      mix: 'mix.json',
      music: 'music.json',
      typing: 'sfxTyping.json',
      sync: 'sync.json',
      voice: 'voice.json',
    };
    this.writeJson(map[key], data);
  }

  private readJson<T>(filename: string): T {
    const p = path.join(this.audioDir, filename);
    if (!fs.existsSync(p)) {
      throw new Error(`[truth] 文件不存在: ${p}`);
    }
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
}
