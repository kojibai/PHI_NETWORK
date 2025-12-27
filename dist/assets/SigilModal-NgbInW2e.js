import{B as e,Er as t,Mr as n,O as r,Tr as i,Zn as a,_r as o,ar as s,b as c,er as l,fr as u,lr as d,m as f,mr as p,or as m,pr as ee,rr as h,sr as te,un as ne,ut as g,vr as _,y as re}from"./index-D-h_hl2M.js";import{t as v}from"./html2canvas-BrJjCeap.js";import{t as ie}from"./SealMomentModal-ntwwK-Eq.js";var y=n(t(),1),b=n(g(),1),x=e=>Math.max(0,Math.min(100,e));function S(e,t){let n=(e??``).toLowerCase().trim();return/(reflekt|reflect|reflektion|reflection)/i.test(n)?`#22c55e`:/(purify|purification|purifikation)/i.test(n)?`#3b82f6`:/dream/i.test(n)?`#7c3aed`:/(ignite|ignition)/i.test(n)?`#ff3b30`:/(integrate|integration)/i.test(n)?`#ff8a00`:/(solar\s*plexus)/i.test(n)?`#ffd600`:t}var ae=({dateISO:e,onDateChange:t,secondsLeft:n,eternalPercent:r,eternalColor:i=`#8beaff`,eternalArkLabel:a=`Eternal Ark`})=>{let o=(0,y.useMemo)(()=>x(r),[r]),s=(0,y.useMemo)(()=>S(a,i),[a,i]),c={"--eternal-bar":s,"--pulse":`var(--kai-pulse, var(--pulse-dur, 5236ms))`},l=(0,y.useMemo)(()=>({"--fill":(o/100).toFixed(6)}),[o]),u=(0,y.useRef)(null),d=(0,y.useRef)(void 0),f=(0,y.useRef)(null),p=(0,y.useRef)(null);return(0,y.useEffect)(()=>()=>{f.current!==null&&window.clearTimeout(f.current),p.current!==null&&window.cancelAnimationFrame(p.current),u.current&&u.current.classList.remove(`is-boom`),f.current=null,p.current=null},[]),(0,y.useEffect)(()=>{let e=typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(typeof n!=`number`||e){d.current=n;return}let t=u.current,r=d.current;t&&typeof r==`number`&&n-r>1.2&&(t.classList.remove(`is-boom`),p.current!==null&&window.cancelAnimationFrame(p.current),p.current=window.requestAnimationFrame(()=>{t.classList.add(`is-boom`)}),f.current!==null&&window.clearTimeout(f.current),f.current=window.setTimeout(()=>{t.classList.remove(`is-boom`),f.current=null},420)),d.current=n},[n]),(0,b.jsxs)(`div`,{className:`sigil-scope`,style:c,children:[(0,b.jsx)(`h3`,{className:`sigil-title`,children:`Kairos Sigil-Glyph Inhaler`}),(0,b.jsx)(`div`,{className:`sigil-ribbon`,"aria-hidden":`true`}),(0,b.jsx)(`div`,{className:`input-row sigil-row`,children:(0,b.jsxs)(`label`,{className:`sigil-label`,children:[(0,b.jsx)(`span`,{className:`sigil-label__text`,children:`Select moment:`}),`\xA0`,(0,b.jsx)(`input`,{className:`sigil-input`,type:`datetime-local`,value:e,onChange:t})]})}),(0,b.jsx)(`div`,{className:`sigil-bars`,role:`group`,"aria-label":`Day progress`,children:(0,b.jsxs)(`div`,{className:`sigil-bar`,children:[(0,b.jsxs)(`div`,{className:`sigil-bar__head`,children:[(0,b.jsxs)(`span`,{className:`sigil-bar__label`,children:[`Unfoldment`,a?` — ${a}`:``]}),(0,b.jsxs)(`span`,{className:`sigil-bar__pct`,"aria-hidden":`true`,children:[o.toFixed(2),`%`]})]}),(0,b.jsx)(`div`,{className:`sigil-bar__track`,"aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":+o.toFixed(2),role:`progressbar`,"aria-label":`Eternal day ${a||``}`,children:(0,b.jsx)(`div`,{ref:u,className:`sigil-bar__fill sigil-bar__fill--eternal`,style:l})})]})}),(0,b.jsx)(`style`,{children:`
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
      `})]})},oe=n(i(),1),se=n(v(),1),ce=n(e(),1),C=1000000n,w=BigInt(2**53-1),le=e=>String(e).padStart(2,`0`),T=e=>e>w?2**53-1:e<-w?-(2**53-1):Number(e),ue=e=>e<0n?-e:e,E=(e,t)=>{if(t===0n)return 0n;let n=e%t;return n>=0n?n:n+t},D=(e,t)=>{let n=e/t;return e%t===0n||e>=0n?n:n-1n},O=e=>e<0n?0n:e,k=(e,t)=>{let n=e<0n?-e:e,r=t<0n?-t:t;for(;r!==0n;){let e=n%r;n=r,r=e}return n},de=(()=>{let e=k(h,C);return e===0n?0n:h/e})(),fe=e=>e.trim().replace(/^(\d+):(\d+)/,(e,t,n)=>`${+t}:${String(n).padStart(2,`0`)}`).replace(/D\s*(\d+)/,(e,t)=>`D${+t}`),A=(e,t)=>`${e}:${le(t)}`,pe=e=>e<=w?Number(e).toLocaleString():e.toString(),j=e=>{try{let t=d(e),n=c(new Date(T(t))),r=f[((n.solarAlignedWeekDayIndex??0)+6)%6];return{weekday:n.dayName??r,dayOfMonth:n.solarAlignedDayInMonth1??n.solarAlignedDayInMonth+1,monthIndex:n.solarAlignedMonth}}catch{return null}},me=(e,t,n,r,i,a,o)=>{if(!e)return``;let s=e,c=j(t);return s=s.replace(/Kairos:\s*\d{1,2}:\d{1,2}/i,`Kairos:${A(n,r)}`),s=s.replace(/Eternal\s*Pulse:\s*[\d,]+/i,`Eternal Pulse:${pe(t)}`),s=s.replace(/Step:\s*\d{1,2}\s*\/\s*44/i,`Step:${r}/44`),s=s.replace(/Beat:\s*\d{1,2}\s*\/\s*36(?:\([^)]+\))?/i,`Beat:${n}/36`),c&&(s=s.replace(/Solar Kairos \(UTC-aligned\):\s*\d{1,2}:\d{1,2}\s+\w+\s+D\d+\/M\d+/i,`Solar Kairos (UTC-aligned): ${A(i,a)} ${c.weekday} D${c.dayOfMonth}/M${c.monthIndex}`)),o&&(s=s.replace(/Y\d+/i,o)),s},he=e=>{try{let t=d(e);return new Date(T(t)).toISOString()}catch{return``}};function ge(e){let t=e.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);if(!t)return null;let n=Number(t[1]),r=Number(t[2])-1,i=Number(t[3]),a=Number(t[4]),o=Number(t[5]),s=Number(t[6]??`0`),c=String(t[7]??`0`).padEnd(3,`0`),l=Number(c),u=new Date(n,r,i,a,o,s,l);return Number.isNaN(u.getTime())?null:u}function _e(e,t){let n=Number.isFinite(t)?Math.max(1,Math.min(11,Math.floor(t))):1;try{let t=_(e.toISOString(),n),r=t?new Date(t):e;return Number.isNaN(r.getTime())?e:r}catch{return e}}var M=()=>typeof performance<`u`&&typeof performance.now==`function`?performance.timeOrigin+performance.now():Date.now(),ve=e=>typeof e==`object`&&!!e,N=(e,t)=>{let n=e[t];return typeof n==`string`?n:void 0},P=(e,t)=>{let n=e[t];return typeof n==`number`&&Number.isFinite(n)?n:void 0},F=(e,t)=>{let n=e[t];return ve(n)?n:void 0},ye=(e,t)=>{let n=e[t];if(typeof n==`string`)return Object.prototype.hasOwnProperty.call(l,n)?n:void 0},be=e=>typeof e==`number`&&Number.isFinite(e)?String(e):typeof e==`bigint`?e.toString():typeof e==`string`?e:``;function xe(e,t){let n=(0,y.useCallback)(()=>{try{let e=d(D(t(),C)+1n)-BigInt(Math.floor(M())),n=T(e<0n?0n:e);return Math.max(0,Math.min(s,n))/1e3}catch{return s/1e3}},[t]),[r,i]=(0,y.useState)(()=>e?n():s/1e3),a=(0,y.useRef)(null),o=(0,y.useRef)(null);return(0,y.useEffect)(()=>{if(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current!==null&&(window.clearInterval(o.current),o.current=null),!e)return;typeof document<`u`&&document.documentElement&&document.documentElement.style.setProperty(`--kai-pulse`,`${s}ms`);let t=()=>{i(n()),a.current=requestAnimationFrame(t)};i(n()),a.current=requestAnimationFrame(t);let r=()=>{document.visibilityState===`hidden`?(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current===null&&(o.current=window.setInterval(()=>{i(n())},33))):(o.current!==null&&(window.clearInterval(o.current),o.current=null),a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),i(n()),a.current=requestAnimationFrame(t))};return document.addEventListener(`visibilitychange`,r),()=>{document.removeEventListener(`visibilitychange`,r),a.current!==null&&cancelAnimationFrame(a.current),o.current!==null&&window.clearInterval(o.current),a.current=null,o.current=null}},[e,n]),e?r:null}var I=()=>{try{return globalThis.crypto?.subtle}catch{return}},Se=async e=>{let t=new TextEncoder().encode(e),n=I();if(n)try{let e=await n.digest(`SHA-256`,t);return Array.from(new Uint8Array(e)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}catch{}let r=2166136261;for(let e=0;e<t.length;e++)r^=t[e]??0,r=Math.imul(r,16777619);return(r>>>0).toString(16).padStart(8,`0`)},L={"Ignition Ark":`#ff0024`,"Integration Ark":`#ff6f00`,"Harmonization Ark":`#ffd600`,"Reflection Ark":`#00c853`,"Purification Ark":`#00b0ff`,"Dream Ark":`#c186ff`,"Ignite Ark":`#ff0024`,"Integrate Ark":`#ff6f00`,"Harmonize Ark":`#ffd600`,"Reflekt Ark":`#00c853`,"Purifikation Ark":`#00b0ff`},Ce=e=>{if(!e)return`#ffd600`;let t=e.trim(),n=t.replace(/\s*ark$/i,` Ark`);return L[t]??L[n]??`#ffd600`},we=()=>(0,b.jsx)(`style`,{children:`
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
  `}),Te=()=>(0,b.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":!0,className:`close-icon`,children:[(0,b.jsx)(`line`,{x1:`4`,y1:`4`,x2:`20`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,b.jsx)(`line`,{x1:`20`,y1:`4`,x2:`4`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,b.jsx)(`circle`,{cx:`12`,cy:`12`,r:`10`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.2`,opacity:`.25`})]}),Ee=()=>(0,b.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:[(0,b.jsx)(`circle`,{cx:`12`,cy:`12`,r:`9.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.4`}),(0,b.jsx)(`path`,{d:`M12 6v6l3.5 3.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.8`,strokeLinecap:`round`,strokeLinejoin:`round`}),(0,b.jsx)(`path`,{d:`M8.2 15.8l2.1-2.1`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.6`,strokeLinecap:`round`})]}),R=`http://www.w3.org/2000/svg`;function z(e){e.getAttribute(`xmlns`)||e.setAttribute(`xmlns`,R),e.getAttribute(`xmlns:xlink`)||e.setAttribute(`xmlns:xlink`,`http://www.w3.org/1999/xlink`)}function B(e){let t=e.ownerDocument||document,n=e.querySelector(`metadata`);if(n)return n;let r=t.createElementNS(R,`metadata`);return e.insertBefore(r,e.firstChild),r}function V(e){let t=e.ownerDocument||document,n=e.querySelector(`desc`);if(n)return n;let r=t.createElementNS(R,`desc`),i=e.querySelector(`metadata`);return i&&i.nextSibling?e.insertBefore(r,i.nextSibling):e.insertBefore(r,e.firstChild),r}function De(e,t){z(e);let n=B(e);n.textContent=JSON.stringify(t);let r=V(e);r.textContent=typeof t==`object`&&t?(()=>{let e=t,n=typeof e.pulse==`number`?e.pulse:void 0,r=typeof e.pulseExact==`string`?e.pulseExact:void 0,i=typeof e.beat==`number`?e.beat:void 0,a=typeof e.stepIndex==`number`?e.stepIndex:void 0,o=typeof e.chakraDay==`string`?e.chakraDay:void 0;return`KaiSigil — pulse:${r??n??`?`} beat:${i??`?`} step:${a??`?`} chakra:${o??`?`}`})():`KaiSigil — exported`;let i=new XMLSerializer().serializeToString(e);return i.startsWith(`<?xml`)?i:`<?xml version="1.0" encoding="UTF-8"?>\n${i}`}async function Oe(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0}catch{}try{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,`true`),t.style.position=`fixed`,t.style.left=`-9999px`,t.style.top=`0`,document.body.appendChild(t),t.select();let n=document.execCommand(`copy`);return document.body.removeChild(t),n}catch{return!1}}var ke=e=>{e.catch(()=>{})},H=s/1e3,Ae=Array.from({length:11},(e,t)=>{let n=(t*H).toFixed(3);return`Breath ${t+1} — ${n}s`}),je=({onClose:e})=>{let t=(0,y.useMemo)(()=>u(),[]),n=(0,y.useRef)(0n),i=(0,y.useRef)(!1),a=(0,y.useRef)(0),c=(0,y.useCallback)(()=>{try{return p(new Date)}catch{return 0n}},[]),f=(0,y.useCallback)(()=>{let e=null;try{e=t.nowMicroPulses()}catch{e=null}if(typeof e==`bigint`)return e;if(typeof e==`number`&&Number.isFinite(e))return BigInt(Math.trunc(e));if(typeof e==`string`&&/^\d+$/.test(e))try{return BigInt(e)}catch{return null}return null},[t]),m=(0,y.useCallback)(()=>{let e=f();if(e===null)return c();let t=M();if(!i.current||t-a.current>2e3){let r=c()-e,o=2n*C;n.current=ue(r)<=o?0n:r,i.current=!0,a.current=t}return e+n.current},[c,f]),g=(0,y.useCallback)(()=>{try{return O(D(m(),C))}catch{return 0n}},[m]),_=(0,y.useRef)(null);_.current===null&&(_.current=g());let v=_.current??0n,[x,S]=(0,y.useState)(`live`),[k,A]=(0,y.useState)(``),[pe,j]=(0,y.useState)(1),[I,L]=(0,y.useState)(()=>v),[R,z]=(0,y.useState)(()=>v.toString()),B=(0,y.useRef)(!1),[V,H]=(0,y.useState)(null),[je,Me]=(0,y.useState)(!0),[Ne,Pe]=(0,y.useState)(!1),[Fe,Ie]=(0,y.useState)(``),[Le,Re]=(0,y.useState)(``),[ze,Be]=(0,y.useState)(``),[Ve,He]=(0,y.useState)(!1),U=(0,y.useRef)(null),Ue=(0,y.useRef)(null),We=(0,y.useRef)(null),W=(0,y.useRef)(null),Ge=(0,y.useRef)(0),Ke=(0,y.useMemo)(()=>{try{return I.toLocaleString()}catch{return I.toString()}},[I]),qe=(0,y.useCallback)(()=>{try{let e=E(m(),C),t=Number(e),n=Math.max(0,Math.min(s,Math.round(t*s/1e6))),r=document.documentElement;r.style.setProperty(`--pulse-dur`,`${s}ms`),r.style.setProperty(`--pulse-offset`,`-${n}ms`);let i=Ue.current;i&&(i.style.setProperty(`--pulse-dur`,`${s}ms`),i.style.setProperty(`--pulse-offset`,`-${n}ms`))}catch{}},[m]),G=(0,y.useCallback)((e,t=!0)=>{let n=O(e);L(n),t&&!B.current&&z(n.toString()),typeof document<`u`&&qe()},[qe]);(0,y.useEffect)(()=>{let e=e=>{let t=U.current;if(!t)return;let n=e.target;n instanceof Node&&t.contains(n)&&(Ue.current?.contains(n)||e.stopPropagation())},t=[`click`,`mousedown`,`touchstart`],n={passive:!0};t.forEach(t=>document.addEventListener(t,e,n));let r=e=>{e.key===`Escape`&&U.current&&e.stopPropagation()};return window.addEventListener(`keydown`,r,!0),()=>{t.forEach(t=>document.removeEventListener(t,e,n)),window.removeEventListener(`keydown`,r,!0)}},[]),(0,y.useEffect)(()=>{x===`live`&&G(g(),!0)},[x,G,g]);let K=(0,y.useCallback)(()=>{W.current!==null&&(window.clearTimeout(W.current),W.current=null)},[]),q=(0,y.useCallback)(()=>{K();let e=()=>{let e=T(d(D(m(),C)+1n));Ge.current=e;let n=Math.max(0,e-M());W.current=window.setTimeout(t,n)},t=()=>{let n=M(),r=Ge.current;if(n<r){W.current=window.setTimeout(t,Math.max(0,r-n));return}G(g(),!0),e()};G(g(),!0),e()},[G,K,g,m]);(0,y.useEffect)(()=>{if(x!==`live`)return;q();let e=()=>{document.visibilityState===`visible`&&x===`live`&&q()};return document.addEventListener(`visibilitychange`,e),window.addEventListener(`focus`,e),()=>{document.removeEventListener(`visibilitychange`,e),window.removeEventListener(`focus`,e),K()}},[x,q,K]);let Je=xe(x===`live`,m),Ye=(0,y.useCallback)(()=>{S(`live`),A(``),j(1),G(g(),!0),q()},[G,g,q]),Xe=e=>{let t=(e.target.value??``).replace(/[^\d]/g,``);if(z(t),t)try{let e=O(BigInt(t));S(`static-pulse`),A(``),j(1),G(e,!1),K()}catch{}},Ze=(0,y.useCallback)((e,t)=>{let n=ge(e);if(!n)return;let r=O(D(p(_e(n,t)),C));S(`static-date`),K(),G(r,!0)},[G,K]),Qe=e=>{let t=e.target.value;if(A(t),!t){j(1),Ye();return}Ze(t,pe)},$e=e=>{let t=Number(e.target.value);j(t),k&&Ze(k,t)},et=()=>{let e=U.current?.querySelector(`.sigil-modal`);e&&(e.classList.remove(`flash-now`),e.offsetWidth,e.classList.add(`flash-now`)),Ye()},J=(0,y.useMemo)(()=>{let{beat:e,stepIndex:t,percentIntoStep:n}=ee(I*C);return{beat:e,stepIndex:t,stepPct:o(n)}},[I]),Y=(0,y.useMemo)(()=>{if(!V)return`Root`;let e=ye(V,`harmonicDay`);return e?l[e]:`Root`},[V]),tt=(0,y.useMemo)(()=>{try{let e=E(I*C,h)*100000000n/h;return Number(e)/1e6}catch{return 0}},[I]),nt=(0,y.useMemo)(()=>{try{let e=d(I),{dayPercent:t}=re(new Date(T(e)));return Math.max(0,Math.min(100,t))}catch{return tt}},[I,tt]),rt=(0,y.useMemo)(()=>{try{let e=d(I),{beatIndex:t,stepIndex:n}=re(new Date(T(e)));return{beat:t,stepIndex:n}}catch{return{beat:J.beat,stepIndex:J.stepIndex}}},[I,J.beat,J.stepIndex]);(0,y.useEffect)(()=>{let e=!1;return(async()=>{try{let t=await te(d(I)),n=ve(t)?t:null;e||H(n)}catch{e||H(null)}})(),()=>{e=!0}},[I]);let it=`${J.beat}:${le(J.stepIndex)}`,at=V?N(V,`chakraStepString`):void 0,ot=it,st=V?P(V,`dayOfMonth`):void 0,X=V?P(V,`eternalMonthIndex`):void 0,ct=fe(typeof st==`number`&&typeof X==`number`?`${it} — D${st}/M${X+1}`:ot),lt=V?N(V,`eternalChakraArc`)??`Harmonization Ark`:`Harmonization Ark`,ut=Ce(lt),Z=e=>ke(Oe(e)),dt=e=>Z(JSON.stringify(e,null,2)),ft=(0,y.useMemo)(()=>{try{if(I<=w)return Number(I);if(de<=0n)return 0;let e=E(I,de);return Number(e)}catch{return 0}},[I]),pt=()=>document.querySelector(`#sigil-export svg`),mt=e=>{let t=pt();return t?De(t,e):null},ht=e=>{let t=mt(e);return t?new Blob([t],{type:`image/svg+xml;charset=utf-8`}):null},gt=async()=>{let e=document.getElementById(`sigil-export`);if(!e)return null;let t=await(0,se.default)(e,{background:void 0,backgroundColor:null}),n=await new Promise(e=>t.toBlob(t=>e(t),`image/png`));if(n)return n;let r=t.toDataURL(`image/png`).split(`,`)[1]??``,i=atob(r),a=new ArrayBuffer(i.length),o=new Uint8Array(a);for(let e=0;e<i.length;e++)o[e]=i.charCodeAt(e);return new Blob([a],{type:`image/png`})},_t=e=>{let t=Number.isFinite(J.stepIndex)?Math.max(0,Math.min(Math.trunc(J.stepIndex),43)):0,n=Number.isFinite(J.beat)?Math.max(0,Math.min(Math.trunc(J.beat),35)):0;return{pulse:T(I),beat:n,stepIndex:t,chakraDay:Y,stepsPerBeat:44,canonicalHash:e,exportedAt:he(I),expiresAtPulse:(I+11n).toString(),pulseExact:I.toString()}},vt=async()=>{let e=(I<=w?ze:``).toLowerCase();if(!e){let t=pt();e=(await Se(((t?new XMLSerializer().serializeToString(t):``)||`no-svg`)+`|pulseExact=${I.toString()}|beat=${J.beat}|step=${J.stepIndex}|chakra=${Y}`)).toLowerCase()}let t=_t(e),n=ne(e,t);Re(e),Ie(n),Pe(!0)},yt=async()=>{let e=_t((I<=w&&ze?String(ze).toLowerCase():``)||(await Se(`pulseExact=${I.toString()}|beat=${J.beat}|step=${J.stepIndex}|chakra=${Y}`)).toLowerCase()),[t,n]=await Promise.all([ht(e),gt()]);if(!t||!n)return;let r=I.toString(),i=r.length>80?`${r.slice(0,40)}_${r.slice(-20)}`:r,a=new ce.default;a.file(`sigil_${i}.svg`,t),a.file(`sigil_${i}.png`,n);let o={...e,overlays:{qr:!1,eternalPulseBar:!1}};a.file(`sigil_${i}.manifest.json`,JSON.stringify(o,null,2));let s=await a.generateAsync({type:`blob`}),c=URL.createObjectURL(s),l=document.createElement(`a`);l.href=c,l.download=`sigil_${i}.zip`,document.body.appendChild(l),l.click(),l.remove(),requestAnimationFrame(()=>URL.revokeObjectURL(c))},bt=()=>e(),xt=(0,y.useMemo)(()=>V?ye(V,`harmonicDay`)||be(V.harmonicDay):``,[V]),St=(0,y.useMemo)(()=>V?N(V,`eternalMonth`)??``:``,[V]),Ct=(0,y.useMemo)(()=>{if(!V)return``;let e=N(V,`eternalYearName`)??``,t=e.match(/Y(\d+)/i);if(!t)return e;let n=Number(t[1]);return Number.isFinite(n)?`Y${Math.max(0,n-1)}`:e},[V]),wt=(0,y.useMemo)(()=>V?N(V,`kaiTurahPhrase`)??``:``,[V]),Tt=(0,y.useMemo)(()=>V?me(N(V,`eternalSeal`)??N(V,`seal`)??``,I,J.beat,J.stepIndex,rt.beat,rt.stepIndex,Ct||void 0):``,[V,J.beat,J.stepIndex,I,rt,Ct]),Et=V?P(V,`kaiPulseEternal`):void 0,Dt=V?P(V,`kaiPulseToday`):void 0,Q=V?F(V,`chakraStep`):void 0,$=V?F(V,`chakraBeat`):void 0,Ot=Q?P(Q,`stepIndex`):void 0,kt=Q?P(Q,`percentIntoStep`):void 0,At=$?P($,`beatIndex`):void 0,jt=$?P($,`pulsesIntoBeat`):void 0,Mt=V?P(V,`weekIndex`):void 0,Nt=V?N(V,`weekName`)??``:``,Pt=(()=>{let e=V?F(V,`harmonicWeekProgress`):void 0;return e?P(e,`percent`):void 0})(),Ft=(()=>{let e=V?F(V,`eternalMonthProgress`):void 0;return e?P(e,`percent`):void 0})(),It=(()=>{let e=V?F(V,`harmonicYearProgress`):void 0;return e?P(e,`percent`):void 0})(),Lt=V?P(V,`phiSpiralLevel`):void 0,Rt=V?N(V,`kaiMomentSummary`)??``:``,zt=V?N(V,`compressed_summary`)??``:``;return(0,oe.createPortal)((0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(we,{}),(0,b.jsx)(`div`,{ref:U,role:`dialog`,"aria-modal":`true`,className:`sigil-modal-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&e.stopPropagation()},onClick:e=>{e.target===e.currentTarget&&e.stopPropagation()},onTouchStart:e=>{e.target===e.currentTarget&&e.stopPropagation()},onKeyDown:e=>e.key===`Escape`&&e.stopPropagation(),children:(0,b.jsxs)(`div`,{className:`sigil-modal`,onMouseDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onTouchStart:e=>e.stopPropagation(),children:[(0,b.jsx)(`button`,{ref:Ue,"aria-label":`Close`,className:`close-btn`,onClick:bt,children:(0,b.jsx)(Te,{})}),(0,b.jsx)(ae,{dateISO:k,onDateChange:Qe,secondsLeft:x===`live`?Je??void 0:void 0,solarPercent:nt,eternalPercent:tt,solarColor:`#ffd600`,eternalColor:ut,eternalArkLabel:lt}),x!==`live`&&(0,b.jsxs)(b.Fragment,{children:[k&&(0,b.jsxs)(`label`,{style:{marginLeft:`12px`},className:`sigil-label`,children:[(0,b.jsx)(`span`,{className:`sigil-label__text`,children:`Breath within minute`}),`\xA0`,(0,b.jsx)(`select`,{value:pe,onChange:$e,children:Ae.map((e,t)=>(0,b.jsx)(`option`,{value:t+1,children:e},e))})]}),(0,b.jsx)(`button`,{className:`now-btn`,onClick:et,children:`Now`})]}),x===`live`&&Je!==null&&(0,b.jsxs)(`p`,{className:`countdown`,children:[`next pulse in `,(0,b.jsx)(`strong`,{children:Je.toFixed(3)}),`s`]}),(0,b.jsxs)(`div`,{className:`sigil-pulse-row`,children:[(0,b.jsxs)(`label`,{className:`sigil-label sigil-pulse-label`,children:[(0,b.jsx)(`span`,{className:`sigil-label__text`,children:`Pulse`}),(0,b.jsx)(`input`,{className:`sigil-input sigil-pulse-input`,type:`text`,inputMode:`numeric`,value:R,onFocus:()=>{B.current=!0},onBlur:()=>{B.current=!1,z(I.toString())},onChange:Xe,"aria-label":`Pulse`,placeholder:`Enter pulse`})]}),(0,b.jsx)(`span`,{className:`sigil-live-chip ${x===`live`?`is-live`:`is-static`}`,"aria-live":`polite`,children:x===`live`?`LIVE`:`STATIC`})]}),(0,b.jsxs)(`div`,{id:`sigil-export`,style:{position:`relative`,width:240,margin:`16px auto`},children:[(0,b.jsx)(r,{ref:We,pulse:ft,beat:J.beat,stepIndex:J.stepIndex,stepPct:J.stepPct,chakraDay:Y,size:240,hashMode:`deterministic`,origin:``,onReady:e=>{let t=e.hash?String(e.hash).toLowerCase():``;t&&Be(t)}}),(0,b.jsx)(`span`,{className:`pulse-tag`,children:Ke})]}),(0,b.jsxs)(`div`,{className:`sigil-meta-block`,children:[(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Kairos:`}),`\xA0`,ot,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(ot),children:`💠`})]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Kairos/Date:`}),`\xA0`,ct,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(ct),children:`💠`})]}),V&&(0,b.jsxs)(b.Fragment,{children:[(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Seal:`}),`\xA0`,Tt,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(Tt),children:`💠`})]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Day:`}),` `,xt]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Month:`}),` `,St]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Arc:`}),` `,lt]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Year:`}),` `,Ct]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Kai-Turah:`}),`\xA0`,wt,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(wt),children:`💠`})]})]})]}),V&&(0,b.jsxs)(`details`,{className:`rich-data`,open:Ve,onToggle:e=>He(e.currentTarget.open),children:[(0,b.jsx)(`summary`,{children:`Memory`}),(0,b.jsxs)(`div`,{className:`rich-grid`,children:[(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`pulseExact`}),(0,b.jsx)(`span`,{children:I.toString()})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`kaiPulseEternal`}),(0,b.jsx)(`span`,{children:(Et??0).toLocaleString()})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`kaiPulseToday`}),(0,b.jsx)(`span`,{children:Dt??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraStepString`}),(0,b.jsx)(`span`,{children:at??``})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraStep.stepIndex`}),(0,b.jsx)(`span`,{children:Ot??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraStep.percentIntoStep`}),(0,b.jsxs)(`span`,{children:[((kt??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraBeat.beatIndex`}),(0,b.jsx)(`span`,{children:At??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraBeat.pulsesIntoBeat`}),(0,b.jsx)(`span`,{children:jt??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`weekIndex`}),(0,b.jsx)(`span`,{children:Mt??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`weekName`}),(0,b.jsx)(`span`,{children:Nt})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`dayOfMonth`}),(0,b.jsx)(`span`,{children:st??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`eternalMonthIndex`}),(0,b.jsx)(`span`,{children:typeof X==`number`?X+1:0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`harmonicWeekProgress.percent`}),(0,b.jsxs)(`span`,{children:[((Pt??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`eternalMonthProgress.percent`}),(0,b.jsxs)(`span`,{children:[((Ft??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`harmonicYearProgress.percent`}),(0,b.jsxs)(`span`,{children:[((It??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`phiSpiralLevel`}),(0,b.jsx)(`span`,{children:Lt??0})]}),(0,b.jsxs)(`div`,{className:`span-2`,children:[(0,b.jsx)(`code`,{children:`kaiMomentSummary`}),(0,b.jsx)(`span`,{children:Rt})]}),(0,b.jsxs)(`div`,{className:`span-2`,children:[(0,b.jsx)(`code`,{children:`compressed_summary`}),(0,b.jsx)(`span`,{children:zt})]}),(0,b.jsxs)(`div`,{className:`span-2`,children:[(0,b.jsx)(`code`,{children:`eternalSeal`}),(0,b.jsx)(`span`,{className:`truncate`,children:Tt})]})]}),(0,b.jsx)(`div`,{className:`rich-actions`,children:(0,b.jsx)(`button`,{onClick:()=>dt(V),children:`Remember JSON`})})]}),(0,b.jsx)(`div`,{className:`modal-bottom-spacer`,"aria-hidden":`true`}),(0,b.jsx)(`div`,{className:`mint-dock`,children:(0,b.jsxs)(`button`,{className:`mint-btn`,type:`button`,"aria-label":`Mint this moment`,title:`Mint this moment`,onClick:vt,children:[(0,b.jsx)(`span`,{className:`mint-btn__icon`,"aria-hidden":`true`,children:je?(0,b.jsx)(`img`,{src:`/assets/seal.svg`,alt:``,loading:`eager`,decoding:`async`,onError:()=>Me(!1)}):(0,b.jsx)(Ee,{})}),(0,b.jsxs)(`span`,{className:`mint-btn__text`,children:[(0,b.jsx)(`span`,{className:`mint-btn__title`,children:`MINT ΦKey`}),(0,b.jsxs)(`span`,{className:`mint-btn__sub`,children:[`☤KAI `,Ke]})]})]})})]})}),(0,b.jsx)(ie,{open:Ne,url:Fe,hash:Le,onClose:()=>Pe(!1),onDownloadZip:yt})]}),document.body)};export{je as t};