/**
 * 收录自 lemo-opuscar 的 66 个风格（scripts/style/import-opuscar.ts 生成，不要手改；上游 commit f171360）。
 * 每个风格的约束在 src/styles/<id>/STYLE.md 原文里。
 */
import { StyleKit } from './types';
import { ARCHIVE_LIGHTTABLE } from './archive-lighttable/style';
import { ART_DECO } from './art-deco/style';
import { ASCII_CRT } from './ascii-crt/style';
import { BACKROOMS } from './backrooms/style';
import { BLUEPRINT_OPUSCAR } from './blueprint-opuscar/style';
import { BRICK_TOY } from './brick-toy/style';
import { BRIEFING_BOARD } from './briefing-board/style';
import { CAPTION_NEWS } from './caption-news/style';
import { CEL_ANIME_80S } from './cel-anime-80s/style';
import { CHALKBOARD } from './chalkboard/style';
import { CIRCUIT_BOARD } from './circuit-board/style';
import { CITY_SYMPHONY } from './city-symphony/style';
import { COUNTDOWN } from './countdown/style';
import { CRAYON_BOOK } from './crayon-book/style';
import { DARK_KEYNOTE } from './dark-keynote/style';
import { DATA_PHYSICAL } from './data-physical/style';
import { DATAVIZ } from './dataviz/style';
import { DESKTOP_FLYTHROUGH } from './desktop-flythrough/style';
import { ENGRAVING } from './engraving/style';
import { GAME_SHOW } from './game-show/style';
import { GLASS_PRODUCT } from './glass-product/style';
import { HALFTONE_DOSSIER } from './halftone-dossier/style';
import { HD_2D } from './hd-2d/style';
import { HOLOGRAM_HUD } from './hologram-hud/style';
import { IMPASTO } from './impasto/style';
import { INK_WASH } from './ink-wash/style';
import { ISO_INFOGRAPHIC } from './iso-infographic/style';
import { ISOMETRIC_PICTURE_BOOK } from './isometric-picture-book/style';
import { KINO_MONTAGE } from './kino-montage/style';
import { LIDAR_SURVEY } from './lidar-survey/style';
import { LIVING_SCREENCAST } from './living-screencast/style';
import { LOWPOLY_ISLAND } from './lowpoly-island/style';
import { MEMPHIS_DIORAMA } from './memphis-diorama/style';
import { MICROGAME } from './microgame/style';
import { MICROSCOPE } from './microscope/style';
import { MIDCENTURY_TOON } from './midcentury-toon/style';
import { NEWS_PACKAGE } from './news-package/style';
import { NEWSREEL } from './newsreel/style';
import { ONE_LINE } from './one-line/style';
import { PAPER_LANTERN } from './paper-lantern/style';
import { PAPER_POPUP } from './paper-popup/style';
import { PAPERCUT_RED } from './papercut-red/style';
import { PICTOGRAM_MOTION } from './pictogram-motion/style';
import { PIXEL_RPG } from './pixel-rpg/style';
import { PRINTED_LONG_TAKE } from './printed-long-take/style';
import { RISOGRAPH } from './risograph/style';
import { RUBBER_HOSE } from './rubber-hose/style';
import { SATELLITE_BRIEFING } from './satellite-briefing/style';
import { SCIFI_TOON } from './scifi-toon/style';
import { SHADOW_PUPPET } from './shadow-puppet/style';
import { SILENT_FILM } from './silent-film/style';
import { SILKSCREEN_POSTER } from './silkscreen-poster/style';
import { SPY_TITLES } from './spy-titles/style';
import { STAINED_GLASS } from './stained-glass/style';
import { SWISS_MOTION } from './swiss-motion/style';
import { TEARDOWN } from './teardown/style';
import { TELESTRATOR } from './telestrator/style';
import { TILT_SHIFT } from './tilt-shift/style';
import { TRANSIT_MAP } from './transit-map/style';
import { UKIYOE } from './ukiyoe/style';
import { URBAN_SKETCH } from './urban-sketch/style';
import { VISUAL_INVESTIGATION } from './visual-investigation/style';
import { WATERCOLOR } from './watercolor/style';
import { WHITE_MODEL } from './white-model/style';
import { WHITEBOARD } from './whiteboard/style';
import { WOODCUT } from './woodcut/style';

export const OPUSCAR_STYLES: Record<string, StyleKit> = {
  "archive-lighttable": ARCHIVE_LIGHTTABLE,
  "art-deco": ART_DECO,
  "ascii-crt": ASCII_CRT,
  "backrooms": BACKROOMS,
  "blueprint-opuscar": BLUEPRINT_OPUSCAR,
  "brick-toy": BRICK_TOY,
  "briefing-board": BRIEFING_BOARD,
  "caption-news": CAPTION_NEWS,
  "cel-anime-80s": CEL_ANIME_80S,
  "chalkboard": CHALKBOARD,
  "circuit-board": CIRCUIT_BOARD,
  "city-symphony": CITY_SYMPHONY,
  "countdown": COUNTDOWN,
  "crayon-book": CRAYON_BOOK,
  "dark-keynote": DARK_KEYNOTE,
  "data-physical": DATA_PHYSICAL,
  "dataviz": DATAVIZ,
  "desktop-flythrough": DESKTOP_FLYTHROUGH,
  "engraving": ENGRAVING,
  "game-show": GAME_SHOW,
  "glass-product": GLASS_PRODUCT,
  "halftone-dossier": HALFTONE_DOSSIER,
  "hd-2d": HD_2D,
  "hologram-hud": HOLOGRAM_HUD,
  "impasto": IMPASTO,
  "ink-wash": INK_WASH,
  "iso-infographic": ISO_INFOGRAPHIC,
  "isometric-picture-book": ISOMETRIC_PICTURE_BOOK,
  "kino-montage": KINO_MONTAGE,
  "lidar-survey": LIDAR_SURVEY,
  "living-screencast": LIVING_SCREENCAST,
  "lowpoly-island": LOWPOLY_ISLAND,
  "memphis-diorama": MEMPHIS_DIORAMA,
  "microgame": MICROGAME,
  "microscope": MICROSCOPE,
  "midcentury-toon": MIDCENTURY_TOON,
  "news-package": NEWS_PACKAGE,
  "newsreel": NEWSREEL,
  "one-line": ONE_LINE,
  "paper-lantern": PAPER_LANTERN,
  "paper-popup": PAPER_POPUP,
  "papercut-red": PAPERCUT_RED,
  "pictogram-motion": PICTOGRAM_MOTION,
  "pixel-rpg": PIXEL_RPG,
  "printed-long-take": PRINTED_LONG_TAKE,
  "risograph": RISOGRAPH,
  "rubber-hose": RUBBER_HOSE,
  "satellite-briefing": SATELLITE_BRIEFING,
  "scifi-toon": SCIFI_TOON,
  "shadow-puppet": SHADOW_PUPPET,
  "silent-film": SILENT_FILM,
  "silkscreen-poster": SILKSCREEN_POSTER,
  "spy-titles": SPY_TITLES,
  "stained-glass": STAINED_GLASS,
  "swiss-motion": SWISS_MOTION,
  "teardown": TEARDOWN,
  "telestrator": TELESTRATOR,
  "tilt-shift": TILT_SHIFT,
  "transit-map": TRANSIT_MAP,
  "ukiyoe": UKIYOE,
  "urban-sketch": URBAN_SKETCH,
  "visual-investigation": VISUAL_INVESTIGATION,
  "watercolor": WATERCOLOR,
  "white-model": WHITE_MODEL,
  "whiteboard": WHITEBOARD,
  "woodcut": WOODCUT,
};
