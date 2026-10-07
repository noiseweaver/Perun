// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CompositeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitNode, type Point, type SimElement } from '@circuitjs-next/engine';
import { CircuitElm } from '../CircuitElm.ts';
import { unescapeToken } from '../escape.ts';
import { elementFactory } from '../factory.ts';
import { parseJavaInt } from '../java.ts';
import { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { AttrReader, AttrWriter, copyInto } from '../xmlattrs.ts';
import { XmlElement } from '../xmldoc.ts';
import { GroundElm } from './GroundElm.ts';
import { applyBindings, type ParamEnv } from '../params.ts';

/**
 * A circuit element made of other circuit elements, simulated part by part. Subclasses build
 * their parts in initNew/undump with loadComposite or loadCompositeXml.
 */
export abstract class CompositeElm extends CircuitElm {
  // need to use escape() instead of converting spaces to _'s so composite elements can be nested
  static readonly FLAG_ESCAPE = 1;

  compElmList: CircuitElm[] = [];
  compNodeList: CircuitNode[] | null = null;
  numPosts = 0;
  numNodes = 0;
  posts: Point[] = [];
  /** Node numbers of each part's posts (space separated), kept for buildCompNodeList. */
  compNodeInfo: string[] = [];
  extNodeIds: number[] = [];

  /** Upstream's `(xx, yy, s, externalNodes)` constructor body. */
  initComposite(model: string, externalNodes: number[]): void {
    this.loadComposite(null, model, externalNodes);
    this.buildCompNodeList();
    this.allocNodes();
  }

  /** Upstream's text constructor body. */
  undumpComposite(st: StringTokenizer, model: string, externalNodes: number[]): void {
    this.loadComposite(st, model, externalNodes);
    this.buildCompNodeList();
    this.allocNodes();
  }

  override getChildElmList(): SimElement[] {
    return this.compElmList;
  }

  useEscape(): boolean {
    return (this.flags & CompositeElm.FLAG_ESCAPE) !== 0;
  }

  loadComposite(stIn: StringTokenizer | null, model: string, externalNodes: number[]): void {
    const modelLinet = new StringTokenizer(model, '\r');
    this.compElmList = [];
    const nodeInfoList: string[] = [];

    // build compElmList from the model, keeping the node info for later
    while (modelLinet.hasMoreTokens()) {
      const line = modelLinet.nextToken();
      const sp = line.indexOf(' ');
      const ceType = line.substring(0, sp);
      const nodeStr = line.substring(sp + 1);
      let newce = elementFactory.construct(ceType, 0, 0, this.sim);
      if (stIn !== null && newce !== null) {
        const tint = newce.getDumpType();
        let dumpedCe = stIn.nextToken();
        if (this.useEscape()) dumpedCe = unescapeToken(dumpedCe);
        const stCe = new StringTokenizer(dumpedCe, this.useEscape() ? ' ' : '_');
        const flags = parseJavaInt(stCe.nextToken());
        newce = elementFactory.createCe(tint, 0, 0, 0, 0, flags, stCe, this.sim);
      }
      if (newce === null) continue;
      if (newce instanceof GroundElm) newce.flags |= GroundElm.FLAG_OLD_STYLE;
      newce.parent = this;
      this.compElmList.push(newce);
      nodeInfoList.push(nodeStr);
    }

    this.compNodeInfo = nodeInfoList;
    this.extNodeIds = externalNodes;
    this.numPosts = this.numNodes = externalNodes.length;
    this.posts = new Array<Point>(this.numPosts);

    // dump new circuits with escape()
    this.flags |= CompositeElm.FLAG_ESCAPE;
  }

  /** Called for each `ccm` model record among the parts (subcircuits register it). */
  loadNestedModel(_r: XmlAttrReader): void {}

  /**
   * `env`: the parameter values of a subcircuit copy, for parts with bound fields (not in
   * upstream, PLAN.md Phase 16). Without it the parts keep the values saved in the model.
   */
  loadCompositeXml(elmEntries: XmlElement[], externalNodes: number[], env?: ParamEnv): void {
    this.compElmList = [];
    const nodeInfoList: string[] = [];

    for (const childElem of elmEntries) {
      const tagName = childElem.name;
      if (tagName === 'ccm') {
        // a referenced subcircuit model, embedded when this model was made from a selection that
        // included an instance of it
        this.loadNestedModel(new AttrReader(childElem));
        continue;
      }
      const className = elementFactory.classNameForXmlTag(tagName);
      if (className === undefined) continue;
      // skip parts that are only needed for display. A ground with coordinates came from a newer
      // dump where it is only visual; old-style dumps have none and need it for simulation.
      if (
        className === 'WireElm' ||
        className === 'RoutedWireElm' ||
        className === 'LabeledNodeElm' ||
        className === 'ScopeElm' ||
        className === 'GraphicElm' ||
        (className === 'GroundElm' && childElem.getAttribute('x') !== null)
      )
        continue;
      const newce = elementFactory.construct(className, 0, 0, this.sim);
      if (newce === null) continue;
      if (newce instanceof GroundElm) newce.flags |= GroundElm.FLAG_OLD_STYLE;
      newce.undumpXml(new AttrReader(childElem));
      if (env !== undefined && newce.paramExprs !== null) applyBindings(newce, env);
      newce.parent = this;
      this.compElmList.push(newce);
      nodeInfoList.push(childElem.getAttribute('nn') ?? '');
    }

    this.compNodeInfo = nodeInfoList;
    this.extNodeIds = externalNodes;
    // numNodes lets allocNodes work when creating; the real count comes at preStamp
    this.numPosts = this.numNodes = externalNodes.length;
    this.posts = new Array<Point>(this.numPosts);
    this.flags |= CompositeElm.FLAG_ESCAPE;
  }

  /**
   * Build compNodeList from the stored node info. Called from preStamp so the parts have their
   * final state (after undumpXml) when asked for their internal node counts.
   */
  buildCompNodeList(): void {
    const compNodeHash = new Map<number, CircuitNode>();
    const order: number[] = [];
    const compNodeList: CircuitNode[] = [];

    for (let i = 0; i !== this.compElmList.length; i++) {
      const ce = this.compElmList[i];
      const stNodes = new StringTokenizer(this.compNodeInfo[i], ' +\t');
      let thisPost = 0;
      while (stNodes.hasMoreTokens()) {
        const nodeOfThisPost = parseJavaInt(stNodes.nextToken());
        // node = 0 means ground
        if (nodeOfThisPost === 0) {
          ce.setNode(thisPost, this.sim.ground);
          ce.setNodeVoltage(thisPost, 0);
          thisPost++;
          continue;
        }
        const cnLink = { num: thisPost, elm: ce as SimElement };
        let cn = compNodeHash.get(nodeOfThisPost);
        if (cn === undefined) {
          cn = new CircuitNode();
          compNodeHash.set(nodeOfThisPost, cn);
          order.push(nodeOfThisPost);
        }
        cn.links.push(cnLink);
        thisPost++;
      }
    }

    // flatten: external nodes first
    const remaining = new Set(order);
    for (const id of this.extNodeIds) {
      const cn = compNodeHash.get(id);
      if (cn === undefined || !remaining.has(id)) {
        this.compNodeList = null;
        return;
      }
      compNodeList.push(cn);
      remaining.delete(id);
    }
    // upstream's HashMap<Integer, …> runs on GWT, whose integer-keyed maps iterate in insertion
    // order (the golden fixtures show it), not java.util.HashMap's bucket order
    for (const id of remaining) compNodeList.push(compNodeHash.get(id) as CircuitNode);

    // allocate more nodes for the parts' internal nodes
    for (const ce of this.compElmList) {
      const inodes = ce.getInternalNodeCount();
      for (let j = 0; j !== inodes; j++) {
        const cn = new CircuitNode();
        cn.links.push({ num: j + ce.getPostCount(), elm: ce });
        compNodeList.push(cn);
      }
    }

    this.compNodeList = compNodeList;
    this.numNodes = compNodeList.length;
  }

  override preStamp(): void {
    for (const ce of this.compElmList) ce.preStamp();
    this.buildCompNodeList();
    this.allocNodes();
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    for (let i = 0; i !== this.compElmList.length; i++) {
      const ce = this.compElmList[i];
      const child = new XmlElement(ce.getXmlDumpType());
      const cw = new AttrWriter(child);
      ce.dumpXmlState(cw);
      // if no state dumped, skip it
      if (child.attributes.length === 0 && child.children.length === 0) continue;
      cw.dumpAttr('ix', i);
      copyInto(w.addChild(child.name), child);
    }
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    for (const cr of r.getChildElements()) {
      const ix = cr.parseIntAttr('ix', -1);
      const ce = this.compElmList[ix];
      if (ce === undefined) throw new Error('no composite child ' + ix);
      if (cr.getTagName() !== ce.getXmlDumpType())
        throw new Error('dump type mismatch for composite child: ' + ix);
      ce.undumpXml(cr);
    }
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override hasGroundConnection(_n1: number): boolean {
    return false;
  }

  override reset(): void {
    for (const ce of this.compElmList) ce.reset();
  }

  override getPostCount(): number {
    return this.numPosts;
  }
  override getInternalNodeCount(): number {
    return this.numNodes - this.numPosts;
  }
  override getPost(n: number): Point {
    return this.posts[n];
  }
  setPost(n: number, p: Point): void {
    this.posts[n] = p;
  }

  override getPower(): number {
    let power = 0;
    for (const ce of this.compElmList) power += ce.getPower();
    return power;
  }

  override stamp(): void {
    for (const ce of this.compElmList) ce.setParentList(this.compElmList);
  }

  /** Node p (local to this element) is now n (global): pass it to every part on that node. */
  override setNode(p: number, n: CircuitNode): void {
    super.setNode(p, n);
    if (this.compNodeList === null) return;
    for (const link of this.compNodeList[p].links) link.elm.setNode(link.num, n);
  }

  override canViewInScope(): boolean {
    return false;
  }

  override getCurrentIntoNode(n: number): number {
    if (this.compNodeList === null) return 0;
    let c = 0;
    for (const link of this.compNodeList[n].links) c += link.elm.getCurrentIntoNode(link.num);
    return c;
  }
}
