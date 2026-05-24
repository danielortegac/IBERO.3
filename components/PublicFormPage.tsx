import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, addDoc, collection, updateDoc, increment, query, where, getDocs, setDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { Form, UserProfile } from '../types';
import Icon from './Icon';
import Spinner from './ui/Spinner';

interface PublicFormPageProps {
    formId: string;
}

const PublicFormPage: React.FC<PublicFormPageProps> = ({ formId }) => {
    const [form, setForm] = useState<Form | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [alreadyFilled, setAlreadyFilled] = useState(false);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // 1. GESTIÓN DE SESIÓN INTELIGENTE: Esperar a que Firebase determine si hay una sesión activa
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    // Solo iniciamos sesión anónima si NO hay un usuario ya logueado
                    await signInAnonymously(auth);
                } catch (err) {
                    console.error("Error en autenticación anónima:", err);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // 2. CARGA DEL FORMULARIO: Solo cuando la sesión esté lista (real o anónima)
    useEffect(() => {
        if (!isAuthReady) return;

        const fetchForm = async () => {
            try {
                // Verificar si ya se envió desde este dispositivo
                if (localStorage.getItem(`submitted_form_${formId}`)) {
                    setAlreadyFilled(true);
                }

                const decodedFormId = decodeURIComponent(formId);
                const formsQuery = query(collection(db, 'forms'), where('slug', '==', decodedFormId));
                const querySnap = await getDocs(formsQuery);
                
                if (!querySnap.empty) {
                    const docSnap = querySnap.docs[0];
                    setForm({ id: docSnap.id, ...docSnap.data() } as Form);
                } else {
                    // Fallback to name query
                    const nameQuery = query(collection(db, 'forms'), where('name', '==', decodedFormId));
                    const nameSnap = await getDocs(nameQuery);
                    if (!nameSnap.empty) {
                        setForm({ id: nameSnap.docs[0].id, ...nameSnap.docs[0].data() } as Form);
                    } else {
                        // Final fallback to ID query
                        const formRef = doc(db, 'forms', formId);
                        const docSnap = await getDoc(formRef);
                        if (docSnap.exists()) {
                            setForm({ id: docSnap.id, ...docSnap.data() } as Form);
                        } else {
                            setError('Formulario no encontrado. Verifica el enlace.');
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching form:", e);
                setError('No se pudo cargar el formulario. Verifica tu conexión o permisos.');
            } finally {
                setLoading(false);
            }
        };
        fetchForm();
    }, [formId, isAuthReady]);

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data.type === 'FORM_SUBMIT' && form) {
                const { data } = event.data;
                try {
                    // Doble verificación de seguridad antes de escribir
                    if (!auth.currentUser) await signInAnonymously(auth);

                    // Guardar respuesta
                    await addDoc(collection(db, 'forms', form.id, 'responses'), {
                        submittedAt: new Date().toISOString(),
                        data: data,
                    });
                    
                    // Incrementar contador y asegurar datos mínimos si se recreating
                    await setDoc(doc(db, 'forms', form.id), { 
                        responseCount: increment(1),
                        name: form.name || 'Formulario Recuperado',
                        slug: form.slug || form.id
                    }, { merge: true });
                    
                    // Notificar al dueño
                    if (form.ownerId) {
                        const ownerRef = doc(db, 'users', form.ownerId);
                        const ownerSnap = await getDoc(ownerRef);
                        const ownerData = ownerSnap.exists() ? ownerSnap.data() as UserProfile : null;

                        await addDoc(collection(db, `users/${form.ownerId}/notifications`), {
                            type: 'general',
                            text: `📊 **Nueva Respuesta**: Se ha completado el formulario **${form.name}**.`,
                            timestamp: new Date().toISOString(),
                            read: false,
                            link: `/#aiStudio/formBuilder`
                        });

                        // Enviar emails por backend
                        if (ownerData?.email) {
                            const guestEmail = data.email || data.correo || data.Mail || data.mail || '';
                            fetch('/api/forms/notify', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    ownerId: form.ownerId,
                                    ownerEmail: ownerData.email,
                                    formName: form.name,
                                    guestEmail,
                                    guestData: data
                                })
                            }).catch(e => console.error("Email notification error:", e));
                        }
                    }

                    // Marcar como enviado localmente
                    localStorage.setItem(`submitted_form_${formId}`, 'true');
                    setIsSubmitted(true);
                } catch (err) {
                    console.error("Error saving response:", err);
                    alert('Error al guardar la respuesta. Inténtalo de nuevo.');
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [formId, form]);

    if (loading) {
        return <div className="w-screen h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><Spinner text="Cargando..." /></div>;
    }

    if (error) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl text-center">
                    <Icon name="close" className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Error</h1>
                    <p className="text-gray-600 dark:text-gray-300">{error}</p>
                </div>
            </div>
        );
    }

    if (isSubmitted || alreadyFilled) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 animate-fade-in">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl text-center transform transition-all duration-300">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Icon name="check" className="w-10 h-10 text-green-600 dark:text-green-400" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">¡Gracias!</h1>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">Usted ya lo ha llenado, gracias.</p>
                </div>
            </div>
        );
    }
    
    const injectedScript = `
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                const form = document.querySelector('form');
                if (form) {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        
                        const submitBtn = form.querySelector('button[type="submit"]');
                        const originalText = submitBtn ? submitBtn.innerText : '';
                        if(submitBtn) {
                            submitBtn.disabled = true;
                            submitBtn.innerText = 'Enviando...';
                            submitBtn.style.opacity = '0.7';
                            submitBtn.style.cursor = 'not-allowed';
                        }

                        const formData = new FormData(form);
                        const data = {};
                        
                        // Usamos un mapa para llevar la cuenta de cuántos "on" hemos procesado por cada key
                        const onCounters = {};

                        formData.forEach((value, key) => {
                            let val = value;
                            if (val === 'on') {
                                try {
                                    const allChecked = Array.from(form.querySelectorAll('[name="' + key + '"]:checked'));
                                    const count = onCounters[key] || 0;
                                    const targetEl = allChecked[count];
                                    if (targetEl) {
                                        const label = form.querySelector('label[for="' + targetEl.id + '"]') || targetEl.closest('label');
                                        if (label) val = label.innerText.trim();
                                    }
                                    onCounters[key] = count + 1;
                                } catch(e) {}
                            }

                            if (data[key]) {
                                if (!Array.isArray(data[key])) {
                                    data[key] = [data[key]];
                                }
                                data[key].push(val);
                            } else {
                                data[key] = val;
                            }
                        });
                        
                        window.parent.postMessage({ type: 'FORM_SUBMIT', data }, '*');

                        setTimeout(() => {
                             if(submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerText = originalText;
                                submitBtn.style.opacity = '1';
                                submitBtn.style.cursor = 'pointer';
                            }
                        }, 5000);
                    });
                }
            });
        </script>
    `;

