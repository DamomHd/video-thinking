import type { FilmRoot } from '../../shared/film-root';
import { FILM_PLAN } from './timeline';
import { UsPaperFilm, US_PAPER_TRUTH, US_PAPER_TYPINGS } from './index';

/** 给 Remotion 的这一份：幕表、画面、真值、打字表（目录约定见 shared/film-root.ts） */
export const filmRoot: FilmRoot = { timeline: FILM_PLAN, component: UsPaperFilm, truth: US_PAPER_TRUTH, typings: US_PAPER_TYPINGS };
