// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Mouse editing follows CircuitJS1 MouseManager.java, and the edit commands CommandManager.java
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Differences in the UI on purpose: a click selects the element under the mouse (shift-click
// adds or removes it), and dragging an unselected element selects it. Upstream only selects with
// a rubber band and acts on the hovered element. Keyboard commands act on the selection, falling
// back to the hovered element, and a switch toggles on the edges of its hit area too.

import {
  CircuitElm,
  SwitchElm,
  TextElm,
  RoutedWireElm,
  WireElm,
  constructElement,
  distanceSq,
  switchRect,
  type Rect,
} from '@perun/elements';
import type { Circuit } from '@perun/format';
import { badPosts } from '@perun/render';
import {
  alignOffsets,
  alignUnits,
  type Unit,
  spreadOffsets,
  type AlignKind,
  type Offset,
  type SpreadAxis,
} from './align.ts';
import { NO_GUIDES, alignmentGuides, type Guides } from './guides.ts';
import { History } from './History.ts';
import { RouteGrid, hasBody, leadDir, reverse, type Pt } from './route.ts';
import { connectivity, keepsConnections, tidy, type TidyResult } from './tidy.ts';
import { WireFollow } from './wireFollow.ts';

export const MouseMode = {
  ADD_ELM: 0,
  DRAG_ALL: 1,
  DRAG_ROW: 2,
  DRAG_COLUMN: 3,
  DRAG_SELECTED: 4,
  DRAG_POST: 5,
  SELECT: 6,
  /** Dragging the middle of a routed wire reroutes it through the pointer. */
  DRAG_REROUTE: 8,
} as const;
export type MouseMode = (typeof MouseMode)[keyof typeof MouseMode];

const POSTGRABSQ = 25;
const MINPOSTGRABSIZE = 256;

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export const NO_MODIFIERS: Modifiers = { shift: false, ctrl: false, alt: false, meta: false };

/** What the editor needs from the app around it. */
export interface EditorHost {
  /** Hit box of an element (its view's bounding box), or null if it has no view. */
  bbox(e: CircuitElm): Rect | null;
  /** Elements were added, removed, moved or changed: analyze again and refresh posts. */
  circuitChanged(): void;
  /** Selection or hover changed. */
  selectionChanged(): void;
  /** Replace the circuit with a saved copy (undo and redo), keeping the view. */
  restore(xml: string): void;
  /** The part of the circuit on screen, in circuit coordinates. */
  visibleArea(): Rect;
  /** An element of this palette class was placed (the quick pick's recent list). */
  placed?(className: string): void;
  /** Tell the user something about the edit that just happened (a short message). */
  notice?(text: string): void;
}

/** Shown when an edit is put back because it would have left a bad connection. */
export const BAD_CONNECTION_NOTICE =
  'Put back: an end would have sat on a part without connecting to it';

/** Placement, selection, dragging and the edit commands, in circuit coordinates. DOM free. */
export class Editor {
  readonly history: History;
  /** Persistent mouse mode: SELECT, or ADD_ELM with `addClass`. */
  mouseMode: MouseMode = MouseMode.SELECT;
  /** Class placed in ADD_ELM mode (upstream `mouseModeStr`). */
  addClass = 'WireElm';
  /** Mode of the current gesture (upstream `tempMouseMode`). */
  tempMouseMode: MouseMode = MouseMode.SELECT;

  mouseElm: CircuitElm | null = null;
  mousePost = -1;
  /** Element being dragged out (not in the circuit yet). */
  private dragElmValue: CircuitElm | null = null;
  /** The element being placed (upstream `dragElm`); it knows, for `isCreating()`. */
  get dragElm(): CircuitElm | null {
    return this.dragElmValue;
  }
  set dragElm(e: CircuitElm | null) {
    if (this.dragElmValue !== null) this.dragElmValue.creating = false;
    this.dragElmValue = e;
    if (e !== null) e.creating = true;
  }
  /** Rubber band, in circuit coordinates. */
  selectedArea: Rect | null = null;
  /** Last mouse position in circuit coordinates, or null when outside the canvas. */
  mousePos: { x: number; y: number } | null = null;

  private draggingPost = -1;
  private dragGridX = 0;
  private dragGridY = 0;
  private initDragGridX = 0;
  private initDragGridY = 0;
  private mouseDragging = false;
  private moved = false;
  private heldSwitchElm: SwitchElm | null = null;
  private dragRowColElms: { e: CircuitElm; post: number }[] = [];
  private clipboard = '';
  private paletteDragClass = '';
  /** Palette class of the element being dragged out on the canvas. */
  private dragClass = '';
  /**
   * Wire ends on a moved part's posts move with it (user setting, not in upstream). Holding Alt
   * while dragging leaves them behind, as upstream does.
   */
  wiresFollow = true;
  /** The wires following the current drag (undefined: not looked for yet this gesture). */
  private follow: WireFollow | null | undefined = undefined;
  /** How far the selection has moved this gesture, for `follow`. */
  private followDx = 0;
  private followDy = 0;
  private followDetached = false;
  /** A two-post part dropped along a wire takes the place of the wire between its posts. */
  spliceOnDrop = true;
  /** Show alignment guides while dragging. */
  smartGuides = true;
  /** A wire being drawn finds its way round parts (Alt: straight, as upstream). */
  routeWires = true;
  /**
   * A part dropped from the palette, the quick pick, the wheel or the search is selected, which
   * opens its properties (user setting, off by default). Off, nothing is left selected.
   */
  selectPlaced = false;
  /**
   * How far past an element a press still picks it, in circuit units, and how far from a wire's
   * end it grabs that end: 0 for a mouse or pen (upstream's few units), more for a finger (not
   * in upstream). The app sets it before each press, from the zoom.
   */
  touchReach = 0;
  /** This press grabbed a wire end or a box corner (not a ctrl-drag): a tap selects instead. */
  private handleGrab = false;
  /** Bad connections before this edit (a file can bring some): left as they are. */
  private badBefore = new Set<string>();
  /** Alignment guides for the current drag. */
  guides: Guides = NO_GUIDES;
  /** The rest of the wire being drawn when it is routed: its first leg is `dragElm`. */
  dragExtras: WireElm[] = [];
  /** The routing grid for the wire being drawn (the circuit doesn't change meanwhile). */
  private routeGrid: RouteGrid | null = null;
  /** Which way the pointer first moved when drawing a wire. */
  private drawDir: number | null = null;

  constructor(
    readonly circuit: Circuit,
    private readonly host: EditorHost,
  ) {
    this.history = new History({
      save: () => circuit.dumpXml(),
      restore: (xml) => {
        this.forgetElements();
        host.restore(xml);
      },
    });
  }

  get elements(): CircuitElm[] {
    return this.circuit.elements;
  }

  /** The mouse is in a gesture (button held). */
  get isDragging(): boolean {
    return this.mouseDragging;
  }

  /** The gesture has moved or changed something (a drag, not a press that may become a click). */
  get isMoving(): boolean {
    return this.mouseDragging && this.moved;
  }

  /** The current gesture pans the view (the app does the panning). */
  get isPanning(): boolean {
    return this.mouseDragging && this.tempMouseMode === MouseMode.DRAG_ALL;
  }

  snapGrid(x: number): number {
    const g = this.circuit.sim.gridSize;
    return (x + (g / 2 - 1)) & ~(g - 1);
  }

  // ---- modes -------------------------------------------------------------------------------

  /** Place elements of this class on the next drags (upstream draw menu). */
  setAddMode(className: string): void {
    this.mouseMode = this.tempMouseMode = MouseMode.ADD_ELM;
    this.addClass = className;
    this.host.selectionChanged();
  }

  setSelectMode(): void {
    this.mouseMode = this.tempMouseMode = MouseMode.SELECT;
    this.host.selectionChanged();
  }

  // ---- palette drag and drop (upstream toolbarDragMove, toolbarDragEnd) ----------------------

  /**
   * An element dragged from the palette is over the canvas at (gx, gy): place it there with its
   * default length, horizontal or (shift) vertical. Null position: it left the canvas.
   */
  paletteDragMove(className: string, pos: { x: number; y: number } | null, vertical: boolean) {
    if (pos === null) {
      this.guides = NO_GUIDES;
      if (this.dragElm !== null) {
        this.dragElm = null;
        this.host.selectionChanged();
      }
      return;
    }
    const ax = this.snapGrid(pos.x);
    const ay = this.snapGrid(pos.y);
    if (this.dragElm === null || this.paletteDragClass !== className) {
      this.dragElm = constructElement(className, ax, ay, this.circuit.sim);
      this.dragElm?.allocNodes();
      this.paletteDragClass = className;
    }
    this.dragElm?.dragPlace(ax, ay, vertical);
    this.mouseElm = null;
    this.updateGuides();
    this.host.selectionChanged();
  }

  /** The palette drag ended; drop the element if it is over the canvas. */
  paletteDragEnd(): CircuitElm | null {
    const de = this.dragElm;
    this.dragElm = null;
    this.guides = NO_GUIDES;
    if (de === null || de.creationFailed()) {
      this.host.selectionChanged();
      return null;
    }
    this.badBefore = this.badKeys();
    this.history.begin('Add');
    if (!this.spliceIntoWire(de)) {
      this.splitWireAt(de.x, de.y);
      this.splitWireAt(de.x2, de.y2);
    }
    this.elements.push(de);
    this.joinLeads([de]);
    if (!this.joinBadPosts(new Set([de]), null)) {
      this.putBack();
      return null;
    }
    for (const e of this.elements) e.selected = this.selectPlaced && e === de;
    this.history.touch();
    this.history.commit();
    this.host.placed?.(this.paletteDragClass);
    this.host.circuitChanged();
    this.host.selectionChanged();
    return de;
  }

  /**
   * Drop an element at its default length centred on (x, y), lying down or (vertical) upright,
   * as the radial wheel does (not upstream).
   */
  placeAt(className: string, x: number, y: number, vertical: boolean): CircuitElm | null {
    this.paletteDragMove(className, { x, y }, vertical);
    const de = this.dragElm;
    if (de === null) return null;
    de.move(-this.snapGrid((de.x2 - de.x) / 2), -this.snapGrid((de.y2 - de.y) / 2));
    return this.paletteDragEnd();
  }

  // ---- selection ---------------------------------------------------------------------------

  selectedElements(): CircuitElm[] {
    return this.elements.filter((e) => e.selected);
  }

  countSelected(): number {
    let n = 0;
    for (const e of this.elements) if (e.selected) n++;
    return n;
  }

  clearSelection(): void {
    for (const e of this.elements) e.selected = false;
    this.host.selectionChanged();
  }

  selectAll(): void {
    for (const e of this.elements) e.selected = true;
    this.host.selectionChanged();
  }

  select(e: CircuitElm, add = false): void {
    if (!add) for (const ce of this.elements) ce.selected = false;
    e.selected = true;
    this.host.selectionChanged();
  }

  private anySelectedButMouse(): boolean {
    for (const ce of this.elements) if (ce !== this.mouseElm && ce.selected) return true;
    return false;
  }

  /** Forget references to elements that a reload replaces. */
  private forgetElements(): void {
    this.mouseElm = null;
    this.mousePost = -1;
    this.dragElm = null;
    this.heldSwitchElm = null;
    this.mouseDragging = false;
    this.selectedArea = null;
    this.guides = NO_GUIDES;
    this.dragExtras = [];
    this.routeGrid = null;
  }

  /** Called after the app loads a different circuit. */
  circuitReplaced(): void {
    this.forgetElements();
    this.tempMouseMode = this.mouseMode;
  }

  // ---- hit testing (upstream mouseSelect) ----------------------------------------------------

  /** Element and post under the point, as upstream's hover picks them. */
  pick(gx: number, gy: number): { elm: CircuitElm | null; post: number } {
    let elm: CircuitElm | null = null;
    let post = -1;
    if (
      this.mouseElm !== null &&
      this.elements.includes(this.mouseElm) &&
      this.grabbedHandle(this.mouseElm, gx, gy) >= 0
    ) {
      elm = this.mouseElm;
    } else {
      let bestDist = 100000000;
      for (const ce of this.elements) {
        const b = this.host.bbox(ce);
        if (b === null || !inBox(b, gx, gy)) continue;
        const dist = ce.getMouseDistance(gx, gy);
        if (dist >= 0 && dist < bestDist) {
          bestDist = dist;
          elm = ce;
        }
      }
    }
    const postSq = Math.max(26, this.touchReach * this.touchReach);
    if (elm === null && this.touchReach > 0) {
      // a finger: the nearest post within reach, else the nearest element within reach
      let best = postSq;
      for (const ce of this.elements) {
        for (let j = 0; j !== ce.getPostCount(); j++) {
          const pt = ce.getPost(j);
          const d = distanceSq(pt.x, pt.y, gx, gy);
          if (d < best) {
            best = d;
            elm = ce;
            post = j;
          }
        }
      }
      if (elm !== null) return { elm, post };
      best = postSq;
      for (const ce of this.elements) {
        const b = this.host.bbox(ce);
        if (b === null || !inBox(grow(b, this.touchReach), gx, gy)) continue;
        const d = ce.getMouseDistance(gx, gy);
        if (d >= 0 && d < best) {
          best = d;
          elm = ce;
        }
      }
      if (elm !== null) return { elm, post };
    }
    if (elm === null) {
      // not in any box, but maybe close to a post
      for (const ce of this.elements) {
        if (
          this.mouseMode === MouseMode.DRAG_POST &&
          ce.getHandleGrabbedClose(gx, gy, POSTGRABSQ, 0) > 0
        ) {
          elm = ce;
          break;
        }
        for (let j = 0; j !== ce.getPostCount(); j++) {
          const pt = ce.getPost(j);
          if (distanceSq(pt.x, pt.y, gx, gy) < 26) {
            elm = ce;
            post = j;
            break;
          }
        }
      }
    } else {
      let best = postSq;
      for (let i = 0; i !== elm.getPostCount(); i++) {
        const pt = elm.getPost(i);
        const d = distanceSq(pt.x, pt.y, gx, gy);
        if (d < best) {
          best = d;
          post = i;
        }
      }
    }
    return { elm, post };
  }

  /**
   * The handle of `e` a press at (gx, gy) grabs, or -1. A finger reaches further for a wire's
   * ends, up to a third of the wire, so the middle still moves the whole wire.
   */
  private grabbedHandle(e: CircuitElm, gx: number, gy: number): number {
    if (this.touchReach === 0 || !(e instanceof WireElm))
      return e.getHandleGrabbedClose(gx, gy, POSTGRABSQ, MINPOSTGRABSIZE);
    const third = distanceSq(e.x, e.y, e.x2, e.y2) / 9;
    const reach = Math.max(POSTGRABSQ, Math.min(this.touchReach * this.touchReach, third));
    // the nearer end, so a short wire's ends don't take each other's touches
    const near = e.closestHandle(gx, gy);
    const p = near === 0 ? { x: e.x, y: e.y } : { x: e.x2, y: e.y2 };
    if (distanceSq(p.x, p.y, gx, gy) > reach) {
      e.lastHandleGrabbed = -1;
      return -1;
    }
    e.lastHandleGrabbed = near;
    return near;
  }

  private mouseSelect(gx: number, gy: number): void {
    this.dragGridX = this.snapGrid(gx);
    this.dragGridY = this.snapGrid(gy);
    this.draggingPost = -1;
    const { elm, post } = this.pick(gx, gy);
    this.mousePost = post;
    if (elm !== this.mouseElm) {
      this.mouseElm = elm;
      this.host.selectionChanged();
    }
  }

  /** The hovered drawing's resize handle under the point (a box corner), or -1. */
  hoverHandle(gx: number, gy: number): number {
    const m = this.mouseElm;
    if (m === null || m.getPostCount() > 0) return -1;
    return m.getHandleGrabbedClose(gx, gy, POSTGRABSQ, MINPOSTGRABSIZE);
  }

  // ---- mouse -------------------------------------------------------------------------------

  /** Pointer moved with no button down (hover). */
  hover(gx: number, gy: number): void {
    this.mousePos = { x: gx, y: gy };
    if (!this.mouseDragging) this.mouseSelect(gx, gy);
  }

  /** The pointer left the canvas. */
  leave(): void {
    this.mousePos = null;
    if (this.mouseDragging) this.endDrag();
    if (this.mouseElm !== null) {
      this.mouseElm = null;
      this.host.selectionChanged();
    }
  }

  /**
   * Button pressed at (gx, gy). `pan` asks for a view drag whatever the mode (middle button,
   * touch on empty space). Returns what the press did.
   */
  pointerDown(
    gx: number,
    gy: number,
    mods: Modifiers,
    pan = false,
    grab: { elm: CircuitElm; post: number } | null = null,
  ): 'switch' | 'pan' | 'edit' | 'none' {
    this.mousePos = { x: gx, y: gy };
    if (grab !== null) {
      // the app picked the element (an undocked scope's handle or resize grip)
      this.dragGridX = this.snapGrid(gx);
      this.dragGridY = this.snapGrid(gy);
      this.mousePost = -1;
      if (this.mouseElm !== grab.elm) {
        this.mouseElm = grab.elm;
        this.host.selectionChanged();
      }
    } else this.mouseSelect(gx, gy);
    this.draggingPost = -1;
    this.mouseDragging = true;
    this.moved = false;
    this.follow = undefined;
    this.followDx = this.followDy = 0;
    this.dragExtras = [];
    this.routeGrid = null;
    this.drawDir = null;

    let mode: MouseMode = this.mouseMode;
    if (grab !== null) mode = grab.post >= 0 ? MouseMode.DRAG_POST : MouseMode.SELECT;
    else if (pan) mode = MouseMode.DRAG_ALL;
    else if (mods.alt && mods.meta) mode = MouseMode.DRAG_COLUMN;
    else if (mods.alt && mods.shift) mode = MouseMode.DRAG_ROW;
    else if (mods.shift) mode = MouseMode.SELECT;
    else if (mods.alt) mode = MouseMode.DRAG_ALL;
    else if (mods.ctrl || mods.meta) mode = MouseMode.DRAG_POST;
    this.tempMouseMode = mode;
    if (mode === MouseMode.DRAG_ALL) return 'pan';

    if (this.doSwitch(gx, gy)) {
      this.mouseDragging = this.heldSwitchElm !== null;
      return 'switch';
    }

    // grab a resize handle in select mode when it is far enough from the other end; a finger
    // grabs it even with other parts selected, unless it is one of them (not upstream)
    this.handleGrab = false;
    if (
      grab === null &&
      mode === MouseMode.SELECT &&
      this.mouseElm !== null &&
      this.grabbedHandle(this.mouseElm, gx, gy) >= 0 &&
      (!this.anySelectedButMouse() || (this.touchReach > 0 && !this.mouseElm.selected))
    ) {
      this.tempMouseMode = MouseMode.DRAG_POST;
      this.handleGrab = true;
    }

    if (this.tempMouseMode !== MouseMode.SELECT && this.tempMouseMode !== MouseMode.DRAG_SELECTED)
      this.clearSelection();

    if (grab !== null && grab.post >= 0) this.draggingPost = grab.post;
    this.badBefore = this.badKeys();
    this.history.begin(this.tempMouseMode === MouseMode.ADD_ELM ? 'Add' : 'Move');
    this.initDragGridX = gx;
    this.initDragGridY = gy;

    if (this.tempMouseMode === MouseMode.DRAG_ROW || this.tempMouseMode === MouseMode.DRAG_COLUMN) {
      // capture the elements now so the sweep doesn't pick up others
      this.dragRowColElms = [];
      const sgx = this.snapGrid(gx);
      const sgy = this.snapGrid(gy);
      const row = this.tempMouseMode === MouseMode.DRAG_ROW;
      for (const ce of this.elements) {
        if (row ? ce.y === sgy : ce.x === sgx) this.dragRowColElms.push({ e: ce, post: 0 });
        if (row ? ce.y2 === sgy : ce.x2 === sgx) this.dragRowColElms.push({ e: ce, post: 1 });
      }
    }

    if (this.tempMouseMode !== MouseMode.ADD_ELM) return 'none';
    this.dragClass = this.addClass;
    this.dragElm = constructElement(
      this.addClass,
      this.snapGrid(gx),
      this.snapGrid(gy),
      this.circuit.sim,
    );
    // not analyzed until it is added: unconnected nodes at 0 V so it can be drawn
    this.dragElm?.allocNodes();
    this.host.selectionChanged();
    return 'edit';
  }

  /** Toggle a switch under the mouse (upstream doSwitch). */
  private doSwitch(gx: number, gy: number): boolean {
    const se = this.mouseElm;
    if (!(se instanceof SwitchElm)) return false;
    // upstream's rectangle excludes its bottom and right edges, which misses a click on the line
    // a closed switch lies on; include them
    const r = switchRect(se);
    if (!(gx >= r.x1 && gx <= r.x2 && gy >= r.y1 && gy <= r.y2)) return false;
    this.toggleSwitch(se);
    if (se.momentary) this.heldSwitchElm = se;
    return true;
  }

  toggleSwitch(se: SwitchElm): void {
    se.toggle();
    this.host.circuitChanged();
  }

  /** Pointer moved with the button down (upstream mouseDragged). */
  pointerDrag(gx: number, gy: number, mods: Modifiers): void {
    this.mousePos = { x: gx, y: gy };
    if (!this.mouseDragging) {
      this.hover(gx, gy);
      return;
    }
    if (this.heldSwitchElm !== null) return;
    if (this.dragElm !== null) {
      this.dragElm.drag(gx, gy);
      this.mouseElm = null;
      this.routeDrawnWire(mods.alt);
    }
    let success = true;
    let changed = false;
    switch (this.tempMouseMode) {
      case MouseMode.DRAG_ALL:
        return;
      case MouseMode.DRAG_ROW:
        changed = this.dragRowCol(0, this.snapGrid(gy) - this.dragGridY);
        break;
      case MouseMode.DRAG_COLUMN:
        changed = this.dragRowCol(this.snapGrid(gx) - this.dragGridX, 0);
        break;
      case MouseMode.DRAG_POST:
        if (this.mouseElm !== null)
          changed = this.dragPost(this.snapGrid(gx), this.snapGrid(gy), mods.shift);
        break;
      case MouseMode.SELECT:
        if (this.mouseElm === null) this.selectArea(gx, gy, mods.shift);
        else {
          if (!this.mouseElm.selected) this.select(this.mouseElm, mods.shift);
          if (this.mouseElm instanceof RoutedWireElm) {
            this.tempMouseMode = MouseMode.DRAG_REROUTE;
            this.mouseElm.rerouteVia(this.snapGrid(gx), this.snapGrid(gy));
            changed = true;
          } else {
            this.tempMouseMode = MouseMode.DRAG_SELECTED;
            changed = success = this.dragSelected(gx, gy, mods.alt);
          }
        }
        break;
      case MouseMode.DRAG_SELECTED:
        changed = success = this.dragSelected(gx, gy, mods.alt);
        break;
      case MouseMode.DRAG_REROUTE:
        if (this.mouseElm instanceof RoutedWireElm) {
          this.mouseElm.rerouteVia(this.snapGrid(gx), this.snapGrid(gy));
          changed = true;
        }
        break;
    }
    if (this.dragElm !== null) changed = true;
    if (changed) {
      this.moved = true;
      this.history.touch();
    }
    if (success) {
      this.dragGridX = gx;
      this.dragGridY = gy;
      if (!(this.tempMouseMode === MouseMode.DRAG_SELECTED && this.onlyGraphicsElmsSelected())) {
        this.dragGridX = this.snapGrid(gx);
        this.dragGridY = this.snapGrid(gy);
      }
    }
    if (this.selectedArea !== null) this.moved = true;
    this.updateGuides();
  }

  /** Button released (upstream onMouseUp and endDrag). */
  pointerUp(mods: Modifiers): void {
    if (!this.mouseDragging) return;
    // a click (no drag) in select mode selects what is under the mouse
    if (
      this.tempMouseMode === MouseMode.SELECT &&
      this.selectedArea === null &&
      !this.moved &&
      this.heldSwitchElm === null
    ) {
      if (this.mouseElm === null) {
        if (!mods.shift) this.clearSelection();
      } else if (mods.shift) {
        this.mouseElm.selected = !this.mouseElm.selected;
        this.host.selectionChanged();
      } else this.select(this.mouseElm);
    }
    // a tap on a wire end or a box corner selects, as a tap elsewhere on it does (not upstream)
    if (this.handleGrab && !this.moved && this.mouseElm !== null) {
      if (mods.shift) {
        this.mouseElm.selected = !this.mouseElm.selected;
        this.host.selectionChanged();
      } else this.select(this.mouseElm);
    }
    // ctrl-click on a wire splits it
    if (
      this.tempMouseMode === MouseMode.DRAG_POST &&
      !this.handleGrab &&
      this.draggingPost === -1 &&
      !this.moved
    ) {
      const m = this.mousePos;
      if (m !== null && this.mouseElm instanceof WireElm) {
        if (this.splitWireAt(this.snapGrid(m.x), this.snapGrid(m.y))) {
          this.history.touch();
          this.host.circuitChanged();
        }
      }
    }
    this.endDrag();
  }

  private endDrag(): void {
    const draggedSelection = this.tempMouseMode === MouseMode.DRAG_SELECTED && this.moved;
    const draggedPost =
      this.tempMouseMode === MouseMode.DRAG_POST && this.moved ? this.mouseElm : null;
    const wiresFollowed = this.follow !== null && this.follow !== undefined;
    this.mouseDragging = false;
    this.tempMouseMode = this.mouseMode;
    this.selectedArea = null;
    this.guides = NO_GUIDES;
    let circuitChanged = false;
    if (this.follow) {
      this.follow.finish();
      circuitChanged = true;
    }
    this.follow = undefined;
    // dropping a post on a wire's middle splits the wire there
    if (
      this.draggingPost >= 0 &&
      this.mouseElm !== null &&
      this.draggingPost < this.mouseElm.getPostCount()
    ) {
      const p = this.mouseElm.getPost(this.draggingPost);
      if (this.splitWireAt(p.x, p.y)) circuitChanged = true;
    }
    if (this.heldSwitchElm !== null) {
      // a push switch springs back
      this.heldSwitchElm.toggle();
      this.heldSwitchElm = null;
      this.host.circuitChanged();
    }
    const de = this.dragElm;
    const extras = this.dragExtras;
    this.dragElm = null;
    this.dragExtras = [];
    this.routeGrid = null;
    if (de !== null) {
      if (de.creationFailed()) {
        this.history.cancel();
      } else if (de instanceof WireElm && extras.length > 0) {
        // a wire drawn round parts: its legs meet nothing but each other
        const last = extras[extras.length - 1];
        this.splitWireAt(de.x, de.y);
        this.splitWireAt(last.x2, last.y2);
        this.elements.push(de, ...extras);
        for (const w of [de, ...extras]) this.wireDraggingDone(w);
        circuitChanged = true;
        this.host.placed?.(this.dragClass);
      } else {
        if (!this.spliceIntoWire(de)) {
          this.splitWireAt(de.x, de.y);
          this.splitWireAt(de.x2, de.y2);
        }
        this.elements.push(de);
        // a routed wire goes round posts instead of connecting to them
        if (de instanceof WireElm && !(de instanceof RoutedWireElm)) this.wireDraggingDone(de);
        circuitChanged = true;
        this.host.placed?.(this.dragClass);
      }
    }
    // a loose part dragged onto a wire splices in too
    if (draggedSelection && !wiresFollowed) {
      const sel = this.selectedElements();
      if (sel.length === 1 && this.spliceIntoWire(sel[0])) circuitChanged = true;
    }
    // a post left on a long part's lead joins it there
    const touched: CircuitElm[] =
      de !== null && !de.creationFailed()
        ? [de, ...extras].filter((e) => this.elements.includes(e))
        : draggedSelection
          ? this.selectedElements()
          : draggedPost !== null
            ? [draggedPost]
            : [];
    if (this.joinLeads(touched)) circuitChanged = true;
    if (circuitChanged || this.moved) {
      const added = de !== null && this.elements.includes(de) ? [de, ...extras] : [];
      if (!this.joinBadPosts(new Set(added), draggedPost)) {
        this.putBack();
        this.host.selectionChanged();
        return;
      }
      if (this.healed) circuitChanged = true;
    }
    if (circuitChanged) {
      this.history.touch();
      this.host.circuitChanged();
    } else if (this.moved) this.host.circuitChanged();
    this.history.commit();
    this.host.selectionChanged();
  }

  // ---- dragging (upstream dragSelected, dragPost, dragRow, dragColumn, selectArea) -----------

  private onlyGraphicsElmsSelected(): boolean {
    if (this.mouseElm !== null && !(this.mouseElm instanceof TextElm)) return false;
    for (const ce of this.elements) if (ce.selected && !(ce instanceof TextElm)) return false;
    return true;
  }

  private dragSelected(x: number, y: number, detach = false): boolean {
    let me = false;
    const mouseElm = this.mouseElm;
    if (mouseElm !== null && !mouseElm.selected) mouseElm.selected = me = true;
    if (this.follow === undefined)
      this.follow = this.wiresFollow ? WireFollow.start(this.elements) : null;
    if (!this.onlyGraphicsElmsSelected()) {
      x = this.snapGrid(x);
      y = this.snapGrid(y);
    }
    const dx = x - this.dragGridX;
    const dy = y - this.dragGridY;
    if (dx === 0 && dy === 0) {
      if (me && mouseElm) mouseElm.selected = false;
      if (this.follow && detach !== this.followDetached) {
        // Alt pressed or released without moving: the wires spring back or catch up
        this.followDetached = detach;
        this.follow.apply(this.followDx, this.followDy, !detach);
        this.host.circuitChanged();
        return true;
      }
      return false;
    }
    let allowed = true;
    for (const ce of this.elements) {
      if (ce.selected && !ce.allowMove(dx, dy, this.elements)) {
        allowed = false;
        break;
      }
    }
    if (allowed) {
      for (const ce of this.elements) if (ce.selected) ce.move(dx, dy);
      if (this.follow) {
        this.followDx += dx;
        this.followDy += dy;
        this.followDetached = detach;
        this.follow.apply(this.followDx, this.followDy, !detach);
      }
      this.host.circuitChanged();
    }
    if (me && mouseElm) mouseElm.selected = false;
    return allowed;
  }

  private dragPost(x: number, y: number, all: boolean): boolean {
    const m = this.mouseElm;
    if (m === null) return false;
    if (this.draggingPost === -1) this.draggingPost = m.closestHandle(x, y);
    const dx = x - this.dragGridX;
    const dy = y - this.dragGridY;
    if (dx === 0 && dy === 0) return false;
    if (all) {
      // move every element end at the grabbed point
      for (const e of this.elements) {
        let p: number;
        if (e.x === this.dragGridX && e.y === this.dragGridY) p = 0;
        else if (e.x2 === this.dragGridX && e.y2 === this.dragGridY) p = 1;
        else continue;
        e.movePoint(p, dx, dy);
      }
    } else m.movePoint(this.draggingPost, dx, dy);
    this.host.circuitChanged();
    return true;
  }

  private dragRowCol(dx: number, dy: number): boolean {
    if (dx === 0 && dy === 0) return false;
    for (const { e, post } of this.dragRowColElms) e.movePoint(post, dx, dy);
    this.removeZeroLengthElements();
    return true;
  }

  private removeZeroLengthElements(): void {
    const els = this.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const ce = els[i];
      if (ce.x === ce.x2 && ce.y === ce.y2) els.splice(i, 1);
    }
    this.host.circuitChanged();
  }

  private selectArea(x: number, y: number, add: boolean): void {
    const x1 = Math.min(x, this.initDragGridX);
    const x2 = Math.max(x, this.initDragGridX);
    const y1 = Math.min(y, this.initDragGridY);
    const y2 = Math.max(y, this.initDragGridY);
    this.selectedArea = { x1, y1, x2, y2 };
    for (const ce of this.elements) {
      const b = this.host.bbox(ce);
      // upstream selectRect: intersecting boxes are selected, a box element only when inside
      const hit = ce.selectsOnlyWhenEnclosed()
        ? encloses(this.selectedArea, pointsRect(ce))
        : b !== null && intersects(this.selectedArea, b);
      if (hit) ce.selected = true;
      else if (!add) ce.selected = false;
    }
    this.host.selectionChanged();
  }

  // ---- wire splitting (upstream splitWireAt, WireElm.split and draggingDone) ----------------

  /** Split every wire whose interior contains (px, py). */
  splitWireAt(px: number, py: number): boolean {
    let split = false;
    const els = this.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const we = els[i];
      if (!(we instanceof WireElm)) continue;
      if (we instanceof RoutedWireElm) {
        // a routed wire splits along its path
        if (!we.pointOnPath({ x: px, y: py })) continue;
        const nw = we.split(px, py);
        if (nw === null) continue;
        nw.flags = we.flags;
        els.push(nw);
        split = true;
        continue;
      }
      if (!pointOnSegmentInterior(we.x, we.y, we.x2, we.y2, px, py)) continue;
      const nw = constructElement('WireElm', px, py, this.circuit.sim);
      if (nw === null) continue;
      nw.flags = we.flags;
      nw.drag(we.x2, we.y2);
      we.drag(px, py);
      els.push(nw);
      split = true;
    }
    return split;
  }

  /**
   * After a wire is drawn, split it where it passes over a junction or a dead end, so it
   * connects there; skip pieces that would duplicate an existing two-post element.
   */
  private wireDraggingDone(w: WireElm): void {
    const others = this.elements.filter((e) => e !== w);
    const splitPoints = postDrawList(others).filter((p) =>
      pointOnSegmentInterior(w.x, w.y, w.x2, w.y2, p.x, p.y),
    );
    if (splitPoints.length === 0) return;
    const x0 = w.x;
    const y0 = w.y;
    const d = (p: { x: number; y: number }): number => (p.x - x0) ** 2 + (p.y - y0) ** 2;
    splitPoints.sort((a, b) => d(a) - d(b));
    const pts = [{ x: w.x, y: w.y }];
    for (const p of splitPoints) {
      const last = pts[pts.length - 1];
      if (p.x !== last.x || p.y !== last.y) pts.push(p);
    }
    const last = pts[pts.length - 1];
    if (last.x !== w.x2 || last.y !== w.y2) pts.push({ x: w.x2, y: w.y2 });

    let first = true;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (hasDirectConnection(others, a.x, a.y, b.x, b.y)) continue;
      if (first) {
        w.x = a.x;
        w.y = a.y;
        w.drag(b.x, b.y);
        first = false;
      } else {
        const seg = constructElement('WireElm', a.x, a.y, this.circuit.sim);
        if (seg === null) continue;
        seg.drag(b.x, b.y);
        this.elements.push(seg);
      }
    }
    if (first) this.elements.splice(this.elements.indexOf(w), 1);
  }

  // ---- smart editing (not in upstream) -------------------------------------------------------

  private badKeys(): Set<string> {
    return new Set(badPosts(this.elements).map((b) => `${b.x},${b.y}`));
  }

  /** The last joinBadPosts changed something. */
  private healed = false;

  /**
   * Join every bad connection this edit made (not upstream): an end left on a part, not on one
   * of its pins, would look connected and not be. A post on a wire splits the wire there; a wire
   * end moves onto the part's nearest pin; a part just placed (`placed`) moves so its pin is on
   * the pin, and a part end just dragged (`stretched`) stretches onto it. False when one can't
   * be joined that way: the caller puts the edit back.
   */
  private joinBadPosts(placed: ReadonlySet<CircuitElm>, stretched: CircuitElm | null): boolean {
    this.healed = false;
    let last = '';
    for (let round = 0; round < 32; round++) {
      const b = badPosts(this.elements).find((p) => !this.badBefore.has(`${p.x},${p.y}`));
      if (b === undefined) {
        this.removeZeroLengthElements();
        return true;
      }
      // the same end bad again: nothing moved it
      const key = `${b.x},${b.y},${this.elements.indexOf(b.owner)},${b.post}`;
      if (key === last) return false;
      last = key;
      this.healed = true;
      if (this.splitWireAt(b.x, b.y)) continue;
      const pin = nearestPin(b.on, b.x, b.y);
      if (pin === null) return false;
      const dx = pin.x - b.x;
      const dy = pin.y - b.y;
      const o = b.owner;
      const isPoint = (n: number): boolean =>
        n < 2 && (n === 0 ? o.x === b.x && o.y === b.y : o.x2 === b.x && o.y2 === b.y);
      if (o instanceof WireElm && !(o instanceof RoutedWireElm) && isPoint(b.post))
        o.movePoint(b.post, dx, dy);
      else if (placed.has(o)) {
        // a routed wire's legs move together
        for (const e of placed) e.move(dx, dy);
      } else if (o === stretched && isPoint(b.post)) o.movePoint(b.post, dx, dy);
      else return false;
    }
    return false;
  }

  /**
   * Run `fn` as one edit (`History.record`), then join the bad connections it made, or put the
   * edit back when one can't be joined. `placed`: the elements it added, free to move as one.
   */
  private guardedRecord(
    label: string,
    fn: () => unknown,
    placed: () => Iterable<CircuitElm> = () => [],
  ): boolean {
    this.badBefore = this.badKeys();
    this.history.begin(label);
    if (fn() === false) {
      this.history.commit();
      return true;
    }
    this.history.touch();
    if (!this.joinBadPosts(new Set(placed()), null)) {
      this.putBack();
      return false;
    }
    this.history.commit();
    return true;
  }

  /** Undo the edit in progress: it would have left a bad connection. */
  private putBack(): void {
    this.history.revert();
    this.host.circuitChanged();
    this.host.notice?.(BAD_CONNECTION_NOTICE);
  }

  /**
   * A two-post part lying along a wire, both posts on it, takes the wire's place between them:
   * the wire is cut at the posts and the piece in between goes, so the part is in series instead
   * of shorted out. Nothing happens if anything else joins the wire between the posts.
   */
  private spliceIntoWire(part: CircuitElm): boolean {
    if (!this.spliceOnDrop || part instanceof WireElm || part.getPostCount() !== 2) return false;
    const a = part.getPost(0);
    const b = part.getPost(1);
    const horiz = a.y === b.y;
    if ((!horiz && a.x !== b.x) || (a.x === b.x && a.y === b.y)) return false;
    const line = horiz ? a.y : a.x;
    const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    /** Where a point lies along the part's line, or null if it is off the line. */
    const along = (x: number, y: number): number | null =>
      horiz ? (y === line ? x : null) : x === line ? y : null;
    const spans: [number, number][] = [];
    const onLine: WireElm[] = [];
    for (const e of this.elements) {
      if (!(e instanceof WireElm) || e instanceof RoutedWireElm) continue;
      const t0 = along(e.x, e.y);
      const t1 = along(e.x2, e.y2);
      if (t0 === null || t1 === null) continue;
      const s0 = Math.min(t0, t1);
      const s1 = Math.max(t0, t1);
      if (s1 <= lo || s0 >= hi) continue;
      onLine.push(e);
      spans.push([s0, s1]);
    }
    if (onLine.length === 0) return false;
    // the wires must run the whole way between the posts
    spans.sort((p, q) => p[0] - q[0]);
    let reach = lo;
    for (const [s0, s1] of spans) {
      if (s0 > reach) return false;
      reach = Math.max(reach, s1);
    }
    if (reach < hi) return false;
    // and nothing else may join them in between
    const wires = new Set<CircuitElm>(onLine);
    for (const e of this.elements) {
      if (e === part || wires.has(e)) continue;
      for (let i = 0; i !== e.getPostCount(); i++) {
        const p = e.getPost(i);
        const t = along(p.x, p.y);
        if (t !== null && t > lo && t < hi) return false;
      }
    }
    this.splitWireAt(a.x, a.y);
    this.splitWireAt(b.x, b.y);
    this.circuit.elements = this.elements.filter((e) => {
      if (!(e instanceof WireElm) || e instanceof RoutedWireElm) return true;
      const t0 = along(e.x, e.y);
      const t1 = along(e.x2, e.y2);
      return t0 === null || t1 === null || Math.min(t0, t1) < lo || Math.max(t0, t1) > hi;
    });
    return true;
  }

  /**
   * A post that lands on a long part's lead, between one of its posts and its body, would be a
   * bad connection. Instead the part is shortened about its body so that its post is there, and
   * wires fill the rest of its leads out to where its posts were. Only parts or posts that were
   * just placed or moved count (not upstream).
   */
  private joinLeads(touched: readonly CircuitElm[]): boolean {
    if (!this.spliceOnDrop || touched.length === 0) return false;
    const moved = new Set(touched);
    let changed = false;
    for (const part of [...this.elements]) {
      if (part instanceof WireElm || part.getPostCount() !== 2) continue;
      const leads = part.routingLeads();
      const a = part.getPost(0);
      const b = part.getPost(1);
      if (leads === null || (a.x !== b.x && a.y !== b.y)) continue;
      if (a.x !== part.x || a.y !== part.y || b.x !== part.x2 || b.y !== part.y2) continue;
      // twice the body's centre, which stays put
      const cx2 = a.x + b.x;
      const cy2 = a.y + b.y;
      let best: { x: number; y: number; side: 0 | 1 } | null = null;
      let bestD = Infinity;
      for (const e of this.elements) {
        if (e === part || (!moved.has(part) && !moved.has(e))) continue;
        for (let i = 0; i !== e.getPostCount(); i++) {
          const p = e.getPost(i);
          if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)) continue;
          const side = onSpan(a, leads[0], p) ? 0 : onSpan(leads[1], b, p) ? 1 : null;
          if (side === null) continue;
          // the point nearest the body sets the new length
          const d = Math.abs(2 * p.x - cx2) + Math.abs(2 * p.y - cy2);
          if (d < bestD) {
            bestD = d;
            best = { x: p.x, y: p.y, side };
          }
        }
      }
      if (best === null) continue;
      const mirror = { x: cx2 - best.x, y: cy2 - best.y };
      const [p0, p1] = best.side === 0 ? [best, mirror] : [mirror, best];
      const old = [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
      part.x = p0.x;
      part.y = p0.y;
      part.x2 = p1.x;
      part.y2 = p1.y;
      part.setPoints();
      const fills: WireElm[] = [];
      for (const [from, to] of [
        [old[0], p0],
        [p1, old[1]],
      ]) {
        if (from.x === to.x && from.y === to.y) continue;
        const w = constructElement('WireElm', from.x, from.y, this.circuit.sim);
        if (!(w instanceof WireElm)) continue;
        w.drag(to.x, to.y);
        this.elements.push(w);
        fills.push(w);
      }
      // other posts that were on the leads are on the new wires now: join them there too
      for (const w of fills)
        for (const e of this.elements)
          for (let i = 0; i !== e.getPostCount(); i++) {
            const p = e.getPost(i);
            if (pointOnSegmentInterior(w.x, w.y, w.x2, w.y2, p.x, p.y)) this.splitWireAt(p.x, p.y);
          }
      changed = true;
    }
    return changed;
  }

  /**
   * The wire being drawn finds its way round parts, with no bend or end on anything but its own
   * two ends. Alt draws it straight, as upstream does.
   */
  private routeDrawnWire(straight: boolean): void {
    const w = this.dragElm;
    this.dragExtras = [];
    if (!(w instanceof WireElm) || w instanceof RoutedWireElm || !this.routeWires || straight)
      return;
    const start = { x: w.x, y: w.y };
    const end = { x: w.x2, y: w.y2 };
    if (start.x === end.x && start.y === end.y) {
      this.drawDir = null;
      return;
    }
    if (this.drawDir === null) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      this.drawDir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
    }
    const bbox = (e: CircuitElm): Rect | null => this.host.bbox(e);
    let grid = this.routeGrid;
    if (grid === null || !grid.covers(end)) {
      grid = this.routeGrid = new RouteGrid(this.elements, {
        gridSize: this.circuit.sim.gridSize,
        bbox,
        extent: [start, end],
        margin: 12,
      });
    }
    // straight across or down and clear of parts: as upstream, joining what it passes over
    if (grid.clearOfBodies(start, end)) return;
    const lead = (p: Pt): number | null => {
      for (const e of this.elements) {
        if (!hasBody(e)) continue;
        for (let i = 0; i !== e.getPostCount(); i++) {
          const q = e.getPost(i);
          if (q.x !== p.x || q.y !== p.y) continue;
          const b = bbox(e);
          return b === null ? null : leadDir(p, b);
        }
      }
      return null;
    };
    const route = grid.route(start, [end], {
      startDir: lead(start) ?? this.drawDir,
      arriveDir: (p) => {
        const d = lead(p);
        return d === null ? null : reverse(d);
      },
    });
    // straight, or no way round: the wire as dragged
    if (route === null || route.length <= 2) return;
    w.x2 = route[1].x;
    w.y2 = route[1].y;
    w.setPoints();
    for (let i = 1; i + 1 < route.length; i++) {
      const leg = constructElement('WireElm', route[i].x, route[i].y, this.circuit.sim);
      if (!(leg instanceof WireElm)) continue;
      leg.x2 = route[i + 1].x;
      leg.y2 = route[i + 1].y;
      leg.setPoints();
      leg.allocNodes();
      this.dragExtras.push(leg);
    }
  }

  /** Lines from what is being dragged to the posts it lines up with. */
  private updateGuides(): void {
    this.guides = NO_GUIDES;
    if (!this.smartGuides) return;
    const moving: Pt[] = [];
    const still = new Set<CircuitElm>();
    const de = this.dragElm;
    if (de !== null) {
      if (de.x === de.x2 && de.y === de.y2) return;
      // a wire or part being drawn out keeps its start; one from the palette moves whole
      const drawing = this.mouseDragging && this.tempMouseMode === MouseMode.ADD_ELM;
      for (let i = 0; i !== de.getPostCount(); i++) {
        const p = de.getPost(i);
        if (!drawing || p.x !== de.x || p.y !== de.y) moving.push({ x: p.x, y: p.y });
      }
      for (const x of this.dragExtras) moving.push({ x: x.x2, y: x.y2 });
    } else if (this.mouseDragging && this.tempMouseMode === MouseMode.DRAG_SELECTED) {
      for (const e of this.elements) {
        if (!e.selected) continue;
        still.add(e);
        for (let i = 0; i !== e.getPostCount(); i++) {
          const p = e.getPost(i);
          moving.push({ x: p.x, y: p.y });
        }
      }
      if (this.follow) for (const w of this.follow.wires()) still.add(w);
    } else if (
      this.mouseDragging &&
      this.tempMouseMode === MouseMode.DRAG_POST &&
      this.mouseElm !== null &&
      this.draggingPost >= 0 &&
      this.draggingPost < this.mouseElm.getPostCount()
    ) {
      const p = this.mouseElm.getPost(this.draggingPost);
      moving.push({ x: p.x, y: p.y });
      still.add(this.mouseElm);
    } else return;
    const fixed: Pt[] = [];
    for (const e of this.elements) {
      if (still.has(e)) continue;
      for (let i = 0; i !== e.getPostCount(); i++) {
        const p = e.getPost(i);
        fixed.push({ x: p.x, y: p.y });
      }
    }
    this.guides = alignmentGuides(moving, fixed);
  }

  /** Can the selection be lined up (two parts or more) or spread out (three or more)? */
  alignable(): { align: boolean; spread: boolean } {
    const n = alignUnits(this.selectedElements(), this.elements).length;
    return { align: n >= 2, spread: n >= 3 };
  }

  /** Line the selected parts up along an edge or centre. */
  align(kind: AlignKind): 'moved' | 'unchanged' | 'refused' | 'none' {
    const units = alignUnits(this.selectedElements(), this.elements);
    if (units.length < 2) return 'none';
    const bbox = (e: CircuitElm): Rect | null => this.host.bbox(e);
    return this.moveUnits('Align', alignOffsets(units, kind, this.circuit.sim.gridSize, bbox));
  }

  /** Spread the selected parts out evenly across or down. */
  spread(axis: SpreadAxis): 'moved' | 'unchanged' | 'refused' | 'none' {
    const units = alignUnits(this.selectedElements(), this.elements);
    if (units.length < 3) return 'none';
    const bbox = (e: CircuitElm): Rect | null => this.host.bbox(e);
    return this.moveUnits('Spread', spreadOffsets(units, axis, this.circuit.sim.gridSize, bbox));
  }

  /**
   * Move parts by their own offsets, one undo step, their wires following each. If that would
   * change what connects to what (a post landing on another), nothing moves.
   */
  private moveUnits(label: string, offsets: Map<Unit, Offset>): 'moved' | 'unchanged' | 'refused' {
    if (offsets.size === 0) return 'unchanged';
    const saved = this.circuit.dumpXml();
    const before = connectivity(this.elements);
    const selected = new Set(this.selectedElements());
    this.history.begin(label);
    let moved = false;
    let blocked = false;
    for (const [unit, { dx, dy }] of offsets) {
      if (!unit.every((e) => e.allowMove(dx, dy, this.elements))) {
        blocked = true;
        break;
      }
      // each unit takes its own wires along
      const mine = new Set(unit);
      for (const ce of this.elements) ce.selected = mine.has(ce);
      const follow = this.wiresFollow ? WireFollow.start(this.elements) : null;
      // a part staying put with a post straight on one of ours gets a wire to where it went
      const bridges: { x: number; y: number }[] = [];
      for (const e of unit)
        for (let i = 0; i !== e.getPostCount(); i++) {
          const p = e.getPost(i);
          const held = this.elements.some((o) => {
            if (mine.has(o) || o instanceof WireElm) return false;
            for (let k = 0; k !== o.getPostCount(); k++) {
              const q = o.getPost(k);
              if (q.x === p.x && q.y === p.y) return true;
            }
            return false;
          });
          if (held && !bridges.some((b) => b.x === p.x && b.y === p.y))
            bridges.push({ x: p.x, y: p.y });
        }
      for (const e of unit) e.move(dx, dy);
      follow?.apply(dx, dy, true);
      follow?.finish();
      for (const b of bridges) {
        const w = constructElement('WireElm', b.x, b.y, this.circuit.sim);
        if (!(w instanceof WireElm)) continue;
        w.drag(b.x + dx, b.y + dy);
        this.elements.push(w);
      }
      moved = true;
    }
    for (const ce of this.elements) ce.selected = selected.has(ce);
    if (!moved && !blocked) {
      this.history.cancel();
      return 'unchanged';
    }
    // one part would land on another, or a post on a post: none of it
    if (blocked || connectivity(this.elements) !== before) {
      this.history.cancel();
      this.forgetElements();
      this.host.restore(saved);
      this.host.selectionChanged();
      return 'refused';
    }
    this.history.touch();
    this.history.commit();
    this.host.circuitChanged();
    this.host.selectionChanged();
    return 'moved';
  }

  // ---- commands (upstream CommandManager) ----------------------------------------------------

  /**
   * What a shortcut acts on when no element is given: the selection, else the element under the
   * mouse (upstream acts on the hovered element when a shortcut is pressed over one).
   */
  keyTarget(): CircuitElm | null {
    return this.countSelected() > 0 ? null : this.mouseElm;
  }

  /** The elements a command acts on: `menuElm` unless it is part of the selection. */
  private target(menuElm: CircuitElm | null): CircuitElm[] {
    const sel = this.selectedElements();
    if (menuElm !== null && !menuElm.selected) return [menuElm];
    return sel;
  }

  /** Delete the selection, or the element under the mouse. */
  deleteSelected(menuElm: CircuitElm | null = this.keyTarget()): void {
    const doomed = new Set(this.target(menuElm));
    if (doomed.size === 0) return;
    this.history.record('Delete', () => {
      this.circuit.elements = this.elements.filter((e) => !doomed.has(e));
      // undocked scopes of what was deleted go too (upstream deleteUnusedScopeElms)
      this.circuit.removeUnusedScopeElms();
      if (this.mouseElm !== null && doomed.has(this.mouseElm)) this.mouseElm = null;
    });
    this.host.circuitChanged();
    this.host.selectionChanged();
  }

  /** Upstream copyOfSelectedElms. */
  copySelected(menuElm: CircuitElm | null = this.keyTarget()): string | null {
    const els = this.target(menuElm);
    if (els.length === 0) return null;
    this.clipboard = this.circuit.dumpElementsXml(els);
    return this.clipboard;
  }

  cut(menuElm: CircuitElm | null = this.keyTarget()): string | null {
    const s = this.copySelected(menuElm);
    if (s !== null) this.deleteSelected(menuElm);
    return s;
  }

  get hasClipboard(): boolean {
    return this.clipboard.length > 0;
  }

  setClipboard(text: string): void {
    this.clipboard = text;
  }

  duplicate(menuElm: CircuitElm | null = this.keyTarget()): void {
    const els = this.target(menuElm);
    if (els.length === 0) return;
    this.paste(this.circuit.dumpElementsXml(els));
  }

  /** Upstream doPaste: add the elements, selected, beside the circuit or at the mouse. */
  paste(dump: string = this.clipboard): boolean {
    if (dump.length === 0) return false;
    let ok = true;
    let pasted: CircuitElm[] = [];
    const kept = this.guardedRecord(
      'Paste',
      () => {
        for (const e of this.elements) e.selected = false;
        const oldbb = this.boundsOf(this.elements);
        let added: CircuitElm[];
        try {
          added = this.circuit.readRetain(dump);
        } catch {
          ok = false;
          return false;
        }
        if (added.length === 0) {
          ok = false;
          return false;
        }
        pasted = added;
        for (const e of added) e.selected = true;
        const newbb = this.boundsOf(added);
        if (oldbb !== null && newbb !== null) {
          let dx = 0;
          let dy = 0;
          const area = this.host.visibleArea();
          const ow = oldbb.x2 - oldbb.x1;
          const oh = oldbb.y2 - oldbb.y1;
          const nw = newbb.x2 - newbb.x1;
          const nh = newbb.y2 - newbb.y1;
          const spacew = area.x2 - area.x1 - ow - nw;
          const spaceh = area.y2 - area.y1 - oh - nh;
          if (!intersects(oldbb, newbb)) {
            dx = this.snapGrid(oldbb.x1 - newbb.x1);
            dy = this.snapGrid(oldbb.y1 - newbb.y1);
          }
          if (spacew > spaceh)
            dx = this.snapGrid(oldbb.x1 + ow - newbb.x1 + this.circuit.sim.gridSize);
          else dy = this.snapGrid(oldbb.y1 + oh - newbb.y1 + this.circuit.sim.gridSize);
          // near the mouse if it's on the canvas and nothing would land on top of something
          const m = this.mousePos;
          if (m !== null) {
            const mdx = this.snapGrid(m.x - (newbb.x1 + nw / 2));
            const mdy = this.snapGrid(m.y - (newbb.y1 + nh / 2));
            if (added.every((e) => e.allowMove(mdx, mdy, this.elements))) {
              dx = mdx;
              dy = mdy;
            }
          }
          for (const e of added) e.move(dx, dy);
        }
      },
      () => pasted,
    );
    this.host.circuitChanged();
    this.host.selectionChanged();
    return ok && kept;
  }

  private boundsOf(els: readonly CircuitElm[]): Rect | null {
    let r: Rect | null = null;
    for (const e of els) {
      const b = this.host.bbox(e) ?? {
        x1: Math.min(e.x, e.x2),
        y1: Math.min(e.y, e.y2),
        x2: Math.max(e.x, e.x2),
        y2: Math.max(e.y, e.y2),
      };
      r =
        r === null
          ? { ...b }
          : {
              x1: Math.min(r.x1, b.x1),
              y1: Math.min(r.y1, b.y1),
              x2: Math.max(r.x2, b.x2),
              y2: Math.max(r.y2, b.y2),
            };
    }
    return r;
  }

  /** Upstream prepareFlip: the elements to flip (all if none selected) and their centre. */
  private prepareFlip(menuElm: CircuitElm | null): { els: CircuitElm[]; cx: number; cy: number } {
    if (menuElm !== null && !menuElm.selected) {
      for (const e of this.elements) e.selected = false;
      menuElm.selected = true;
    }
    const count = this.countSelected();
    const els = this.elements.filter((e) => e.selected || count === 0);
    let minx = 30000;
    let maxx = -30000;
    let miny = 30000;
    let maxy = -30000;
    for (const ce of els) {
      minx = Math.min(ce.x, ce.x2, minx);
      maxx = Math.max(ce.x, ce.x2, maxx);
      miny = Math.min(ce.y, ce.y2, miny);
      maxy = Math.max(ce.y, ce.y2, maxy);
    }
    // Java int division
    return { els, cx: Math.trunc((minx + maxx) / 2), cy: Math.trunc((miny + maxy) / 2) };
  }

  private flipCommand(label: string, menuElm: CircuitElm | null, fn: (fi: FlipInfo) => void): void {
    this.guardedRecord(label, () => {
      const fi = this.prepareFlip(menuElm);
      if (fi.els.length === 0) return false;
      fn({ ...fi, count: this.countSelected() });
    });
    this.host.circuitChanged();
    this.host.selectionChanged();
  }

  mirrorX(menuElm: CircuitElm | null = null): void {
    this.flipCommand('Mirror', menuElm, (fi) => {
      for (const ce of fi.els) ce.flipX(fi.cx * 2, fi.count);
    });
  }

  mirrorY(menuElm: CircuitElm | null = null): void {
    this.flipCommand('Mirror', menuElm, (fi) => {
      for (const ce of fi.els) ce.flipY(fi.cy * 2, fi.count);
    });
  }

  /** A diagonal flip then a vertical flip: a rotation 90 degrees counterclockwise. */
  rotateCCW(menuElm: CircuitElm | null = null): void {
    this.flipCommand('Rotate', menuElm, (fi) => {
      const xmy = this.snapGrid(fi.cx - fi.cy);
      for (const ce of fi.els) {
        ce.flipXY(xmy, fi.count);
        ce.flipY(fi.cy * 2, fi.count);
      }
    });
  }

  rotateCW(menuElm: CircuitElm | null = null): void {
    this.flipCommand('Rotate', menuElm, (fi) => {
      const xmy = this.snapGrid(fi.cx - fi.cy);
      for (const ce of fi.els) {
        ce.flipY(fi.cy * 2, fi.count);
        ce.flipXY(xmy, fi.count);
      }
    });
  }

  /** Swap an element's terminals (upstream "Swap Terminals", doFlip). */
  swapTerminals(e: CircuitElm): void {
    this.history.record('Swap terminals', () => e.flipPosts());
    this.host.circuitChanged();
  }

  /** Arrow keys: move the selection one grid step. */
  moveSelected(dx: number, dy: number): boolean {
    if (this.countSelected() === 0) return false;
    this.history.record('Move', () => {
      const follow = this.wiresFollow ? WireFollow.start(this.elements) : null;
      for (const ce of this.elements) if (ce.selected) ce.move(dx, dy);
      follow?.apply(dx, dy, true);
      follow?.finish();
    });
    this.host.circuitChanged();
    return true;
  }

  /**
   * Tidy up the selection, or the whole circuit when nothing is selected (not in upstream):
   * straighten wires, remove kinks and nudge parts into line. What connects to what never
   * changes; if a check after the tidy finds it did, the circuit is put back. Null: put back.
   */
  tidyUp(): TidyResult | null {
    const only = this.countSelected() > 0 ? new Set(this.selectedElements()) : null;
    // wires a scope plots stay, so the scope keeps its trace
    const keep = new Set<CircuitElm>();
    for (const s of [...this.circuit.scopes.scopes, ...this.circuit.undockedScopes()])
      for (const p of s.plots) if (p.elm !== null) keep.add(p.elm);
    const saved = this.circuit.dumpXml();
    const before = connectivity(this.elements);
    this.history.begin('Tidy up');
    const result = tidy(this.circuit.elements, {
      gridSize: this.circuit.sim.gridSize,
      bbox: (e) => this.host.bbox(e),
      only,
      keep,
    });
    if (result.changed && !keepsConnections(before, connectivity(this.elements))) {
      this.history.cancel();
      this.forgetElements();
      this.host.restore(saved);
      return null;
    }
    if (result.changed) {
      this.history.touch();
      this.forgetElements();
    }
    this.history.commit();
    this.host.circuitChanged();
    this.host.selectionChanged();
    return result;
  }

  /** A part of this class built where `e` is, or null if it can't be. */
  private buildLike(e: CircuitElm, className: string): CircuitElm | null {
    const n = constructElement(className, e.x, e.y, this.circuit.sim);
    if (n === null) return null;
    n.x2 = e.x2;
    n.y2 = e.y2;
    n.setPoints();
    return n;
  }

  /**
   * Which of these classes could take the part's place (not in upstream): built on the same two
   * points, its posts land exactly where the part's are, so every connection stays.
   */
  replacementsFor(e: CircuitElm, classes: readonly string[]): string[] {
    if (e instanceof WireElm || e.getPostCount() === 0) return [];
    const posts = (x: CircuitElm): string => {
      const out: string[] = [];
      for (let i = 0; i !== x.getPostCount(); i++) {
        const p = x.getPost(i);
        out.push(`${p.x},${p.y}`);
      }
      return out.sort().join(';');
    };
    const want = posts(e);
    return classes.filter((c) => {
      try {
        const n = this.buildLike(e, c);
        return n !== null && !(n instanceof WireElm) && posts(n) === want;
      } catch {
        return false;
      }
    });
  }

  /** Swap a part for one of another class in the same place (Replace with…). One undo step. */
  replaceWith(e: CircuitElm, className: string): CircuitElm | null {
    const i = this.elements.indexOf(e);
    if (i < 0) return null;
    const n = this.buildLike(e, className);
    if (n === null) return null;
    this.history.record('Replace', () => {
      n.selected = e.selected;
      this.elements[i] = n;
      // scopes watching the old part watch the new one
      for (const sc of [...this.circuit.scopes.scopes, ...this.circuit.undockedScopes()])
        for (const p of sc.plots) if (p.elm === e) p.elm = n;
      if (this.mouseElm === e) this.mouseElm = null;
    });
    this.host.placed?.(className);
    this.host.circuitChanged();
    this.host.selectionChanged();
    return n;
  }

  /** Split the wire under the mouse at the grid point nearest (gx, gy). */
  splitWire(gx: number, gy: number): void {
    this.history.record('Split wire', () => this.splitWireAt(this.snapGrid(gx), this.snapGrid(gy)));
    this.host.circuitChanged();
  }

  /** Can every element the flip commands would act on be flipped that way? */
  canFlip(menuElm: CircuitElm | null = null): { x: boolean; y: boolean; xy: boolean } {
    const count = this.countSelected();
    const els =
      menuElm !== null && !menuElm.selected
        ? [menuElm]
        : this.elements.filter((e) => e.selected || count === 0);
    let x = true;
    let y = true;
    let xy = true;
    for (const e of els) {
      if (!e.canFlipX()) x = false;
      if (!e.canFlipY()) y = false;
      if (!e.canFlipXY()) xy = false;
    }
    return { x, y, xy };
  }
}

