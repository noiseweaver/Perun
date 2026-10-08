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
 * Runs in the frame before the app. The app's local storage becomes a copy of the plugin's (sent
 * back on every change, so the settings live in the vault), and the app's files (the example
 * circuits, translations, license) come from `files` instead of a server.
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
var E=window.perunEmbed;if(!E)return;
var data=Object.create(null);for(var k in E.storage)data[k]=String(E.storage[k]);
var real=null;try{real=window.localStorage;}catch(e){}
// the clipboard stays on this device, so copying between editor tabs doesn't rewrite the vault
var local=function(k){return k==="circuitClipboard"&&real!==null;};
var send=function(k,v){window.parent.postMessage({perun:"storage",key:k,value:v},"*");};
var keys=function(){return Object.keys(data);};
var s={
  get length(){return keys().length;},
  key:function(n){var a=keys();return n<a.length?a[n]:null;},
  getItem:function(k){k=String(k);if(local(k))return real.getItem(k);return k in data?data[k]:null;},
  setItem:function(k,v){k=String(k);v=String(v);if(local(k)){real.setItem(k,v);return;}
    if(data[k]===v)return;data[k]=v;send(k,v);},
  removeItem:function(k){k=String(k);if(local(k)){real.removeItem(k);return;}
    if(!(k in data))return;delete data[k];send(k,null);},
  clear:function(){keys().forEach(function(k){s.removeItem(k);});}
};
Object.defineProperty(window,"localStorage",{value:s,configurable:true});
})();</script>`;
}
