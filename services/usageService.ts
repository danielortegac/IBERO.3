import { auth } from '../firebaseConfig';
import type { FeatureKey } from '../types';

export async function consumeServerFeature(featureKey: FeatureKey, amount: number = 1, metadata: Record<string, any> = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Usuario no autenticado.');
  const res = await fetch('/api/usage/consume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ featureKey, amount, metadata })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || 'No se pudo consumir el límite del plan.');
    err.code = data?.code || 'PLAN_LIMIT_REACHED';
    err.status = res.status;
    throw err;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('goatify:usage-updated', { detail: { featureKey, amount } }));
  return data;
}

export async function releaseServerFeature(featureKey: FeatureKey, amount: number = 1) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  await fetch('/api/usage/release', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ featureKey, amount })
  }).catch(() => undefined);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('goatify:usage-updated', { detail: { featureKey, amount, released: true } }));
}


export async function consumeAgentOwnerFeature(ownerId: string, agentId: string, featureKey: string, amount: number = 1, metadata: Record<string, any> = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Usuario no autenticado.');
  const res = await fetch('/api/usage/consume-agent-owner', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ownerId, agentId, featureKey, amount, metadata })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || 'Límite del plan alcanzado para este agente.');
    err.code = data?.code || 'PLAN_LIMIT_REACHED';
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function releaseAgentOwnerFeature(ownerId: string, agentId: string, featureKey: string, amount: number = 1) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  await fetch('/api/usage/release-agent-owner', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ownerId, agentId, featureKey, amount })
  }).catch(() => undefined);
}


export async function canUseAgentOwnerFeature(ownerId: string, agentId: string, featureKey: string, amount: number = 1) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return false;
  const res = await fetch('/api/usage/can-use-agent-owner', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ownerId, agentId, featureKey, amount })
  });
  const data = await res.json().catch(() => ({}));
  return !!(res.ok && data?.allowed === true);
}
