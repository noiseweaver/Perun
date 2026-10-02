#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Static survey of upstream element classes, used to generate the table in docs/ELEMENTS.md.

Usage: python3 tools/recon/elements.py > /tmp/elements.json
Reads reference/circuitjs1 only. Heuristic (regex based), so check odd rows by hand.
"""
import json, os, re, sys, collections

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'reference', 'circuitjs1')
SRC = os.path.join(ROOT, 'src/com/lushprojects/circuitjs1/client')
PUB = os.path.join(ROOT, 'src/com/lushprojects/circuitjs1/public')

HOOKS = ['stamp', 'doStep', 'startIteration', 'stepFinished', 'calculateCurrent', 'getInternalNodeCount',
         'getVoltageSourceCount', 'setCurrent', 'setVoltageSource', 'getConnection', 'hasGroundConnection',
         'getCurrentIntoNode', 'isWireEquivalent', 'isRemovableWire', 'reset', 'execute', 'setNodeVoltage',
         'nonLinear', 'getPostCount', 'isIdealCapacitor', 'isGraphicElmt', 'canViewInScope']

def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)

def method_body(src, name):
    m = re.search(r'\b[\w<>\[\]]+\s+' + name + r'\s*\(([^)]*)\)\s*(?:throws [\w, ]+)?\{', src)
    if not m: return None
    i = m.end(); depth = 1
    while depth and i < len(src):
        depth += {'{': 1, '}': -1}.get(src[i], 0); i += 1
    return src[m.end():i - 1].strip()

classes = {}
for fn in sorted(os.listdir(SRC)):
    if not fn.endswith('.java'): continue
    src = strip_comments(open(os.path.join(SRC, fn), encoding='utf-8', errors='replace').read())
    for m in re.finditer(r'\bclass\s+(\w+)(?:\s+extends\s+(\w+))?', src):
        name, parent = m.group(1), m.group(2)
        if name in classes: continue
        # only analyze the top-level class body of its own file
        body = src if name == fn[:-5] else ''
        info = {'file': fn, 'parent': parent, 'hooks': {}, 'abstract': bool(re.search(r'abstract\s+class\s+' + name, src))}
        for h in HOOKS:
            b = method_body(body, h)
            if b is not None: info['hooks'][h] = b
        b = method_body(body, 'getDumpType')
        if b:
            r = re.search(r"return\s+([^;]+);", b); info['dumpType'] = r.group(1).strip() if r else b
        b = method_body(body, 'getXmlDumpType')
        if b:
            r = re.search(r'return\s+"([^"]*)"', b); info['xmlDumpType'] = r.group(1) if r else '(computed)'
        info['random'] = bool(re.search(r'Math\.random|\.random\.next|getrand\(', body))
        info['twoIntCtor'] = bool(re.search(r'\b' + name + r'\s*\(\s*int\s+\w+\s*,\s*int\s+\w+\s*\)', body))
        classes[name] = info

def is_elm(n):
    while n:
        if n == 'CircuitElm': return True
        n = classes.get(n, {}).get('parent')
    return False

def inherited(n, key, sub=None):
    while n and n in classes:
        c = classes[n]
        v = c.get(key) if sub is None else c[key].get(sub)
        if v is not None: return v, n
        n = c.get('parent')
    return None, None

menus = strip_comments(open(os.path.join(SRC, 'Menus.java'), encoding='utf-8').read())
in_menu = set(re.findall(r'"(\w+Elm)"', menus)) | {'CCVSElm', 'VCCSElm'}

def inherited_random(n):
    while n and n in classes and n != 'CircuitElm':
        if classes[n]['random']: return n
        n = classes[n].get('parent')
    return None

def dump_value(expr):
    if expr is None: return None
    m = re.fullmatch(r"'(.)'", expr)
    if m: return m.group(1)
    if re.fullmatch(r'\d+', expr):
        v = int(expr)
        if v == 0: return None
        return chr(v) if 64 < v < 127 else str(v)
    return expr

# usage in bundled examples (text format first token; XML element tag)
usage = collections.Counter(); xml_usage = collections.Counter()
for fn in os.listdir(os.path.join(PUB, 'circuits')):
    text = open(os.path.join(PUB, 'circuits', fn), encoding='utf-8', errors='replace').read()
    if text.lstrip().startswith('<'):
        for t in set(re.findall(r'^\s*<(\w+)\s', text, flags=re.M)): xml_usage[t] += 1
    else:
        for t in set(l.split()[0] for l in text.splitlines()[1:] if l.strip()): usage[t] += 1

out = []
for n, c in classes.items():
    if not n.endswith('Elm') or not is_elm(n) or n == 'CircuitElm': continue
    dt_expr, _ = inherited(n, 'dumpType')
    dt = dump_value(dt_expr)
    xml = c.get('xmlDumpType')
    if xml is None:
        inh_xml, xml_from = inherited(n, 'xmlDumpType')
        if xml_from == 'GateElm': inh_xml = n.replace('GateElm', '')  # GateElm.getXmlDumpType()
        # CircuitElm.getXmlDumpType(): printable-char dump types map to that char, else class name minus "Elm"
        if inh_xml and inh_xml != '(computed)': xml = inh_xml
        elif dt and len(dt) == 1: xml = dt
        else: xml = n.replace('Elm', '')
    nl_body, nl_from = inherited(n, 'hooks', 'nonLinear')
    hooks = {}
    for h in HOOKS:
        if h == 'nonLinear': continue
        b, frm = inherited(n, 'hooks', h)
        if frm and frm != 'CircuitElm': hooks[h] = frm
    out.append({
        'class': n, 'file': c['file'], 'parent': c['parent'], 'abstract': c['abstract'],
        'dumpType': dt, 'xmlTag': xml, 'inMenu': n in in_menu, 'twoIntCtor': c['twoIntCtor'],
        'nonLinear': (nl_body or 'return false;').replace('return', '').strip(' ;') if nl_from else 'false',
        'nonLinearFrom': nl_from, 'hooks': hooks, 'random': inherited_random(n),
        'exampleFiles': usage.get(dt, 0) if dt else 0, 'xmlExampleFiles': xml_usage.get(xml, 0),
    })
json.dump({'elements': sorted(out, key=lambda e: e['class']), 'textUsage': usage, 'xmlUsage': xml_usage}, sys.stdout, indent=1)
