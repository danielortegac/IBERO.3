
/**
 * Perplexity Service - Motor de Búsqueda Web de Alta Eficiencia
 * Utiliza el modelo sonar para obtener información en tiempo real con citaciones.
 */


import { auth } from '../firebaseConfig';

export interface PerplexityResponse {
    text: string;
    citations: string[];
}

/**
 * Realiza una búsqueda profunda en internet utilizando Perplexity Sonar vía proxy en el servidor.
 */
export const searchWithPerplexity = async (query: string): Promise<PerplexityResponse> => {
    try {
        const response = await fetch('/api/perplexity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(auth.currentUser ? { 'Authorization': `Bearer ${await auth.currentUser.getIdToken()}` } : {})
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            throw new Error(`Perplexity Proxy Error: ${response.statusText}`);
        }

        const data = await response.json();
        if (data?.usageUpdated) {
            window.dispatchEvent(new CustomEvent('goatify:usage-updated', {
                detail: { featureKey: data.featureKey, amount: data.amount || 1, usage: data.usage }
            }));
        }
        return data;
    } catch (error) {
        console.error("Fallo en búsqueda Perplexity:", error);
        return {
            text: "No se pudo completar la búsqueda en internet en este momento.",
            citations: []
        };
    }
};
