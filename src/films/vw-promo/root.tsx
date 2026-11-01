import type { FilmRoot } from '../../shared/film-root';
import { FILM_PLAN } from './timeline';
import { VwPromoFilm, VW_PROMO_TRUTH, VW_PROMO_TYPINGS } from './index';

/** 给 Remotion 的这一份：幕表、画面、真值、打字表（目录约定见 shared/film-root.ts） */
export const filmRoot: FilmRoot = { timeline: FILM_PLAN, component: VwPromoFilm, truth: VW_PROMO_TRUTH, typings: VW_PROMO_TYPINGS };
