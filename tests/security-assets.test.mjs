import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSvg,sanitizeScopedCss} from '../dist/safe-assets.js';
test('SVG sanitizer preserves geometry and removes scripts, handlers and remote references',()=>{const dirty='<svg viewBox="0 0 24 24" onclick="steal()"><script>alert(1)</script><foreignObject><div>x</div></foreignObject><path fill="red" d="M0 0h24v24z"/><image href="https://evil/x"/></svg>';const safe=sanitizeSvg(dirty);assert.match(safe,/<path/);assert.doesNotMatch(safe,/script|foreignObject|onclick|https:\/\//i);});
test('SVG sanitizer rejects empty, huge, malformed and remote-only files',()=>{for(const value of ['<svg></svg>','<svg><image href="https://evil/x"/></svg>','x'.repeat(1024*1024+1)])assert.throws(()=>sanitizeSvg(value));});
test('custom CSS is scoped and blocks imports, URLs, broad and attribute selectors',()=>{const {css,errors}=sanitizeScopedCss('@import "https://evil"; body{color:red}.widget:hover{opacity:.5}.x[data-secret]{color:red}.icon{background:url(https://evil)}','#rt-preview');assert.match(css,/#rt-preview \.widget:hover/);assert.doesNotMatch(css,/https|body|data-secret|url\(/);assert.ok(errors.length>=3);});
