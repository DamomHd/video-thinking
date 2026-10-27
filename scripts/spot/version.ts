import fs from 'node:fs';
import path from 'node:path';
import { TruthManager } from './truth.js';

export interface VersionMetadata {
  id: string;
  tag: string;
  createdAt: string;
  note?: string;
  /** 九张真值 */
  files: string[];
  /** 这一版用到的配乐 WAV（相对 public/），连同分析与改编记录一起随版本固定 */
  tracks?: { cueId: string; file: string; copied: boolean }[];
  /** out/<片>/music/<段>/ 下的 analysis.json / adapt.json 快照 */
  musicRecords?: string[];
}

/**
 * 混音真值版本快照管理器 (Mix Snapshot Manager)
 * 供 Agent 动手改真值前自动备份快照，以及人工在工作台一键撤销
 */
export class VersionService {
  private versionsDir: string;
  private truthMgr: TruthManager;

  constructor(private filmId: string) {
    const projectRoot = process.cwd();
    this.versionsDir = path.join(projectRoot, 'out', filmId, 'versions');
    fs.mkdirSync(this.versionsDir, { recursive: true });
    this.truthMgr = new TruthManager(filmId);
  }

  /**
   * 保存一版混音快照（对标 architecture.html §18.2 的「混音版本快照」）：
   * WORK 表（九张真值）+ 各段的 WAV + 分析与改编记录，一起固定下来。
   * WAV 用硬链接存，所以一版快照几乎不占空间；盘不支持硬链接时退回拷贝。
   */
  save(tag = 'snapshot', note = ''): VersionMetadata {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const versionId = `ver_${timestamp}_${tag}`;
    const snapDir = path.join(this.versionsDir, versionId);
    fs.mkdirSync(snapDir, { recursive: true });

    const truth = this.truthMgr.readAll();
    const files = [
      'sfxPlan.json',
      'sfxOffsets.json',
      'sfxGains.json',
      'sfxFades.json',
      'sfxDucks.json',
      'mix.json',
      'music.json',
      'sfxTyping.json',
      'sync.json',
    ];

    const audioDir = path.join(process.cwd(), 'src', 'films', this.filmId, 'audio');
    for (const f of files) {
      const src = path.join(audioDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(snapDir, f));
      }
    }

    // 配乐 WAV：硬链接进快照，保证「这一版听到的就是这一版的曲子」
    const tracks: NonNullable<VersionMetadata['tracks']> = [];
    const mediaDir = path.join(snapDir, 'media');
    for (const cue of truth.music.cues) {
      if (!cue.track?.file) continue;
      const src = path.join(process.cwd(), 'public', cue.track.file);
      if (!fs.existsSync(src)) {
        tracks.push({ cueId: cue.id, file: cue.track.file, copied: false });
        continue;
      }
      fs.mkdirSync(mediaDir, { recursive: true });
      const dst = path.join(mediaDir, `${cue.id}-${path.basename(cue.track.file)}`);
      let copied = true;
      try {
        if (!fs.existsSync(dst)) fs.linkSync(src, dst);
      } catch {
        try {
          fs.copyFileSync(src, dst);
        } catch {
          copied = false;
        }
      }
      tracks.push({ cueId: cue.id, file: cue.track.file, copied });
    }

    // 分析与改编记录
    const musicRecords: string[] = [];
    const recordsRoot = path.join(process.cwd(), 'out', this.filmId, 'music');
    if (fs.existsSync(recordsRoot)) {
      const recDir = path.join(snapDir, 'music');
      for (const cueDir of fs.readdirSync(recordsRoot)) {
        for (const name of ['analysis.json', 'adapt.json']) {
          const src = path.join(recordsRoot, cueDir, name);
          if (!fs.existsSync(src)) continue;
          fs.mkdirSync(path.join(recDir, cueDir), { recursive: true });
          fs.copyFileSync(src, path.join(recDir, cueDir, name));
          musicRecords.push(`music/${cueDir}/${name}`);
        }
      }
    }

    const meta: VersionMetadata = {
      id: versionId,
      tag,
      createdAt: new Date().toISOString(),
      note,
      files,
      tracks,
      musicRecords,
    };

    fs.writeFileSync(path.join(snapDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    console.log(
      `[version] 快照已保存 -> ${versionId} (tag: ${tag})` +
        `；真值 ${files.length} 张、配乐 ${tracks.filter((t) => t.copied).length}/${tracks.length} 条、记录 ${musicRecords.length} 份`
    );
    return meta;
  }

  // 2. 列出所有快照
  list(): VersionMetadata[] {
    if (!fs.existsSync(this.versionsDir)) return [];
    const entries = fs.readdirSync(this.versionsDir, { withFileTypes: true });
    const list: VersionMetadata[] = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const metaFile = path.join(this.versionsDir, ent.name, 'meta.json');
        if (fs.existsSync(metaFile)) {
          try {
            list.push(JSON.parse(fs.readFileSync(metaFile, 'utf-8')));
          } catch {}
        }
      }
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 改快照的标签 / 备注。
   * 只动 meta.json —— 快照内容本身是不可变的，
   * 允许就地改内容的话「版本」就失去意义了。
   */
  update(versionId: string, patch: { tag?: string; note?: string }): VersionMetadata | null {
    const metaFile = path.join(this.versionsDir, versionId, 'meta.json');
    if (!fs.existsSync(metaFile)) {
      console.error(`[version] 快照不存在: ${versionId}`);
      return null;
    }
    const meta: VersionMetadata = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    if (patch.tag !== undefined) meta.tag = patch.tag;
    if (patch.note !== undefined) meta.note = patch.note;
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
    return meta;
  }

  /** 删快照。目录整个删掉，包括随快照存下来的 WAV。 */
  delete(versionId: string): boolean {
    const snapDir = path.join(this.versionsDir, versionId);
    if (!fs.existsSync(snapDir)) {
      console.error(`[version] 快照不存在: ${versionId}`);
      return false;
    }
    fs.rmSync(snapDir, { recursive: true, force: true });
    return true;
  }

  // 3. 还原指定快照
  restore(versionId: string): boolean {
    const snapDir = path.join(this.versionsDir, versionId);
    if (!fs.existsSync(snapDir)) {
      console.error(`[version] 快照不存在: ${versionId}`);
      return false;
    }

    const audioDir = path.join(process.cwd(), 'src', 'films', this.filmId, 'audio');
    for (const f of fs.readdirSync(snapDir)) {
      // 只还原九张真值；media/ 与 music/ 是这一版的留底，不回写
      if (f === 'meta.json' || !f.endsWith('.json')) continue;
      fs.copyFileSync(path.join(snapDir, f), path.join(audioDir, f));
    }

    // 配乐 WAV 丢了就从快照里取回来
    const meta: VersionMetadata | null = (() => {
      const mf = path.join(snapDir, 'meta.json');
      if (!fs.existsSync(mf)) return null;
      try {
        return JSON.parse(fs.readFileSync(mf, 'utf-8'));
      } catch {
        return null;
      }
    })();
    for (const t of meta?.tracks ?? []) {
      if (!t.copied) continue;
      const dst = path.join(process.cwd(), 'public', t.file);
      if (fs.existsSync(dst)) continue;
      const src = path.join(snapDir, 'media', `${t.cueId}-${path.basename(t.file)}`);
      if (!fs.existsSync(src)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`[version] 从快照取回配乐: ${t.file}`);
    }

    console.log(`[version] 成功还原快照真值: ${versionId}`);
    return true;
  }
}
