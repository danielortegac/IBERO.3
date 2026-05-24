
// Sound Assets - Protegidos y sin dependencias críticas
const SOUND_MESSAGE = '/assets/message_bloop.mp3'; 
const SOUND_POST = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'; 

class NotificationService {
    private lastBeepTime: number = 0;
    private permission: NotificationPermission = 'default';
    private audioContext: AudioContext | null = null;
    private userInteracted: boolean = false;

    constructor() {
        if (typeof window !== 'undefined') {
            if ('Notification' in window) {
                this.permission = Notification.permission;
            }
            
            // TRACK USER INTERACTION (Vibration/Audio Unlock)
            const unlock = () => {
                this.userInteracted = true;
                window.removeEventListener('pointerdown', unlock);
                window.removeEventListener('touchstart', unlock);
                window.removeEventListener('keydown', unlock);
            };
            window.addEventListener('pointerdown', unlock);
            window.addEventListener('touchstart', unlock);
            window.addEventListener('keydown', unlock);
        }
        this.initAudio();
    }

    private initAudio() {
        if (typeof window !== 'undefined' && !this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    async requestPermission(): Promise<boolean> {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            try {
                this.permission = await Notification.permission;
                if (this.permission === 'default') {
                    this.permission = await Notification.requestPermission();
                }
                return this.permission === 'granted';
            } catch (error) {
                console.error("Could not request notification permission:", error);
                return false;
            }
        }
        return false;
    }

    playBeep(type: 'message' | 'post' | 'call') {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }

        if (typeof navigator !== 'undefined' && navigator.vibrate && this.userInteracted) {
            try {
                if (type === 'call') {
                    navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 2000]); 
                } else {
                    navigator.vibrate([200, 100, 200]);
                }
            } catch (e) {}
        }

        let soundUrl = SOUND_MESSAGE;
        if (type === 'post') soundUrl = SOUND_POST;

        const audio = new Audio(soundUrl);
        audio.volume = 0.2;
        audio.currentTime = 0;
        
        audio.play().catch(() => {
            // Silencioso por política de navegador o archivo no encontrado
        });
        return audio; 
    }

    async showNotification(title: string, options?: NotificationOptions): Promise<void> {
        if (typeof window === 'undefined' || !('Notification' in window)) return;

        if (this.permission !== 'granted') {
            const granted = await this.requestPermission();
            if (!granted) return;
        }

        const icon = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747"; 
        
        let finalTitle = title;
        if (finalTitle === 'Goatify IA') finalTitle = 'Goatify';
        
        const isCall = (options?.tag === 'call-notification' || finalTitle.toLowerCase().includes('llamada') || finalTitle.toLowerCase().includes('reunión'));
        const validTag = options?.tag || (isCall ? 'call-notification' : `goatify-notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);

        const finalOptions: any = {
            ...options,
            icon: icon,
            badge: icon,
            vibrate: isCall ? [1000, 500, 1000, 500, 1000, 500, 1000, 500, 2000] : [200, 100, 200],
            requireInteraction: true, 
            silent: false,
            tag: validTag || 'goatify-alert', 
            renotify: true,
            priority: 'high', 
            importance: 'high',
            visibility: 'public', 
            data: options?.data || { url: '/' },
        };

        if (finalOptions.body && finalOptions.body.startsWith(finalTitle)) {
            finalOptions.body = finalOptions.body.replace(finalTitle, '').trim();
            if (finalOptions.body.startsWith(':')) finalOptions.body = finalOptions.body.substring(1).trim();
        }

        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                if (registration) {
                    await registration.showNotification(finalTitle, finalOptions);
                    return;
                }
            }
            new Notification(finalTitle, finalOptions);
        } catch (e) {
            console.error("Error showing notification:", e);
        }
    }
}

export const notificationService = new NotificationService();
