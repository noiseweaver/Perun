// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

// Parts of the editor page that build.ts puts together (plain code: build.ts runs it in Node).

/** Where the page leaves room for its configuration (frame.ts fills it in). */
export const CONFIG_MARKER = '<!--perun-embed-config-->';

/** `page` with its configuration filled in (window.perunEmbed, read by the app's embedConfig.ts). */
export function fillConfig(page: string, config: object): string {
  // `<` escaped so no string in the circuit can end the script
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  // a function, so `$` in the circuit text is not a replacement pattern
  return page.replace(CONFIG_MARKER, () => `<script>window.perunEmbed=${json};</script>`);
}

/**
 * Runs in the frame before the app: the app's files come from `files`, inlined in the page (the
 * license and the like), or for the names in `fromPlugin` (example circuits, translations: most
 * of the plugin's size) from the plugin, which hangs `perunHost.file` on the frame element (see
 * appFiles.ts). (The app's stored data goes to the plugin through its platform module,
 * packages/app/src/platform/obsidian.ts.)
 */
export function shimScript(
  files: Record<string, string>,
  fromPlugin: readonly string[] = [],
): string {
  const json = JSON.stringify(files).replace(/</g, '\\u003c');
  const names = JSON.stringify(fromPlugin).replace(/</g, '\\u003c');
  return `<script>(function(){
var F=${json};
var P=${names};
var of=window.fetch.bind(window);
function ok(t){return new Response(t,{status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}});}
function is(p,k){return p===k||p.slice(-k.length-1)==="/"+k;}
window.fetch=function(i,o){
  var u=typeof i==="string"?i:(i&&i.url)||"";
  var p=decodeURIComponent(u.split("?")[0].split("#")[0]);
  for(var k in F){if(is(p,k))return Promise.resolve(ok(F[k]));}
  for(var j=0;j<P.length;j++){if(is(p,P[j])){
    var h=window.frameElement&&window.frameElement.perunHost;
    if(!h)return Promise.resolve(new Response("",{status:404}));
    return h.file(P[j]).then(function(t){return t===null?new Response("",{status:404}):ok(t);});}}
  return of(i,o);
};
})();</script>`;
}
