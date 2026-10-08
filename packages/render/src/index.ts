// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

export { AnnotationLayer, LASER_FADE_MS, PENCIL_WIDTH, type Stroke } from './Annotations.ts';
export { CanvasPainter, type PaintSettings } from './CanvasPainter.ts';
export { CircuitRenderer, DEFAULT_FRAME, type FrameState } from './CircuitRenderer.ts';
export { currentMultiplier, DotCounters, updateDotCount } from './dots.ts';
export { ALL_FIELDS, FieldOverlay, NO_FIELDS, type FieldOptions } from './fields.ts';
export { COLOR_SCALE_COUNT, Palette } from './palette.ts';
export { MAX_SCALE, MIN_SCALE, Viewport, fitScale } from './Viewport.ts';
export { drawPreview } from './preview.ts';
export {
  CanvasScopeGraphics,
  CanvasScopeImage,
  ScopePalette,
  ScopeRenderer,
  type BottomAreaState,
  type UndockedScopeItem,
} from './ScopeRenderer.ts';
export { findPosts, type PostInfo } from './posts.ts';
export {
  DEFAULT_SCHEMATIC,
  SvgPainter,
  drawSchematic,
  estimateText,
  schematicBounds,
  schematicCanvas,
  schematicSvg,
  type MeasureText,
  type SchematicOptions,
} from './schematic.ts';
