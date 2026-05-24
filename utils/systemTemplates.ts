
/**
 * ARCHIVO DE PLANTILLAS NATIVAS ESTRUCTURALES
 * Estas plantillas están diseñadas para ser cargadas en el módulo de Mailing Avanzado
 * permitiendo su uso generalizado y manual.
 */

export const SYSTEM_TEMPLATES = [
  {
    id: 'sys_welcome',
    name: '8. Bienvenida (Welcome Email)',
    subject: '¡Bienvenido a Goatify - Tu Suite de Productividad!',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background-color: #0f172a; padding: 40px 20px; text-align: center; border-bottom: 4px solid #3b82f6;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">BIENVENIDO A GOATIFY</h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Infraestructura de Alto Rendimiento</p>
        </div>
        
        <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 15px 0;">¡Hola {{Nombre}}!</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 25px 0;">Estamos encantados de tenerte a bordo. Goatify no es solo una aplicación, es el motor que llevará tu negocio al siguiente nivel operativo y comercial.</p>
            
            <div style="background-color: #f8fafc; border-left: 4px solid #0f172a; padding: 25px 20px; margin-bottom: 30px;">
                <div style="margin-bottom: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase;">IA Studio & Alter Ego</p>
                    <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">Automatiza tu inteligencia y delega tareas a tu propia IA personalizada.</p>
                </div>
                <div style="margin-bottom: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase;">CRM & Sales Copilot</p>
                    <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">Gestiona leads, cierra ventas con asistencia de IA y escala tus ingresos.</p>
                </div>
                <div>
                    <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase;">Gestión de Proyectos</p>
                    <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">Organiza equipos, archivos y tareas en un solo lugar centralizado.</p>
                </div>
            </div>

            <div style="text-align: center; margin-bottom: 25px;">
                <a href="https://ia.goatify.app" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #2563eb; color: #ffffff; padding: 16px 20px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Explorar Mi Suite Operativa</a>
            </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 25px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a;">- Goatify</p>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">© 2026 Goatify Operations & Strategy.</p>
        </div>
    </div>
    `
  },
  {
    id: 'sys_news',
    name: '9. Goatify Intel (Noticias Diarias)',
    subject: 'Goatify Intel: Avances Críticos en IA y Transformación de Negocios',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background-color: #111827; padding: 40px 20px; text-align: center; border-bottom: 4px solid #10b981; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">GOATIFY <span style="color: #10b981;">INTEL</span></h1>
            <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Briefing de Inteligencia de Negocio</p>
        </div>
        
        <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #1e293b; line-height: 1.6; margin: 0 0 30px 0; font-weight: 500;">Hola, aquí tienes tu dosis diaria de innovación. Hemos curado las noticias más críticas de hoy para que mantengas la ventaja competitiva.</p>
            
            <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #e2e8f0;">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="background-color: #0f172a; color: white; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;">Marketing</span>
                </div>
                <h3 style="color: #0f172a; font-size: 18px; font-weight: 800; line-height: 1.3; margin: 0 0 10px 0;">El futuro de la IA en la creación de contenido</h3>
                <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 15px 0;">Descubre cómo las nuevas herramientas de IA generativa están redefiniendo el proceso creativo para las agencias modernas.</p>
                <div style="background-color: #f8fafc; padding: 12px 15px; border-left: 3px solid #3b82f6; font-size: 14px; color: #1e293b; font-style: italic; margin-bottom: 15px;"><b>Inside Take:</b> La velocidad de ejecución se convertirá en el factor diferenciador clave este año.</div>
            </div>

            <div style="text-align: center; margin-top: 35px; padding: 30px 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 800; color: #0f172a;">¿Listo para aplicar esto?</h3>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748b;">Entra a tu IA Studio y empieza a automatizar.</p>
                <a href="https://ia.goatify.app" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #000000; color: #ffffff; padding: 16px 20px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Abrir Mi Dashboard</a>
            </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 25px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a;">- Goatify Innovation Lab</p>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">© 2026 Todos los derechos reservados.</p>
        </div>
    </div>
    `
  },
  {
    id: 'sys_pos',
    name: '10. Recibo del POS (Venta Directa)',
    subject: 'Tu recibo de compra en {{Negocio}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background-color: #0f172a; padding: 40px 20px; text-align: center; border-bottom: 4px solid #10b981;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">RECIBO DE VENTA</h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">{{NombreNegocio}}</p>
        </div>
        
        <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #1e293b; font-weight: 700; margin: 0 0 10px 0;">Hola <span style="color: #10b981;">{{Cliente}}</span>,</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 30px 0;">Gracias por tu compra. Adjuntamos el detalle de tu transacción:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding-bottom: 12px; color: #94a3b8; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Producto</th>
                        <th style="text-align: right; padding-bottom: 12px; color: #94a3b8; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <div style="font-weight: 700; color: #0f172a; font-size: 15px; line-height: 1.4;">Producto Ejemplo</div>
                            <div style="font-size: 13px; color: #64748b; margin-top: 2px;">Cant: 1 x $100.00</div>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 800; color: #0f172a; font-size: 15px;">
                            $100.00
                        </td>
                    </tr>
                </tbody>
            </table>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 1px solid #e2e8f0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 500;">Subtotal</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">$100.00</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px 0 0 0; color: #0f172a; font-size: 18px; font-weight: 900; border-top: 1px solid #e2e8f0; margin-top: 10px;">TOTAL</td>
                        <td style="padding: 15px 0 0 0; color: #10b981; font-size: 24px; font-weight: 900; text-align: right; border-top: 1px solid #e2e8f0; margin-top: 10px;">$100.00</td>
                    </tr>
                </table>
            </div>

            <div style="text-align: center; color: #94a3b8; font-size: 13px;">
                <p style="margin: 0 0 4px 0;">Recibo N°: <b style="color: #64748b;">{{ID_TX}}</b></p>
                <p style="margin: 0 0 15px 0;">Fecha: {{Fecha}}</p>
                <p style="margin: 0; font-size: 15px; color: #0f172a; font-weight: 800;">¡Gracias por tu preferencia!</p>
            </div>
        </div>
    </div>
    `
  },
  {
    id: 'sys_confirm_meeting',
    name: '1. Confirmación de Cita (Inbound)',
    subject: 'Confirmación de Reunión: {{Fecha}} a las {{Hora}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 40px 30px; border-radius: 24px; background-color: #ffffff; box-shadow: 0 10px 40px rgba(0,0,0,0.03);">
        <h2 style="color: #6366f1; font-size: 24px; font-weight: 900; margin-bottom: 10px;">¡Hola {{NombreInvitado}}!</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">Tu reunión ha sido agendada con éxito en nuestro sistema.</p>
        
        <div style="background: #f9fafb; padding: 25px; border-radius: 16px; margin: 30px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Detalles del Evento:</p>
            <p style="margin: 0; font-size: 16px; color: #1e293b;"><strong>📅 Fecha:</strong> {{Fecha}}</p>
            <p style="margin: 10px 0 0 0; font-size: 16px; color: #1e293b;"><strong>⏰ Hora:</strong> {{Hora}}</p>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #94a3b8; font-style: italic;">"{{Notas}}"</p>
        </div>
        
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">Para unirte a la reunión en el momento acordado, haz clic en el siguiente enlace:</p>
        
        <div style="text-align: center;">
            <a href="{{LinkReunion}}" style="display: inline-block; width: 100%; box-sizing: border-box; background: #6366f1; color: white; padding: 18px 24px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 15px; text-transform: uppercase;">Unirse a la Videollamada</a>
        </div>
        
        <hr style="margin: 40px 0; border: none; border-top: 1px solid #f1f5f9;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Este es un mensaje automático de Goatify Scheduler.</p>
    </div>
    `
  },
  {
    id: 'sys_new_meeting_alert',
    name: '2. Alerta de Nueva Cita (Dueño)',
    subject: 'NUEVA REUNIÓN AGENDADA: {{NombreInvitado}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 40px 30px; border-radius: 24px; background-color: #ffffff;">
        <h2 style="color: #0f172a; font-size: 22px; font-weight: 900; margin-bottom: 10px;">¡Nueva Cita Confirmada!</h2>
        <p style="color: #475569; font-size: 16px;">Alguien ha agendado una nueva reunión contigo.</p>
        
        <div style="background: #0f172a; padding: 25px; border-radius: 16px; margin: 30px 0; color: #ffffff;">
            <p style="margin: 0 0 15px 0; font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;"><strong>👤 Cliente:</strong> {{NombreInvitado}}</p>
            <p style="margin: 0 0 15px 0; font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;"><strong>📧 Email:</strong> {{EmailInvitado}}</p>
            <p style="margin: 0 0 15px 0; font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;"><strong>📅 Fecha:</strong> {{Fecha}}</p>
            <p style="margin: 0; font-size: 16px;"><strong>⏰ Hora:</strong> {{Hora}}</p>
        </div>
        
        <div style="text-align: center;">
            <a href="https://ia.goatify.app/#/scheduler" style="display: inline-block; width: 100%; box-sizing: border-box; background: #6366f1; color: white; padding: 18px 24px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase;">Ver En Mi Organizador</a>
        </div>
    </div>
    `
  },
  {
    id: 'sys_project_invite',
    name: '3. Invitación a Proyecto (Colaboración)',
    subject: 'Invitación de Colaboración: {{NombreProyecto}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <div style="background-color: #111827; padding: 50px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Invitación a Proyecto</h1>
            <p style="color: #94a3b8; margin: 10px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.25em;">Colaboración Goatify Pro</p>
        </div>
        
        <div style="padding: 40px 30px; background-color: #ffffff;">
            <p style="font-size: 16px; color: #1e293b; line-height: 1.6; font-weight: 600;">Hola,</p>
            <p style="font-size: 16px; color: #334155; line-height: 1.6;"><b>{{NombreDueno}}</b> te ha invitado a colaborar en el ecosistema digital del proyecto <b>{{NombreProyecto}}</b>.</p>
            
            <div style="background: #f8fafc; padding: 25px; border-radius: 16px; margin: 30px 0; border-left: 5px solid #6366f1;">
                <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">"Has sido convocado a participar en esta infraestructura de alto rendimiento. Trabajen juntos, compartan activos y escalen el proyecto."</p>
            </div>
            
            <div style="text-align: center; margin-top: 35px;">
                <a href="{{LinkAcceso}}" style="display: inline-block; width: 100%; box-sizing: border-box; background: #6366f1; color: white; padding: 20px 32px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Aceptar Invitación y Entrar</a>
            </div>
            
            <p style="margin-top: 35px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">Esta es una Tarjeta de Acceso VIP vinculada a tu correo electrónico.</p>
        </div>
        
        <div style="padding: 25px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0; font-weight: 700; text-transform: uppercase;">Ecosistema Goatify Pro 2026</p>
        </div>
    </div>
    `
  },
  {
    id: 'sys_task_assign',
    name: '4. Tarea Asignada (Flujo Operativo)',
    subject: 'Nueva Tarea Asignada: {{NombreTarea}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Nueva Tarea Asignada</h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Sistema de Gestión Goatify</p>
        </div>
        
        <div style="padding: 40px 30px; background-color: #ffffff;">
            <p style="font-size: 16px; color: #334155; line-height: 1.6;"><b>{{NombreDueno}}</b> te ha adjudicado la responsabilidad de una nueva tarea en el proyecto <b>{{NombreProyecto}}</b>:</p>
            
            <div style="background: #f8fafc; padding: 25px; border-radius: 14px; margin: 25px 0; border-left: 4px solid #6366f1;">
                <p style="margin: 0; font-size: 11px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Título de la Tarea:</p>
                <p style="margin: 0; font-size: 18px; color: #111827; font-weight: 900; line-height: 1.3;">{{NombreTarea}}</p>
            </div>
            
            <p style="font-size: 15px; color: #475569; margin-bottom: 30px;">Revisa los detalles y el tablero KanBan de inmediato para comenzar la ejecución:</p>
            
            <div style="text-align: center;">
                <a href="{{LinkTarea}}" style="display: inline-block; width: 100%; box-sizing: border-box; background: #111827; color: white; padding: 18px 32px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase;">Revisar Tablero operativo</a>
            </div>
        </div>
    </div>
    `
  },
  {
    id: 'sys_money_receipt',
    name: '5. Recibo de Transacción (Intis)',
    subject: 'Recibo de Transacción Intis: #{{ID_TX}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; background-color: #f8fafc; padding: 20px; margin: 0 auto;">
        <div style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <div style="background-color: #111827; padding: 45px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #4c1d95 100%);">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.01em;">RECIBO DE <span style="color: #a78bfa;">INTIS</span></h1>
                <p style="color: #94a3b8; margin: 10px 0 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Comprobante Digital de Pago</p>
            </div>
            
            <div style="padding: 40px 30px;">
                <p style="font-size: 16px; color: #1e293b; margin-bottom: 25px; font-weight: 600;">Comprobante de Transferencia</p>
                <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 30px;">Has recibido saldo digital a través de la infraestructura financiera de Goatify. Detalles de la transferencia:</p>
                
                <div style="background-color: #f8fafc; border-radius: 16px; border: 1px dashed #cbd5e1; padding: 30px; margin-bottom: 35px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <span style="display: block; font-size: 12px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Monto de la Operación</span>
                        <span style="font-size: 48px; font-weight: 900; color: #10b981; letter-spacing: -2px;">+{{Monto}} <span style="font-size: 20px; font-weight: 600; color: #94a3b8;">$I</span></span>
                    </div>
                    
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 25px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600; width: 40%;">ID Transacción:</td>
                                <td style="padding: 10px 0; color: #1e293b; font-size: 14px; font-weight: 800; text-align: right; font-family: monospace;">#{{ID_TX}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600;">Emisor:</td>
                                <td style="padding: 10px 0; color: #1e293b; font-size: 14px; font-weight: 800; text-align: right;">{{NombreEmisor}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: 600;">Concepto:</td>
                                <td style="padding: 10px 0; color: #1e293b; font-size: 14px; font-weight: 800; text-align: right;">{{Descripcion}}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div style="text-align: center;">
                    <a href="https://ia.goatify.app/#/wallet" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #111827; color: white; padding: 18px 30px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase;">Entrar a Mi Billetera</a>
                </div>
            </div>
        </div>
    </div>
    `
  },
  {
    id: 'sys_form_alert',
    name: '6. Alerta de Formulario (Dueño)',
    subject: 'Nueva respuesta: {{NombreFormulario}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 40px 30px; border-radius: 20px; background-color: #ffffff;">
        <h2 style="color: #6366f1; font-weight: 900; font-size: 22px; margin-bottom: 15px;">Nueva Respuesta Recibida</h2>
        <p style="color: #475569; margin-bottom: 25px;">Se ha registrado una entrada en el formulario: <strong>"{{NombreFormulario}}"</strong>.</p>
        
        <div style="background: #f8fafc; padding: 30px; border-radius: 16px; margin: 30px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Data del Cliente:</p>
            <div style="font-family: monospace; font-size: 14px; color: #1e293b; white-space: pre-wrap; line-height: 1.6;">
{{Datos}}
            </div>
        </div>
        
        <div style="text-align: center;">
            <a href="https://ia.goatify.app/#/aiStudio/formBuilder" style="display: inline-block; width: 100%; box-sizing: border-box; background: #6366f1; color: white; padding: 18px 24px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase;">Gestionar Formularios</a>
        </div>
    </div>
    `
  },
  {
    id: 'sys_form_confirm',
    name: '7. Acuse de Recibo (Formularios)',
    subject: 'Confirmación de envío: {{NombreFormulario}}',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 40px 30px; border-radius: 24px; background-color: #ffffff;">
        <h2 style="color: #6366f1; font-weight: 900; font-size: 24px; margin-bottom: 15px;">¡Gracias por contactarnos!</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">Hemos recibido tus datos correctamente a través de nuestro formulario <strong>"{{NombreFormulario}}"</strong>.</p>
        <p style="color: #64748b; font-size: 15px; line-height: 1.6;">Nuestro equipo revisará la información y se pondrá en contacto contigo en breve si es necesario.</p>
        
        <div style="margin: 40px 0; border-top: 1px solid #f1f5f9; padding-top: 30px; text-align: center;">
            <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 800; letter-spacing: 1px;">Enviado vía Goatify Service Infrastructure</p>
        </div>
    </div>
    `
  },
  {
    id: 'sys_reengagement',
    name: '11. Reactivación (Te Extrañamos)',
    subject: '¿Todo bien por ahí? Te extrañamos en el HUB',
    html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background-color: #111827; padding: 50px 20px; text-align: center; border-bottom: 4px solid #8b5cf6;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">IMPULSA TU <span style="color: #8b5cf6;">PROGRESO</span></h1>
            <p style="color: #94a3b8; margin: 10px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">No dejes que tu negocio pierda el ritmo</p>
        </div>
        
        <div style="padding: 40px 30px;">
            <p style="font-size: 18px; color: #1e293b; font-weight: 800; margin: 0 0 15px 0;">¡Hola {{Nombre}}!</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 30px 0;">Hemos notado que hace unos días que no entras a tu panel operativo. La constancia es el ingrediente secreto del éxito, y Goatify está listo para ayudarte a retomar el control.</p>
            
            <div style="background-color: #f5f3ff; border-radius: 20px; padding: 30px; margin-bottom: 35px; border: 1px solid #ddd6fe;">
                <h4 style="margin: 0 0 15px 0; color: #5b21b6; font-size: 14px; font-weight: 900; text-transform: uppercase;">Tienes pendientes esperando:</h4>
                <ul style="margin: 0; padding: 0; list-style: none;">
                    <li style="margin-bottom: 12px; font-size: 15px; color: #475569; display: flex; align-items: center;">• Nuevos mensajes en el Hub social</li>
                    <li style="margin-bottom: 12px; font-size: 15px; color: #475569;">• Tareas por finalizar en tu Kanban</li>
                    <li style="font-size: 15px; color: #475569;">• Reportes de IA listos para revisar</li>
                </ul>
            </div>

            <div style="text-align: center;">
                <a href="https://ia.goatify.app" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #8b5cf6; color: #ffffff; padding: 20px 30px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 10px 20px rgba(139, 92, 246, 0.2);">Retomar Mi Actividad ahora</a>
            </div>
        </div>
    </div>
    `
  }
];
