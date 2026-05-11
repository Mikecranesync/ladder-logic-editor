/**
 * MIRA Bridge
 *
 * Talks to the MIRA backend (mira-mcp REST surface) to fetch tag manifests and
 * equipment context for the asset currently being edited. Lets the editor open
 * pre-populated with real plant tags instead of requiring a manual manifest
 * upload.
 *
 * Endpoints (defined in MIRA docs/specs/ladder-editor-mira-integration-spec.md):
 *   GET  /api/plc/manifest?asset_tag={tag}
 *   GET  /api/plc/equipment-context?asset_tag={tag}
 *   POST /api/plc/ingest-instruction-list
 *
 * Config:
 *   - Base URL read from import.meta.env.VITE_MIRA_BASE_URL (build-time)
 *     or from window.MIRA_BRIDGE_URL (iframe parent injection at runtime).
 *   - When empty/unset, all bridge calls short-circuit to "disabled" so the
 *     editor still works standalone at lle.dilger.dev.
 *   - API key read from VITE_MIRA_API_KEY (dev) or window.MIRA_API_KEY (prod
 *     iframe). Sent as Bearer token.
 *
 * Backward compatibility: every export here returns a typed result with a
 * `disabled` discriminator so callers can render gracefully when MIRA isn't
 * wired up.
 */

import type { VariableDeclaration } from '../models/plc-types';

// ============================================================================
// Types — mirror mira-mcp REST contract
// ============================================================================

export interface MiraManifestResponse {
  asset_tag: string;
  asset_name?: string;
  generatedAt: string;
  variables: Array<{
    name: string;
    alias?: string | null;
    address?: string | null;
    modbusAddress?: string | null;
    direction?: 'IN' | 'OUT';
    dataType?: VariableDeclaration['dataType'];
    comment?: string;
  }>;
  wiringNotes?: string[];
  gaps?: Array<{ variableName: string; missingFields: string[]; note: string }>;
}

export interface MiraEquipmentContext {
  asset_tag: string;
  make?: string;
  model?: string;
  oem_manual_urls?: string[];
  recent_faults?: Array<{ code: string; description: string; occurred_at: string }>;
  open_work_orders?: Array<{ id: string; summary: string; status: string }>;
}

export type BridgeResult<T> =
  | { ok: true; data: T }
  | { ok: false; disabled: true }
  | { ok: false; disabled?: false; error: string };

// ============================================================================
// Config resolution
// ============================================================================

interface BridgeConfig {
  baseUrl: string;
  apiKey: string;
}

declare global {
  interface Window {
    MIRA_BRIDGE_URL?: string;
    MIRA_API_KEY?: string;
  }
}

function resolveConfig(): BridgeConfig {
  // Runtime injection (iframe host) wins, build-time env is fallback.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const baseUrl =
    (typeof window !== 'undefined' && window.MIRA_BRIDGE_URL) ||
    env.VITE_MIRA_BASE_URL ||
    '';
  const apiKey =
    (typeof window !== 'undefined' && window.MIRA_API_KEY) ||
    env.VITE_MIRA_API_KEY ||
    '';
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

export function isBridgeEnabled(): boolean {
  return resolveConfig().baseUrl.length > 0;
}

// ============================================================================
// HTTP helpers
// ============================================================================

async function request<T>(path: string, init?: RequestInit): Promise<BridgeResult<T>> {
  const { baseUrl, apiKey } = resolveConfig();
  if (!baseUrl) return { ok: false, disabled: true };

  try {
    const headers = new Headers(init?.headers);
    if (apiKey && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch the variable manifest for an asset. Response shape is intentionally
 * identical to what `useProjectStore().loadManifest()` accepts — callers can
 * pipe `result.data` straight in.
 */
export async function fetchManifest(assetTag: string): Promise<BridgeResult<MiraManifestResponse>> {
  return request<MiraManifestResponse>(
    `/api/plc/manifest?asset_tag=${encodeURIComponent(assetTag)}`,
  );
}

/**
 * Fetch equipment context (OEM model, recent faults, open work orders) for
 * the side-panel display.
 */
export async function fetchEquipmentContext(
  assetTag: string,
): Promise<BridgeResult<MiraEquipmentContext>> {
  return request<MiraEquipmentContext>(
    `/api/plc/equipment-context?asset_tag=${encodeURIComponent(assetTag)}`,
  );
}

/**
 * Push an exported instruction list back to MIRA's KB. The instruction list
 * text is produced by `instruction-list-export.ts`.
 */
export async function ingestInstructionList(payload: {
  asset_tag: string;
  program_name: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<BridgeResult<{ id: string }>> {
  return request<{ id: string }>(`/api/plc/ingest-instruction-list`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, format: 'ab-instruction-list' }),
  });
}