interface FlipInfo {
  els: CircuitElm[];
  cx: number;
  cy: number;
  count: number;
}

function inBox(b: Rect, x: number, y: number): boolean {
  return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
}

/** The post of `e` nearest (x, y), or null if it has none. */
function nearestPin(e: CircuitElm, x: number, y: number): Pt | null {
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let i = 0; i !== e.getPostCount(); i++) {
    const p = e.getPost(i);
    const d = distanceSq(p.x, p.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = { x: p.x, y: p.y };
    }
  }
  return best;
}

function grow(b: Rect, d: number): Rect {
  return { x1: b.x1 - d, y1: b.y1 - d, x2: b.x2 + d, y2: b.y2 + d };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2;
}

/** `b` lies inside `a`. */
function encloses(a: Rect, b: Rect): boolean {
  return a.x1 <= b.x1 && b.x2 <= a.x2 && a.y1 <= b.y1 && b.y2 <= a.y2;
}

/** The rectangle spanned by an element's two points (upstream's box `boundingBox`). */
function pointsRect(e: CircuitElm): Rect {
  return {
    x1: Math.min(e.x, e.x2),
    y1: Math.min(e.y, e.y2),
    x2: Math.max(e.x, e.x2),
    y2: Math.max(e.y, e.y2),
  };
}

