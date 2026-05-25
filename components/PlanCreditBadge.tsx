import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { getPlanConfig } from '../types';
import Icon from './Icon';
import { auth } from '../firebaseConfig';

const formatLimit = (value: number) => value >= 999999 ? '∞' : String(value);
const formatStorage = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

const getPending = (limit: number, used: number) => limit >= 999999 ? 999999 : Math.max(0, limit - used);

const DISPLAY_COUNTER_KEYS = [
  'daily_chat_count',
  'monthly_posts_used',
  'monthly_images_used',
  'monthly_web_ops_used',
  'monthly_grounding_used',
  'monthly_presentations_used',
  'current_published_sites',
  'current_storage_bytes'
];

const normalizeUsageForDisplay = (usage: any) => {
  if (!usage) return usage;
  const counters: any = { ...(usage.counters || {}) };
  DISPLAY_COUNTER_KEYS.forEach((key) => {
    const legacy = usage[`counters.${key}`];
    if (typeof legacy === 'undefined') return;
    const current = counters[key];
    if (typeof legacy === 'number' && typeof current === 'number') counters[key] = Math.max(current, legacy);
    else if (typeof current === 'undefined' || current === 0 || current === '') counters[key] = legacy;
  });
  return { ...usage, counters };
};

type PlanCreditBadgeProps = {
  compact?: boolean;
  className?: string;
  showStorage?: boolean;
};

