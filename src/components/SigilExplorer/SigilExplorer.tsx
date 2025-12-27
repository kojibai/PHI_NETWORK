// src/components/SigilExplorer.tsx
/* eslint-disable no-empty -- benign lifecycle errors are silenced */
"use client";

import React, {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ✅ CSS contract you pasted */
import "../SigilExplorer.css";

/* ──────────────────────────────────────────────────────────────────────────────
   Modular SigilExplorer wiring (components/SigilExplorer/*)
────────────────────────────────────────────────────────────────────────────── */

/** Core registry + storage */
import {
  memoryRegistry,
  addUrl,
  ensureRegistryHydrated,
  persistRegistryToStorage,
  parseImportedJson,
  REGISTRY_LS_KEY,
  MODAL_FALLBACK_LS_KEY,
  isOnline,
} from "./registryStore";

/** Breath cadence + chakra tinting */
import { chakraTintStyle } from "./chakra";

/** URL surface */
import {
  canonicalizeUrl,
  browserViewUrl,
  explorerOpenUrl,
  extractPayloadFromUrl,
  parseHashFromUrl,
  isPTildeUrl,
  contentKindForUrl,
  scoreUrlForView,
  momentKeyFor,
} from "./url";

/** Formatting + Kai-time comparisons */
import { formatPhi, formatUsd, getPhiFromPayload, short } from "./format";

/** URL health probing */
import { loadUrlHealthFromStorage, probeUrl, setUrlHealth, urlHealth } from "./urlHealth";

/** Remote API client */
import {
  apiFetchWithFailover,
  API_SEAL_PATH,
  type ApiSealResponse,
  loadApiBackupDeadUntil,
  loadApiBaseHint,
} from "./apiClient";

/** Inhale queue (push) */
import {
  enqueueInhaleRawKrystal,
  flushInhaleQueue,
  forceInhaleUrls,
  loadInhaleQueueFromStorage,
  saveInhaleQueueToStorage,
  seedInhaleFromRegistry,
} from "./inhaleQueue";

/** Remote pull (exhale) */
import { pullAndImportRemoteUrls } from "./remotePull";

/** Username claim witness registry */
import {
  getUsernameClaimRegistry,
  normalizeUsername,
  subscribeUsernameClaimRegistry,
  type UsernameClaimRegistry,
} from "./witness";

/** Transfers registry */
import {
  getTransferMoveFromPayload,
  getTransferMoveFromRegistry,
  getTransferMoveFromTransferUrl,
  readSigilTransferRegistry,
  SIGIL_TRANSFER_CHANNEL_NAME,
  SIGIL_TRANSFER_EVENT,
  SIGIL_TRANSFER_LS_KEY,
  type SigilTransferRecord,
  type TransferMove,
} from "./transfers";
import { registerSigilUrl as registerSigilUrlGlobal } from "../../utils/sigilRegistry";
import { stepIndexFromPulseExact } from "../../utils/kai_pulse";

/** Tree build */
import { buildForest, resolveCanonicalHashFromNode } from "./tree/buildForest";
import type { SigilNode } from "./tree/types";

/* ─────────────────────────────────────────────────────────────────────
 *  Globals / constants
 *  ───────────────────────────────────────────────────────────────────── */
const hasWindow = typeof window !== "undefined";

type SyncReason = "open" | "pulse" | "visible" | "focus" | "online" | "import";

const SIGIL_EXPLORER_OPEN_EVENT = "sigil:explorer:open";
const SIGIL_EXPLORER_CHANNEL_NAME = "sigil:explorer:bc:v1";

const UI_SCROLL_INTERACT_MS = 520;
const UI_TOGGLE_INTERACT_MS = 900;
const UI_FLUSH_PAD_MS = 80;
const IMPORT_BATCH_SIZE = 80;

const URL_PROBE_MAX_PER_REFRESH = 18;
const INHALE_INTERVAL_MS = 3236;
const EXHALE_INTERVAL_MS = 2000;

function getLatestPulseFromRegistry(): number | undefined {
  let latest: number | undefined;
  for (const [, payload] of memoryRegistry) {
    const pulse = (payload as { pulse?: unknown }).pulse;
    if (typeof pulse !== "number" || !Number.isFinite(pulse)) continue;
    if (latest == null || pulse > latest) latest = pulse;
  }
  return latest;
}

function readRemotePulse(body: ApiSealResponse): number | undefined {
  const pulse = body?.pulse ?? body?.latestPulse ?? body?.latest_pulse;
  if (typeof pulse !== "number" || !Number.isFinite(pulse)) return undefined;
  return pulse;
}

const PHI_MARK_SRC = "/phi.svg";

function nowMs(): number {
  return Date.now();
}

function yieldToMain(): Promise<void> {
  if (!hasWindow) return Promise.resolve();
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function cssEscape(s: string): string {
  const w = hasWindow ? (window as unknown as { CSS?: { escape?: (v: string) => string } }) : null;
  const esc = w?.CSS?.escape;
  if (typeof esc === "function") return esc(s);
  return s.replace(/["\\]/g, "\\$&");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function hasStringProp<T extends string>(obj: unknown, key: T): obj is Record<T, string> {
  return isRecord(obj) && typeof obj[key] === "string";
}

/* ─────────────────────────────────────────────────────────────────────
 *  Detail extraction
 *  ───────────────────────────────────────────────────────────────────── */
type DetailEntry = { label: string; value: string };

type FeedPostPayload = {
  author?: string;
  usernameClaim?: unknown;
};

function resolveTransferMoveForNode(
  node: SigilNode,
  transferRegistry: ReadonlyMap<string, SigilTransferRecord>,
): TransferMove | undefined {
  const canonicalHash = resolveCanonicalHashFromNode(node);
  const registryMove = getTransferMoveFromRegistry(canonicalHash, transferRegistry);
  if (registryMove) return registryMove;

  const payloadMove = getTransferMoveFromPayload(node.payload);
  if (payloadMove) return payloadMove;

  const record = node.payload as unknown as Record<string, unknown>;
  const transferUrlMove = getTransferMoveFromTransferUrl(record);
  if (transferUrlMove) return transferUrlMove;

  if (isRecord(record.feed)) {
    const feedTransferUrlMove = getTransferMoveFromTransferUrl(record.feed as Record<string, unknown>);
    if (feedTransferUrlMove) return feedTransferUrlMove;
  }

  for (const url of node.urls) {
    const payload = extractPayloadFromUrl(url);
    if (!payload) continue;

    const derived = getTransferMoveFromPayload(payload);
    if (derived) return derived;

    const payloadRec = payload as unknown as Record<string, unknown>;
    const derivedTransferUrl = getTransferMoveFromTransferUrl(payloadRec);
    if (derivedTransferUrl) return derivedTransferUrl;
  }

  return undefined;
}

function buildDetailEntries(
  node: SigilNode,
  usernameClaims: UsernameClaimRegistry,
  transferRegistry: ReadonlyMap<string, SigilTransferRecord>,
): DetailEntry[] {
  const record = node.payload as unknown as Record<string, unknown>;
  const entries: DetailEntry[] = [];
  const usedKeys = new Set<string>();

  const phiSelf = getPhiFromPayload(node.payload);
  if (phiSelf !== undefined) entries.push({ label: "This glyph Φ", value: `${formatPhi(phiSelf)} Φ` });

  const transferMove = resolveTransferMoveForNode(node, transferRegistry);
  if (transferMove) {
    entries.push({
      label: `Φ ${transferMove.direction === "receive" ? "Received" : "Sent"}`,
      value: `${transferMove.direction === "receive" ? "+" : "-"}${formatPhi(transferMove.amount)} Φ`,
    });
    if (transferMove.amountUsd !== undefined) entries.push({ label: "USD value", value: `$${formatUsd(transferMove.amountUsd)}` });
    if (transferMove.sentPulse !== undefined) entries.push({ label: "Sent pulse", value: String(transferMove.sentPulse) });

    const maybe = transferMove as unknown;
    if (hasStringProp(maybe, "txHash")) entries.push({ label: "Tx hash", value: maybe.txHash });
  }

  const feed = record.feed as FeedPostPayload | undefined;
  const authorRaw =
    typeof feed?.author === "string"
      ? feed.author
      : typeof record.author === "string"
        ? record.author
        : undefined;

  const claimEvidence = feed ? (feed as FeedPostPayload & { usernameClaim?: unknown }).usernameClaim : undefined;
  const normalizedFromClaim = claimEvidence
    ? normalizeUsername(
        (claimEvidence as { payload?: { normalized?: string; username?: string } }).payload?.normalized ||
          (claimEvidence as { payload?: { normalized?: string; username?: string } }).payload?.username ||
          "",
      )
    : "";
  const normalizedFromAuthor = normalizeUsername(authorRaw ?? "");
  const normalizedUsername = normalizedFromClaim || normalizedFromAuthor;

  if (normalizedUsername) {
    const claimEntry = usernameClaims[normalizedUsername];
    const displayName =
      typeof authorRaw === "string" && authorRaw.trim().length > 0 ? authorRaw.trim() : `@${normalizedUsername}`;

    if (claimEntry) {
      entries.push({ label: "Username (claimed)", value: `${displayName} → glyph ${short(claimEntry.claimHash, 10)}` });
      entries.push({ label: "Claim glyph", value: browserViewUrl(claimEntry.claimUrl) });
    } else {
      entries.push({ label: "Username", value: displayName });
    }
  }

  const addFromKey = (key: string, label: string) => {
    const v = record[key];
    if (typeof v === "string" && v.trim().length > 0 && !usedKeys.has(key)) {
      entries.push({ label, value: v.trim() });
      usedKeys.add(key);
    }
  };

  addFromKey("userPhiKey", "PhiKey");
  addFromKey("phiKey", "PhiKey");
  addFromKey("phikey", "PhiKey");
  addFromKey("kaiSignature", "Kai Signature");

  if (typeof record.parentUrl === "string" && record.parentUrl.length > 0) entries.push({ label: "Parent URL", value: browserViewUrl(record.parentUrl) });
  if (typeof record.originUrl === "string" && record.originUrl.length > 0) entries.push({ label: "Origin URL", value: browserViewUrl(record.originUrl) });

  const labelCandidate = record.label ?? record.title ?? record.type ?? record.note ?? record.description;
  if (typeof labelCandidate === "string" && labelCandidate.trim().length > 0) entries.push({ label: "Label / Type", value: labelCandidate.trim() });

  entries.push({ label: "Primary URL", value: browserViewUrl(node.url) });

  const visibleVariants = node.urls.filter((u) => !isPTildeUrl(u)).map((u) => browserViewUrl(u));
  if (node.urls.length > 1) {
    entries.push({
      label: "URL variants",
      value:
        visibleVariants.length === 0
          ? `${node.urls.length} urls (kept in data; hidden from browser view)`
          : visibleVariants.length <= 3
            ? visibleVariants.join(" | ")
            : `${node.urls.length} urls (kept in data; rendered once)`,
    });
  }

  return entries.slice(0, 12);
}

/* ─────────────────────────────────────────────────────────────────────
 *  Clipboard helper
 *  ───────────────────────────────────────────────────────────────────── */
async function copyText(text: string): Promise<void> {
  if (!hasWindow) return;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {}
}

/* ─────────────────────────────────────────────────────────────────────
 *  Prefetch helper (warm view urls)
 *  ───────────────────────────────────────────────────────────────────── */
async function prefetchViewUrl(u: string): Promise<void> {
  if (!hasWindow) return;
  try {
    await fetch(u, { method: "GET", cache: "force-cache", mode: "cors", credentials: "omit", redirect: "follow" });
  } catch {}
}

/* ─────────────────────────────────────────────────────────────────────
 *  UI components (CSS class contract)
 *  ───────────────────────────────────────────────────────────────────── */
function KaiStamp({ p }: { p: { pulse?: number; beat?: number; stepIndex?: number; stepsPerBeat?: number } }) {
  const pulse = typeof p.pulse === "number" ? p.pulse : 0;
  const stepsPerBeat = typeof p.stepsPerBeat === "number" && p.stepsPerBeat > 0 ? p.stepsPerBeat : 44;
  const step =
    typeof p.pulse === "number"
      ? stepIndexFromPulseExact(p.pulse, stepsPerBeat)
      : typeof p.stepIndex === "number"
        ? p.stepIndex
        : 0;
  const beat = typeof p.beat === "number" ? p.beat : 0;

  return (
    <span className="k-stamp" title={`pulse ${pulse} • beat ${beat} • step ${step}`}>
      <span className="k-pill">☤KAI {pulse}</span>
      <span className="k-dot">•</span>
      <span className="k-pill">beat {beat}</span>
      <span className="k-dot">•</span>
      <span className="k-pill">step {step}</span>
    </span>
  );
}

type SigilTreeNodeProps = {
  node: SigilNode;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  phiTotalsByPulse: ReadonlyMap<number, number>;
  usernameClaims: UsernameClaimRegistry;
  transferRegistry: ReadonlyMap<string, SigilTransferRecord>;
};

function SigilTreeNode({
  node,
  expanded,
  toggle,
  phiTotalsByPulse,
  usernameClaims,
  transferRegistry,
}: SigilTreeNodeProps) {
  const open = expanded.has(node.id);

  const hash = resolveCanonicalHashFromNode(node);
  const sig = (node.payload as unknown as { kaiSignature?: string }).kaiSignature;
  const chakraDay = (node.payload as unknown as { chakraDay?: string }).chakraDay;

  const pulseKey =
    typeof (node.payload as { pulse?: unknown }).pulse === "number" ? (node.payload as { pulse: number }).pulse : undefined;

  const phiSentFromPulse = pulseKey != null ? phiTotalsByPulse.get(pulseKey) : undefined;

  const openHref = explorerOpenUrl(node.url);
  const detailEntries = open ? buildDetailEntries(node, usernameClaims, transferRegistry) : [];
  const transferMove = resolveTransferMoveForNode(node, transferRegistry);

  return (
    <div className="node" style={chakraTintStyle(chakraDay)} data-chakra={String(chakraDay ?? "")} data-node-id={node.id}>
      <div className="node-row">
        <div className="node-main">
          <button
            className="twirl"
            aria-label={open ? "Collapse memories" : "Expand memories"}
            aria-expanded={open}
            onClick={() => toggle(node.id)}
            title={open ? "Collapse" : "Expand"}
            type="button"
          >
            <span className={`tw ${open ? "open" : ""}`} />
          </button>

          <a className="node-link" href={openHref} target="_blank" rel="noopener noreferrer" title={openHref}>
            <span>{short(sig ?? hash ?? "glyph", 12)}</span>
          </a>
        </div>

        <div className="node-meta">
          <KaiStamp p={node.payload as { pulse?: number; beat?: number; stepIndex?: number }} />

          {chakraDay && (
            <span className="chakra" title={String(chakraDay)}>
              {String(chakraDay)}
            </span>
          )}

          {transferMove && (
            <span
              className={`phi-move phi-move--${transferMove.direction}`}
              title={`Φ ${transferMove.direction === "receive" ? "received" : "sent"}: ${formatPhi(transferMove.amount)} Φ${
                transferMove.amountUsd !== undefined ? ` • $${formatUsd(transferMove.amountUsd)}` : ""
              }${transferMove.sentPulse !== undefined ? ` • sent pulse ${transferMove.sentPulse}` : ""}`}
            >
              <img className="phi-move__mark" src={PHI_MARK_SRC} alt="" aria-hidden="true" decoding="async" loading="lazy" draggable={false} />
              <span className="phi-move__sign" aria-hidden="true">
                {transferMove.direction === "receive" ? "+" : "-"}
              </span>
              <span className="phi-move__amount">{formatPhi(transferMove.amount)} Φ</span>
              {transferMove.amountUsd !== undefined && <span className="phi-move__usd">${formatUsd(transferMove.amountUsd)}</span>}
            </span>
          )}

          {phiSentFromPulse !== undefined && (
            <span className="phi-pill" title={`Total Φ on pulse ${(node.payload as { pulse?: number }).pulse ?? ""}`}>
              Φ pulse: {formatPhi(phiSentFromPulse)}Φ
            </span>
          )}

          <button className="node-copy" aria-label="Copy URL" onClick={() => void copyText(openHref)} title="Copy URL" type="button">
            ⧉
          </button>
        </div>
      </div>

      {open && (
        <div className="node-open">
          <div className="node-detail">
            {detailEntries.length === 0 ? (
              <div className="node-detail-empty">No additional memory fields recorded on this glyph.</div>
            ) : (
              <div className="node-detail-grid">
                {detailEntries.map((entry) => (
                  <React.Fragment key={entry.label}>
                    <div className="detail-label">{entry.label}</div>
                    <div className="detail-value" title={entry.value}>
                      {entry.value}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {node.children.length > 0 && (
            <div className="node-children" aria-label="Memory Imprints">
              {node.children.map((c) => (
                <SigilTreeNode
                  key={c.id}
                  node={c}
                  expanded={expanded}
                  toggle={toggle}
                  phiTotalsByPulse={phiTotalsByPulse}
                  usernameClaims={usernameClaims}
                  transferRegistry={transferRegistry}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OriginPanel({
  root,
  expanded,
  toggle,
  phiTotalsByPulse,
  usernameClaims,
  transferRegistry,
}: {
  root: SigilNode;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  phiTotalsByPulse: ReadonlyMap<number, number>;
  usernameClaims: UsernameClaimRegistry;
  transferRegistry: ReadonlyMap<string, SigilTransferRecord>;
}) {
  const count = useMemo(() => {
    let n = 0;
    const walk = (s: SigilNode) => {
      n += 1;
      s.children.forEach(walk);
    };
    walk(root);
    return n;
  }, [root]);

  const originHash = parseHashFromUrl(root.url);
  const originSig = (root.payload as unknown as { kaiSignature?: string }).kaiSignature;

  const openHref = explorerOpenUrl(root.url);
  const chakraDay = (root.payload as unknown as { chakraDay?: string }).chakraDay;

  return (
    <section className="origin" aria-label="Sigil origin stream" style={chakraTintStyle(chakraDay)} data-chakra={String(chakraDay ?? "")} data-node-id={root.id}>
      <header className="origin-head">
        <div className="o-meta">
          <span className="o-title">Origin</span>
          <a className="o-link" href={openHref} target="_blank" rel="noopener noreferrer" title={openHref}>
            {short(originSig ?? originHash ?? "origin", 14)}
          </a>
          {chakraDay && (
            <span className="o-chakra" title={String(chakraDay)}>
              {String(chakraDay)}
            </span>
          )}
        </div>

        <div className="o-right">
          <KaiStamp p={root.payload as { pulse?: number; beat?: number; stepIndex?: number }} />
          <span className="o-count" title="Total content keys in this lineage">
            {count} keys
          </span>
          <button className="o-copy" onClick={() => void copyText(openHref)} title="Copy origin URL" type="button">
            Remember Origin
          </button>
        </div>
      </header>

      <div className="origin-body">
        {root.children.length === 0 ? (
          <div className="kx-empty">No memories yet. The stream begins here.</div>
        ) : (
          <div className="tree">
            {root.children.map((c) => (
              <SigilTreeNode
                key={c.id}
                node={c}
                expanded={expanded}
                toggle={toggle}
                phiTotalsByPulse={phiTotalsByPulse}
                usernameClaims={usernameClaims}
                transferRegistry={transferRegistry}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ExplorerToolbar({
  onAdd,
  onImport,
  onExport,
  total,
  lastAdded,
}: {
  onAdd: (u: string) => void;
  onImport: (f: File) => void;
  onExport: () => void;
  total: number;
  lastAdded?: string;
}) {
  const [input, setInput] = useState("");

  return (
    <div className="kx-toolbar" role="region" aria-label="Explorer toolbar">
      <div className="kx-toolbar-inner">
        <div className="kx-brand">
          <div className="kx-glyph" aria-hidden>
            <img className="kx-glyph__mark" src={PHI_MARK_SRC} alt="" aria-hidden="true" decoding="async" loading="eager" draggable={false} />
          </div>

          <div className="kx-title">
            <h1>
              KAIROS <span>Keystream</span>
            </h1>
            <div className="kx-tagline">Sovereign Lineage • No DB • Pure Φ</div>
          </div>
        </div>

        <div className="kx-controls">
          <form
            className="kx-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim()) return;
              onAdd(input.trim());
              setInput("");
            }}
          >
            <input
              className="kx-input"
              placeholder="Inhale a sigil (or memory)…"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Sigil Key"
            />
            <button className="kx-button" type="submit">
              Inhale
            </button>
          </form>

          <div className="kx-io" role="group" aria-label="Import and export">
            <label className="kx-import" title="Import a JSON list of Keys (or krystals)">
              <input
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImport(f);
                }}
                aria-label="Import JSON"
              />
              Inhale
            </label>

            <button className="kx-export" onClick={onExport} aria-label="Export registry to JSON" type="button">
              Exhale
            </button>
          </div>

          <div className="kx-stats" aria-live="polite">
            <span className="kx-pill" title="Total KEYS in registry (includes variants)">
              {total} KEYS
            </span>
            {lastAdded && (
              <span className="kx-pill subtle" title={lastAdded}>
                Last: {short(lastAdded, 8)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Main Page — Layout matches CSS: .sigil-explorer + ONLY .explorer-scroll scrolls
 *  ───────────────────────────────────────────────────────────────────── */
const SigilExplorer: React.FC = () => {
  const [registryRev, setRegistryRev] = useState(() => (ensureRegistryHydrated() ? 1 : 0));
  const [transferRev, setTransferRev] = useState(0);
  const [lastAdded, setLastAdded] = useState<string | undefined>(undefined);
  const [usernameClaims, setUsernameClaims] = useState<UsernameClaimRegistry>(() => getUsernameClaimRegistry());

  const unmounted = useRef(false);
  const prefetchedRef = useRef<Set<string>>(new Set());

  // Scroll safety guards
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const scrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<number | null>(null);

  // UI stability gate
  const interactUntilRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);
  const pendingBumpRef = useRef(false);
  const pendingLastAddedRef = useRef<string | undefined>(undefined);
  const pendingClaimEntriesRef = useRef<
    Array<{
      normalized: string;
      claimHash: string;
      claimUrl: string;
      originHash?: string | null;
      ownerHint?: string | null;
    }>
  >([]);
  const syncNowRef = useRef<((reason: SyncReason) => Promise<void>) | null>(null);

  const markInteracting = useCallback((ms: number) => {
    const until = nowMs() + ms;
    if (until > interactUntilRef.current) interactUntilRef.current = until;
  }, []);

  const flushDeferredUi = useCallback(() => {
    if (!hasWindow) return;
    if (unmounted.current) return;

    const now = nowMs();
    const remaining = interactUntilRef.current - now;
    if (remaining > 0) {
      if (flushTimerRef.current != null) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        flushDeferredUi();
      }, remaining + UI_FLUSH_PAD_MS);
      return;
    }

    const queuedClaims = pendingClaimEntriesRef.current.splice(0);
    if (queuedClaims.length > 0) {
      startTransition(() => {
        setUsernameClaims((prev) => {
          let next = prev;
          for (const entry of queuedClaims) {
            const current = next[entry.normalized];
            if (
              current &&
              current.claimHash === entry.claimHash &&
              current.claimUrl === entry.claimUrl &&
              current.originHash === (entry.originHash ?? current.originHash) &&
              current.ownerHint === (entry.ownerHint ?? current.ownerHint)
            ) {
              continue;
            }
            next = {
              ...next,
              [entry.normalized]: {
                ...current,
                normalized: entry.normalized,
                claimHash: entry.claimHash,
                claimUrl: entry.claimUrl,
                originHash: entry.originHash ?? current?.originHash,
                ownerHint: entry.ownerHint ?? current?.ownerHint ?? null,
                updatedAt: current?.updatedAt ?? 0,
              },
            };
          }
          return next;
        });
      });
    }

    if (pendingLastAddedRef.current !== undefined) {
      const v = pendingLastAddedRef.current;
      pendingLastAddedRef.current = undefined;
      startTransition(() => setLastAdded(v));
    }

    if (pendingBumpRef.current) {
      pendingBumpRef.current = false;
      startTransition(() => setRegistryRev((v) => v + 1));
    }
  }, [markInteracting]);

  const scheduleUiFlush = useCallback(() => {
    if (!hasWindow) return;
    if (flushTimerRef.current != null) return;

    const now = nowMs();
    const remaining = interactUntilRef.current - now;
    const delay = Math.max(0, remaining) + UI_FLUSH_PAD_MS;

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushDeferredUi();
    }, delay);
  }, [flushDeferredUi]);

  const bump = useCallback(() => {
    if (unmounted.current) return;

    const now = nowMs();
    if (now < interactUntilRef.current || scrollingRef.current) {
      pendingBumpRef.current = true;
      scheduleUiFlush();
      return;
    }
    startTransition(() => setRegistryRev((v) => v + 1));
  }, [scheduleUiFlush]);

  const setLastAddedSafe = useCallback(
    (v: string | undefined) => {
      if (unmounted.current) return;

      const now = nowMs();
      if (now < interactUntilRef.current || scrollingRef.current) {
        pendingLastAddedRef.current = v;
        scheduleUiFlush();
        return;
      }
      startTransition(() => setLastAdded(v));
    },
    [scheduleUiFlush],
  );

  // Toggle anchor preservation
  const lastToggleAnchorRef = useRef<{ id: string; scrollTop: number; rectTop: number } | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = useCallback(
    (id: string) => {
      markInteracting(UI_TOGGLE_INTERACT_MS);

      const el = scrollElRef.current;
      if (el) {
        const sel = `[data-node-id="${cssEscape(id)}"]`;
        const nodeEl = el.querySelector(sel) as HTMLElement | null;
        lastToggleAnchorRef.current = { id, scrollTop: el.scrollTop, rectTop: nodeEl ? nodeEl.getBoundingClientRect().top : 0 };
      }

      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });

      scheduleUiFlush();
    },
    [markInteracting, scheduleUiFlush],
  );

  // Prevent browser pull-to-refresh overscroll while explorer is open
  useEffect(() => {
    if (!hasWindow) return;

    const html = document.documentElement as HTMLElement | null;
    const body = document.body as HTMLElement | null;
    const root = (document.scrollingElement as HTMLElement | null) || (document.documentElement as HTMLElement | null);

    const prev = {
      htmlOverscroll: html?.style.overscrollBehavior ?? "",
      htmlOverscrollY: html?.style.overscrollBehaviorY ?? "",
      bodyOverscroll: body?.style.overscrollBehavior ?? "",
      bodyOverscrollY: body?.style.overscrollBehaviorY ?? "",
      rootOverscroll: root?.style.overscrollBehavior ?? "",
      rootOverscrollY: root?.style.overscrollBehaviorY ?? "",
    };

    if (html) {
      html.style.overscrollBehavior = "none";
      html.style.overscrollBehaviorY = "none";
    }
    if (body) {
      body.style.overscrollBehavior = "none";
      body.style.overscrollBehaviorY = "none";
    }
    if (root) {
      root.style.overscrollBehavior = "none";
      root.style.overscrollBehaviorY = "none";
    }

    return () => {
      if (html) {
        html.style.overscrollBehavior = prev.htmlOverscroll;
        html.style.overscrollBehaviorY = prev.htmlOverscrollY;
      }
      if (body) {
        body.style.overscrollBehavior = prev.bodyOverscroll;
        body.style.overscrollBehaviorY = prev.bodyOverscrollY;
      }
      if (root) {
        root.style.overscrollBehavior = prev.rootOverscroll;
        root.style.overscrollBehaviorY = prev.rootOverscrollY;
      }
    };
  }, []);

  // Touch guard: prevent top/bottom overdrag from triggering pull-to-refresh
  useEffect(() => {
    if (!hasWindow) return;
    const el = scrollElRef.current;
    if (!el) return;

    let lastY = 0;
    let lastX = 0;

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      lastY = ev.touches[0]?.clientY ?? 0;
      lastX = ev.touches[0]?.clientX ?? 0;
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (!ev.cancelable) return;
      if (ev.touches.length !== 1) return;

      const y = ev.touches[0]?.clientY ?? 0;
      const x = ev.touches[0]?.clientX ?? 0;

      const dy = y - lastY;
      const dx = x - lastX;

      lastY = y;
      lastX = x;

      if (Math.abs(dy) <= Math.abs(dx)) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop >= maxScroll - 1;

      const pullingDown = dy > 0;
      const pushingUp = dy < 0;

      if ((atTop && pullingDown && window.scrollY <= 0) || (atBottom && pushingUp)) {
        ev.preventDefault();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Scroll listener (isolated)
  useEffect(() => {
    if (!hasWindow) return;
    const el = scrollElRef.current;
    if (!el) return;

    const onScroll = () => {
      scrollingRef.current = true;
      markInteracting(UI_SCROLL_INTERACT_MS);

      if (scrollIdleTimerRef.current != null) window.clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = window.setTimeout(() => {
        scrollingRef.current = false;
        scrollIdleTimerRef.current = null;
        scheduleUiFlush();
      }, 180);
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (scrollIdleTimerRef.current != null) window.clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = null;
      scrollingRef.current = false;
    };
  }, [markInteracting, scheduleUiFlush]);

  // Apply toggle anchor preservation after DOM commit
  useLayoutEffect(() => {
    const anchor = lastToggleAnchorRef.current;
    if (!anchor) return;
    lastToggleAnchorRef.current = null;

    const el = scrollElRef.current;
    if (!el) return;

    const sel = `[data-node-id="${cssEscape(anchor.id)}"]`;
    const nodeEl = el.querySelector(sel) as HTMLElement | null;
    if (!nodeEl) return;

    const afterTop = nodeEl.getBoundingClientRect().top;
    const delta = afterTop - anchor.rectTop;

    if (Number.isFinite(delta) && Math.abs(delta) > 1) {
      el.scrollTop = Math.max(0, anchor.scrollTop + delta);
    }
  }, [expanded]);

  // Remote seal + sync guards
  const remoteSealRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const lastFullSeedSealRef = useRef<string | null>(null);

  useEffect(() => {
    unmounted.current = false;

    loadApiBackupDeadUntil();
    loadApiBaseHint();

    loadUrlHealthFromStorage();
    loadInhaleQueueFromStorage();

    const hydrated = ensureRegistryHydrated();
    if (hydrated) bump();

    // Inhale current URL if it contains a payload
    if (hasWindow) {
      const here = canonicalizeUrl(window.location.href);
      if (extractPayloadFromUrl(here)) {
        const changed = addUrl(here, { includeAncestry: true, broadcast: false, persist: true, source: "local", enqueueToApi: true });
        setLastAddedSafe(browserViewUrl(here));
        if (changed) bump();
      }
    }

    // Stable global hook
    const prev = window.__SIGIL__?.registerSigilUrl;
    const prevSend = window.__SIGIL__?.registerSend;
    if (!window.__SIGIL__) window.__SIGIL__ = {};
    window.__SIGIL__.registerSigilUrl = registerSigilUrlGlobal;
    window.__SIGIL__.registerSend = (rec: unknown) => {
      if (!rec || typeof rec !== "object") return;
      const url = (rec as { url?: unknown }).url;
      if (typeof url !== "string" || !url.trim()) return;
      const changed = addUrl(url, { includeAncestry: true, broadcast: true, persist: true, source: "local", enqueueToApi: true });
      if (changed) {
        setLastAddedSafe(browserViewUrl(url));
        bump();
      }
    };

    // event surface
    const onUrlRegistered = (e: Event) => {
      const anyEvent = e as CustomEvent<{ url: string }>;
      const u = anyEvent?.detail?.url;
      if (typeof u === "string" && u.length) {
        const changed = addUrl(u, { includeAncestry: true, broadcast: true, persist: true, source: "local", enqueueToApi: true });
        if (changed) {
          setLastAddedSafe(browserViewUrl(u));
          bump();
        }
      }
    };
    window.addEventListener("sigil:url-registered", onUrlRegistered as EventListener);

    const onMint = (e: Event) => {
      const anyEvent = e as CustomEvent<{ url: string }>;
      const u = anyEvent?.detail?.url;
      if (typeof u === "string" && u.length) {
        const changed = addUrl(u, { includeAncestry: true, broadcast: true, persist: true, source: "local", enqueueToApi: true });
        if (changed) {
          setLastAddedSafe(browserViewUrl(u));
          bump();
        }
      }
    };
    window.addEventListener("sigil:minted", onMint as EventListener);

    // Cross-tab quick add
    const channel = hasWindow && "BroadcastChannel" in window ? new BroadcastChannel(SIGIL_EXPLORER_CHANNEL_NAME) : null;
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as unknown as { type?: unknown; url?: unknown };
      if (data?.type === "sigil:add" && typeof data.url === "string") {
        const changed = addUrl(data.url, { includeAncestry: true, broadcast: false, persist: true, source: "local", enqueueToApi: true });
        if (changed) {
          setLastAddedSafe(browserViewUrl(data.url));
          bump();
        }
      }
    };
    channel?.addEventListener("message", onMsg);

    // Storage hydration (registry + modal fallback + transfers)
    const onStorage = (ev: StorageEvent) => {
      if (!ev.key) return;
      const isRegistryKey = ev.key === REGISTRY_LS_KEY;
      const isModalKey = ev.key === MODAL_FALLBACK_LS_KEY;
      const isTransferKey = ev.key === SIGIL_TRANSFER_LS_KEY;

      if (isTransferKey) {
        setTransferRev((v) => v + 1);
        return;
      }
      if (!isRegistryKey && !isModalKey) return;
      if (!ev.newValue) return;

      try {
        const urls: unknown = JSON.parse(ev.newValue);
        if (!Array.isArray(urls)) return;

        let changed = false;
        for (const u of urls) {
          if (typeof u !== "string") continue;
          if (addUrl(u, { includeAncestry: true, broadcast: false, persist: false, source: "local", enqueueToApi: true })) changed = true;
        }

        setLastAddedSafe(undefined);
        if (changed) {
          persistRegistryToStorage();
          bump();
        }
      } catch {}
    };
    window.addEventListener("storage", onStorage);

    const onTransferEvent = () => setTransferRev((v) => v + 1);
    window.addEventListener(SIGIL_TRANSFER_EVENT, onTransferEvent as EventListener);

    const transferChannel = hasWindow && "BroadcastChannel" in window ? new BroadcastChannel(SIGIL_TRANSFER_CHANNEL_NAME) : null;
    const onTransferMsg = (ev: MessageEvent) => {
      const data = ev.data as unknown as { type?: unknown };
      if (data?.type === "transfer:update") setTransferRev((v) => v + 1);
    };
    transferChannel?.addEventListener("message", onTransferMsg);

    const onPageHide = () => {
      saveInhaleQueueToStorage();
      void flushInhaleQueue();
    };
    window.addEventListener("pagehide", onPageHide);

    // Username claim registry subscription (deferred)
    const unsubClaims = subscribeUsernameClaimRegistry((entry) => {
      const now = nowMs();
      if (now < interactUntilRef.current || scrollingRef.current) {
        pendingClaimEntriesRef.current.push({
          normalized: entry.normalized,
          claimHash: entry.claimHash,
          claimUrl: entry.claimUrl,
          originHash: entry.originHash,
          ownerHint: entry.ownerHint,
        });
        scheduleUiFlush();
        return;
      }

      startTransition(() => {
        setUsernameClaims((prevClaims) => {
          const current = prevClaims[entry.normalized];
          if (
            current &&
            current.claimHash === entry.claimHash &&
            current.claimUrl === entry.claimUrl &&
            current.originHash === entry.originHash &&
            current.ownerHint === entry.ownerHint
          ) {
            return prevClaims;
          }
          return { ...prevClaims, [entry.normalized]: entry };
        });
      });
    });

    // BREATH LOOP: inhale(push) ⇄ exhale(pull)
    const ac = new AbortController();

    const inhaleOnce = async (reason: SyncReason) => {
      if (unmounted.current) return;
      if (!isOnline()) return;
      if (scrollingRef.current) return;
      if (nowMs() < interactUntilRef.current && (reason === "pulse" || reason === "import")) return;

      await flushInhaleQueue();
    };

    const exhaleOnce = async (reason: SyncReason) => {
      if (unmounted.current) return;
      if (!isOnline()) return;
      if (syncInFlightRef.current) return;
      if (scrollingRef.current) return;
      if (nowMs() < interactUntilRef.current && (reason === "pulse" || reason === "import")) return;

      syncInFlightRef.current = true;
      try {
        const prevSeal = remoteSealRef.current;

        const res = await apiFetchWithFailover((base) => new URL(API_SEAL_PATH, base).toString(), {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
          headers: undefined,
        });

        if (!res) return;
        if (res.status === 304) return;
        if (!res.ok) return;

        let nextSeal = "";
        let remotePulse: number | undefined;
        try {
          const body = (await res.json()) as ApiSealResponse;
          nextSeal = typeof body?.seal === "string" ? body.seal : "";
          remotePulse = readRemotePulse(body);
        } catch {
          return;
        }

        const localLatestPulse = remotePulse != null ? getLatestPulseFromRegistry() : undefined;
        const hasNewerPulse =
          remotePulse != null && (localLatestPulse == null || remotePulse > localLatestPulse);

        if (prevSeal && nextSeal && prevSeal === nextSeal && !hasNewerPulse) {
          remoteSealRef.current = nextSeal;
          return;
        }

        const importedRes = await pullAndImportRemoteUrls(ac.signal);

        if (importedRes.pulled) {
          remoteSealRef.current = importedRes.remoteSeal ?? nextSeal ?? prevSeal ?? null;
        }

        if (importedRes.imported > 0) {
          setLastAddedSafe(undefined);
          bump();
        }

        const sealNow = remoteSealRef.current;
        const shouldFullSeed =
          reason === "open" ||
          ((reason === "visible" || reason === "focus" || reason === "online" || reason === "import") &&
            sealNow !== lastFullSeedSealRef.current);

        if (shouldFullSeed) {
          seedInhaleFromRegistry();
          lastFullSeedSealRef.current = sealNow;
          await flushInhaleQueue();
        }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    syncNowRef.current = exhaleOnce;

    seedInhaleFromRegistry();
    void inhaleOnce("open");
    void exhaleOnce("open");

    let inhaleTimer: number | null = null;
    let exhaleTimer: number | null = null;

    const scheduleInhale = (): void => {
      if (!hasWindow) return;
      if (unmounted.current) return;
      if (inhaleTimer != null) window.clearInterval(inhaleTimer);

      inhaleTimer = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (!isOnline()) return;
        void inhaleOnce("pulse");
      }, INHALE_INTERVAL_MS);
    };

    const scheduleExhale = (): void => {
      if (!hasWindow) return;
      if (unmounted.current) return;
      if (exhaleTimer != null) window.clearInterval(exhaleTimer);

      exhaleTimer = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (!isOnline()) return;
        void exhaleOnce("pulse");
      }, EXHALE_INTERVAL_MS);
    };

    const resnapBreath = (): void => {
      scheduleInhale();
      scheduleExhale();
    };

    resnapBreath();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        resnapBreath();
        void inhaleOnce("visible");
        void exhaleOnce("visible");
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const onFocus = () => {
      resnapBreath();
      void inhaleOnce("focus");
      void exhaleOnce("focus");
    };

    const onOnline = () => {
      resnapBreath();
      void inhaleOnce("online");
      void exhaleOnce("online");
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      if (window.__SIGIL__) {
        window.__SIGIL__.registerSigilUrl = prev;
        window.__SIGIL__.registerSend = prevSend;
      }

      window.removeEventListener("sigil:url-registered", onUrlRegistered as EventListener);
      window.removeEventListener("sigil:minted", onMint as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SIGIL_TRANSFER_EVENT, onTransferEvent as EventListener);

      transferChannel?.removeEventListener("message", onTransferMsg);
      transferChannel?.close();

      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);

      channel?.removeEventListener("message", onMsg);
      channel?.close();

      if (typeof unsubClaims === "function") unsubClaims();

      if (flushTimerRef.current != null) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;

      if (inhaleTimer != null) window.clearInterval(inhaleTimer);
      inhaleTimer = null;
      if (exhaleTimer != null) window.clearInterval(exhaleTimer);
      exhaleTimer = null;

      ac.abort();
      syncNowRef.current = null;
      unmounted.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump, markInteracting, scheduleUiFlush, setLastAddedSafe]);

  const requestImmediateSync = useCallback((reason: SyncReason) => {
    const fn = syncNowRef.current;
    if (fn) void fn(reason);
  }, []);

  useEffect(() => {
    if (!hasWindow) return;
    const onOpen = () => requestImmediateSync("visible");
    window.addEventListener(SIGIL_EXPLORER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SIGIL_EXPLORER_OPEN_EVENT, onOpen);
  }, [requestImmediateSync]);

  const forest = useMemo(() => buildForest(memoryRegistry), [registryRev]);
  const transferRegistry = useMemo(() => readSigilTransferRegistry(), [transferRev]);

  const totalKeys = useMemo(() => {
    let n = 0;
    for (const [,] of memoryRegistry) n += 1;
    return n;
  }, [registryRev]);
 
  const phiTotalsByPulse = useMemo((): ReadonlyMap<number, number> => {
    const totals = new Map<number, number>();
    const seenByPulse = new Map<number, Set<string>>();

    for (const [rawUrl, payload] of memoryRegistry) {
      const pulse = typeof payload.pulse === "number" ? payload.pulse : undefined;
      if (pulse == null) continue;

      const url = canonicalizeUrl(rawUrl);
      const mkey = momentKeyFor(url, payload);

      let seen = seenByPulse.get(pulse);
      if (!seen) {
        seen = new Set<string>();
        seenByPulse.set(pulse, seen);
      }
      if (seen.has(mkey)) continue;
      seen.add(mkey);

      const amt = getPhiFromPayload(payload);
      if (amt === undefined) continue;

      totals.set(pulse, (totals.get(pulse) ?? 0) + amt);
    }

    return totals;
  }, [registryRev]);

  const prefetchTargets = useMemo((): string[] => {
    const urls: string[] = [];
    for (const [rawUrl] of memoryRegistry) {
      const viewUrl = explorerOpenUrl(rawUrl);
      const canon = canonicalizeUrl(viewUrl);
      if (!urls.includes(canon)) urls.push(canon);
    }
    return urls;
  }, [registryRev]);

  useEffect(() => {
    if (!hasWindow) return;
    if (prefetchTargets.length === 0) return;

    const pending = prefetchTargets.filter((u) => !prefetchedRef.current.has(u));
    if (pending.length === 0) return;

    let cancelled = false;

    const runPrefetch = async () => {
      for (const u of pending) {
        if (cancelled) break;
        prefetchedRef.current.add(u);
        await prefetchViewUrl(u);
      }
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let cancel: (() => void) | null = null;

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => void runPrefetch(), { timeout: 1000 });
      cancel = () => w.cancelIdleCallback?.(id);
    } else {
      const id = window.setTimeout(() => void runPrefetch(), 120);
      cancel = () => window.clearTimeout(id);
    }

    return () => {
      cancelled = true;
      cancel?.();
    };
  }, [prefetchTargets]);

  const probePrimaryCandidates = useCallback(async () => {
    if (!hasWindow) return;
    if (scrollingRef.current) return;
    if (!isOnline()) return;
    if (nowMs() < interactUntilRef.current) return;

    const candidates: string[] = [];

    const walk = (n: SigilNode) => {
      if (n.urls.length > 1) {
        const prefer = contentKindForUrl(n.url);

        const normalized = [...n.urls]
          .map((u) => canonicalizeUrl(browserViewUrl(u)))
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .sort((a, b) => scoreUrlForView(b, prefer) - scoreUrlForView(a, prefer));

        for (const u of normalized.slice(0, 2)) {
          const key = canonicalizeUrl(u);
          if (!urlHealth.has(key) && !candidates.includes(key)) candidates.push(key);
        }
      }
      n.children.forEach(walk);
    };

    for (const r of forest) walk(r);
    if (candidates.length === 0) return;

    for (const u of candidates.slice(0, URL_PROBE_MAX_PER_REFRESH)) {
      const res = await probeUrl(u);
      if (res === "ok") setUrlHealth(u, 1);
      if (res === "bad") setUrlHealth(u, -1);
    }
  }, [forest]);

  useEffect(() => {
    if (!hasWindow) return;

    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      void probePrimaryCandidates();
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let cancel: (() => void) | null = null;

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 900 });
      cancel = () => w.cancelIdleCallback?.(id);
    } else {
      const id = window.setTimeout(run, 250);
      cancel = () => window.clearTimeout(id);
    }

    return () => {
      cancelled = true;
      cancel?.();
    };
  }, [registryRev, probePrimaryCandidates]);

  const handleAdd = useCallback(
    (url: string) => {
      markInteracting(UI_TOGGLE_INTERACT_MS);

      const changed = addUrl(url, { includeAncestry: true, broadcast: true, persist: true, source: "local", enqueueToApi: true });
      // addUrl already enqueues when requested

      if (changed) {
        setLastAddedSafe(browserViewUrl(url));
        bump();
      }
    },
    [bump, markInteracting, setLastAddedSafe],
  );

  const handleImport = useCallback(
    async (file: File) => {
      markInteracting(0);

      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return;
      }

      const { urls, rawKrystals } = parseImportedJson(parsed);
      if (urls.length === 0 && rawKrystals.length === 0) return;

      let changed = false;

      for (let i = 0; i < rawKrystals.length; i += IMPORT_BATCH_SIZE) {
        for (const k of rawKrystals.slice(i, i + IMPORT_BATCH_SIZE)) {
          enqueueInhaleRawKrystal(k);
        }
        if (i + IMPORT_BATCH_SIZE < rawKrystals.length) await yieldToMain();
      }

      for (let i = 0; i < urls.length; i += IMPORT_BATCH_SIZE) {
        for (const u of urls.slice(i, i + IMPORT_BATCH_SIZE)) {
          if (
            addUrl(u, {
              includeAncestry: true,
              broadcast: true,
              persist: true,
              source: "import",
              enqueueToApi: true,
            })
          ) {
            changed = true;
          }
          // addUrl already enqueues when requested
        }

        if (changed) {
          setLastAddedSafe(undefined);
          bump();
        }

        if (i + IMPORT_BATCH_SIZE < urls.length) await yieldToMain();
      }

      // If import had explicit urls, push them immediately (fast UX)
      if (urls.length > 0) forceInhaleUrls(urls);

      if (changed) {
        setLastAddedSafe(undefined);
        bump();
      }

      requestImmediateSync("import");
    },
    [bump, markInteracting, requestImmediateSync, setLastAddedSafe],
  );

  const handleExport = useCallback(() => {
    markInteracting(UI_TOGGLE_INTERACT_MS);

    const urls: string[] = [];
    for (const [u] of memoryRegistry) urls.push(u);

    const blob = new Blob([JSON.stringify({ urls }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sigil-registry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [markInteracting]);

  return (
    <div className="sigil-explorer" aria-label="Kairos Keystream Explorer">
      <ExplorerToolbar onAdd={handleAdd} onImport={handleImport} onExport={handleExport} total={totalKeys} lastAdded={lastAdded} />

      <div className="explorer-scroll" ref={scrollElRef} role="region" aria-label="Explorer scroll viewport">
        <div className="explorer-inner">
          {forest.length === 0 ? (
            <div className="kx-empty">
              <p>No sigil-glyphs in your keystream yet.</p>
              <ol>
                <li>Import your keystream memories.</li>
                <li>Seal a moment — auto-registered here.</li>
                <li>Inhale any sigil-glyph or memory key above — lineage aligns instantly.</li>
              </ol>
            </div>
          ) : (
            <div className="forest" aria-label="Sigil forest">
              {forest.map((root) => (
                <OriginPanel
                  key={root.id}
                  root={root}
                  expanded={expanded}
                  toggle={toggle}
                  phiTotalsByPulse={phiTotalsByPulse}
                  usernameClaims={usernameClaims}
                  transferRegistry={transferRegistry}
                />
              ))}
            </div>
          )}

          <footer className="kx-footer" aria-label="Explorer footer">
            <span className="row">
               <span>Determinate • Stateless • Kairos-Memory</span>
              <span className="dot">•</span>
              <span>{isOnline() ? "online" : "offline"}</span>
              <span className="dot">•</span>
              <span>{totalKeys} keys</span>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default SigilExplorer;