/** Is p on the axis-aligned segment from a to b, ends included? */
function onSpan(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
): boolean {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

/** Upstream CircuitElm.pointOnSegmentInterior: strictly inside an axis-aligned segment. */
export function pointOnSegmentInterior(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): boolean {
  if ((px === ax && py === ay) || (px === bx && py === by)) return false;
  if (ax === bx && px === ax) return py > Math.min(ay, by) && py < Math.max(ay, by);
  if (ay === by && py === ay) return px > Math.min(ax, bx) && px < Math.max(ax, bx);
  return false;
}

/** Points where upstream draws a post dot: dead ends and junctions (not two-way joints). */
export function postDrawList(els: readonly CircuitElm[]): { x: number; y: number }[] {
  const count = new Map<string, { x: number; y: number; n: number }>();
  for (const e of els) {
    for (let j = 0; j !== e.getPostCount(); j++) {
      const p = e.getPost(j);
      const k = `${p.x},${p.y}`;
      const c = count.get(k);
      if (c) c.n++;
      else count.set(k, { x: p.x, y: p.y, n: 1 });
    }
  }
  return [...count.values()].filter((p) => p.n !== 2);
}

/** Does a two-post element already join a and b directly? */
function hasDirectConnection(
  els: readonly CircuitElm[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  for (const ce of els) {
    if (ce.getPostCount() !== 2) continue;
    const p0 = ce.getPost(0);
    const p1 = ce.getPost(1);
    if (
      (p0.x === ax && p0.y === ay && p1.x === bx && p1.y === by) ||
      (p0.x === bx && p0.y === by && p1.x === ax && p1.y === ay)
    )
      return true;
  }
  return false;
}
