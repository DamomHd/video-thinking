import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FilmAdapter } from './shared/types';
import type { FilmMeta } from './shared/film-root';

export interface RegisteredFilm {
  id: string;
  title: string;
  fps: 30 | 60;
  width: number;
  height: number;
  getAdapter: () => Promise<FilmAdapter>;
}

/**
 * 全局已注册影片表（禁止隐式默认片）。
 * 按目录自动发现：src/films/<片>/film.json 在就登记，不在就没有（目录约定见 shared/film-root.ts）。
 * 被 .gitignore 排除的片子（本机才有的业务片）因此不会让其余部分编不过。
 */
const FILMS: Record<string, RegisteredFilm> = {};

export function registerFilm(film: RegisteredFilm): void {
  FILMS[film.id] = film;
}

/** 声音适配器类：audio/adapter 里第一个带 spots() 的导出 */
function adapterClassOf(mod: Record<string, unknown>): new () => FilmAdapter {
  const cls = Object.values(mod).find(
    (v): v is new () => FilmAdapter => typeof v === 'function' && typeof (v as { prototype?: { spots?: unknown } }).prototype?.spots === 'function'
  );
  if (!cls) throw new Error('audio/adapter 里没有导出 FilmAdapter 类（要有 spots() 方法）');
  return cls;
}

/** 扫描 src/films/*，把有 film.json 的片子登记进来 */
export function discoverFilms(filmsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'films')): void {
  if (!fs.existsSync(filmsDir)) return;
  for (const dir of fs.readdirSync(filmsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const metaPath = path.join(filmsDir, dir.name, 'film.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as FilmMeta;
    if (meta.id !== dir.name) throw new Error(`[films] ${path.relative(process.cwd(), metaPath)} 的 id（${meta.id}）和目录名（${dir.name}）不一致`);
    registerFilm({
      ...meta,
      getAdapter: async () => {
        const mod = (await import(`./films/${dir.name}/audio/adapter.js`)) as Record<string, unknown>;
        return new (adapterClassOf(mod))();
      },
    });
  }
}

discoverFilms();

export function getFilm(id?: string): RegisteredFilm {
  if (!id) {
    const ids = Object.keys(FILMS);
    throw new Error(
      `[films] 必须显式指定影片 ID（如 'vw <cmd> <film>'），当前已注册: [${ids.join(', ')}]`
    );
  }
  const film = FILMS[id];
  if (!film) {
    throw new Error(`[films] 未找到影片: '${id}'（要有 src/films/${id}/film.json；新片用 vw init 生成）`);
  }
  return film;
}

export function listFilms(): RegisteredFilm[] {
  return Object.values(FILMS);
}
