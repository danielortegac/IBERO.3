
export const constructWelcomeEmailHtml = (userName: string) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @media only screen and (min-width: 600px) {
                .email-container { width: 90% !important; max-width: 850px !important; }
                .desktop-padding { padding: 60px 50px !important; }
                .feature-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 30px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 20px 15px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #0f172a; padding: 50px 40px; text-align: center; border-bottom: 5px solid #3b82f6;">
                <p style="color: #3b82f6; margin: 0 0 10px 0; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">ACCESO DE ÉLITE ACTIVADO</p>
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase;">BIENVENIDO A GOATIFY</h1>
                <p style="color: #94a3b8; margin: 15px 0 0 0; font-size: 14px; font-weight: 600; line-height: 1.4;">La infraestructura tecnológica definitiva para escalar tu marca y tus ingresos.</p>
            </div>
            
            <div class="desktop-padding" style="padding: 30px;">
                <p style="font-size: 18px; color: #1e293b; font-weight: 800; margin: 0 0 15px 0;">¡Hola <span style="color: #3b82f6;">${userName}</span>!</p>
                <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 35px 0;">Es un privilegio darte la bienvenida a nuestra red. Goatify no es solo una app, es un ecosistema diseñado para que tu negocio funcione en piloto automático gracias a la Inteligencia Artificial.</p>
                
                <h3 style="font-size: 15px; font-weight: 900; color: #0f172a; border-left: 4px solid #3b82f6; padding-left: 12px; margin: 0 0 25px 0; text-transform: uppercase; letter-spacing: 0.5px;">Tu Arsenal de Herramientas Premium:</h3>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 35px 30px; margin-bottom: 40px;">
                    <div class="feature-grid">
                        <div style="margin-bottom: 30px;">
                            <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #3b82f6; text-transform: uppercase;">🧠 IA STUDIO & ALTER EGO</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">Crea tu propio clon digital inteligente para gestionar tu marca y delegar tareas.</p>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #10b981; text-transform: uppercase;">📧 MAILING & CAMPAÑAS</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">Gestiona cuentas y envía campañas masivas automatizadas para cerrar ventas.</p>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #06b6d4; text-transform: uppercase;">🎮 DISCOVERY HUB</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">Explora contenido de valor y juega mientras aprendes sobre negocios.</p>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #f59e0b; text-transform: uppercase;">🤖 VENDEDORES IA</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">Asistentes virtuales que califican prospectos y agendan citas por ti 24/7.</p>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #8b5cf6; text-transform: uppercase;">📝 COTIZADOR & PROYECTOS</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">Genera presupuestos en segundos y organiza el flujo de trabajo de tu equipo.</p>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #ec4899; text-transform: uppercase;">☁️ DRIVE & SCHEDULER</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">Almacenamiento en la nube y agenda inteligente sincronizada sin fricción.</p>
                        </div>
                    </div>
                </div>

            <div style="background-color: #ecfdf5; border: 1px solid #10b981; padding: 30px; border-radius: 20px; margin-bottom: 40px; text-align: center;">
                <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 900; color: #065f46; text-transform: uppercase;">🐐 PROGRAMA DE SOCIOS</h3>
                <p style="margin: 0 0 20px 0; font-size: 15px; color: #047857; line-height: 1.6;">¿Sabías que puedes ganar comisiones recurrentes? Recomienda nuestras soluciones y monetiza tu red hoy mismo.</p>
                <a href="https://ia.goatify.app/#/partners" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 14px 25px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Convertirse en Socio →</a>
            </div>

            <div style="text-align: center; margin-bottom: 30px;">
                <a href="https://ia.goatify.app" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #0f172a; color: #ffffff; padding: 20px 30px; text-decoration: none; border-radius: 16px; font-weight: 900; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.3);">Explorar Mi Suite Operativa</a>
            </div>
            
            <div style="text-align: center;">
                <p style="margin: 0;"><a href="https://goatify.notion.site/Manual-de-Usuario-Goatify-IA-123" style="color: #64748b; font-size: 14px; text-decoration: underline; font-weight: 700; opacity: 0.8;">Ver Manual de Usuario Oficial</a></p>
            </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 900; color: #0f172a;">- Goatify Intelligence</p>
            <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">© 2026 Goatify Operations & Strategy. Infraestructura de élite.</p>
        </div>
    </div>
    `;
};

export const constructNewsEmailHtml = (articles: any[]) => {
    const slugify = (text: string) => {
        return text
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .trim()
            .replace(/\s+/g, '-')     // Replace spaces with -
            .replace(/[^\w-]+/g, '')     // Remove all non-word chars
            .replace(/--+/g, '-')       // Replace multiple - with single -
            .replace(/^-+/, '')          // Trim - from start of text
            .replace(/-+$/, '');         // Trim - from end of text
    };

    const newsItems = articles.map((n, i) => {
        const articleSlug = slugify(n.title);
        const articleLink = n.url && n.url.startsWith('http') ? n.url : `https://ia.goatify.app/#/article/${articleSlug}`;
        
        return `
    <div style="margin-bottom: 30px; padding: 25px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="background-color: #10b981; color: white; font-size: 10px; font-weight: 900; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1.5px; display: inline-block;">${n.category || 'Actualidad'}</span>
        </div>
        <h3 style="color: #0f172a; font-size: 20px; font-weight: 900; line-height: 1.2; margin: 0 0 12px 0; letter-spacing: -0.5px;">${n.title}</h3>
        <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">${n.summary}</p>
        
        <div style="background-color: #f1f5f9; padding: 15px 18px; border-radius: 12px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; color: #1e293b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🧬 Consejo para tu Marca:</p>
            <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.5; font-style: italic;">${n.goatifyTakeaway || 'Aplica esta tendencia para escalar tu posicionamiento hoy mismo.'}</p>
        </div>

        <div style="text-align: right;">
            <a href="${articleLink}" style="display: inline-block; color: #10b981; font-size: 14px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px;">Leer análisis completo &rarr;</a>
        </div>
    </div>`;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @media only screen and (min-width: 600px) {
                .email-container { width: 90% !important; max-width: 850px !important; }
                .desktop-padding { padding: 40px 60px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 40px 15px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 680px; margin: 0 auto;">
            
            <div style="background-color: #0f172a; padding: 45px 30px; text-align: center; border-radius: 24px 24px 0 0; border-bottom: 5px solid #10b981;">
                <p style="color: #10b981; margin: 0 0 10px 0; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">PULSO DE INNOVACIÓN</p>
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; line-height: 1;">NOTICIAS DEL DÍA</h1>
                <p style="color: #94a3b8; margin: 15px 0 0 0; font-size: 14px; font-weight: 500; line-height: 1.4;">Consejos estratégicos y tendencias para potenciar tu marca con Inteligencia Artificial.</p>
            </div>
            
            <div class="desktop-padding" style="padding: 35px 0;">
                <div style="max-width: 750px; margin: 0 auto;">
                    ${newsItems}
                </div>
            </div>

            <div style="background-color: #ffffff; padding: 35px 30px; border-radius: 24px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); margin-bottom: 30px;">
                <div style="width: 60px; height: 60px; background-color: #ecfdf5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <span style="font-size: 30px;">🐐</span>
                </div>
                <h2 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">¿Quieres generar ingresos extra?</h2>
                <div style="margin-top:20px; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; margin-bottom: 25px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #166534;">¡Es completamente gratis!</p>
                    <a href="https://ia.goatify.app" style="display: inline-block; padding: 12px 20px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 8px;">GENERAR INGRESOS - ES GRATIS</a>
                </div>
                <p style="margin: 0 0 25px 0; font-size: 15px; color: #64748b; line-height: 1.6;">Únete a nuestro programa de socios y genera comisiones recurrentes vendiendo nuestras soluciones tecnológicas de élite.</p>
                <a href="https://ia.goatify.app/#/partners" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #10b981; color: #ffffff; padding: 18px 25px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; transition: all 0.3s;">Quiero Ser Socio Goatify</a>
            </div>

            <div style="text-align: center; padding: 20px;">
                <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px;">Goatify Innovation Lab</p>
                <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">© 2026 Inteligencia que Transforma Negocios.</p>
                <div style="margin-top: 15px;">
                    <a href="https://ia.goatify.app" style="color: #b91c1c; font-size: 11px; font-weight: 700; text-decoration: none; text-transform: uppercase;">Darse de baja</a>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};

export const constructMarketingEmailHtml = (userName: string) => {
    const greeting = '¿Quieres alcanzar tus metas?';
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @media only screen and (min-width: 600px) {
                .email-container { width: 90% !important; max-width: 850px !important; }
                .feature-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 30px !important; }
                .desktop-padding { padding: 60px !important; }
                .hero-section { padding: 80px 40px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 40px 15px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
            
            <div class="hero-section" style="background-color: #0f172a; padding: 60px 30px; text-align: center; border-bottom: 4px solid #3b82f6;">
                <p style="color: #60a5fa; margin: 0 0 12px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Ecosistema Global de Innovación</p>
                <h1 style="color: #ffffff; margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2;">GOATIFY: INFRAESTRUCTURA DE ÉLITE</h1>
            </div>
            
            <div class="desktop-padding" style="padding: 30px;">
                <div style="max-width: 700px; margin: 0 auto;">
                    <p style="font-size: 20px; color: #1e293b; font-weight: 700; margin: 0 0 15px 0;">${greeting}</p>
                    <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 35px 0;">
                        Escalar un proyecto o consolidar una marca personal requiere una base tecnológica sólida. Goatify ha sido diseñado para ser el sistema nervioso de tu actividad, integrando todas las herramientas necesarias en un solo lugar, eliminando costos innecesarios y permitiéndote enfocarte en lo que realmente importa: tu crecimiento.
                    </p>

                    <h3 style="font-size: 12px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">Arsenal Tecnológico Integrado</h3>

                    <div class="feature-grid" style="margin-bottom: 40px;">
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a;">🧠 IA Studio & Alter Ego</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Delegue su carga operativa a modelos de IA especializados. Cree su propio clon digital para gestionar redacción, código y activos visuales de forma autónoma.</p>
                        </div>
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a;">🚀 Mailing Masivo & Tracking</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Gestione sus campañas de correo con plantillas de alta conversión, seguimiento en tiempo real y automatización de envíos a escala global.</p>
                        </div>
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a;">📞 Vendedores IA 24/7</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Implemente bots entrenados para realizar llamadas, calificar prospectos y agendar citas en su calendario mientras usted descansa.</p>
                        </div>
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a;">📁 CRM & Gestión de Datos</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Centralice sus leads, organice proyectos con tableros visuales y mantenga sus archivos seguros en una nube privada de alto rendimiento.</p>
                        </div>
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a;">📝 Cotizador & Herramientas</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Genere presupuestos profesionales en segundos, gestione tareas en equipo y optimice el flujo de trabajo con herramientas de grado empresarial.</p>
                        </div>
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a;">🌐 Discovery & Networking</p>
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Acceda a tendencias del mercado, únase a grupos de interés y conecte con otros usuarios de la red para generar alianzas estratégicas.</p>
                        </div>
                    </div>

                    <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 25px; border-radius: 0 16px 16px 0; margin-bottom: 40px;">
                        <p style="margin: 0; font-size: 15px; color: #1e293b; line-height: 1.6; font-style: italic;">
                            "Nuestra misión es democratizar el acceso a la tecnología de punta. Por eso, el acceso a la suite base de Goatify es gratuito, permitiéndote escalar sin barreras de entrada."
                        </p>
                    </div>

                    <div style="text-align: center; margin-bottom: 45px;">
                        <a href="https://ia.goatify.app" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 20px 45px; text-decoration: none; border-radius: 14px; font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 1.5px; transition: all 0.2s; box-shadow: 0 10px 15px rgba(59, 130, 246, 0.2);">Acceder a la Plataforma Gratis</a>
                    </div>

                    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 30px; border-radius: 20px; text-align: left;">
                        <h4 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 900; color: #0369a1; text-transform: uppercase; letter-spacing: 1px;">Economía Circular & Recompensas</h4>
                        <p style="margin: 0 0 20px 0; font-size: 14px; color: #0c4a6e; line-height: 1.6;">
                            Integrar Goatify en su rutina no solo optimiza su tiempo, sino que le genera beneficios directos. El uso activo de la plataforma premia a los usuarios con <b>INTIS</b>, una unidad de valor interna que puede reinvertir para potenciar sus servicios.
                        </p>
                        <p style="margin: 0; font-size: 14px; color: #0c4a6e; line-height: 1.6;">
                            Además, le extendemos una invitación para unirse a nuestro <b>Programa de Socios</b>, donde podrá monetizar su crecimiento y generar ingresos recurrentes conectando a otros con nuestra infraestructura tecnológica.
                        </p>
                    </div>
                </div>
            </div>

            <div style="background-color: #f1f5f9; padding: 35px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px;">Goatify Innovation Ecosystem. Infraestructura Operativa de Vanguardia.</p>
                <p style="margin: 10px 0 0 0;"><a href="https://ia.goatify.app" style="color: #64748b; font-size: 11px; text-decoration: underline; font-weight: 700;">Configurar Preferencias de Usuario</a></p>
            </div>
        </div>
    </body>
    </html>
    `;
};

export const constructIntisTransactionEmailHtml = (userName: string, tx: { id: string, type: string, amount: number, description: string, date: string }) => {
    const isCredit = tx.type === 'Ganado' || tx.type === 'Recibido';
    const amountColor = isCredit ? '#10b981' : '#ef4444';
    const amountPrefix = isCredit ? '+' : '-';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @media only screen and (min-width: 600px) {
                .email-container { width: 90% !important; max-width: 800px !important; }
                .desktop-padding { padding: 40px 60px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 20px 15px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #0f172a; padding: 40px 20px; text-align: center; border-bottom: 4px solid #8b5cf6;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">TRANSACCIÓN <span style="color: #a78bfa;">INTIS</span></h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Confirmación de Movimiento</p>
        </div>
        
        <div class="desktop-padding" style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 15px 0;">Hola <span style="color: #8b5cf6;">${userName}</span>,</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 30px 0;">Se ha registrado un nuevo movimiento en tu billetera digital de Goatify. A continuación los detalles:</p>
            
            <div style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 30px 20px; margin-bottom: 30px;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <span style="display: block; font-size: 12px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Monto de la Operación</span>
                    <span style="font-size: 42px; font-weight: 900; color: ${amountColor}; letter-spacing: -1px; line-height: 1;">${amountPrefix}${tx.amount.toFixed(2)} <span style="font-size: 20px; font-weight: 700; color: #94a3b8;">$I</span></span>
                </div>
                
                <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600; width: 40%; border-bottom: 1px solid #f1f5f9;">ID Transacción:</td>
                            <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${tx.id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600; border-bottom: 1px solid #f1f5f9;">Tipo:</td>
                            <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${tx.type}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600; border-bottom: 1px solid #f1f5f9;">Concepto:</td>
                            <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${tx.description}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600;">Fecha:</td>
                            <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">${tx.date}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="https://ia.goatify.app/#/wallet" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #0f172a; color: #ffffff; padding: 16px 20px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Entrar a Mi Billetera</a>
            </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 25px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a;">- Goatify Pay</p>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Confirmación Automática de Sistema.</p>
        </div>
    </div>
    `;
};

export const constructPartnerEmailHtml = () => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @media only screen and (min-width: 600px) {
                .email-container { width: 90% !important; max-width: 800px !important; }
                .desktop-padding { padding: 50px 60px !important; }
                .feature-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 20px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 20px 15px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
            <div style="background-color: #0f172a; padding: 50px 30px; text-align: center; border-bottom: 5px solid #8b5cf6;">
                <p style="color: #a78bfa; margin: 0 0 10px 0; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">OPORTUNIDAD DE ALIANZA</p>
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -0.5px; line-height: 1.2;">¿QUIERES GENERAR INGRESOS EXTRA?</h1>
            </div>
            
            <div class="desktop-padding" style="padding: 35px 25px;">
                <p style="font-size: 18px; color: #1e293b; font-weight: 800; margin: 0 0 15px 0;">Vive de los negocios digitales con infraestructura de élite.</p>
                <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 35px 0;">
                    Vende soluciones tecnológicas de vanguardia y monetiza tu red de contactos. Es simple: <b>tú recomiendas, nosotros cerramos el trato y tú recibes la comisión.</b>
                </p>

                <div style="background-color: #fcfaff; border: 1px solid #e9d5ff; padding: 25px; border-radius: 20px; margin-bottom: 35px;">
                    <h3 style="margin: 0 0 15px 0; font-size: 14px; font-weight: 900; color: #7c3aed; text-transform: uppercase; letter-spacing: 1px;">Beneficios del Programa:</h3>
                    <div class="feature-grid">
                        <div style="margin-bottom: 15px;">
                            <p style="margin: 0; font-size: 15px; font-weight: 800; color: #1e293b;">💰 Comisiones desde el 35%</p>
                            <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">Ganancias significativas por cada proyecto cerrado.</p>
                        </div>
                        <div style="margin-bottom: 15px;">
                            <p style="margin: 0; font-size: 15px; font-weight: 800; color: #1e293b;">🤝 Tú Recomiendas, Nosotros Cerramos</p>
                            <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">No necesitas ser experto técnico ni vendedor.</p>
                        </div>
                    </div>
                </div>

                <h3 style="font-size: 12px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Soluciones que puedes ofrecer:</h3>
                
                <div class="feature-grid" style="margin-bottom: 35px;">
                    <p style="margin: 5px 0; font-size: 14px; color: #4b5563; font-weight: 600;">• Aplicaciones Móviles & Web</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #4b5563; font-weight: 600;">• Páginas Web & E-commerce</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #4b5563; font-weight: 600;">• Automatizaciones con IA</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #4b5563; font-weight: 600;">• Consultoría Tecnológica</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #4b5563; font-weight: 600;">• Cursos & Formación Élite</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #4b5563; font-weight: 600;">• Desarrollo Tecnológico a Medida</p>
                </div>

                <div style="margin-bottom: 15px;">
                    <a href="https://ia.goatify.app/#/partners" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #8b5cf6; color: #ffffff; padding: 18px 25px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 15px; text-transform: uppercase; text-align: center; letter-spacing: 1px; box-shadow: 0 10px 20px rgba(139, 92, 246, 0.15);">Ingresar Gratis Ahora</a>
                </div>

                <div style="text-align: center;">
                    <a href="https://www.goatify.app/socios/" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #f1f5f9; color: #475569; padding: 16px 20px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border: 1px solid #e2e8f0;">Información General</a>
                </div>
            </div>

            <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px;">© 2026 Goatify Innovation Ecosystem. Infraestructura de Élite.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

export const constructPOSReceiptEmailHtml = (projectName: string, receipt: { id: string, date: string, items: any[], subtotal: number, tax: number, total: number, customerName: string }) => {
    const itemsHtml = receipt.items.map(item => `
        <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                <div style="font-weight: 700; color: #0f172a; font-size: 15px; line-height: 1.4;">${item.name}</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 2px;">Cant: ${item.quantity} x $${item.price.toFixed(2)}</div>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 800; color: #0f172a; font-size: 15px;">
                $${(item.price * item.quantity).toFixed(2)}
            </td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @media only screen and (min-width: 600px) {
                .email-container { width: 90% !important; max-width: 800px !important; }
                .desktop-padding { padding: 40px 60px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 20px 15px; background-color: #f8fafc;">
        <div class="email-container" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #0f172a; padding: 40px 20px; text-align: center; border-bottom: 4px solid #10b981;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">RECIBO DE VENTA</h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">${projectName}</p>
        </div>
        
        <div class="desktop-padding" style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 10px 0;">Hola <span style="color: #10b981;">${receipt.customerName}</span>,</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 30px 0;">Gracias por tu compra. Adjuntamos el detalle de tu transacción:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding-bottom: 12px; color: #94a3b8; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Producto</th>
                        <th style="text-align: right; padding-bottom: 12px; color: #94a3b8; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 1px solid #e2e8f0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 500;">Subtotal</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">$${receipt.subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 500;">Impuestos</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">$${receipt.tax.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px 0 0 0; color: #0f172a; font-size: 18px; font-weight: 900; border-top: 1px solid #e2e8f0; margin-top: 10px;">TOTAL</td>
                        <td style="padding: 15px 0 0 0; color: #10b981; font-size: 24px; font-weight: 900; text-align: right; border-top: 1px solid #e2e8f0; margin-top: 10px;">$${receipt.total.toFixed(2)}</td>
                    </tr>
                </table>
            </div>

            <div style="text-align: center; color: #94a3b8; font-size: 13px;">
                <p style="margin: 0 0 4px 0;">Recibo N°: <b style="color: #64748b;">${receipt.id}</b></p>
                <p style="margin: 0 0 15px 0;">Fecha: ${new Date(receipt.date).toLocaleString()}</p>
                <p style="margin: 0; font-size: 15px; color: #0f172a; font-weight: 800;">¡Gracias por tu preferencia!</p>
            </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 25px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a;">- Goatify</p>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">© 2026 Infraestructura de élite.</p>
        </div>
    </div>
    `;
};
