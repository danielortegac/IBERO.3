import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import Icon from '../Icon';
import Button from '../ui/Button';

export default function PublicReceiptPage({ receiptId }: { receiptId: string }) {
    const [receipt, setReceipt] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchReceipt = async () => {
            try {
                // We will store receipts in a root collection `receipts`
                const docRef = doc(db, 'receipts', receiptId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setReceipt(docSnap.data());
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error(err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchReceipt();
    }, [receiptId]);

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-neutral-50"><Icon name="loader" className="w-8 h-8 animate-spin text-brand-primary" /></div>;
    }

    if (error || !receipt) {
        return <div className="flex h-screen items-center justify-center bg-neutral-50 text-neutral-500">Recibo no encontrado</div>;
    }

    return (
        <div className="h-screen overflow-y-auto bg-neutral-100 flex flex-col items-center p-4 font-sans">
            <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden my-auto flex-shrink-0">
                <div className="bg-brand-primary p-6 text-center text-white">
                    {receipt.projectLogo ? (
                        <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-full p-1 shadow-sm">
                            <img src={receipt.projectLogo} alt={receipt.projectName} className="w-full h-full object-contain rounded-full" referrerPolicy="no-referrer" />
                        </div>
                    ) : (
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="check" className="w-8 h-8 text-white" />
                        </div>
                    )}
                    <h1 className="text-2xl font-black uppercase tracking-widest">{receipt.projectName || 'Recibo'}</h1>
                    <p className="text-white/80 text-sm mt-1">¡Gracias por tu compra!</p>
                </div>
                
                <div className="p-6">
                    <div className="flex justify-between text-xs text-neutral-500 mb-6 uppercase tracking-wider font-bold border-b border-neutral-100 pb-4">
                        <span>Fecha: {new Date(receipt.date).toLocaleDateString()}</span>
                        <span>Ref: #{receiptId.slice(0, 8)}</span>
                    </div>

                    {receipt.customerName && (
                        <div className="mb-6">
                            <p className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Cliente</p>
                            <p className="font-medium text-neutral-800">{receipt.customerName}</p>
                        </div>
                    )}

                    <div className="space-y-4 mb-6">
                        {receipt.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-neutral-100 rounded-lg flex items-center justify-center text-xs font-bold text-neutral-500">
                                        {item.quantity}x
                                    </div>
                                    <div>
                                        <p className="font-bold text-neutral-800 text-sm">{item.name}</p>
                                        {item.category && <p className="text-[10px] text-neutral-400 uppercase">{item.category}</p>}
                                    </div>
                                </div>
                                <p className="font-bold text-neutral-800">${(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-neutral-100 pt-4 space-y-2">
                        <div className="flex justify-between text-sm text-neutral-500">
                            <span>Subtotal</span>
                            <span>${receipt.subtotal.toFixed(2)}</span>
                        </div>
                        {receipt.discount > 0 && (
                            <div className="flex justify-between text-sm text-emerald-500">
                                <span>Descuento ({receipt.discount}%)</span>
                                <span>-${receipt.discountAmount.toFixed(2)}</span>
                            </div>
                        )}
                        {receipt.tax > 0 && (
                            <div className="flex justify-between text-sm text-neutral-500">
                                <span>Impuestos {receipt.taxRate ? `(${receipt.taxRate}%)` : ''}</span>
                                <span>${receipt.tax.toFixed(2)}</span>
                            </div>
                        )}
                        {receipt.tipAmount > 0 && (
                            <div className="flex justify-between text-sm text-neutral-500">
                                <span>Propina ({receipt.tipPercentage}%)</span>
                                <span>${receipt.tipAmount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-xl font-black text-neutral-900 pt-2 border-t border-neutral-100 mt-2">
                            <span>TOTAL</span>
                            <span>${receipt.total.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="mt-8">
                        <Button onClick={() => window.print()} className="w-full bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition-colors">
                            <Icon name="download" className="w-4 h-4 mr-2" /> Descargar PDF
                        </Button>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-[10px] text-neutral-400">
                            Solución desarrollada por <a href="https://www.goatify.app" target="_blank" rel="noopener noreferrer" className="font-bold text-brand-primary hover:underline">Goatify</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
