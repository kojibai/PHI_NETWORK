import{B as e,Er as t,Mr as n,O as r,Tr as i,Zn as a,_r as o,ar as s,er as c,fr as l,lr as u,mr as d,or as f,pr as p,rr as m,sr as ee,un as te,ut as h,vr as g,y as ne}from"./index-CMXSDsMg.js";import{t as _}from"./html2canvas-o_5ztwsH.js";import{t as re}from"./SealMomentModal-ClthO_Sv.js";var v=n(t(),1),y=n(h(),1),b=e=>Math.max(0,Math.min(100,e));function ie(e,t){let n=(e??``).toLowerCase().trim();return/(reflekt|reflect|reflektion|reflection)/i.test(n)?`#22c55e`:/(purify|purification|purifikation)/i.test(n)?`#3b82f6`:/dream/i.test(n)?`#7c3aed`:/(ignite|ignition)/i.test(n)?`#ff3b30`:/(integrate|integration)/i.test(n)?`#ff8a00`:/(solar\s*plexus)/i.test(n)?`#ffd600`:t}var ae=({dateISO:e,onDateChange:t,secondsLeft:n,eternalPercent:r,eternalColor:i=`#8beaff`,eternalArkLabel:a=`Eternal Ark`})=>{let o=(0,v.useMemo)(()=>b(r),[r]),s=(0,v.useMemo)(()=>ie(a,i),[a,i]),c={"--eternal-bar":s,"--pulse":`var(--kai-pulse, var(--pulse-dur, 5236ms))`},l=(0,v.useMemo)(()=>({"--fill":(o/100).toFixed(6)}),[o]),u=(0,v.useRef)(null),d=(0,v.useRef)(void 0),f=(0,v.useRef)(null),p=(0,v.useRef)(null);return(0,v.useEffect)(()=>()=>{f.current!==null&&window.clearTimeout(f.current),p.current!==null&&window.cancelAnimationFrame(p.current),u.current&&u.current.classList.remove(`is-boom`),f.current=null,p.current=null},[]),(0,v.useEffect)(()=>{let e=typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(typeof n!=`number`||e){d.current=n;return}let t=u.current,r=d.current;t&&typeof r==`number`&&n-r>1.2&&(t.classList.remove(`is-boom`),p.current!==null&&window.cancelAnimationFrame(p.current),p.current=window.requestAnimationFrame(()=>{t.classList.add(`is-boom`)}),f.current!==null&&window.clearTimeout(f.current),f.current=window.setTimeout(()=>{t.classList.remove(`is-boom`),f.current=null},420)),d.current=n},[n]),(0,y.jsxs)(`div`,{className:`sigil-scope`,style:c,children:[(0,y.jsx)(`h3`,{className:`sigil-title`,children:`Kairos Sigil-Glyph Inhaler`}),(0,y.jsx)(`div`,{className:`sigil-ribbon`,"aria-hidden":`true`}),(0,y.jsx)(`div`,{className:`input-row sigil-row`,children:(0,y.jsxs)(`label`,{className:`sigil-label`,children:[(0,y.jsx)(`span`,{className:`sigil-label__text`,children:`Select moment:`}),`\xA0`,(0,y.jsx)(`input`,{className:`sigil-input`,type:`datetime-local`,value:e,onChange:t})]})}),(0,y.jsx)(`div`,{className:`sigil-bars`,role:`group`,"aria-label":`Day progress`,children:(0,y.jsxs)(`div`,{className:`sigil-bar`,children:[(0,y.jsxs)(`div`,{className:`sigil-bar__head`,children:[(0,y.jsxs)(`span`,{className:`sigil-bar__label`,children:[`Unfoldment`,a?` — ${a}`:``]}),(0,y.jsxs)(`span`,{className:`sigil-bar__pct`,"aria-hidden":`true`,children:[o.toFixed(2),`%`]})]}),(0,y.jsx)(`div`,{className:`sigil-bar__track`,"aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":+o.toFixed(2),role:`progressbar`,"aria-label":`Eternal day ${a||``}`,children:(0,y.jsx)(`div`,{ref:u,className:`sigil-bar__fill sigil-bar__fill--eternal`,style:l})})]})}),(0,y.jsx)(`style`,{children:`
        .sigil-ribbon {
          height: 1px;
          margin: .35rem 0 .85rem 0;
          background: linear-gradient(90deg, rgba(255,255,255,.00), rgba(255,255,255,.22), rgba(255,255,255,.00));
          background-size: 200% 100%;
          animation: sigilRibbonBreath var(--pulse) ease-in-out infinite;
          animation-delay: var(--pulse-offset, 0ms);
          filter: drop-shadow(0 0 8px rgba(139,234,255,.12));
        }

        .sigil-bars { display: grid; gap: .6rem; margin-top: .65rem; }

        .sigil-bar__head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: .28rem;
        }
        .sigil-bar__label { font-size: .86rem; letter-spacing: .01em; color: rgba(255,255,255,.88); }
        .sigil-bar__pct   { font-size: .82rem; color: rgba(255,255,255,.66); font-variant-numeric: tabular-nums; }

        .sigil-bar__track {
          position: relative; height: 12px; border-radius: 999px;
          background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
          border: 1px solid rgba(139,234,255,.22);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.03), 0 6px 16px -8px rgba(0,0,0,.45);
          overflow: hidden;
        }

        .sigil-bar__fill {
          position: absolute; inset: 0 auto 0 0; width: 100%;
          transform-origin: left center;
          transform: scaleX(var(--fill, 0));
          transition: transform .45s cubic-bezier(.22,.61,.36,1);
          will-change: transform, filter;
        }

        .sigil-bar__fill--eternal {
          background:
            radial-gradient(120% 100% at 0% 50%, rgba(255,255,255,.18), transparent 60%) padding-box,
            linear-gradient(90deg,
              color-mix(in oklab, var(--eternal-bar, #8beaff) 92%, white 0%),
              var(--eternal-bar, #8beaff)) border-box;
          filter: drop-shadow(0 0 14px color-mix(in oklab, var(--eternal-bar, #8beaff) 55%, transparent 45%))
                  drop-shadow(0 0 22px color-mix(in oklab, var(--eternal-bar, #8beaff) 35%, transparent 65%));
          animation: barGlow var(--pulse) ease-in-out infinite;
          animation-delay: var(--pulse-offset, 0ms);
        }

        .sigil-bar__fill--eternal::after {
          content: "";
          position: absolute;
          right: -6px;
          top: 50%;
          translate: 0 -50%;
          width: 12px; height: 12px;
          border-radius: 50%;
          background:
            radial-gradient(closest-side, var(--eternal-bar, #8beaff), rgba(255,255,255,.85), transparent 75%);
          filter:
            drop-shadow(0 0 10px color-mix(in oklab, var(--eternal-bar, #8beaff) 85%, transparent 15%))
            drop-shadow(0 0 16px color-mix(in oklab, var(--eternal-bar, #8beaff) 60%, transparent 40%));
          opacity: .95;
          pointer-events: none;
        }

        .sigil-bar__fill--eternal.is-boom {
          animation: barGlow var(--pulse) ease-in-out infinite, explodeFlash 420ms cubic-bezier(.18,.6,.2,1) 1;
          animation-delay: var(--pulse-offset, 0ms), 0ms;
          filter:
            drop-shadow(0 0 22px color-mix(in oklab, var(--eternal-bar, #8beaff) 85%, transparent 15%))
            drop-shadow(0 0 36px color-mix(in oklab, var(--eternal-bar, #8beaff) 65%, transparent 35%));
        }

        .sigil-bar__fill--eternal.is-boom::before {
          content: "";
          position: absolute;
          right: -8px;
          top: 50%;
          translate: 0 -50%;
          width: 10px; height: 10px;
          border-radius: 999px;
          background: radial-gradient(closest-side, white, var(--eternal-bar, #8beaff) 60%, transparent 70%);
          opacity: .95;
          pointer-events: none;
          animation: sparkBurst 420ms cubic-bezier(.18,.6,.2,1) 1;
        }

        @keyframes barGlow {
          0%   { filter: drop-shadow(0 0 10px color-mix(in oklab, var(--eternal-bar, #8beaff) 45%, transparent))
                          drop-shadow(0 0 18px color-mix(in oklab, var(--eternal-bar, #8beaff) 25%, transparent)); }
          50%  { filter: drop-shadow(0 0 18px color-mix(in oklab, var(--eternal-bar, #8beaff) 70%, transparent))
                          drop-shadow(0 0 28px color-mix(in oklab, var(--eternal-bar, #8beaff) 40%, transparent)); }
          100% { filter: drop-shadow(0 0 10px color-mix(in oklab, var(--eternal-bar, #8beaff) 45%, transparent))
                          drop-shadow(0 0 18px color-mix(in oklab, var(--eternal-bar, #8beaff) 25%, transparent)); }
        }

        @keyframes explodeFlash {
          0%   { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); transform: scaleX(var(--fill)) scaleY(1); }
          14%  { box-shadow: inset 0 0 0 2px rgba(255,255,255,.25); transform: scaleX(var(--fill)) scaleY(1.18); }
          28%  { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); transform: scaleX(var(--fill)) scaleY(1.06); }
          100% { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); transform: scaleX(var(--fill)) scaleY(1); }
        }

        @keyframes sparkBurst {
          0%   { opacity: .98; transform: scale(1);   filter: blur(0);   }
          40%  { opacity: .85; transform: scale(2.6); filter: blur(.5px);}
          100% { opacity: 0;   transform: scale(4.2); filter: blur(1px); }
        }

        @keyframes sigilRibbonBreath {
          0% { background-position: 0% 0%; opacity: .8; }
          50% { background-position: 100% 0%; opacity: 1; }
          100% { background-position: 0% 0%; opacity: .8; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sigil-bar__fill--eternal,
          .sigil-ribbon { animation: none !important; }
          .sigil-bar__fill--eternal.is-boom,
          .sigil-bar__fill--eternal.is-boom::before { animation: none !important; }
          .sigil-bar__fill { transition: none !important; }
        }
      `})]})},oe=n(i(),1),se=n(_(),1),ce=n(e(),1),x=1000000n,S=BigInt(2**53-1),le=e=>String(e).padStart(2,`0`),C=e=>e>S?2**53-1:e<-S?-(2**53-1):Number(e),ue=e=>e<0n?-e:e,w=(e,t)=>{if(t===0n)return 0n;let n=e%t;return n>=0n?n:n+t},T=(e,t)=>{let n=e/t;return e%t===0n||e>=0n?n:n-1n},E=e=>e<0n?0n:e,D=(e,t)=>{let n=e<0n?-e:e,r=t<0n?-t:t;for(;r!==0n;){let e=n%r;n=r,r=e}return n},de=(()=>{let e=D(m,x);return e===0n?0n:m/e})(),fe=e=>e.trim().replace(/^(\d+):(\d+)/,(e,t,n)=>`${+t}:${String(n).padStart(2,`0`)}`).replace(/D\s*(\d+)/,(e,t)=>`D${+t}`),pe=e=>{try{let t=u(e);return new Date(C(t)).toISOString()}catch{return``}};function me(e){let t=e.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);if(!t)return null;let n=Number(t[1]),r=Number(t[2])-1,i=Number(t[3]),a=Number(t[4]),o=Number(t[5]),s=Number(t[6]??`0`),c=String(t[7]??`0`).padEnd(3,`0`),l=Number(c),u=new Date(n,r,i,a,o,s,l);return Number.isNaN(u.getTime())?null:u}function he(e,t){let n=Number.isFinite(t)?Math.max(1,Math.min(11,Math.floor(t))):1;try{let t=g(e.toISOString(),n),r=t?new Date(t):e;return Number.isNaN(r.getTime())?e:r}catch{return e}}var O=()=>typeof performance<`u`&&typeof performance.now==`function`?performance.timeOrigin+performance.now():Date.now(),ge=e=>typeof e==`object`&&!!e,k=(e,t)=>{let n=e[t];return typeof n==`string`?n:void 0},A=(e,t)=>{let n=e[t];return typeof n==`number`&&Number.isFinite(n)?n:void 0},j=(e,t)=>{let n=e[t];return ge(n)?n:void 0},_e=(e,t)=>{let n=e[t];if(typeof n==`string`)return Object.prototype.hasOwnProperty.call(c,n)?n:void 0},ve=e=>typeof e==`number`&&Number.isFinite(e)?String(e):typeof e==`bigint`?e.toString():typeof e==`string`?e:``;function ye(e,t){let n=(0,v.useCallback)(()=>{try{let e=u(T(t(),x)+1n)-BigInt(Math.floor(O())),n=C(e<0n?0n:e);return Math.max(0,Math.min(s,n))/1e3}catch{return s/1e3}},[t]),[r,i]=(0,v.useState)(()=>e?n():s/1e3),a=(0,v.useRef)(null),o=(0,v.useRef)(null);return(0,v.useEffect)(()=>{if(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current!==null&&(window.clearInterval(o.current),o.current=null),!e)return;typeof document<`u`&&document.documentElement&&document.documentElement.style.setProperty(`--kai-pulse`,`${s}ms`);let t=()=>{i(n()),a.current=requestAnimationFrame(t)};i(n()),a.current=requestAnimationFrame(t);let r=()=>{document.visibilityState===`hidden`?(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current===null&&(o.current=window.setInterval(()=>{i(n())},33))):(o.current!==null&&(window.clearInterval(o.current),o.current=null),a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),i(n()),a.current=requestAnimationFrame(t))};return document.addEventListener(`visibilitychange`,r),()=>{document.removeEventListener(`visibilitychange`,r),a.current!==null&&cancelAnimationFrame(a.current),o.current!==null&&window.clearInterval(o.current),a.current=null,o.current=null}},[e,n]),e?r:null}var M=()=>{try{return globalThis.crypto?.subtle}catch{return}},be=async e=>{let t=new TextEncoder().encode(e),n=M();if(n)try{let e=await n.digest(`SHA-256`,t);return Array.from(new Uint8Array(e)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}catch{}let r=2166136261;for(let e=0;e<t.length;e++)r^=t[e]??0,r=Math.imul(r,16777619);return(r>>>0).toString(16).padStart(8,`0`)},N={"Ignition Ark":`#ff0024`,"Integration Ark":`#ff6f00`,"Harmonization Ark":`#ffd600`,"Reflection Ark":`#00c853`,"Purification Ark":`#00b0ff`,"Dream Ark":`#c186ff`,"Ignite Ark":`#ff0024`,"Integrate Ark":`#ff6f00`,"Harmonize Ark":`#ffd600`,"Reflekt Ark":`#00c853`,"Purifikation Ark":`#00b0ff`},xe=e=>{if(!e)return`#ffd600`;let t=e.trim(),n=t.replace(/\s*ark$/i,` Ark`);return N[t]??N[n]??`#ffd600`},Se=()=>(0,y.jsx)(`style`,{children:`
    .sigil-modal { position: relative; isolation: isolate; }

    .sigil-modal .close-btn {
      z-index: 99999 !important;
      pointer-events: auto;
      touch-action: manipulation;
    }
    .sigil-modal .close-btn svg { pointer-events: none; }

    .modal-bottom-spacer { height: clamp(96px, 14vh, 140px); }

    .mint-dock{
      position: sticky;
      bottom: max(10px, env(safe-area-inset-bottom));
      z-index: 6;

      display: grid;
      place-items: center;
      width: fit-content;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: none;

      contain: layout paint style;
      -webkit-transform: translateZ(0);
              transform: translateZ(0);
    }

    .mint-dock > *{
      width: auto;
      max-width: 100%;
      flex: 0 0 auto;
    }

    .mint-dock button,
    .mint-dock a{
      display: inline-flex;
    }
  `}),Ce=()=>(0,y.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":!0,className:`close-icon`,children:[(0,y.jsx)(`line`,{x1:`4`,y1:`4`,x2:`20`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,y.jsx)(`line`,{x1:`20`,y1:`4`,x2:`4`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,y.jsx)(`circle`,{cx:`12`,cy:`12`,r:`10`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.2`,opacity:`.25`})]}),we=()=>(0,y.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:[(0,y.jsx)(`circle`,{cx:`12`,cy:`12`,r:`9.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.4`}),(0,y.jsx)(`path`,{d:`M12 6v6l3.5 3.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.8`,strokeLinecap:`round`,strokeLinejoin:`round`}),(0,y.jsx)(`path`,{d:`M8.2 15.8l2.1-2.1`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.6`,strokeLinecap:`round`})]}),P=`http://www.w3.org/2000/svg`;function Te(e){e.getAttribute(`xmlns`)||e.setAttribute(`xmlns`,P),e.getAttribute(`xmlns:xlink`)||e.setAttribute(`xmlns:xlink`,`http://www.w3.org/1999/xlink`)}function F(e){let t=e.ownerDocument||document,n=e.querySelector(`metadata`);if(n)return n;let r=t.createElementNS(P,`metadata`);return e.insertBefore(r,e.firstChild),r}function I(e){let t=e.ownerDocument||document,n=e.querySelector(`desc`);if(n)return n;let r=t.createElementNS(P,`desc`),i=e.querySelector(`metadata`);return i&&i.nextSibling?e.insertBefore(r,i.nextSibling):e.insertBefore(r,e.firstChild),r}function Ee(e,t){Te(e);let n=F(e);n.textContent=JSON.stringify(t);let r=I(e);r.textContent=typeof t==`object`&&t?(()=>{let e=t,n=typeof e.pulse==`number`?e.pulse:void 0,r=typeof e.pulseExact==`string`?e.pulseExact:void 0,i=typeof e.beat==`number`?e.beat:void 0,a=typeof e.stepIndex==`number`?e.stepIndex:void 0,o=typeof e.chakraDay==`string`?e.chakraDay:void 0;return`KaiSigil — pulse:${r??n??`?`} beat:${i??`?`} step:${a??`?`} chakra:${o??`?`}`})():`KaiSigil — exported`;let i=new XMLSerializer().serializeToString(e);return i.startsWith(`<?xml`)?i:`<?xml version="1.0" encoding="UTF-8"?>\n${i}`}async function De(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0}catch{}try{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,`true`),t.style.position=`fixed`,t.style.left=`-9999px`,t.style.top=`0`,document.body.appendChild(t),t.select();let n=document.execCommand(`copy`);return document.body.removeChild(t),n}catch{return!1}}var Oe=e=>{e.catch(()=>{})},ke=s/1e3,Ae=Array.from({length:11},(e,t)=>{let n=(t*ke).toFixed(3);return`Breath ${t+1} — ${n}s`}),je=({onClose:e})=>{let t=(0,v.useMemo)(()=>l(),[]),n=(0,v.useRef)(0n),i=(0,v.useRef)(!1),a=(0,v.useRef)(0),f=(0,v.useCallback)(()=>{try{return d(new Date)}catch{return 0n}},[]),h=(0,v.useCallback)(()=>{let e=null;try{e=t.nowMicroPulses()}catch{e=null}if(typeof e==`bigint`)return e;if(typeof e==`number`&&Number.isFinite(e))return BigInt(Math.trunc(e));if(typeof e==`string`&&/^\d+$/.test(e))try{return BigInt(e)}catch{return null}return null},[t]),g=(0,v.useCallback)(()=>{let e=h();if(e===null)return f();let t=O();if(!i.current||t-a.current>2e3){let r=f()-e,o=2n*x;n.current=ue(r)<=o?0n:r,i.current=!0,a.current=t}return e+n.current},[f,h]),_=(0,v.useCallback)(()=>{try{return E(T(g(),x))}catch{return 0n}},[g]),b=(0,v.useRef)(null);b.current===null&&(b.current=_());let ie=b.current??0n,[D,M]=(0,v.useState)(`live`),[N,P]=(0,v.useState)(``),[Te,F]=(0,v.useState)(1),[I,ke]=(0,v.useState)(()=>ie),[je,L]=(0,v.useState)(()=>ie.toString()),R=(0,v.useRef)(!1),[z,Me]=(0,v.useState)(null),[Ne,Pe]=(0,v.useState)(!0),[Fe,Ie]=(0,v.useState)(!1),[Le,Re]=(0,v.useState)(``),[ze,Be]=(0,v.useState)(``),[B,Ve]=(0,v.useState)(``),[He,Ue]=(0,v.useState)(!1),V=(0,v.useRef)(null),H=(0,v.useRef)(null),We=(0,v.useRef)(null),U=(0,v.useRef)(null),Ge=(0,v.useRef)(0),Ke=(0,v.useMemo)(()=>{try{return I.toLocaleString()}catch{return I.toString()}},[I]),qe=(0,v.useCallback)(()=>{try{let e=w(g(),x),t=Number(e),n=Math.max(0,Math.min(s,Math.round(t*s/1e6))),r=document.documentElement;r.style.setProperty(`--pulse-dur`,`${s}ms`),r.style.setProperty(`--pulse-offset`,`-${n}ms`);let i=H.current;i&&(i.style.setProperty(`--pulse-dur`,`${s}ms`),i.style.setProperty(`--pulse-offset`,`-${n}ms`))}catch{}},[g]),W=(0,v.useCallback)((e,t=!0)=>{let n=E(e);ke(n),t&&!R.current&&L(n.toString()),typeof document<`u`&&qe()},[qe]);(0,v.useEffect)(()=>{let e=e=>{let t=V.current;if(!t)return;let n=e.target;n instanceof Node&&t.contains(n)&&(H.current?.contains(n)||e.stopPropagation())},t=[`click`,`mousedown`,`touchstart`],n={passive:!0};t.forEach(t=>document.addEventListener(t,e,n));let r=e=>{e.key===`Escape`&&V.current&&e.stopPropagation()};return window.addEventListener(`keydown`,r,!0),()=>{t.forEach(t=>document.removeEventListener(t,e,n)),window.removeEventListener(`keydown`,r,!0)}},[]),(0,v.useEffect)(()=>{D===`live`&&W(_(),!0)},[D,W,_]);let G=(0,v.useCallback)(()=>{U.current!==null&&(window.clearTimeout(U.current),U.current=null)},[]),K=(0,v.useCallback)(()=>{G();let e=()=>{let e=C(u(T(g(),x)+1n));Ge.current=e;let n=Math.max(0,e-O());U.current=window.setTimeout(t,n)},t=()=>{let n=O(),r=Ge.current;if(n<r){U.current=window.setTimeout(t,Math.max(0,r-n));return}W(_(),!0),e()};W(_(),!0),e()},[W,G,_,g]);(0,v.useEffect)(()=>{if(D!==`live`)return;K();let e=()=>{document.visibilityState===`visible`&&D===`live`&&K()};return document.addEventListener(`visibilitychange`,e),window.addEventListener(`focus`,e),()=>{document.removeEventListener(`visibilitychange`,e),window.removeEventListener(`focus`,e),G()}},[D,K,G]);let Je=ye(D===`live`,g),Ye=(0,v.useCallback)(()=>{M(`live`),P(``),F(1),W(_(),!0),K()},[W,_,K]),Xe=e=>{let t=(e.target.value??``).replace(/[^\d]/g,``);if(L(t),t)try{let e=E(BigInt(t));M(`static-pulse`),P(``),F(1),W(e,!1),G()}catch{}},Ze=(0,v.useCallback)((e,t)=>{let n=me(e);if(!n)return;let r=E(T(d(he(n,t)),x));M(`static-date`),G(),W(r,!0)},[W,G]),Qe=e=>{let t=e.target.value;if(P(t),!t){F(1),Ye();return}Ze(t,Te)},$e=e=>{let t=Number(e.target.value);F(t),N&&Ze(N,t)},et=()=>{let e=V.current?.querySelector(`.sigil-modal`);e&&(e.classList.remove(`flash-now`),e.offsetWidth,e.classList.add(`flash-now`)),Ye()},q=(0,v.useMemo)(()=>{let{beat:e,stepIndex:t,percentIntoStep:n}=p(I*x);return{beat:e,stepIndex:t,stepPct:o(n)}},[I]),J=(0,v.useMemo)(()=>{if(!z)return`Root`;let e=_e(z,`harmonicDay`);return e?c[e]:`Root`},[z]),tt=(0,v.useMemo)(()=>{try{let e=w(I*x,m)*100000000n/m;return Number(e)/1e6}catch{return 0}},[I]),nt=(0,v.useMemo)(()=>{try{let e=u(I),{dayPercent:t}=ne(new Date(C(e)));return Math.max(0,Math.min(100,t))}catch{return tt}},[I,tt]);(0,v.useEffect)(()=>{let e=!1;return(async()=>{try{let t=await ee(u(I)),n=ge(t)?t:null;e||Me(n)}catch{e||Me(null)}})(),()=>{e=!0}},[I]);let rt=`${q.beat}:${le(q.stepIndex)}`,Y=z?k(z,`chakraStepString`):void 0,it=Y||rt,at=z?A(z,`dayOfMonth`):void 0,X=z?A(z,`eternalMonthIndex`):void 0,ot=fe(Y&&typeof at==`number`&&typeof X==`number`?`${Y} — D${at}/M${X+1}`:it),st=z?k(z,`eternalChakraArc`)??`Harmonization Ark`:`Harmonization Ark`,ct=xe(st),Z=e=>Oe(De(e)),lt=e=>Z(JSON.stringify(e,null,2)),ut=(0,v.useMemo)(()=>{try{if(I<=S)return Number(I);if(de<=0n)return 0;let e=w(I,de);return Number(e)}catch{return 0}},[I]),dt=()=>document.querySelector(`#sigil-export svg`),ft=e=>{let t=dt();return t?Ee(t,e):null},pt=e=>{let t=ft(e);return t?new Blob([t],{type:`image/svg+xml;charset=utf-8`}):null},mt=async()=>{let e=document.getElementById(`sigil-export`);if(!e)return null;let t=await(0,se.default)(e,{background:void 0,backgroundColor:null}),n=await new Promise(e=>t.toBlob(t=>e(t),`image/png`));if(n)return n;let r=t.toDataURL(`image/png`).split(`,`)[1]??``,i=atob(r),a=new ArrayBuffer(i.length),o=new Uint8Array(a);for(let e=0;e<i.length;e++)o[e]=i.charCodeAt(e);return new Blob([a],{type:`image/png`})},ht=e=>{let t=Number.isFinite(q.stepIndex)?Math.max(0,Math.min(Math.trunc(q.stepIndex),43)):0,n=Number.isFinite(q.beat)?Math.max(0,Math.min(Math.trunc(q.beat),35)):0;return{pulse:C(I),beat:n,stepIndex:t,chakraDay:J,stepsPerBeat:44,canonicalHash:e,exportedAt:pe(I),expiresAtPulse:(I+11n).toString(),pulseExact:I.toString()}},gt=async()=>{let e=(I<=S?B:``).toLowerCase();if(!e){let t=dt();e=(await be(((t?new XMLSerializer().serializeToString(t):``)||`no-svg`)+`|pulseExact=${I.toString()}|beat=${q.beat}|step=${q.stepIndex}|chakra=${J}`)).toLowerCase()}let t=ht(e),n=te(e,t);Be(e),Re(n),Ie(!0)},_t=async()=>{let e=ht((I<=S&&B?String(B).toLowerCase():``)||(await be(`pulseExact=${I.toString()}|beat=${q.beat}|step=${q.stepIndex}|chakra=${J}`)).toLowerCase()),[t,n]=await Promise.all([pt(e),mt()]);if(!t||!n)return;let r=I.toString(),i=r.length>80?`${r.slice(0,40)}_${r.slice(-20)}`:r,a=new ce.default;a.file(`sigil_${i}.svg`,t),a.file(`sigil_${i}.png`,n);let o={...e,overlays:{qr:!1,eternalPulseBar:!1}};a.file(`sigil_${i}.manifest.json`,JSON.stringify(o,null,2));let s=await a.generateAsync({type:`blob`}),c=URL.createObjectURL(s),l=document.createElement(`a`);l.href=c,l.download=`sigil_${i}.zip`,document.body.appendChild(l),l.click(),l.remove(),requestAnimationFrame(()=>URL.revokeObjectURL(c))},vt=()=>e(),yt=(0,v.useMemo)(()=>z?k(z,`eternalSeal`)??k(z,`seal`)??``:``,[z]),bt=(0,v.useMemo)(()=>z?_e(z,`harmonicDay`)||ve(z.harmonicDay):``,[z]),xt=(0,v.useMemo)(()=>z?k(z,`eternalMonth`)??``:``,[z]),St=(0,v.useMemo)(()=>z?k(z,`eternalYearName`)??``:``,[z]),Ct=(0,v.useMemo)(()=>z?k(z,`kaiTurahPhrase`)??``:``,[z]),wt=z?A(z,`kaiPulseEternal`):void 0,Tt=z?A(z,`kaiPulseToday`):void 0,Q=z?j(z,`chakraStep`):void 0,$=z?j(z,`chakraBeat`):void 0,Et=Q?A(Q,`stepIndex`):void 0,Dt=Q?A(Q,`percentIntoStep`):void 0,Ot=$?A($,`beatIndex`):void 0,kt=$?A($,`pulsesIntoBeat`):void 0,At=z?A(z,`weekIndex`):void 0,jt=z?k(z,`weekName`)??``:``,Mt=(()=>{let e=z?j(z,`harmonicWeekProgress`):void 0;return e?A(e,`percent`):void 0})(),Nt=(()=>{let e=z?j(z,`eternalMonthProgress`):void 0;return e?A(e,`percent`):void 0})(),Pt=(()=>{let e=z?j(z,`harmonicYearProgress`):void 0;return e?A(e,`percent`):void 0})(),Ft=z?A(z,`phiSpiralLevel`):void 0,It=z?k(z,`kaiMomentSummary`)??``:``,Lt=z?k(z,`compressed_summary`)??``:``;return(0,oe.createPortal)((0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)(Se,{}),(0,y.jsx)(`div`,{ref:V,role:`dialog`,"aria-modal":`true`,className:`sigil-modal-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&e.stopPropagation()},onClick:e=>{e.target===e.currentTarget&&e.stopPropagation()},onTouchStart:e=>{e.target===e.currentTarget&&e.stopPropagation()},onKeyDown:e=>e.key===`Escape`&&e.stopPropagation(),children:(0,y.jsxs)(`div`,{className:`sigil-modal`,onMouseDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onTouchStart:e=>e.stopPropagation(),children:[(0,y.jsx)(`button`,{ref:H,"aria-label":`Close`,className:`close-btn`,onClick:vt,children:(0,y.jsx)(Ce,{})}),(0,y.jsx)(ae,{dateISO:N,onDateChange:Qe,secondsLeft:D===`live`?Je??void 0:void 0,solarPercent:nt,eternalPercent:tt,solarColor:`#ffd600`,eternalColor:ct,eternalArkLabel:st}),D!==`live`&&(0,y.jsxs)(y.Fragment,{children:[N&&(0,y.jsxs)(`label`,{style:{marginLeft:`12px`},className:`sigil-label`,children:[(0,y.jsx)(`span`,{className:`sigil-label__text`,children:`Breath within minute`}),`\xA0`,(0,y.jsx)(`select`,{value:Te,onChange:$e,children:Ae.map((e,t)=>(0,y.jsx)(`option`,{value:t+1,children:e},e))})]}),(0,y.jsx)(`button`,{className:`now-btn`,onClick:et,children:`Now`})]}),D===`live`&&Je!==null&&(0,y.jsxs)(`p`,{className:`countdown`,children:[`next pulse in `,(0,y.jsx)(`strong`,{children:Je.toFixed(3)}),`s`]}),(0,y.jsxs)(`div`,{className:`sigil-pulse-row`,children:[(0,y.jsxs)(`label`,{className:`sigil-label sigil-pulse-label`,children:[(0,y.jsx)(`span`,{className:`sigil-label__text`,children:`Pulse`}),(0,y.jsx)(`input`,{className:`sigil-input sigil-pulse-input`,type:`text`,inputMode:`numeric`,value:je,onFocus:()=>{R.current=!0},onBlur:()=>{R.current=!1,L(I.toString())},onChange:Xe,"aria-label":`Pulse`,placeholder:`Enter pulse`})]}),(0,y.jsx)(`span`,{className:`sigil-live-chip ${D===`live`?`is-live`:`is-static`}`,"aria-live":`polite`,children:D===`live`?`LIVE`:`STATIC`})]}),(0,y.jsxs)(`div`,{id:`sigil-export`,style:{position:`relative`,width:240,margin:`16px auto`},children:[(0,y.jsx)(r,{ref:We,pulse:ut,beat:q.beat,stepIndex:q.stepIndex,stepPct:q.stepPct,chakraDay:J,size:240,hashMode:`deterministic`,origin:``,onReady:e=>{let t=e.hash?String(e.hash).toLowerCase():``;t&&Ve(t)}}),(0,y.jsx)(`span`,{className:`pulse-tag`,children:Ke})]}),(0,y.jsxs)(`div`,{className:`sigil-meta-block`,children:[(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Kairos:`}),`\xA0`,it,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(it),children:`💠`})]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Kairos/Date:`}),`\xA0`,ot,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(ot),children:`💠`})]}),z&&(0,y.jsxs)(y.Fragment,{children:[(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Seal:`}),`\xA0`,yt,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(yt),children:`💠`})]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Day:`}),` `,bt]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Month:`}),` `,xt]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Arc:`}),` `,st]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Year:`}),` `,St]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Kai-Turah:`}),`\xA0`,Ct,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(Ct),children:`💠`})]})]})]}),z&&(0,y.jsxs)(`details`,{className:`rich-data`,open:He,onToggle:e=>Ue(e.currentTarget.open),children:[(0,y.jsx)(`summary`,{children:`Memory`}),(0,y.jsxs)(`div`,{className:`rich-grid`,children:[(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`pulseExact`}),(0,y.jsx)(`span`,{children:I.toString()})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`kaiPulseEternal`}),(0,y.jsx)(`span`,{children:(wt??0).toLocaleString()})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`kaiPulseToday`}),(0,y.jsx)(`span`,{children:Tt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraStepString`}),(0,y.jsx)(`span`,{children:Y??``})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraStep.stepIndex`}),(0,y.jsx)(`span`,{children:Et??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraStep.percentIntoStep`}),(0,y.jsxs)(`span`,{children:[((Dt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraBeat.beatIndex`}),(0,y.jsx)(`span`,{children:Ot??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraBeat.pulsesIntoBeat`}),(0,y.jsx)(`span`,{children:kt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`weekIndex`}),(0,y.jsx)(`span`,{children:At??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`weekName`}),(0,y.jsx)(`span`,{children:jt})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`dayOfMonth`}),(0,y.jsx)(`span`,{children:at??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`eternalMonthIndex`}),(0,y.jsx)(`span`,{children:typeof X==`number`?X+1:0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`harmonicWeekProgress.percent`}),(0,y.jsxs)(`span`,{children:[((Mt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`eternalMonthProgress.percent`}),(0,y.jsxs)(`span`,{children:[((Nt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`harmonicYearProgress.percent`}),(0,y.jsxs)(`span`,{children:[((Pt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`phiSpiralLevel`}),(0,y.jsx)(`span`,{children:Ft??0})]}),(0,y.jsxs)(`div`,{className:`span-2`,children:[(0,y.jsx)(`code`,{children:`kaiMomentSummary`}),(0,y.jsx)(`span`,{children:It})]}),(0,y.jsxs)(`div`,{className:`span-2`,children:[(0,y.jsx)(`code`,{children:`compressed_summary`}),(0,y.jsx)(`span`,{children:Lt})]}),(0,y.jsxs)(`div`,{className:`span-2`,children:[(0,y.jsx)(`code`,{children:`eternalSeal`}),(0,y.jsx)(`span`,{className:`truncate`,children:yt})]})]}),(0,y.jsx)(`div`,{className:`rich-actions`,children:(0,y.jsx)(`button`,{onClick:()=>lt(z),children:`Remember JSON`})})]}),(0,y.jsx)(`div`,{className:`modal-bottom-spacer`,"aria-hidden":`true`}),(0,y.jsx)(`div`,{className:`mint-dock`,children:(0,y.jsxs)(`button`,{className:`mint-btn`,type:`button`,"aria-label":`Mint this moment`,title:`Mint this moment`,onClick:gt,children:[(0,y.jsx)(`span`,{className:`mint-btn__icon`,"aria-hidden":`true`,children:Ne?(0,y.jsx)(`img`,{src:`/assets/seal.svg`,alt:``,loading:`eager`,decoding:`async`,onError:()=>Pe(!1)}):(0,y.jsx)(we,{})}),(0,y.jsxs)(`span`,{className:`mint-btn__text`,children:[(0,y.jsx)(`span`,{className:`mint-btn__title`,children:`MINT ΦKey`}),(0,y.jsxs)(`span`,{className:`mint-btn__sub`,children:[`☤KAI `,Ke]})]})]})})]})}),(0,y.jsx)(re,{open:Fe,url:Le,hash:ze,onClose:()=>Ie(!1),onDownloadZip:_t})]}),document.body)};export{je as t};