const PlanCreditBadge: React.FC<PlanCreditBadgeProps> = ({ compact = false, className = '', showStorage = true }) => {
  const { userProfile, userUsage, setProModalOpen } = useContext(AppContext);
  const [liveUsage, setLiveUsage] = useState<any | null>(null);
  const planConfig = getPlanConfig(userProfile.plan);

  useEffect(() => {
    let cancelled = false;
    const refreshUsage = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/usage/current', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.usage) setLiveUsage(normalizeUsageForDisplay(data.usage));
      } catch (e) {
        // Firestore listener sigue siendo la fuente principal; este fetch solo evita badges congelados en 0.
      }
    };
    refreshUsage();
    const onFocusRefresh = () => refreshUsage();
    const onUsageUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.usage) {
        setLiveUsage(normalizeUsageForDisplay(detail.usage));
      } else if (detail.featureKey) {
        const amount = Math.max(1, Number(detail.amount || 1));
        const map: Record<string, string> = {
          ai_chat: 'daily_chat_count',
          ai_grounding: 'monthly_grounding_used',
          ai_image: 'monthly_images_used',
          social_post: 'monthly_posts_used',
          web_programmer: 'monthly_web_ops_used',
          presentation: 'monthly_presentations_used',
          site_publish: 'current_published_sites',
          storage: 'current_storage_bytes'
        };
        const counterKey = map[detail.featureKey];
        if (counterKey) {
          setLiveUsage((prev: any) => {
            const base = prev || userUsage || { counters: {} };
            return {
              ...base,
              counters: {
                ...(base.counters || {}),
                [counterKey]: Math.max(0, Number((base.counters || {})[counterKey] || 0) + (detail.released ? -amount : amount))
              }
            };
          });
        }
      }
      window.setTimeout(refreshUsage, 400);
    };
    window.addEventListener('focus', onFocusRefresh);
    window.addEventListener('goatify:usage-updated', onUsageUpdated as EventListener);
    const interval = window.setInterval(refreshUsage, 20000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocusRefresh);
      window.removeEventListener('goatify:usage-updated', onUsageUpdated as EventListener);
      window.clearInterval(interval);
    };
  }, []);

  const metrics = useMemo(() => {
    const limits = planConfig.limits as any;
    const effectiveUsage = normalizeUsageForDisplay(liveUsage || userUsage);
    const counters = effectiveUsage?.counters || {} as any;
    const storageLimitGb = limits.storage_gb || 0;
    const storageUsedBytes = counters.current_storage_bytes || 0;
    const storageLimitBytes = storageLimitGb * 1024 * 1024 * 1024;

    return {
      chatUsed: counters.daily_chat_count || 0,
      chatLimit: limits.ai_chat_daily_queries || 0,
      postsUsed: counters.monthly_posts_used || 0,
      postsLimit: limits.social_posts_monthly || 0,
      imagesUsed: counters.monthly_images_used || 0,
      imagesLimit: limits.ai_images_monthly || 0,
      webUsed: counters.monthly_web_ops_used || 0,
      webLimit: limits.web_programmer_ops || 0,
      groundingUsed: counters.monthly_grounding_used || 0,
      groundingLimit: limits.grounding_monthly || 0,
      presentationsUsed: counters.monthly_presentations_used || 0,
      presentationsLimit: limits.presentations_monthly || 0,
      sitesUsed: counters.current_published_sites || 0,
      sitesLimit: limits.publish_sites || 0,
      storageLabel: `${formatStorage(storageUsedBytes)} / ${storageLimitGb >= 999999 ? '∞' : `${storageLimitGb} GB`}`,
      storagePercent: storageLimitBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / storageLimitBytes) * 100)) : 0
    };
  }, [planConfig, userUsage, liveUsage]);

  const planLabel = userProfile.plan === 'premium' ? 'Premium' : userProfile.plan === 'pro' ? 'Pro' : 'Free';
  const isPremiumActive = userProfile.plan === 'premium' && userProfile.subscriptionStatus === 'active';
  const statusText = isPremiumActive ? 'Activo' : (userProfile.subscriptionStatus === 'canceled' ? 'Cancelado' : userProfile.subscriptionStatus || 'Activo');

  const statItems = [
    { label: 'IA diaria', used: metrics.chatUsed, limit: metrics.chatLimit, accent: 'text-brand-primary' },
    { label: 'Social', used: metrics.postsUsed, limit: metrics.postsLimit, accent: 'text-purple-600 dark:text-purple-300' },
    { label: 'Imágenes', used: metrics.imagesUsed, limit: metrics.imagesLimit, accent: 'text-pink-600 dark:text-pink-300' },
    { label: 'Búsqueda', used: metrics.groundingUsed, limit: metrics.groundingLimit, accent: 'text-cyan-600 dark:text-cyan-300' },
    { label: 'Web ops', used: metrics.webUsed, limit: metrics.webLimit, accent: 'text-blue-600 dark:text-blue-300' },
    { label: 'Presentaciones', used: metrics.presentationsUsed, limit: metrics.presentationsLimit, accent: 'text-amber-600 dark:text-amber-300' },
    { label: 'Sitios', used: metrics.sitesUsed, limit: metrics.sitesLimit, accent: 'text-emerald-600 dark:text-emerald-300' }
  ];

  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-2xl border border-brand-primary/20 bg-white/90 dark:bg-neutral-900/90 px-2.5 py-1.5 shadow-sm backdrop-blur-md ${className}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`h-2 w-2 rounded-full ${isPremiumActive ? 'bg-emerald-500' : userProfile.subscriptionStatus === 'canceled' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-600 dark:text-neutral-300 truncate">{planLabel}</span>
        </div>
        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700"></div>
        <span className="text-[9px] font-black text-brand-primary whitespace-nowrap">IA {metrics.chatUsed}/{formatLimit(metrics.chatLimit)}</span>
        <span className="hidden sm:inline text-[9px] font-black text-cyan-600 dark:text-cyan-300 whitespace-nowrap">Web {metrics.groundingUsed}/{formatLimit(metrics.groundingLimit)}</span>
        <span className="hidden md:inline text-[9px] font-black text-purple-600 dark:text-purple-300 whitespace-nowrap">Social {metrics.postsUsed}/{formatLimit(metrics.postsLimit)}</span>
        <button onClick={() => setProModalOpen(true)} className="rounded-full bg-brand-primary px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow hover:scale-105 active:scale-95 transition-transform">
          Subir
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 px-3 py-2 shadow-sm backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-neutral-400">Plan actual</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-neutral-900 dark:text-white uppercase truncate">{planLabel}</span>
            <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${isPremiumActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : userProfile.subscriptionStatus === 'canceled' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
              {statusText}
            </span>
          </div>
        </div>
        <button onClick={() => setProModalOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-transform">
          <Icon name="rocket" className="w-3.5 h-3.5" /> Subir
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 xl:grid-cols-3 gap-2 text-[9px] font-bold text-neutral-500 dark:text-neutral-400">
        {statItems.map(item => (
          <div key={item.label} className="rounded-xl bg-neutral-50 dark:bg-neutral-800/70 px-2 py-1.5">
            <span className="block text-[7px] font-black uppercase tracking-widest opacity-60">{item.label}</span>
            <strong className={item.accent}>{item.used}</strong> / {formatLimit(item.limit)} · pend. {formatLimit(getPending(item.limit, item.used))}
          </div>
        ))}
      </div>
      {showStorage && (
        <div className="mt-2">
          <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-neutral-400"><span>Drive</span><span>{metrics.storageLabel}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"><div className={`h-full rounded-full transition-all ${metrics.storagePercent > 90 ? 'bg-red-500' : 'bg-brand-primary'}`} style={{ width: `${metrics.storagePercent}%` }} /></div>
        </div>
      )}
    </div>
  );
};

export default PlanCreditBadge;
