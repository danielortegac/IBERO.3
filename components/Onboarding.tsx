import React, { useState, useContext, useEffect, useRef } from 'react';
import { generateProjectTemplate, generateProjectProposal } from '../services/geminiService';
import { AppContext } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import Spinner from './ui/Spinner';
import Icon from './Icon';
import type { Project, UserProfile, Note } from '../types';
import Button from './ui/Button';
import { auth, db } from '../firebaseConfig';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, User, sendPasswordResetEmail, sendEmailVerification, OAuthProvider } from 'firebase/auth';
import { doc, getDoc, collection, addDoc, writeBatch, query, where, getDocs, updateDoc } from 'firebase/firestore';

interface OnboardingProps {
    onComplete: (showWelcome?: boolean) => void;
}

const countries = {
    "United States": "USD", "Mexico": "MXN", "Colombia": "COP",
    "Peru": "PEN", "Argentina": "ARS", "Spain": "EUR",
    "Canada": "CAD", "Ecuador": "USD", "Chile": "CLP", "Guatemala": "GTQ"
};
type Country = keyof typeof countries;

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const { updateUserProfile, currentUser, logInWithEmail, setOnboardingComplete, notifyAdminsOfNewUser, setLanguage, language } = useContext(AppContext);
    const { t } = useTranslation();
    
    const projectTemplates = [
        { id: 'launchStore', labelKey: 'templateLaunchStore', icon: 'market' },
        { id: 'marketingCampaign', labelKey: 'templateMarketingCampaign', icon: 'partners' },
        { id: 'mobileApp', labelKey: 'templateMobileApp', icon: 'code' },
        { id: 'writeBook', labelKey: 'templateWriteBook', icon: 'notepad' },
        { id: 'planTrip', labelKey: 'templatePlanTrip', icon: 'discover' },
        { id: 'custom', labelKey: 'templateCustom', icon: 'edit' },
    ] as const;

    const pendingCallId = localStorage.getItem('pendingCallId');
    const [step, setStep] = useState(pendingCallId ? 2 : 0); 
    
    const [authMode, setAuthMode] = useState<'signup' | 'login' | 'forgot'>(pendingCallId ? 'signup' : 'login'); 
    const [isProjectBeingGenerated, setIsProjectBeingGenerated] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [isAiPath, setIsAiPath] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    // Refs to handle background processing
    const projectPromiseRef = useRef<Promise<any[]> | null>(null);
    const projectDetailsRef = useRef<{name: string, industry: string} | null>(null);

    const [selectedTemplate, setSelectedTemplate] = useState<typeof projectTemplates[number]['id'] | null>(null);
    const [customProject, setCustomProject] = useState("");

    const [formData, setFormData] = useState({
        name: '',
        lastName: '',
        email: '',
        businessName: '',
        headline: '',
        bio: '',
        skills: 'Project Management, AI, UI/UX Design',
        country: '' as Country | '',
        currency: 'USD',
        socials: { linkedin: '', twitter: '', instagram: '', facebook: '' },
        avatarUrl: null as string | null,
        profileType: 'personal' as 'personal' | 'business',
        circle: [] as string[],
        circleRequests: [] as string[]
    });
    
    const handleStartWithAI = () => {
        setIsAiPath(true);
        setStep(1);
    }
    
    const handleStartBlank = () => {
        setIsAiPath(false);
        projectPromiseRef.current = null;
        projectDetailsRef.current = null;
        setAuthMode('login'); 
        setStep(2);
    }

    const handleProjectSubmit = () => {
        let projectDescription = '';
        if (selectedTemplate === 'custom') {
            projectDescription = customProject;
        } else {
            const template = projectTemplates.find(p => p.id === selectedTemplate);
            projectDescription = template ? t(template.labelKey) : 'New Project';
        }

        if (!projectDescription) return;

        setIsProjectBeingGenerated(true);
        
        // START BACKGROUND GENERATION IMMEDIATELY
        const industry = selectedTemplate === 'custom' ? customProject : t(projectTemplates.find(p => p.id === selectedTemplate)?.labelKey || 'templateCustom' as any);
        projectDetailsRef.current = { name: projectDescription, industry };
        projectPromiseRef.current = generateProjectTemplate(industry, projectDescription, language);
        
        // Proceed to auth immediately
        setAuthMode('signup'); 
        setStep(2);
    };

    const savePendingProject = async (user: User) => {
        // Ensure generation continues if started
        if (isAiPath && !projectPromiseRef.current && projectDetailsRef.current) {
             projectPromiseRef.current = generateProjectTemplate(projectDetailsRef.current.industry, projectDetailsRef.current.name, language);
        }

        if (projectPromiseRef.current) {
            try {
                // Fetch actual profile if exists to use real name/avatar
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const existingProfile = userDoc.exists() ? userDoc.data() as UserProfile : null;

                // Wait for AI to finish
                const rawResponse = await projectPromiseRef.current;
                
                let finalProjectData: any = {};
                
                // Flexible parsing: Handle array or single object response
                if (Array.isArray(rawResponse) && rawResponse.length > 0) {
                     const { id, ...projectData } = rawResponse[0];
                     finalProjectData = { ...projectData };
                } else if (rawResponse && typeof rawResponse === 'object' && !Array.isArray(rawResponse)) {
                     // In case AI returned a single project object instead of array
                     const { id, ...projectData } = rawResponse as any;
                     finalProjectData = { ...projectData };
                } else {
                    finalProjectData = { 
                        name: projectDetailsRef.current?.name || 'Mi Proyecto IA', 
                        folders: [
                            {
                                id: 'f1', 
                                name: 'Planificación Estratégica', 
                                tasks: [
                                    { title: 'Definir objetivos del proyecto', status: 'Por Hacer', date: new Date().toISOString().split('T')[0] },
                                    { title: 'Investigación de mercado básica', status: 'Por Hacer', date: new Date().toISOString().split('T')[0] }
                                ]
                            }
                        ] 
                    };
                }

                // Use user info from social, existing profile or form
                const nameFromSocial = user.displayName;
                const finalName = existingProfile?.name || nameFromSocial || formData.name.trim() || 'Emprendedor';

                const profileData: UserProfile = { 
                     uid: user.uid, 
                     name: finalName, 
                     email: user.email || formData.email,
                     avatarUrl: existingProfile?.avatarUrl || user.photoURL || null,
                     plan: existingProfile?.plan || 'free',
                     skills: existingProfile?.skills || [],
                     country: existingProfile?.country || formData.country || 'United States',
                     currency: existingProfile?.currency || formData.currency || countries[formData.country as Country || 'United States'] || 'USD',
                     profileType: existingProfile?.profileType || formData.profileType,
                     notificationSettings: existingProfile?.notificationSettings || { likes: true, comments: true, groupPosts: true, projectInvites: true, projectUpdates: true, newJobs: true, newMessages: true, taskDue: true, general: true, ai_task_complete: true, newsAlerts: true, agentMessages: true }
                } as UserProfile;

                // DIRECT FIRESTORE WRITE: Bypass AppContext addProject to avoid "Not logged in" race condition
                const projectRef = collection(db, 'projects');
                
                const completeProject = {
                     folders: [],
                     documents: [],
                     notes: [],
                     drawings: [],
                     chats: [],
                     spreadsheets: [],
                     finances: { income: 0, expenses: 0, transactions: [] },
                     statuses: [
                         { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
                         { id: 'status-inprogress', name: 'En Progreso', color: '#3B82F6', isFixed: true },
                         { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
                     ],
                     ...finalProjectData, 
                     ownerId: user.uid,
                     name: finalProjectData.name || projectDetailsRef.current?.name || 'Nuevo Proyecto IA',
                     members: [profileData],
                     memberIds: [user.uid],
                     createdAt: new Date().toISOString()
                };
                
                const docRef = await addDoc(projectRef, completeProject);
                const newProjectId = docRef.id;
                
                // FIX: Inject Project ID into tasks
                if (completeProject.folders) {
                    const updatedFolders = completeProject.folders.map((folder: any) => ({
                        ...folder,
                        tasks: (folder.tasks || []).map((task: any) => ({
                            ...task,
                            id: task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
                            projectId: newProjectId,
                            status: 'Por Hacer'
                        }))
                    }));
                    await updateDoc(doc(db, "projects", newProjectId), { folders: updatedFolders });
                }

                // Generate Strategy Note
                if (projectDetailsRef.current) {
                    generateProjectProposal(projectDetailsRef.current.name, projectDetailsRef.current.industry, language)
                        .then(async (proposal) => {
                            const strategyNote: Note = {
                                id: `note-strategy-${Date.now()}`,
                                title: '🚀 Estrategia & Roadmap',
                                content: proposal,
                                createdAt: new Date().toISOString()
                            };
                            const pRef = doc(db, "projects", newProjectId);
                            const pSnap = await getDoc(pRef);
                            if (pSnap.exists()) {
                                const currentNotes = pSnap.data().notes || [];
                                await updateDoc(pRef, { notes: [strategyNote, ...currentNotes] });
                            }
                        })
                        .catch(e => console.error("Proposal generation background error", e));
                }

            } catch (e) {
                console.error("Failed to save pending project", e);
                // Use user info from social or form for fallback too
                const nameFromSocialFallback = user.displayName?.split(' ')[0];
                const finalNameFallback = nameFromSocialFallback || formData.name.trim() || 'Emprendedor';
                
                // Basic fallback direct write
                 await addDoc(collection(db, 'projects'), {
                    name: projectDetailsRef.current?.name || 'Mi Proyecto',
                    ownerId: user.uid,
                    members: [{ uid: user.uid, name: finalNameFallback, email: user.email, plan: 'free' }],
                    memberIds: [user.uid],
                    folders: [{id: `f-${Date.now()}`, name: 'General', tasks: []}],
                    documents: [], notes: [], drawings: [], chats: [], spreadsheets: [],
                    finances: { income: 0, expenses: 0, transactions: [] },
                    statuses: []
                });
            } finally {
                projectPromiseRef.current = null;
                projectDetailsRef.current = null;
                setIsProjectBeingGenerated(false);
            }
        }
    };

    const finalizeOnboarding = async (user: User) => {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        const isNewRegistration = !userDoc.exists() || (formData.country && authMode === 'signup');
        
        if (isNewRegistration) {
            const nameFromSocial = user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'New User';
            const lastNameFromSocial = user.displayName?.split(' ').slice(1).join(' ') || '';
    
            let finalName: string;
            if (formData.profileType === 'personal') {
                finalName = formData.name.trim() || nameFromSocial;
            } else {
                finalName = formData.businessName.trim() || nameFromSocial;
            }
    
            const newUserProfile: Partial<UserProfile> = {
                uid: user.uid,
                name: finalName,
                lastName: formData.lastName || lastNameFromSocial, 
                email: user.email || formData.email.trim(),
                businessName: formData.businessName.trim() || '',
                avatarUrl: formData.avatarUrl || user.photoURL || null,
                headline: '',
                bio: '',
                skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
                country: formData.country || 'United States',
                currency: formData.currency || 'USD',
                socials: formData.socials,
                profileType: formData.profileType,
                showInHub: true,
                lastSeen: new Date().toISOString(),
                plan: 'free', 
                circle: [], 
                circleRequests: [], 
                intisBalance: 2, // AJUSTE: Bono de bienvenida de 2 Intis
                emailVerified: user.emailVerified // Sync social verified status
            };
    
            await updateUserProfile(user.uid, newUserProfile);

            try {
                const batch = writeBatch(db);
                const txId = `tx_welcome_${user.uid}`;
                const txRef = doc(db, `users/${user.uid}/transactions`, txId);
                batch.set(txRef, {
                    id: txId,
                    type: 'Ganado',
                    amount: 2, // AJUSTE: Monto de la transacción inicial 2 Intis
                    description: 'Bono de Bienvenida: Registro de Usuario',
                    date: new Date().toISOString()
                });
                await batch.commit();
            } catch (e) {
                console.error("Failed to apply welcome bonus", e);
            }

            const fullProfile = { ...newUserProfile, uid: user.uid } as UserProfile;
            notifyAdminsOfNewUser(fullProfile);
        }
        
        // CRITICAL: AWAIT THE PROJECT CREATION BEFORE FINISHING
        if (projectPromiseRef.current || isProjectBeingGenerated) {
            setIsProjectBeingGenerated(true); 
            await savePendingProject(user);
        }
        
        const finalCheck = await getDoc(userDocRef);
        if (finalCheck.exists() && finalCheck.data().country) {
             onComplete(isNewRegistration); 
        } else {
            setAuthError("Escoge tu país para acabar tu registro.");
            setIsFinalizing(false);
        }
    };

    const handleGoogleLogin = async () => {
        setAuthError('');
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userDoc = await getDoc(doc(db, "users", user.uid));

            // Logic: If user exists AND has country set, let them in.
            // If user is new OR doesn't have country set, force them to complete profile (Country selection).
            if (userDoc.exists() && userDoc.data().country) {
                 // Existing complete user
                 if (projectPromiseRef.current) {
                     setIsProjectBeingGenerated(true);
                     await savePendingProject(user);
                 }
                 onComplete(false);
            } else {
                // New or Incomplete User -> Force Country Selection
                setFormData(prev => ({
                    ...prev,
                    name: user.displayName?.split(' ')[0] || '',
                    lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
                    email: user.email || '',
                    avatarUrl: user.photoURL
                }));
                setStep(2);
                setAuthMode('signup'); // Force signup UI to show country selector
            }

        } catch (error: any) {
            console.error("Google login error:", error);
            setAuthError(error.message);
        }
    };

    const handleMicrosoftLogin = async () => {
        setAuthError('');
        try {
            const provider = new OAuthProvider('microsoft.com');
            // Adding prompts/scopes if needed, but default is usually fine for basic login
            provider.setCustomParameters({ prompt: 'select_account' });
            
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists() && userDoc.data().country) {
                 if (projectPromiseRef.current) {
                     setIsProjectBeingGenerated(true);
                     await savePendingProject(user);
                 }
                 onComplete(false);
            } else {
                setFormData(prev => ({
                    ...prev,
                    name: user.displayName?.split(' ')[0] || '',
                    lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
                    email: user.email || '',
                    avatarUrl: user.photoURL
                }));
                setStep(2);
                setAuthMode('signup');
            }
        } catch (error: any) {
            console.error("Microsoft login error:", error);
            setAuthError(error.message);
        }
    };
    
    const handleEmailSignUp = async () => {
        const { email } = formData;
        if (!email.trim()) { setAuthError('Completa los campos.'); return; }
        if (password !== confirmPassword) { setAuthError('Las contraseñas no coinciden.'); return; }
        if (password.length < 6) { setAuthError('La contraseña debe tener al menos 6 caracteres.'); return; }
        
        setAuthError('');
        setIsFinalizing(true);
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(userCredential.user);
            await finalizeOnboarding(userCredential.user);
        } catch (error: any) {
            console.error("Sign up failed:", error);
            setAuthError(error.message);
            setIsFinalizing(false); 
        }
    };
    
    const handleEmailLogin = async () => {
        const { email } = formData;
        if (!email.trim() || !password.trim()) {
            setAuthError('Ingresa correo y contraseña.');
            return;
        }
        setAuthError('');
        setIsFinalizing(true);
        try {
            await logInWithEmail(email, password);
            const user = auth.currentUser;
            
            if (user) {
                 if (projectPromiseRef.current) {
                     setIsProjectBeingGenerated(true);
                     await savePendingProject(user);
                 }

                 const userDoc = await getDoc(doc(db, "users", user.uid));
                 if (userDoc.exists() && userDoc.data().country) {
                     onComplete(false); 
                 } else {
                     setStep(2);
                     setAuthMode('signup');
                     setFormData(prev => ({...prev, email: user.email || '' }));
                     setAuthError("Por favor completa tu perfil seleccionando tu país.");
                     setIsFinalizing(false);
                 }
            }
        } catch (error: any) {
            console.error("Login failed:", error);
            setAuthError('Credenciales incorrectas.');
            setIsFinalizing(false); 
        }
    }

    const handleForgotPassword = async () => {
        if (!formData.email) {
             setAuthError('Ingresa tu correo electrónico.');
             return;
        }
        setIsFinalizing(true);
        try {
            await sendPasswordResetEmail(auth, formData.email);
            setResetEmailSent(true);
            setAuthError('');
        } catch (error: any) {
            setAuthError("Error enviando correo: " + error.message);
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleFormSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (authMode === 'forgot') {
            handleForgotPassword();
        } else if (authMode === 'signup') {
            if (currentUser) { 
                // Social login finishing up
                if (!formData.country) { setAuthError("Escoge tu país."); return; }
                setIsFinalizing(true);
                finalizeOnboarding(currentUser).catch(() => setIsFinalizing(false)); 
            } else { 
                handleEmailSignUp();
            }
        } else { 
            handleEmailLogin();
        }
    }
    
    const renderStepContent = () => {
        switch(step) {
            case 0:
                 return (
                    <div className="w-full max-w-xl animate-fade-in">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl md:text-4xl font-bold font-sans text-light-text-primary dark:text-dark-text-primary mb-3">{t('onboardingIntro')}</h1>
                            <p className="text-light-text-secondary dark:text-dark-text-secondary max-w-lg mx-auto">{t('onboardingSubIntro')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-5 mt-4">
                            <div onClick={handleStartWithAI} className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6 text-left flex flex-row items-center gap-4 hover:border-brand-primary hover:shadow-lg transition-all duration-300 cursor-pointer group">
                                <div className="bg-brand-primary/10 p-3 rounded-full"><Icon name="ai" className="w-8 h-8 text-brand-primary" /></div>
                                <div className="flex-grow"><h2 className="text-lg font-bold font-sans mb-1">{t('createProjectWithAI')}</h2><p className="text-sm text-neutral-600 dark:text-neutral-400">{t('createProjectWithAIDesc')}</p></div>
                                <span className="font-semibold text-brand-primary group-hover:underline whitespace-nowrap">&rarr;</span>
                            </div>
                            <div onClick={handleStartBlank} className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6 text-left flex flex-row items-center gap-4 hover:border-brand-primary hover:shadow-lg transition-all duration-300 cursor-pointer group">
                                <div className="bg-brand-secondary/10 p-3 rounded-full"><Icon name="user" className="w-8 h-8 text-brand-secondary" /></div>
                                <div className="flex-grow"><h2 className="text-lg font-bold font-sans mb-1">{t('accessAccount')}</h2><p className="text-sm text-neutral-600 dark:text-neutral-400">{t('accessAccountDesc')}</p></div>
                                <span className="font-semibold text-brand-primary group-hover:underline whitespace-nowrap">{t('enter')}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-center mt-8 pt-4 border-t border-neutral-200 dark:border-neutral-800 gap-4">
                            <div className="flex justify-center gap-4">
                                <button onClick={() => setLanguage('es')} className={`text-sm px-3 py-1 rounded-full transition-colors ${language === 'es' ? 'bg-brand-primary text-white font-bold' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>ES</button>
                                <button onClick={() => setLanguage('en')} className={`text-sm px-3 py-1 rounded-full transition-colors ${language === 'en' ? 'bg-brand-primary text-white font-bold' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>EN</button>
                            </div>
                            <div className="text-center">
                                <a 
                                    href="https://www.goatify.app/privacidad/" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-[10px] text-neutral-400 hover:text-brand-primary transition-colors underline opacity-60 font-sans tracking-wide"
                                >
                                    Política de Privacidad
                                </a>
                            </div>
                        </div>
                    </div>
                );
            case 1:
                 return (
                     <div className="w-full max-w-2xl animate-fade-in flex flex-col lg:block">
                        <div className="text-center">
                            <h1 className="text-2xl sm:text-3xl font-sans font-bold mb-2">{t('projectTypePromptTitle')}</h1>
                            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-6 sm:mb-8">{t('projectTypePromptDesc')}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 overflow-y-visible">
                            {projectTemplates.map((template) => (
                                <button key={template.id} onClick={() => setSelectedTemplate(template.id)} className={`p-4 rounded-lg border-2 transition-all duration-200 text-light-text-primary dark:text-dark-text-primary font-medium transform hover:scale-105 flex flex-col items-center justify-center text-center gap-2 aspect-square ${selectedTemplate === template.id ? 'bg-brand-primary border-brand-primary text-white scale-105 shadow-lg' : 'bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border hover:border-brand-secondary'}`}>
                                    <Icon name={template.icon} className="w-8 h-8"/>
                                    <span className="text-xs sm:text-sm">{t(template.labelKey)}</span>
                                </button>
                            ))}
                        </div>
                        {selectedTemplate === 'custom' && ( <div className="animate-fade-in text-left mt-2 mb-4"> <input type="text" value={customProject} onChange={(e) => setCustomProject(e.target.value)} placeholder={t('describeIndustry')} className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-brand-primary placeholder-neutral-400 transition-all" /> </div> )}
                        <div className="flex items-center justify-between mt-4 lg:mt-8 pb-10 lg:pb-0 sticky bottom-0 bg-white dark:bg-dark-bg lg:static z-10 py-4 lg:py-0 border-t lg:border-none border-neutral-100 dark:border-neutral-800 lg:shadow-none shadow-[0_-10px_20px_rgba(0,0,0,0.05)] lg:bg-transparent">
                            <button className="px-5 py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-700" onClick={() => setStep(0)}>&larr; {t('back')}</button>
                            <Button onClick={handleProjectSubmit} disabled={!selectedTemplate || (selectedTemplate === 'custom' && !customProject.trim())}>{t('goAhead')} →</Button>
                        </div>
                    </div>
                );
            case 2:
                 return (
                    <div className="w-full max-w-md mx-auto animate-fade-in">
                        <h1 className="text-3xl font-sans font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-brand-secondary">
                            {currentUser && authMode === 'signup' ? t('completeProfile') : (authMode === 'signup' ? t('joinGoatify') : (authMode === 'forgot' ? t('recoverPassword') : t('welcome')))}
                        </h1>
                        <p className="text-neutral-500 dark:text-neutral-400 mb-6 text-center text-sm">
                            {currentUser && authMode === 'signup' ? 'Selecciona tu país para configurar tu moneda y completar el registro.' : (authMode === 'signup' ? 'Tu ecosistema de productividad te espera.' : 'Ingresa tus credenciales para continuar.')}
                        </p>
                        
                        {/* Creating Project Indicator */}
                        {(isProjectBeingGenerated || (isFinalizing && projectPromiseRef.current)) && (
                            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 flex items-center justify-center gap-3 animate-pulse shadow-sm">
                                <Spinner showText={false} size="sm" className="text-brand-primary" />
                                <div className="flex flex-col text-left">
                                    <span className="text-sm font-bold text-brand-primary">Creando tu proyecto con IA...</span>
                                    <span className="text-xs text-blue-600 dark:text-blue-300">Esto puede tomar unos segundos.</span>
                                </div>
                            </div>
                        )}

                        {/* Social Buttons - Only hide if we are in "Complete Profile" state for already logged in user */}
                        {(!currentUser || authMode === 'login') && authMode !== 'forgot' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                <button 
                                    onClick={handleGoogleLogin}
                                    className="flex items-center justify-center gap-3 bg-white dark:bg-white text-gray-700 font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-50 transition-all border border-gray-200"
                                >
                                    <Icon name="google" className="w-5 h-5" />
                                    <span>Google</span>
                                </button>
                                <button 
                                    onClick={handleMicrosoftLogin}
                                    className="flex items-center justify-center gap-3 bg-white dark:bg-white text-gray-700 font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-50 transition-all border border-gray-200"
                                >
                                    <Icon name="microsoft" className="w-5 h-5" />
                                    <span>Microsoft</span>
                                </button>
                            </div>
                        )}
                        
                        {(!currentUser || authMode === 'login') && authMode !== 'forgot' && (
                             <div className="relative flex py-2 items-center mb-6">
                                <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">O con correo</span>
                                <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                            </div>
                        )}
                        
                        <div className="space-y-4">
                             <form onSubmit={handleFormSubmit} className="space-y-3">
                                {authMode === 'signup' && (!currentUser || authMode === 'login') && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div><input name="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-brand-primary placeholder-neutral-400 transition-all" placeholder={t('namePlaceholder')} /></div>
                                        <div><input name="email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-brand-primary placeholder-neutral-400 transition-all" placeholder={t('emailPlaceholder')} autoComplete="email" /></div>
                                    </div>
                                )}
                                
                                {(authMode === 'login' || authMode === 'forgot') && ( 
                                    <input name="email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-brand-primary placeholder-neutral-400 transition-all" placeholder={t('emailPlaceholder')} autoComplete="username" /> 
                                )}

                                {authMode === 'forgot' && resetEmailSent && (
                                     <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-xl text-xs text-center border border-green-100 dark:border-green-900/30 font-semibold">
                                         ¡Enlace enviado! Revisa tu correo.
                                     </div>
                                )}
                                
                                {(!currentUser || authMode === 'login') && authMode !== 'forgot' && (
                                    <div className="space-y-1">
                                        <div className={`grid gap-3 ${authMode === 'signup' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                            <div>
                                                 <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-brand-primary placeholder-neutral-400 transition-all" placeholder={t('password')} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
                                            </div>
                                            {authMode === 'signup' && ( 
                                                <div>
                                                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-brand-primary placeholder-neutral-400 transition-all" placeholder={t('confirmPassword')} autoComplete="new-password" />
                                                </div>
                                            )}
                                        </div>
                                        {authMode === 'signup' && <p className="text-[10px] text-gray-500 mt-1 ml-1">Mínimo 6 caracteres</p>}
                                    </div>
                                )}
                                
                                {authMode === 'login' && ( <div className="flex justify-end"><button type="button" onClick={() => { setAuthMode('forgot'); setAuthError(''); }} className="text-xs text-brand-primary hover:underline">{t('forgotPassword')}</button></div> )}
                                
                                {/* COUNTRY SELECTOR - VISIBLE ALWAYS IN SIGNUP OR WHEN LOGGED IN BUT INCOMPLETE */}
                                {authMode === 'signup' && (
                                    <div className="relative group">
                                        <select 
                                            name="country" 
                                            value={formData.country} 
                                            onChange={e => {
                                                const selectedCountry = e.target.value as Country;
                                                const selectedCurrency = countries[selectedCountry] || 'USD';
                                                setFormData({...formData, country: selectedCountry, currency: selectedCurrency});
                                            }} 
                                            className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-4 text-sm focus:ring-2 focus:ring-brand-primary appearance-none cursor-pointer text-neutral-500 dark:text-neutral-400 transition-all font-bold pr-10"
                                        >
                                            <option value="" disabled>{t('selectCountry')}</option>
                                            {Object.keys(countries).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 group-hover:text-brand-primary transition-colors">
                                            <Icon name="chevronDown" className="w-5 h-5" />
                                        </div>
                                    </div>
                                )}

                                {authError && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-xs text-center border border-red-100 dark:border-red-900/30 font-bold">{authError}</div>}
                                <div className="pt-4">
                                    <Button type="submit" disabled={isFinalizing} className="w-full h-14 text-base rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all bg-[#2E1065] hover:bg-[#1e0a45] text-white border-none font-bold tracking-wide">
                                        {isFinalizing ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                <span>{isProjectBeingGenerated ? 'Finalizando...' : t('loading')}</span>
                                            </div>
                                        ) : (currentUser && authMode === 'signup' ? t('completeProfile') : (authMode === 'signup' ? t('joinGoatify') : (authMode === 'forgot' ? t('recoverPassword') : t('welcome'))))}
                                    </Button>
                                </div>
                             </form>
                        </div>
                         <div className="mt-6 text-center text-sm">
                            {(!currentUser || authMode === 'login') && !isFinalizing && ( authMode === 'signup' ? ( <span className="text-neutral-500">{t('alreadyHaveAccount')} <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="font-bold text-brand-primary hover:underline ml-1">{t('login')}</button></span> ) : ( <span className="text-neutral-500"> {authMode === 'forgot' ? <button onClick={() => { setAuthMode('login'); setAuthError(''); setResetEmailSent(false); }} className="font-bold text-brand-primary hover:underline">{t('backToLogin')}</button> : <span>{t('newHere')} <button onClick={() => { setAuthMode('signup'); setAuthError(''); }} className="font-bold text-brand-primary hover:underline ml-1">{t('createAccount')}</button></span>} </span> ) )}
                        </div>
                        <div className="mt-8 text-center"><button className="text-neutral-400 hover:text-neutral-600 text-xs font-medium" onClick={() => setStep(isAiPath ? 1 : 0)}>&larr; {t('back')}</button></div>
                    </div>
                );
        }
    }

    const currentStepIndex = step + 1;
    const totalSteps = isAiPath ? 3 : 2;
    const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";

    return (
        <div className="fixed inset-0 w-full flex flex-col lg:flex-row bg-light-bg dark:bg-dark-bg font-sans text-light-text-primary dark:text-dark-text-primary overflow-hidden">
            <div className="hidden lg:flex w-full lg:w-1/3 xl:w-2/5 bg-dark-surface p-12 flex-col justify-between relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-br from-[#2E1065] via-dark-surface to-dark-surface opacity-60"></div>
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#4c1d95] rounded-full filter blur-[100px] opacity-20 animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#6d28d9] rounded-full filter blur-[80px] opacity-20 animate-pulse animation-delay-2000"></div>
                <div className="relative z-10 text-white"><div className="flex items-center gap-3">{!imgError ? (<img src={LOGO_URL} alt="Goatify" className="h-12 w-auto" onError={() => setImgError(true)} />) : (<div className="flex items-center gap-2"><Icon name="goat" className="w-8 h-8 text-white" /><span className="text-2xl font-bold">Goatify</span></div>)}</div></div>
                <div className="relative z-10 text-white"><div className="flex items-center gap-3 mb-6">{[...Array(totalSteps)].map((_, idx) => (<div key={idx} className={`h-1.5 rounded-full transition-all duration-500 ${step >= idx ? 'bg-brand-primary flex-1' : 'bg-white/20 w-12'}`}></div>))}</div><p className="font-semibold text-2xl mb-2 text-white">{step === 0 ? t('onboardingStep1') : step === 1 ? t('onboardingStep2') : t('onboardingStep3')}</p><p className="text-neutral-400 text-sm">{t('welcomeToYourCopilot')}</p></div>
            </div>
            <div className="w-full lg:flex-1 flex flex-col items-center lg:justify-center justify-start p-6 sm:p-12 h-full overflow-y-auto bg-white dark:bg-dark-bg relative">
                <div className="w-full max-w-2xl lg:hidden text-left mb-4 flex-shrink-0 pt-4">
                     <div className="flex items-center justify-center gap-3 mb-6">{!imgError ? (<img src={LOGO_URL} alt="Goatify" className="h-10 w-auto" onError={() => setImgError(true)} />) : (<div className="flex items-center gap-2"><Icon name="goat" className="w-8 h-8 text-brand-primary" /><span className="text-xl font-bold text-brand-primary">Goatify</span></div>)}</div>
                     <div className="flex items-center justify-center gap-2">{[...Array(totalSteps)].map((_, idx) => (<div key={idx} className={`h-1.5 rounded-full transition-all duration-500 ${step >= idx ? 'bg-brand-primary w-8' : 'bg-neutral-200 dark:bg-neutral-700 w-8'}`}></div>))}</div>
                    <p className="text-center text-xs font-bold text-neutral-400 mt-2 uppercase tracking-wider">{t('onboardingStep1').split(':')[0]} {Math.min(step + 1, totalSteps)}/{totalSteps}</p>
                </div>
                {renderStepContent()}
            </div>
        </div>
    );
};

export default Onboarding;