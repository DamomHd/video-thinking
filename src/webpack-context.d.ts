/** Remotion 的 webpack 提供的目录发现（Root.tsx 用它按目录找每部片的 film.json / root.tsx） */
interface ImportMeta {
  webpackContext(
    request: string,
    options?: { recursive?: boolean; regExp?: RegExp; mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once' }
  ): { keys(): string[]; (id: string): unknown };
}
