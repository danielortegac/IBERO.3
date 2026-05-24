
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { PartnerLead } from '../types';

interface PublicSitePageProps {
    siteId: string;
}

const safeJsonForScript = (value: any): string => {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
};

const prettifyPageName = (name: string): string => {
    const base = String(name || 'pagina')
        .split('/')
        .pop()!
        .replace(/\.html?$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
    if (!base || base.toLowerCase() === 'index') return 'Inicio';
    return base.replace(/\b\w/g, c => c.toUpperCase());
};


const readFileCode = (file: any): string => String(file?.code ?? file?.content ?? file?.html ?? '');

const normalizeFileName = (name: string): string => String(name || '').trim().replace(/^\/+/, '');

const stripInjectedFooterFromAsset = (code: string): string => {
    // Old builds accidentally appended an HTML Goatify footer to CSS/JS files when publishing.
    // Removing it here prevents blank pages caused by broken JavaScript/CSS bundles.
    return String(code || '')
        .replace(/<footer[\s\S]*?ia\.goatify\.app[\s\S]*?<\/footer>/gi, '')
        .trim();
};

const ensureFullHtmlDocument = (html: string, title: string = 'Sitio publicado'): string => {
    const raw = String(html || '').trim();
    if (!raw) return '';
    if (/<!doctype html|<html[\s>]/i.test(raw)) return raw;
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body>
${raw}
</body>
</html>`;
};

const injectAssetsIntoHtml = (rawHtml: string, cssBundle: string, jsBundle: string, navBridge: string): string => {
    let html = String(rawHtml || '');
    if (!html.trim()) return '';

    if (cssBundle && !html.includes('/* goatify-published-css-bundle */')) {
        const styleTag = `<style>\n/* goatify-published-css-bundle */\n${cssBundle}\n</style>`;
        html = html.includes('</head>') ? html.replace('</head>', `${styleTag}\n</head>`) : `${styleTag}\n${html}`;
    }

    if (navBridge && !html.includes('GOATIFY_PUBLIC_SITE_NAV')) {
        html = html.includes('</body>') ? html.replace('</body>', `${navBridge}\n</body>`) : `${html}\n${navBridge}`;
    }

    if (jsBundle && !html.includes('/* goatify-published-js-bundle */')) {
        const scriptTag = `<script>\n/* goatify-published-js-bundle */\n${jsBundle}\n<\/script>`;
        html = html.includes('</body>') ? html.replace('</body>', `${scriptTag}\n</body>`) : `${html}\n${scriptTag}`;
    }

    return html;
};

const buildPublishedSiteHtml = (data: any): string => {
    const files = Array.isArray(data?.files) ? data.files : [];
    const brandName = String(data?.brandName || data?.name || 'Sitio publicado');

    const normalizedFiles = files
        .map((f: any) => ({ name: normalizeFileName(String(f?.name || '')), code: readFileCode(f) }))
        .filter((f: any) => f.name && String(f.code || '').trim());

    const htmlFiles = normalizedFiles.filter((f: any) => /\.html?$/i.test(f.name));
    const cssFiles = normalizedFiles.filter((f: any) => /\.css$/i.test(f.name));
    const jsFiles = normalizedFiles.filter((f: any) => /\.js$/i.test(f.name));

    const cssBundle = cssFiles
        .map((f: any) => `/* ${f.name || 'style.css'} */\n${stripInjectedFooterFromAsset(f.code || '')}`)
        .filter(Boolean)
        .join('\n\n');
    const jsBundle = jsFiles
        .map((f: any) => `/* ${f.name || 'script.js'} */\n${stripInjectedFooterFromAsset(f.code || '')}`)
        .filter(Boolean)
        .join('\n\n');

    const navBridge = `<script>\n(function(){\n  document.addEventListener('click', function(e){\n    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;\n    if(!link) return;\n    var href = link.getAttribute('href') || '';\n    if(!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;\n    var clean = href.split('/').pop().split('#')[0].split('?')[0];\n    if(/\\.html?$/i.test(clean) || (!/^https?:/i.test(href) && !href.startsWith('//'))){\n      e.preventDefault();\n      window.parent.postMessage({ type: 'GOATIFY_PUBLIC_SITE_NAV', file: clean || 'index.html' }, '*');\n    }\n  });\n})();\n<\/script>`;

    // IMPORTANT: Web Programmer publishes multi-file projects. Prefer files[] over htmlCode.
    // htmlCode is kept only as legacy fallback for old partner/simple sites.
    if (!htmlFiles.length) {
        const legacyHtml = typeof data?.htmlCode === 'string' ? data.htmlCode.trim() : '';
        if (legacyHtml) return injectAssetsIntoHtml(ensureFullHtmlDocument(legacyHtml, brandName), cssBundle, jsBundle, navBridge);
        const fallback = normalizedFiles[0];
        if (fallback?.code) return injectAssetsIntoHtml(ensureFullHtmlDocument(fallback.code, brandName), cssBundle, jsBundle, navBridge);
        return '';
    }

    const pickName = (name?: string) => normalizeFileName(String(name || '')).split('/').pop() || '';
    const indexFile = htmlFiles.find((f: any) => pickName(f.name).toLowerCase() === 'index.html') || htmlFiles[0];

    if (htmlFiles.length === 1) {
        return injectAssetsIntoHtml(ensureFullHtmlDocument(indexFile.code, brandName), cssBundle, jsBundle, navBridge);
    }

    const pages = htmlFiles.map((f: any) => ({
        name: pickName(f.name) || f.name,
        title: prettifyPageName(f.name),
        html: injectAssetsIntoHtml(ensureFullHtmlDocument(f.code, brandName), cssBundle, jsBundle, navBridge)
    }));

    const pageNames = new Set(pages.map((p: any) => p.name));
    const mainFileCandidate = pickName(data?.mainFile);
    const initialName = (mainFileCandidate && pageNames.has(mainFileCandidate)) ? mainFileCandidate : (pickName(indexFile.name) || pages[0].name);
    const year = new Date().getFullYear();
    const pagesJson = safeJsonForScript(Object.fromEntries(pages.map((p: any) => [p.name, p.html])));
    const navJson = safeJsonForScript(pages.map(({ name, title }: any) => ({ name, title })));
    const initialJson = safeJsonForScript(initialName);
    const brandJson = safeJsonForScript(brandName);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${brandName}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #050505; }
    .goatify-shell { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #ffffff; }
    .goatify-sitebar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-bottom: 1px solid rgba(15,23,42,.10); background: rgba(255,255,255,.94); backdrop-filter: blur(18px); box-shadow: 0 8px 28px rgba(15,23,42,.08); }
    .goatify-brand { min-width: 0; display: flex; flex-direction: column; line-height: 1.05; padding-right: 8px; }
    .goatify-brand strong { font-size: 13px; font-weight: 950; color: #111827; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 220px; }
    .goatify-brand span { font-size: 9px; text-transform: uppercase; letter-spacing: .12em; color: #8b5cf6; font-weight: 900; }
    .goatify-nav { display: flex; align-items: center; gap: 8px; overflow-x: auto; flex: 1; padding: 3px 0; scrollbar-width: thin; }
    .goatify-tab { border: 1px solid rgba(15,23,42,.08); background: #f8fafc; color: #334155; padding: 9px 13px; border-radius: 999px; font-size: 11px; font-weight: 900; cursor: pointer; white-space: nowrap; transition: transform .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease; }
    .goatify-tab:hover { transform: translateY(-1px); background: #f1f5f9; }
    .goatify-tab.active { background: linear-gradient(135deg, #7c3aed, #2563eb); color: #fff; box-shadow: 0 10px 24px rgba(124,58,237,.28); border-color: transparent; }
    .goatify-frame-wrap { flex: 1; min-height: 0; background: #fff; }
    #goatifyPageFrame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
    .goatify-footnote { position: fixed; right: 10px; bottom: 8px; z-index: 60; font-size: 9px; font-weight: 800; color: rgba(15,23,42,.36); background: rgba(255,255,255,.72); backdrop-filter: blur(10px); border: 1px solid rgba(15,23,42,.08); border-radius: 999px; padding: 5px 8px; }
    @media (max-width: 640px) {
      .goatify-sitebar { align-items: flex-start; flex-direction: column; gap: 8px; padding: 10px; }
      .goatify-brand strong { max-width: 88vw; }
      .goatify-nav { width: 100%; }
      .goatify-tab { font-size: 10px; padding: 8px 11px; }
    }
  </style>
</head>
<body>
  <div class="goatify-shell">
    <header class="goatify-sitebar" aria-label="Navegación del sitio publicado">
      <div class="goatify-brand"><span>Publicado con Goatify</span><strong id="goatifyBrand"></strong></div>
      <nav id="goatifyNav" class="goatify-nav" aria-label="Páginas del proyecto"></nav>
    </header>
    <main class="goatify-frame-wrap">
      <iframe id="goatifyPageFrame" title="Página publicada" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"></iframe>
    </main>
    <div class="goatify-footnote">© ${year} · ia.goatify.app</div>
  </div>
  <script>
    const GOATIFY_PAGES = ${pagesJson};
    const GOATIFY_NAV = ${navJson};
    const GOATIFY_INITIAL = ${initialJson};
    const GOATIFY_BRAND = ${brandJson};
    const brandEl = document.getElementById('goatifyBrand');
    const navEl = document.getElementById('goatifyNav');
    const frame = document.getElementById('goatifyPageFrame');
    let activePage = GOATIFY_PAGES[GOATIFY_INITIAL] ? GOATIFY_INITIAL : (GOATIFY_NAV[0] && GOATIFY_NAV[0].name);
    brandEl.textContent = GOATIFY_BRAND || 'Sitio publicado';
    function renderNav(){
      navEl.innerHTML = '';
      GOATIFY_NAV.forEach(function(page){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'goatify-tab' + (page.name === activePage ? ' active' : '');
        btn.textContent = page.title;
        btn.setAttribute('aria-current', page.name === activePage ? 'page' : 'false');
        btn.onclick = function(){ renderPage(page.name); };
        navEl.appendChild(btn);
      });
    }
    function renderPage(name){
      if(!GOATIFY_PAGES[name]) return;
      activePage = name;
      renderNav();
      frame.srcdoc = GOATIFY_PAGES[name];
    }
    window.addEventListener('message', function(event){
      if(event.data && event.data.type === 'GOATIFY_PUBLIC_SITE_NAV'){
        const clean = String(event.data.file || '').split('/').pop().split('#')[0].split('?')[0];
        if(GOATIFY_PAGES[clean]) renderPage(clean);
      }
    });
    renderPage(activePage);
  <\/script>
</body>
</html>`;
};

const PublicSitePage: React.FC<PublicSitePageProps> = ({ siteId }) => {
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [siteData, setSiteData] = useState<any>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // 1. GESTIÓN DE SESIÓN: Esperar a que la sesión anónima esté lista antes de pedir datos
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (err) {
                    console.error("Error en autenticación anónima:", err);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // 2. CARGA DEL CONTENIDO: Solo cuando isAuthReady es true
    useEffect(() => {
        if (!isAuthReady) return;

        const fetchContent = async () => {
            try {
                const siteRef = doc(db, 'published_sites', siteId);
                const siteSnap = await getDoc(siteRef);

                if (!siteSnap.exists()) {
                    setError('Sitio no encontrado.');
                    setLoading(false);
                    return;
                }

                const data = siteSnap.data();
                setSiteData(data);

                if (data.isPartnerSite && data.leadId) {
                    const leadRef = doc(db, 'partnerLeads', data.leadId);
                    
                    const unsubLead = onSnapshot(leadRef, (leadSnap) => {
                        if (leadSnap.exists()) {
                            const leadData = leadSnap.data() as PartnerLead;
                            let code = buildPublishedSiteHtml(data);
                            
                            let initialStep = 1;
                            if (leadData.contractSigned) initialStep = 3;
                            else if (leadData.preInvoicePaid) initialStep = 3;
                            else if (leadData.proposalApproved) initialStep = 2;

                            const signedStatus = !!leadData.contractSigned;
                            const signatureName = leadData.clientRepresentative || '';
                            
                            code = code.replace(/let currentStep = \d+;/, `let currentStep = ${initialStep};`);
                            code = code.replace(/let isAlreadySigned = (true|false);/, `let isAlreadySigned = ${signedStatus};`);
                            code = code.replace(/let clientSignature = ".*?";/, `let clientSignature = "${signatureName}";`);
                            
                            setHtmlContent(code);
                            setLoading(false);
                        }
                    });
                    return () => unsubLead();
                } else {
                    if (data.active === false) {
                        setError('Este sitio no está activo.');
                        setLoading(false);
                        return;
                    }

                    const code = buildPublishedSiteHtml(data);
                    if (!code) {
                        setError('Este sitio no tiene contenido publicable.');
                        setLoading(false);
                        return;
                    }

                    // Coherencia de planes v5.2:
                    // si el plan permite publicar sitios (Free=1, Pro=10, Premium=30), el enlace público debe abrir.
                    // No bloqueamos por plan aquí; el cupo se valida al publicar desde Web Programmer.
                    setHtmlContent(code);
                    setLoading(false);
                }
            } catch (e: any) {
                console.error("Error cargando sitio público:", e);
                setError('No se pudo establecer conexión con el servidor de contenidos.');
                setLoading(false);
            }
        };

        fetchContent();
    }, [siteId, isAuthReady]);

    // 3. HANDLERS DE MENSAJES
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (!siteData) return;
            if (event.data?.type === 'CLIENT_SITE_FINAL_APPROVAL' || 
                event.data?.type === 'LEAD_CHANGE_REQUEST_STATUS' ||
                event.data?.type === 'LEAD_CHANGE_REQUEST' ||
                event.data?.type === 'TALK_TO_AGENT') {
                const { handlePublicSiteMessage } = await import('../services/publicSiteService');
                handlePublicSiteMessage(event, siteData);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [siteData]);

    if (loading && !htmlContent) {
        return (
            <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#050505]">
                <Spinner text="Conexión Directa..." className="text-white/20" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 text-center">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
                    <Icon name="close" className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-4">Acceso Restringido</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
                    <a href="https://ia.goatify.app" className="text-brand-primary font-bold hover:underline">Regresar a Goatify IA</a>
                </div>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen bg-white relative overflow-hidden">
             <iframe
                key={siteId}
                title="Goatify Secure Site"
                srcDoc={htmlContent || ''}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
            />
        </div>
    );
};

export default PublicSitePage;
