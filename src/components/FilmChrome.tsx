/**
 * 工业级正片字幕与微装饰控制开关 (FilmChrome)
 * 严格遵循 LoomCare §6.2 预告片复用规范：
 * 预告片复用正片幕时，通过外层挂载 <FilmChrome value={false}>，
 * 一键隐藏正片内置的章节微胶囊、排版字幕等 Chrome 装饰，仅复用纯粹的核心动态画面。
 */

import React, { createContext, useContext } from 'react';

export interface FilmChromeContextValue {
  showChrome: boolean; // 是否显示字幕与排版外壳
  showSafeAreas?: boolean; // 是否显示安全区辅助线 (调试用途)
}

const FilmChromeContext = createContext<FilmChromeContextValue>({
  showChrome: true,
  showSafeAreas: false,
});

export const useFilmChrome = (): FilmChromeContextValue => useContext(FilmChromeContext);

export interface FilmChromeProps {
  value?: boolean;
  showSafeAreas?: boolean;
  children: React.ReactNode;
}

export const FilmChrome: React.FC<FilmChromeProps> = ({
  value = true,
  showSafeAreas = false,
  children,
}) => {
  return (
    <FilmChromeContext.Provider value={{ showChrome: value, showSafeAreas }}>
      {children}
    </FilmChromeContext.Provider>
  );
};