const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${form?.name || 'Formulario Goatify'}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap" rel="stylesheet">
    <script>
        tailwind.config = { 
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            primary: '#1a0b4e',
                            accent: '#10b981'
                        }
                    }
                }
            }
        }
    </script>
    <style>
        body { 
            font-family: 'Plus Jakarta Sans', sans-serif; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            min-height: 100vh; 
            margin: 0; 
            padding: 20px; 
            background-color: #f9fafb;
        }
        .dark body { background-color: #030712; }
        input, textarea, select { color: #1f2937 !important; border-radius: 1rem !important; }
        .dark input, .dark textarea, .dark select { color: #f9fafb !important; background-color: #111827 !important; border-color: #374151 !important; }
        button[type="submit"] {
            border-radius: 1rem !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        button[type="submit"]:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
    </style>
</head>
<body class="bg-gray-50 dark:bg-gray-950">
    <div class="w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl rounded-[2.5rem] p-10 border border-neutral-100 dark:border-neutral-800 transition-all">
        <div class="mb-10 text-center">
             <div class="w-16 h-16 bg-brand-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-brand-primary/10">
                <span style="font-size: 32px">📊</span>
             </div>
            <h1 class="text-3xl font-black text-neutral-900 dark:text-white uppercase tracking-tighter leading-none mb-2">${form?.name}</h1>
        </div>
        
        ${form?.htmlCode?.replace(/<!DOCTYPE html>|<html>|<\/html>|<head>|<\/head>|<body>|<\/body>/gi, '')}

        <div class="mt-12 pt-6 border-t border-neutral-100 dark:border-neutral-800 text-center">
            <p class="text-[9px] font-black text-neutral-300 dark:text-neutral-700 uppercase tracking-widest leading-relaxed">
                Powered by Goatify IA - Secure Infrastructure<br/>
                © 2026 Inteligencia Artificial para Negocios de Élite
            </p>
        </div>
    </div>
    ${injectedScript}
</body>
</html>`;

    return (
        <div className="w-screen h-screen bg-gray-50 dark:bg-gray-950 relative overflow-hidden">
             <iframe
                title={form?.name || 'Form'}
                srcDoc={fullHtml}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups allow-downloads"
            />
        </div>
    );
};

export default PublicFormPage;