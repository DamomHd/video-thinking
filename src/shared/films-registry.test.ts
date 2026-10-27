import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverFilms, getFilm, listFilms } from '../films';

const FILMS_DIR = path.join(process.cwd(), 'src', 'films');

describe('片子按目录自动发现（shared/film-root.ts 的约定）', () => {
  it('有 film.json 的目录登记，没有的忽略；宽高、帧率、片名照 film.json', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'films-'));
    fs.mkdirSync(path.join(tmp, 'zz-vertical'));
    fs.writeFileSync(path.join(tmp, 'zz-vertical', 'film.json'), JSON.stringify({ id: 'zz-vertical', title: '竖屏样片', fps: 30, width: 1080, height: 1920 }));
    fs.mkdirSync(path.join(tmp, 'zz-no-meta'));
    fs.writeFileSync(path.join(tmp, 'stray.txt'), 'x');
    discoverFilms(tmp);
    const f = getFilm('zz-vertical');
    assert.deepEqual([f.title, f.fps, f.width, f.height], ['竖屏样片', 30, 1080, 1920]);
    assert.ok(!listFilms().some((x) => x.id === 'zz-no-meta'));
    assert.throws(() => getFilm('zz-no-meta'), /film\.json/);
    fs.rmSync(tmp, { recursive: true });
  });

  it('film.json 的 id 要和目录名一致', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'films-'));
    fs.mkdirSync(path.join(tmp, 'a'));
    fs.writeFileSync(path.join(tmp, 'a', 'film.json'), JSON.stringify({ id: 'b', title: 't', fps: 60, width: 1920, height: 1080 }));
    assert.throws(() => discoverFilms(tmp), /id（b）和目录名（a）不一致/);
    fs.rmSync(tmp, { recursive: true });
  });

  it('目录不存在时不报错（只克隆了引擎、没有任何片子的机器）', () => {
    assert.doesNotThrow(() => discoverFilms(path.join(os.tmpdir(), 'no-such-films-dir-xyz')));
  });

  it('本机每部有 film.json 的片子都配齐：root.tsx、audio/adapter.ts、timeline.ts，adapter 能实例化', async () => {
    const dirs = fs.readdirSync(FILMS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(FILMS_DIR, d.name, 'film.json')));
    assert.ok(dirs.length > 0);
    for (const d of dirs) {
      for (const f of ['root.tsx', 'audio/adapter.ts', 'timeline.ts']) assert.ok(fs.existsSync(path.join(FILMS_DIR, d.name, f)), `${d.name} 缺 ${f}`);
      const adapter = await getFilm(d.name).getAdapter();
      assert.equal(adapter.filmId, d.name);
    }
  });
});
