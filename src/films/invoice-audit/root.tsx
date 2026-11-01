import type { FilmRoot } from '../../shared/film-root';
import { FILM_PLAN } from './timeline';
import { InvoiceAuditFilm, INVOICE_AUDIT_TRUTH, INVOICE_AUDIT_TYPINGS } from './index';

/** 给 Remotion 的这一份：幕表、画面、真值、打字表（目录约定见 shared/film-root.ts） */
export const filmRoot: FilmRoot = { timeline: FILM_PLAN, component: InvoiceAuditFilm, truth: INVOICE_AUDIT_TRUTH, typings: INVOICE_AUDIT_TYPINGS };
