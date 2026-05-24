import React, { useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';

interface PayPalWrapperProps {
    planId: string;
    currency?: string;
    onSuccess: (subscriptionID: string) => void;
    onError: (err: any) => void;
}

// LIVE Client ID provided
const PAYPAL_CLIENT_ID = "AaVxELNJMF9eUO3MtNzZdX2QMDeT45MZ9ONkJ9FmX6ggUICUbQL1lBexoqFnG_n6WvNjfqaJofHzr_UV";

const PayPalWrapper: React.FC<PayPalWrapperProps> = ({ planId, currency = 'USD', onSuccess, onError }) => {
    const [sdkReady, setSdkReady] = useState(false);
    const [scriptError, setScriptError] = useState<string | null>(null);
    const paypalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Construct the expected source URL with the currency
        const scriptSrc = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=${currency}`;
        const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);

        // If the script with the CORRECT currency is already loaded, use it.
        if (existingScript && (window as any).paypal) {
            setSdkReady(true);
            return;
        }

        // If a script exists but for a different currency/config, remove it to force reload.
        const anyPayPalScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
        if (anyPayPalScript) {
            anyPayPalScript.remove();
             // Reset window.paypal to force re-initialization
            (window as any).paypal = undefined;
            setSdkReady(false);
        }

        // Load PayPal SDK
        const script = document.createElement('script');
        script.src = scriptSrc;
        script.async = true;
        script.setAttribute('data-sdk-integration-source', 'button-factory');
        
        script.onload = () => {
            setSdkReady(true);
        };
        
        script.onerror = () => {
            console.error("PayPal SDK failed to load");
            setScriptError("No se pudo cargar el sistema de pagos. Por favor, verifica tu conexión.");
            onError("Failed to load payment system");
        };
        
        document.body.appendChild(script);

        return () => {
            // Optional cleanup if needed
        };
    }, [currency]); // Reload if currency changes

    useEffect(() => {
        if (sdkReady && !scriptError && paypalRef.current && (window as any).paypal) {
            const container = paypalRef.current;
            container.innerHTML = '';

            try {
                const buttons = (window as any).paypal.Buttons({
                    style: {
                        shape: 'rect',
                        color: 'gold',
                        layout: 'vertical',
                        label: 'subscribe',
                        height: 40
                    },
                    createSubscription: function(data: any, actions: any) {
                        return actions.subscription.create({
                            'plan_id': planId
                        });
                    },
                    onApprove: function(data: any, actions: any) {
                        onSuccess(data.subscriptionID);
                    },
                    onError: function(err: any) {
                        console.error("PayPal Button Error:", err);
                        onError(err);
                    },
                    onCancel: function (data: any) {
                        console.log("Subscription cancelled");
                    }
                });
                
                buttons.render(container).catch((err: any) => {
                    console.error("Failed to render PayPal buttons", err);
                    if (document.body.contains(container)) {
                        onError(err);
                    }
                });

                return () => {
                    if (buttons && buttons.close) {
                        buttons.close();
                    }
                };

            } catch (e) {
                console.error("Error initiating PayPal buttons:", e);
            }
        }
    }, [sdkReady, scriptError, planId, onSuccess, onError, currency]);

    if (scriptError) {
        return <div className="text-red-500 text-sm text-center py-4">{scriptError}</div>;
    }

    if (!sdkReady) {
        return <div className="flex justify-center py-8"><Spinner text={`Conectando PayPal (${currency})...`} /></div>;
    }

    return <div ref={paypalRef} className="w-full z-0 relative" />;
};

export default PayPalWrapper;