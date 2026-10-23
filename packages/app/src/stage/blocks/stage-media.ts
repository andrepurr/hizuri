import { parseHostPort } from "@getpaseo/protocol/daemon-endpoints";
import { withPreviewCsp } from "@/file-panels/html-preview-csp";

// Files Zuri opens with show_file. Pictures and videos come as `/stage-media/<hash>`
// paths on the daemon's own origin, like its avatar page; a page comes inline and is drawn in a
// sandbox. The origin is taken from the host's saved direct connection when the app is offline,
// so a cold start in airplane mode still names the same URL its image and video caches hold.

export const STAGE_MEDIA_PREFIX = "/stage-media/";

/** `http://host:port` for a direct endpoint (`https` when the web app itself runs on https). */
export function daemonOrigin(endpoint: string, secure: boolean): string | null {
  try {
    const { host, port, isIpv6 } = parseHostPort(endpoint);
    const lower = host.trim().toLowerCase();
    let base = host;
    if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") base = "localhost";
    else if (isIpv6) base = `[${host}]`;
    return `${secure ? "https" : "http"}://${base}:${port}`;
  } catch {
    return null;
  }
}

/** An https link as it is; a show_file path on the daemon's origin; anything else nothing. */
export function resolveStageMediaUrl(url: string, origin: string | null): string | null {
  if (url.startsWith("https://")) return url;
  if (url.startsWith(STAGE_MEDIA_PREFIX)) return origin ? `${origin}${url}` : null;
  return null;
}

// The page runs in an opaque origin with storage off, so pages that keep their theme or panel state
// in localStorage would throw on the first read. An in-memory Storage stands in; it is gone when
// the tab closes. The second script tells the app while the user pinches the page or has it bigger,
// so a sideways drag pans the page instead of turning the agent page; the hold lasts from the
// second finger down until every finger is up, so a page pinched back below its size does not free
// the pages while the user's fingers still move. Both run before the page's own policy is parsed,
// so a page that pins its scripts by hash still lets them run.
const STORAGE_SHIM = `<script>(function(){function m(){var s=new Map();return{get length(){return s.size},key:function(i){var k=Array.from(s.keys())[i];return k===undefined?null:k},getItem:function(k){k=String(k);return s.has(k)?s.get(k):null},setItem:function(k,v){s.set(String(k),String(v))},removeItem:function(k){s.delete(String(k))},clear:function(){s.clear()}}}["localStorage","sessionStorage"].forEach(function(n){var ok=false;try{ok=!!window[n]}catch(e){}if(!ok){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(e){}}})})();</script>`;
const ZOOM_REPORTER = `<script>(function(){var v=window.visualViewport,b=window.ReactNativeWebView;if(!v||!b)return;var held=false,pinch=false;function send(){var n=pinch||v.scale>1.02;if(n!==held){held=n;b.postMessage(JSON.stringify({hold:n}))}}function lift(e){if(e.touches.length===0){pinch=false;send()}}var o={passive:true,capture:true};v.addEventListener("resize",send);addEventListener("touchstart",function(e){if(e.touches.length>1){pinch=true;send()}},o);addEventListener("touchend",lift,o);addEventListener("touchcancel",lift,o)})();</script>`;

// The sandbox is transparent over Show's dark backdrop, so a bare page (no background of its own)
// drew black text on near-black. Such a page gets the system canvas and text colours, light or
// dark like the phone; a page that paints its own background is left alone.
const BARE_PAGE_CANVAS = `<script>addEventListener("DOMContentLoaded",function(){var d=document.documentElement;function bare(e){if(!e)return true;var c=getComputedStyle(e).backgroundColor;return c==="transparent"||/^rgba\\(.*,\\s*0\\)$/.test(c)}if(bare(d)&&bare(document.body)){d.style.colorScheme="light dark";d.style.background="Canvas";d.style.color="CanvasText"}});</script>`;

// Zuri flips a live page (stage_focus with a slide): the app calls __hizuriSlide(n) in the
// open page (native WebView) or posts {hizuriSlide: n} into the frame (web), so the page moves
// with its own animation and never reloads. A reveal.js deck goes to
// slide n (1-based; Reveal counts from 0) once Reveal is ready; any other page can listen for the
// `hizuri:slide` event. Every global goes through `window`, so the test runs it on a stand-in.
export const SLIDE_DRIVER_JS =
  'var w=window,want=0,tries=0;function go(){var R=w.Reveal;if(R&&R.isReady&&R.isReady()){if(R.getIndices().h!==want-1)R.slide(want-1);return}if(++tries<150)w.setTimeout(go,60)}w.__hizuriSlide=function(n){want=n;tries=0;w.dispatchEvent(new w.CustomEvent("hizuri:slide",{detail:{slide:n}}));go()};w.addEventListener("message",function(e){var d=e.data;if(d&&typeof d.hizuriSlide==="number")w.__hizuriSlide(d.hizuriSlide)});';
const SLIDE_DRIVER = `<script>(function(){${SLIDE_DRIVER_JS}})();</script>`;

/** What the native WebView runs to flip its page; `true` keeps Android's evaluator quiet. */
export function slideCommand(slide: number): string {
  return `window.__hizuriSlide&&window.__hizuriSlide(${Math.trunc(slide)});true;`;
}

/** The page as the sandbox loads it: the preview's policy first, then the small scripts. */
export function stagePageDocument(html: string, options: { reportZoom: boolean }): string {
  const sandboxed = withPreviewCsp(html);
  const head = "<!doctype html>";
  const policyEnd = sandboxed.indexOf(">", head.length) + 1;
  const scripts =
    STORAGE_SHIM + BARE_PAGE_CANVAS + SLIDE_DRIVER + (options.reportZoom ? ZOOM_REPORTER : "");
  return sandboxed.slice(0, policyEnd) + scripts + sandboxed.slice(policyEnd);
}
