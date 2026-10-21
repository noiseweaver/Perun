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
 * Runs in the frame before the app: the app's files (the example circuits, translations, license)
 * come from `files` instead of a server. (The app's stored data goes to the plugin through its
 * platform module, packages/app/src/platform/obsidian.ts.)
 */
export function shimScript(files: Record<string, string>): string {
  const json = JSON.stringify(files).replace(/</g, '\\u003c');
  return `<script>(function(){
var F=${json};
var of=window.fetch.bind(window);
window.fetch=function(i,o){
  var u=typeof i==="string"?i:(i&&i.url)||"";
  var p=decodeURIComponent(u.split("?")[0].split("#")[0]);
  for(var k in F){if(p===k||p.slice(-k.length-1)==="/"+k){
    return Promise.resolve(new Response(F[k],{status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}}));}}
  return of(i,o);
};
})();</script>`;
}
