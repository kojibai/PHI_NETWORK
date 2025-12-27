import{B as e,Er as t,Mr as n,O as r,Tr as i,Zn as a,_r as o,ar as s,b as c,er as l,fr as u,lr as d,m as f,mr as p,or as m,pr as ee,rr as h,sr as te,un as ne,ut as g,vr as _,y as re}from"./index-CaLcFsxo.js";import{t as v}from"./html2canvas-CCYIV-pG.js";import{t as ie}from"./SealMomentModal-BnWqSbuV.js";var y=n(t(),1),b=n(g(),1),x=e=>Math.max(0,Math.min(100,e));function S(e,t){let n=(e??``).toLowerCase().trim();return/(reflekt|reflect|reflektion|reflection)/i.test(n)?`#22c55e`:/(purify|purification|purifikation)/i.test(n)?`#3b82f6`:/dream/i.test(n)?`#7c3aed`:/(ignite|ignition)/i.test(n)?`#ff3b30`:/(integrate|integration)/i.test(n)?`#ff8a00`:/(solar\s*plexus)/i.test(n)?`#ffd600`:t}var ae=({dateISO:e,onDateChange:t,secondsLeft:n,eternalPercent:r,eternalColor:i=`#8beaff`,eternalArkLabel:a=`Eternal Ark`})=>{let o=(0,y.useMemo)(()=>x(r),[r]),s=(0,y.useMemo)(()=>S(a,i),[a,i]),c={"--eternal-bar":s,"--pulse":`var(--kai-pulse, var(--pulse-dur, 5236ms))`},l=(0,y.useMemo)(()=>({"--fill":(o/100).toFixed(6)}),[o]),u=(0,y.useRef)(null),d=(0,y.useRef)(void 0),f=(0,y.useRef)(null),p=(0,y.useRef)(null);return(0,y.useEffect)(()=>()=>{f.current!==null&&window.clearTimeout(f.current),p.current!==null&&window.cancelAnimationFrame(p.current),u.current&&u.current.classList.remove(`is-boom`),f.current=null,p.current=null},[]),(0,y.useEffect)(()=>{let e=typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(typeof n!=`number`||e){d.current=n;return}let t=u.current,r=d.current;t&&typeof r==`number`&&n-r>1.2&&(t.classList.remove(`is-boom`),p.current!==null&&window.cancelAnimationFrame(p.current),p.current=window.requestAnimationFrame(()=>{t.classList.add(`is-boom`)}),f.current!==null&&window.clearTimeout(f.current),f.current=window.setTimeout(()=>{t.classList.remove(`is-boom`),f.current=null},420)),d.current=n},[n]),(0,b.jsxs)(`div`,{className:`sigil-scope`,style:c,children:[(0,b.jsx)(`h3`,{className:`sigil-title`,children:`Kairos Sigil-Glyph Inhaler`}),(0,b.jsx)(`div`,{className:`sigil-ribbon`,"aria-hidden":`true`}),(0,b.jsx)(`div`,{className:`input-row sigil-row`,children:(0,b.jsxs)(`label`,{className:`sigil-label`,children:[(0,b.jsx)(`span`,{className:`sigil-label__text`,children:`Select moment:`}),`\xA0`,(0,b.jsx)(`input`,{className:`sigil-input`,type:`datetime-local`,value:e,onChange:t})]})}),(0,b.jsx)(`div`,{className:`sigil-bars`,role:`group`,"aria-label":`Day progress`,children:(0,b.jsxs)(`div`,{className:`sigil-bar`,children:[(0,b.jsxs)(`div`,{className:`sigil-bar__head`,children:[(0,b.jsxs)(`span`,{className:`sigil-bar__label`,children:[`Unfoldment`,a?` — ${a}`:``]}),(0,b.jsxs)(`span`,{className:`sigil-bar__pct`,"aria-hidden":`true`,children:[o.toFixed(2),`%`]})]}),(0,b.jsx)(`div`,{className:`sigil-bar__track`,"aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":+o.toFixed(2),role:`progressbar`,"aria-label":`Eternal day ${a||``}`,children:(0,b.jsx)(`div`,{ref:u,className:`sigil-bar__fill sigil-bar__fill--eternal`,style:l})})]})}),(0,b.jsx)(`style`,{children:`
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
      `})]})},oe=n(i(),1),se=n(v(),1),ce=n(e(),1),C=1000000n,w=BigInt(2**53-1),le=e=>String(e).padStart(2,`0`),T=e=>e>w?2**53-1:e<-w?-(2**53-1):Number(e),ue=e=>e<0n?-e:e,de=(e,t)=>{if(t===0n)return 0n;let n=e%t;return n>=0n?n:n+t},E=(e,t)=>{let n=e/t;return e%t===0n||e>=0n?n:n-1n},D=e=>e<0n?0n:e,O=(e,t)=>{let n=e<0n?-e:e,r=t<0n?-t:t;for(;r!==0n;){let e=n%r;n=r,r=e}return n},fe=(()=>{let e=O(h,C);return e===0n?0n:h/e})(),pe=e=>e.trim().replace(/^(\d+):(\d+)/,(e,t,n)=>`${+t}:${String(n).padStart(2,`0`)}`).replace(/D\s*(\d+)/,(e,t)=>`D${+t}`),k=(e,t)=>`${e}:${le(t)}`,me=e=>e<=w?Number(e).toLocaleString():e.toString(),A=e=>{try{let t=d(e),n=c(new Date(T(t))),r=f[((n.solarAlignedWeekDayIndex??0)+6)%6];return{weekday:n.dayName??r,dayOfMonth:n.solarAlignedDayInMonth1??n.solarAlignedDayInMonth+1,monthIndex:n.solarAlignedMonth}}catch{return null}},he=(e,t,n,r)=>{if(!e)return``;let i=e,a=A(t);return i=i.replace(/Kairos:\s*\d{1,2}:\d{1,2}/i,`Kairos:${k(n,r)}`),i=i.replace(/Eternal\s*Pulse:\s*[\d,]+/i,`Eternal Pulse:${me(t)}`),i=i.replace(/Step:\s*\d{1,2}\s*\/\s*44/i,`Step:${r}/44`),i=i.replace(/Beat:\s*\d{1,2}\s*\/\s*36(?:\([^)]+\))?/i,`Beat:${n}/36`),a&&(i=i.replace(/Solar Kairos \(UTC-aligned\):\s*\d{1,2}:\d{1,2}\s+\w+\s+D\d+\/M\d+/i,`Solar Kairos (UTC-aligned): ${k(n,r)} ${a.weekday} D${a.dayOfMonth}/M${a.monthIndex}`)),i},ge=e=>{try{let t=d(e);return new Date(T(t)).toISOString()}catch{return``}};function _e(e){let t=e.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);if(!t)return null;let n=Number(t[1]),r=Number(t[2])-1,i=Number(t[3]),a=Number(t[4]),o=Number(t[5]),s=Number(t[6]??`0`),c=String(t[7]??`0`).padEnd(3,`0`),l=Number(c),u=new Date(n,r,i,a,o,s,l);return Number.isNaN(u.getTime())?null:u}function ve(e,t){let n=Number.isFinite(t)?Math.max(1,Math.min(11,Math.floor(t))):1;try{let t=_(e.toISOString(),n),r=t?new Date(t):e;return Number.isNaN(r.getTime())?e:r}catch{return e}}var j=()=>typeof performance<`u`&&typeof performance.now==`function`?performance.timeOrigin+performance.now():Date.now(),ye=e=>typeof e==`object`&&!!e,M=(e,t)=>{let n=e[t];return typeof n==`string`?n:void 0},N=(e,t)=>{let n=e[t];return typeof n==`number`&&Number.isFinite(n)?n:void 0},P=(e,t)=>{let n=e[t];return ye(n)?n:void 0},be=(e,t)=>{let n=e[t];if(typeof n==`string`)return Object.prototype.hasOwnProperty.call(l,n)?n:void 0},xe=e=>typeof e==`number`&&Number.isFinite(e)?String(e):typeof e==`bigint`?e.toString():typeof e==`string`?e:``;function Se(e,t){let n=(0,y.useCallback)(()=>{try{let e=d(E(t(),C)+1n)-BigInt(Math.floor(j())),n=T(e<0n?0n:e);return Math.max(0,Math.min(s,n))/1e3}catch{return s/1e3}},[t]),[r,i]=(0,y.useState)(()=>e?n():s/1e3),a=(0,y.useRef)(null),o=(0,y.useRef)(null);return(0,y.useEffect)(()=>{if(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current!==null&&(window.clearInterval(o.current),o.current=null),!e)return;typeof document<`u`&&document.documentElement&&document.documentElement.style.setProperty(`--kai-pulse`,`${s}ms`);let t=()=>{i(n()),a.current=requestAnimationFrame(t)};i(n()),a.current=requestAnimationFrame(t);let r=()=>{document.visibilityState===`hidden`?(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current===null&&(o.current=window.setInterval(()=>{i(n())},33))):(o.current!==null&&(window.clearInterval(o.current),o.current=null),a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),i(n()),a.current=requestAnimationFrame(t))};return document.addEventListener(`visibilitychange`,r),()=>{document.removeEventListener(`visibilitychange`,r),a.current!==null&&cancelAnimationFrame(a.current),o.current!==null&&window.clearInterval(o.current),a.current=null,o.current=null}},[e,n]),e?r:null}var F=()=>{try{return globalThis.crypto?.subtle}catch{return}},Ce=async e=>{let t=new TextEncoder().encode(e),n=F();if(n)try{let e=await n.digest(`SHA-256`,t);return Array.from(new Uint8Array(e)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}catch{}let r=2166136261;for(let e=0;e<t.length;e++)r^=t[e]??0,r=Math.imul(r,16777619);return(r>>>0).toString(16).padStart(8,`0`)},I={"Ignition Ark":`#ff0024`,"Integration Ark":`#ff6f00`,"Harmonization Ark":`#ffd600`,"Reflection Ark":`#00c853`,"Purification Ark":`#00b0ff`,"Dream Ark":`#c186ff`,"Ignite Ark":`#ff0024`,"Integrate Ark":`#ff6f00`,"Harmonize Ark":`#ffd600`,"Reflekt Ark":`#00c853`,"Purifikation Ark":`#00b0ff`},we=e=>{if(!e)return`#ffd600`;let t=e.trim(),n=t.replace(/\s*ark$/i,` Ark`);return I[t]??I[n]??`#ffd600`},Te=()=>(0,b.jsx)(`style`,{children:`
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
  `}),Ee=()=>(0,b.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":!0,className:`close-icon`,children:[(0,b.jsx)(`line`,{x1:`4`,y1:`4`,x2:`20`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,b.jsx)(`line`,{x1:`20`,y1:`4`,x2:`4`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,b.jsx)(`circle`,{cx:`12`,cy:`12`,r:`10`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.2`,opacity:`.25`})]}),De=()=>(0,b.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:[(0,b.jsx)(`circle`,{cx:`12`,cy:`12`,r:`9.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.4`}),(0,b.jsx)(`path`,{d:`M12 6v6l3.5 3.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.8`,strokeLinecap:`round`,strokeLinejoin:`round`}),(0,b.jsx)(`path`,{d:`M8.2 15.8l2.1-2.1`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.6`,strokeLinecap:`round`})]}),L=`http://www.w3.org/2000/svg`;function R(e){e.getAttribute(`xmlns`)||e.setAttribute(`xmlns`,L),e.getAttribute(`xmlns:xlink`)||e.setAttribute(`xmlns:xlink`,`http://www.w3.org/1999/xlink`)}function z(e){let t=e.ownerDocument||document,n=e.querySelector(`metadata`);if(n)return n;let r=t.createElementNS(L,`metadata`);return e.insertBefore(r,e.firstChild),r}function B(e){let t=e.ownerDocument||document,n=e.querySelector(`desc`);if(n)return n;let r=t.createElementNS(L,`desc`),i=e.querySelector(`metadata`);return i&&i.nextSibling?e.insertBefore(r,i.nextSibling):e.insertBefore(r,e.firstChild),r}function Oe(e,t){R(e);let n=z(e);n.textContent=JSON.stringify(t);let r=B(e);r.textContent=typeof t==`object`&&t?(()=>{let e=t,n=typeof e.pulse==`number`?e.pulse:void 0,r=typeof e.pulseExact==`string`?e.pulseExact:void 0,i=typeof e.beat==`number`?e.beat:void 0,a=typeof e.stepIndex==`number`?e.stepIndex:void 0,o=typeof e.chakraDay==`string`?e.chakraDay:void 0;return`KaiSigil — pulse:${r??n??`?`} beat:${i??`?`} step:${a??`?`} chakra:${o??`?`}`})():`KaiSigil — exported`;let i=new XMLSerializer().serializeToString(e);return i.startsWith(`<?xml`)?i:`<?xml version="1.0" encoding="UTF-8"?>\n${i}`}async function ke(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0}catch{}try{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,`true`),t.style.position=`fixed`,t.style.left=`-9999px`,t.style.top=`0`,document.body.appendChild(t),t.select();let n=document.execCommand(`copy`);return document.body.removeChild(t),n}catch{return!1}}var Ae=e=>{e.catch(()=>{})},je=s/1e3,Me=Array.from({length:11},(e,t)=>{let n=(t*je).toFixed(3);return`Breath ${t+1} — ${n}s`}),Ne=({onClose:e})=>{let t=(0,y.useMemo)(()=>u(),[]),n=(0,y.useRef)(0n),i=(0,y.useRef)(!1),a=(0,y.useRef)(0),c=(0,y.useCallback)(()=>{try{return p(new Date)}catch{return 0n}},[]),f=(0,y.useCallback)(()=>{let e=null;try{e=t.nowMicroPulses()}catch{e=null}if(typeof e==`bigint`)return e;if(typeof e==`number`&&Number.isFinite(e))return BigInt(Math.trunc(e));if(typeof e==`string`&&/^\d+$/.test(e))try{return BigInt(e)}catch{return null}return null},[t]),m=(0,y.useCallback)(()=>{let e=f();if(e===null)return c();let t=j();if(!i.current||t-a.current>2e3){let r=c()-e,o=2n*C;n.current=ue(r)<=o?0n:r,i.current=!0,a.current=t}return e+n.current},[c,f]),g=(0,y.useCallback)(()=>{try{return D(E(m(),C))}catch{return 0n}},[m]),_=(0,y.useRef)(null);_.current===null&&(_.current=g());let v=_.current??0n,[x,S]=(0,y.useState)(`live`),[O,k]=(0,y.useState)(``),[me,A]=(0,y.useState)(1),[F,I]=(0,y.useState)(()=>v),[L,R]=(0,y.useState)(()=>v.toString()),z=(0,y.useRef)(!1),[B,je]=(0,y.useState)(null),[Ne,Pe]=(0,y.useState)(!0),[Fe,Ie]=(0,y.useState)(!1),[Le,Re]=(0,y.useState)(``),[ze,Be]=(0,y.useState)(``),[Ve,He]=(0,y.useState)(``),[Ue,We]=(0,y.useState)(!1),V=(0,y.useRef)(null),Ge=(0,y.useRef)(null),Ke=(0,y.useRef)(null),H=(0,y.useRef)(null),qe=(0,y.useRef)(0),Je=(0,y.useMemo)(()=>{try{return F.toLocaleString()}catch{return F.toString()}},[F]),Ye=(0,y.useCallback)(()=>{try{let e=de(m(),C),t=Number(e),n=Math.max(0,Math.min(s,Math.round(t*s/1e6))),r=document.documentElement;r.style.setProperty(`--pulse-dur`,`${s}ms`),r.style.setProperty(`--pulse-offset`,`-${n}ms`);let i=Ge.current;i&&(i.style.setProperty(`--pulse-dur`,`${s}ms`),i.style.setProperty(`--pulse-offset`,`-${n}ms`))}catch{}},[m]),U=(0,y.useCallback)((e,t=!0)=>{let n=D(e);I(n),t&&!z.current&&R(n.toString()),typeof document<`u`&&Ye()},[Ye]);(0,y.useEffect)(()=>{let e=e=>{let t=V.current;if(!t)return;let n=e.target;n instanceof Node&&t.contains(n)&&(Ge.current?.contains(n)||e.stopPropagation())},t=[`click`,`mousedown`,`touchstart`],n={passive:!0};t.forEach(t=>document.addEventListener(t,e,n));let r=e=>{e.key===`Escape`&&V.current&&e.stopPropagation()};return window.addEventListener(`keydown`,r,!0),()=>{t.forEach(t=>document.removeEventListener(t,e,n)),window.removeEventListener(`keydown`,r,!0)}},[]),(0,y.useEffect)(()=>{x===`live`&&U(g(),!0)},[x,U,g]);let W=(0,y.useCallback)(()=>{H.current!==null&&(window.clearTimeout(H.current),H.current=null)},[]),G=(0,y.useCallback)(()=>{W();let e=()=>{let e=T(d(E(m(),C)+1n));qe.current=e;let n=Math.max(0,e-j());H.current=window.setTimeout(t,n)},t=()=>{let n=j(),r=qe.current;if(n<r){H.current=window.setTimeout(t,Math.max(0,r-n));return}U(g(),!0),e()};U(g(),!0),e()},[U,W,g,m]);(0,y.useEffect)(()=>{if(x!==`live`)return;G();let e=()=>{document.visibilityState===`visible`&&x===`live`&&G()};return document.addEventListener(`visibilitychange`,e),window.addEventListener(`focus`,e),()=>{document.removeEventListener(`visibilitychange`,e),window.removeEventListener(`focus`,e),W()}},[x,G,W]);let Xe=Se(x===`live`,m),Ze=(0,y.useCallback)(()=>{S(`live`),k(``),A(1),U(g(),!0),G()},[U,g,G]),Qe=e=>{let t=(e.target.value??``).replace(/[^\d]/g,``);if(R(t),t)try{let e=D(BigInt(t));S(`static-pulse`),k(``),A(1),U(e,!1),W()}catch{}},$e=(0,y.useCallback)((e,t)=>{let n=_e(e);if(!n)return;let r=D(E(p(ve(n,t)),C));S(`static-date`),W(),U(r,!0)},[U,W]),et=e=>{let t=e.target.value;if(k(t),!t){A(1),Ze();return}$e(t,me)},tt=e=>{let t=Number(e.target.value);A(t),O&&$e(O,t)},nt=()=>{let e=V.current?.querySelector(`.sigil-modal`);e&&(e.classList.remove(`flash-now`),e.offsetWidth,e.classList.add(`flash-now`)),Ze()},K=(0,y.useMemo)(()=>{let{beat:e,stepIndex:t,percentIntoStep:n}=ee(F*C);return{beat:e,stepIndex:t,stepPct:o(n)}},[F]),q=(0,y.useMemo)(()=>{if(!B)return`Root`;let e=be(B,`harmonicDay`);return e?l[e]:`Root`},[B]),rt=(0,y.useMemo)(()=>{try{let e=de(F*C,h)*100000000n/h;return Number(e)/1e6}catch{return 0}},[F]),it=(0,y.useMemo)(()=>{try{let e=d(F),{dayPercent:t}=re(new Date(T(e)));return Math.max(0,Math.min(100,t))}catch{return rt}},[F,rt]);(0,y.useEffect)(()=>{let e=!1;return(async()=>{try{let t=await te(d(F)),n=ye(t)?t:null;e||je(n)}catch{e||je(null)}})(),()=>{e=!0}},[F]);let at=`${K.beat}:${le(K.stepIndex)}`,J=B?M(B,`chakraStepString`):void 0,ot=J||at,st=B?N(B,`dayOfMonth`):void 0,Y=B?N(B,`eternalMonthIndex`):void 0,ct=pe(J&&typeof st==`number`&&typeof Y==`number`?`${J} — D${st}/M${Y+1}`:ot),lt=B?M(B,`eternalChakraArc`)??`Harmonization Ark`:`Harmonization Ark`,ut=we(lt),X=e=>Ae(ke(e)),dt=e=>X(JSON.stringify(e,null,2)),ft=(0,y.useMemo)(()=>{try{if(F<=w)return Number(F);if(fe<=0n)return 0;let e=de(F,fe);return Number(e)}catch{return 0}},[F]),pt=()=>document.querySelector(`#sigil-export svg`),mt=e=>{let t=pt();return t?Oe(t,e):null},ht=e=>{let t=mt(e);return t?new Blob([t],{type:`image/svg+xml;charset=utf-8`}):null},gt=async()=>{let e=document.getElementById(`sigil-export`);if(!e)return null;let t=await(0,se.default)(e,{background:void 0,backgroundColor:null}),n=await new Promise(e=>t.toBlob(t=>e(t),`image/png`));if(n)return n;let r=t.toDataURL(`image/png`).split(`,`)[1]??``,i=atob(r),a=new ArrayBuffer(i.length),o=new Uint8Array(a);for(let e=0;e<i.length;e++)o[e]=i.charCodeAt(e);return new Blob([a],{type:`image/png`})},_t=e=>{let t=Number.isFinite(K.stepIndex)?Math.max(0,Math.min(Math.trunc(K.stepIndex),43)):0,n=Number.isFinite(K.beat)?Math.max(0,Math.min(Math.trunc(K.beat),35)):0;return{pulse:T(F),beat:n,stepIndex:t,chakraDay:q,stepsPerBeat:44,canonicalHash:e,exportedAt:ge(F),expiresAtPulse:(F+11n).toString(),pulseExact:F.toString()}},vt=async()=>{let e=(F<=w?Ve:``).toLowerCase();if(!e){let t=pt();e=(await Ce(((t?new XMLSerializer().serializeToString(t):``)||`no-svg`)+`|pulseExact=${F.toString()}|beat=${K.beat}|step=${K.stepIndex}|chakra=${q}`)).toLowerCase()}let t=_t(e),n=ne(e,t);Be(e),Re(n),Ie(!0)},yt=async()=>{let e=_t((F<=w&&Ve?String(Ve).toLowerCase():``)||(await Ce(`pulseExact=${F.toString()}|beat=${K.beat}|step=${K.stepIndex}|chakra=${q}`)).toLowerCase()),[t,n]=await Promise.all([ht(e),gt()]);if(!t||!n)return;let r=F.toString(),i=r.length>80?`${r.slice(0,40)}_${r.slice(-20)}`:r,a=new ce.default;a.file(`sigil_${i}.svg`,t),a.file(`sigil_${i}.png`,n);let o={...e,overlays:{qr:!1,eternalPulseBar:!1}};a.file(`sigil_${i}.manifest.json`,JSON.stringify(o,null,2));let s=await a.generateAsync({type:`blob`}),c=URL.createObjectURL(s),l=document.createElement(`a`);l.href=c,l.download=`sigil_${i}.zip`,document.body.appendChild(l),l.click(),l.remove(),requestAnimationFrame(()=>URL.revokeObjectURL(c))},bt=()=>e(),Z=(0,y.useMemo)(()=>B?he(M(B,`eternalSeal`)??M(B,`seal`)??``,F,K.beat,K.stepIndex):``,[B,K.beat,K.stepIndex,F]),xt=(0,y.useMemo)(()=>B?be(B,`harmonicDay`)||xe(B.harmonicDay):``,[B]),St=(0,y.useMemo)(()=>B?M(B,`eternalMonth`)??``:``,[B]),Ct=(0,y.useMemo)(()=>B?M(B,`eternalYearName`)??``:``,[B]),wt=(0,y.useMemo)(()=>B?M(B,`kaiTurahPhrase`)??``:``,[B]),Tt=B?N(B,`kaiPulseEternal`):void 0,Et=B?N(B,`kaiPulseToday`):void 0,Q=B?P(B,`chakraStep`):void 0,$=B?P(B,`chakraBeat`):void 0,Dt=Q?N(Q,`stepIndex`):void 0,Ot=Q?N(Q,`percentIntoStep`):void 0,kt=$?N($,`beatIndex`):void 0,At=$?N($,`pulsesIntoBeat`):void 0,jt=B?N(B,`weekIndex`):void 0,Mt=B?M(B,`weekName`)??``:``,Nt=(()=>{let e=B?P(B,`harmonicWeekProgress`):void 0;return e?N(e,`percent`):void 0})(),Pt=(()=>{let e=B?P(B,`eternalMonthProgress`):void 0;return e?N(e,`percent`):void 0})(),Ft=(()=>{let e=B?P(B,`harmonicYearProgress`):void 0;return e?N(e,`percent`):void 0})(),It=B?N(B,`phiSpiralLevel`):void 0,Lt=B?M(B,`kaiMomentSummary`)??``:``,Rt=B?M(B,`compressed_summary`)??``:``;return(0,oe.createPortal)((0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(Te,{}),(0,b.jsx)(`div`,{ref:V,role:`dialog`,"aria-modal":`true`,className:`sigil-modal-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&e.stopPropagation()},onClick:e=>{e.target===e.currentTarget&&e.stopPropagation()},onTouchStart:e=>{e.target===e.currentTarget&&e.stopPropagation()},onKeyDown:e=>e.key===`Escape`&&e.stopPropagation(),children:(0,b.jsxs)(`div`,{className:`sigil-modal`,onMouseDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onTouchStart:e=>e.stopPropagation(),children:[(0,b.jsx)(`button`,{ref:Ge,"aria-label":`Close`,className:`close-btn`,onClick:bt,children:(0,b.jsx)(Ee,{})}),(0,b.jsx)(ae,{dateISO:O,onDateChange:et,secondsLeft:x===`live`?Xe??void 0:void 0,solarPercent:it,eternalPercent:rt,solarColor:`#ffd600`,eternalColor:ut,eternalArkLabel:lt}),x!==`live`&&(0,b.jsxs)(b.Fragment,{children:[O&&(0,b.jsxs)(`label`,{style:{marginLeft:`12px`},className:`sigil-label`,children:[(0,b.jsx)(`span`,{className:`sigil-label__text`,children:`Breath within minute`}),`\xA0`,(0,b.jsx)(`select`,{value:me,onChange:tt,children:Me.map((e,t)=>(0,b.jsx)(`option`,{value:t+1,children:e},e))})]}),(0,b.jsx)(`button`,{className:`now-btn`,onClick:nt,children:`Now`})]}),x===`live`&&Xe!==null&&(0,b.jsxs)(`p`,{className:`countdown`,children:[`next pulse in `,(0,b.jsx)(`strong`,{children:Xe.toFixed(3)}),`s`]}),(0,b.jsxs)(`div`,{className:`sigil-pulse-row`,children:[(0,b.jsxs)(`label`,{className:`sigil-label sigil-pulse-label`,children:[(0,b.jsx)(`span`,{className:`sigil-label__text`,children:`Pulse`}),(0,b.jsx)(`input`,{className:`sigil-input sigil-pulse-input`,type:`text`,inputMode:`numeric`,value:L,onFocus:()=>{z.current=!0},onBlur:()=>{z.current=!1,R(F.toString())},onChange:Qe,"aria-label":`Pulse`,placeholder:`Enter pulse`})]}),(0,b.jsx)(`span`,{className:`sigil-live-chip ${x===`live`?`is-live`:`is-static`}`,"aria-live":`polite`,children:x===`live`?`LIVE`:`STATIC`})]}),(0,b.jsxs)(`div`,{id:`sigil-export`,style:{position:`relative`,width:240,margin:`16px auto`},children:[(0,b.jsx)(r,{ref:Ke,pulse:ft,beat:K.beat,stepIndex:K.stepIndex,stepPct:K.stepPct,chakraDay:q,size:240,hashMode:`deterministic`,origin:``,onReady:e=>{let t=e.hash?String(e.hash).toLowerCase():``;t&&He(t)}}),(0,b.jsx)(`span`,{className:`pulse-tag`,children:Je})]}),(0,b.jsxs)(`div`,{className:`sigil-meta-block`,children:[(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Kairos:`}),`\xA0`,ot,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>X(ot),children:`💠`})]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Kairos/Date:`}),`\xA0`,ct,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>X(ct),children:`💠`})]}),B&&(0,b.jsxs)(b.Fragment,{children:[(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Seal:`}),`\xA0`,Z,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>X(Z),children:`💠`})]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Day:`}),` `,xt]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Month:`}),` `,St]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Arc:`}),` `,lt]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Year:`}),` `,Ct]}),(0,b.jsxs)(`p`,{children:[(0,b.jsx)(`strong`,{children:`Kai-Turah:`}),`\xA0`,wt,(0,b.jsx)(`button`,{className:`copy-btn`,onClick:()=>X(wt),children:`💠`})]})]})]}),B&&(0,b.jsxs)(`details`,{className:`rich-data`,open:Ue,onToggle:e=>We(e.currentTarget.open),children:[(0,b.jsx)(`summary`,{children:`Memory`}),(0,b.jsxs)(`div`,{className:`rich-grid`,children:[(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`pulseExact`}),(0,b.jsx)(`span`,{children:F.toString()})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`kaiPulseEternal`}),(0,b.jsx)(`span`,{children:(Tt??0).toLocaleString()})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`kaiPulseToday`}),(0,b.jsx)(`span`,{children:Et??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraStepString`}),(0,b.jsx)(`span`,{children:J??``})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraStep.stepIndex`}),(0,b.jsx)(`span`,{children:Dt??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraStep.percentIntoStep`}),(0,b.jsxs)(`span`,{children:[((Ot??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraBeat.beatIndex`}),(0,b.jsx)(`span`,{children:kt??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`chakraBeat.pulsesIntoBeat`}),(0,b.jsx)(`span`,{children:At??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`weekIndex`}),(0,b.jsx)(`span`,{children:jt??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`weekName`}),(0,b.jsx)(`span`,{children:Mt})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`dayOfMonth`}),(0,b.jsx)(`span`,{children:st??0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`eternalMonthIndex`}),(0,b.jsx)(`span`,{children:typeof Y==`number`?Y+1:0})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`harmonicWeekProgress.percent`}),(0,b.jsxs)(`span`,{children:[((Nt??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`eternalMonthProgress.percent`}),(0,b.jsxs)(`span`,{children:[((Pt??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`harmonicYearProgress.percent`}),(0,b.jsxs)(`span`,{children:[((Ft??0)*100).toFixed(2),`%`]})]}),(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`code`,{children:`phiSpiralLevel`}),(0,b.jsx)(`span`,{children:It??0})]}),(0,b.jsxs)(`div`,{className:`span-2`,children:[(0,b.jsx)(`code`,{children:`kaiMomentSummary`}),(0,b.jsx)(`span`,{children:Lt})]}),(0,b.jsxs)(`div`,{className:`span-2`,children:[(0,b.jsx)(`code`,{children:`compressed_summary`}),(0,b.jsx)(`span`,{children:Rt})]}),(0,b.jsxs)(`div`,{className:`span-2`,children:[(0,b.jsx)(`code`,{children:`eternalSeal`}),(0,b.jsx)(`span`,{className:`truncate`,children:Z})]})]}),(0,b.jsx)(`div`,{className:`rich-actions`,children:(0,b.jsx)(`button`,{onClick:()=>dt(B),children:`Remember JSON`})})]}),(0,b.jsx)(`div`,{className:`modal-bottom-spacer`,"aria-hidden":`true`}),(0,b.jsx)(`div`,{className:`mint-dock`,children:(0,b.jsxs)(`button`,{className:`mint-btn`,type:`button`,"aria-label":`Mint this moment`,title:`Mint this moment`,onClick:vt,children:[(0,b.jsx)(`span`,{className:`mint-btn__icon`,"aria-hidden":`true`,children:Ne?(0,b.jsx)(`img`,{src:`/assets/seal.svg`,alt:``,loading:`eager`,decoding:`async`,onError:()=>Pe(!1)}):(0,b.jsx)(De,{})}),(0,b.jsxs)(`span`,{className:`mint-btn__text`,children:[(0,b.jsx)(`span`,{className:`mint-btn__title`,children:`MINT ΦKey`}),(0,b.jsxs)(`span`,{className:`mint-btn__sub`,children:[`☤KAI `,Je]})]})]})})]})}),(0,b.jsx)(ie,{open:Fe,url:Le,hash:ze,onClose:()=>Ie(!1),onDownloadZip:yt})]}),document.body)};export{Ne as t};