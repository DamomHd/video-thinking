import fs from 'node:fs';
import path from 'node:path';
import { InboxItem, InboxVisualContext, InboxAudioContext } from '../../src/shared/types.js';

/**
 * Inbox 任务管理器（huashu-motion 指着改协议）
 */
export class InboxService {
  private inboxPath: string;

  constructor(private filmId: string) {
    const projectRoot = process.cwd();
    const outDir = path.join(projectRoot, 'out', filmId);
    fs.mkdirSync(outDir, { recursive: true });
    this.inboxPath = path.join(outDir, 'inbox.json');
    if (!fs.existsSync(this.inboxPath)) {
      fs.writeFileSync(this.inboxPath, JSON.stringify([], null, 2));
    }
  }

  // 1. 读取修改单（按状态过滤，默认读取未完成任务）
  list(status?: 'pending' | 'in_progress' | 'resolved'): InboxItem[] {
    const raw = fs.readFileSync(this.inboxPath, 'utf-8');
    const items: InboxItem[] = JSON.parse(raw);
    if (!status) return items;
    return items.filter(item => item.status === status);
  }

  // 2. 新增修改单（工作台调用）
  create(input: {
    targetType: 'visual' | 'audio' | 'global';
    filmSec: number;
    instruction: string;
    visual?: InboxVisualContext;
    audio?: InboxAudioContext;
  }): InboxItem {
    const items = this.list();
    const nextId = `INB-${String(items.length + 1).padStart(3, '0')}`;
    const newItem: InboxItem = {
      id: nextId,
      film: this.filmId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...input,
    };
    items.push(newItem);
    fs.writeFileSync(this.inboxPath, JSON.stringify(items, null, 2));
    return newItem;
  }

  // 3. 结单（Agent 处理后调用）
  resolve(id: string, note: string): InboxItem {
    const items = this.list();
    const item = items.find(i => i.id === id);
    if (!item) throw new Error(`[inbox] 未找到任务单: ${id}`);
    item.status = 'resolved';
    item.resolutionNote = note;
    fs.writeFileSync(this.inboxPath, JSON.stringify(items, null, 2));
    return item;
  }
}
