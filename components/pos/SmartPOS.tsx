import React, { useState, useEffect, useContext, useRef } from 'react';
import { AppContext } from '../../context/AppContext';
import Icon from '../Icon';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Toast from '../ui/Toast';
import Spinner from '../ui/Spinner';
import { analyzeInventoryFile } from '../../services/geminiService';
import { doc, setDoc, collection, query, where, getDocs, orderBy, updateDoc, onSnapshot, addDoc, increment, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { uploadWithQuotaCheck, safeStoragePath } from '../../services/storageQuotaService';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Spreadsheet } from '../../types';
import DriveFilePicker from '../ui/DriveFilePicker';
import { constructPOSReceiptEmailHtml } from '../../utils/emailTemplates';

export interface POSProduct {
    id: string;
    name: string;
    price: number;
    stock: number;
    category: string;
    imageUrl?: string;
}

export interface POSCartItem extends POSProduct {
    quantity: number;
}

export interface HeldOrder {
    id: string;
    name?: string;
    cart: POSCartItem[];
    time: string;
}

export default function SmartPOS({ projectId }: { projectId: string }) {
    const { 
        projects, updateProject, userProfile, setToastNotification, 
        userUsage, updateUserUsage, checkAndConsumeLimit, setNewTaskModalOpen,
        setCurrentView, setSelectedProjectId, setDeepLinkTarget,
        isFullScreenActive, setIsFullScreenActive, setMailDraft, authLoading
    } = useContext(AppContext);
    const project = projects.find(p => p.id === projectId);
    
    const [products, setProducts] = useState<POSProduct[]>([]);
    const [cart, setCart] = useState<POSCartItem[]>([]);
    const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
    const [categories, setCategories] = useState<string[]>(['Todas']);
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    
    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [isHeldOrdersModalOpen, setIsHeldOrdersModalOpen] = useState(false);
    
    const [applyTax, setApplyTax] = useState(false);
    const [taxRate, setTaxRate] = useState(15);
    const [discount, setDiscount] = useState(0);
    
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
    const [cashGiven, setCashGiven] = useState<string>('');
    const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '' });
    const [tipPercentage, setTipPercentage] = useState<number>(0);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [paymentLink, setPaymentLink] = useState('');
    
    // New features state
    const [isHoldNameModalOpen, setIsHoldNameModalOpen] = useState(false);
    const [holdOrderName, setHoldOrderName] = useState('');
    const [selectedTableIndex, setSelectedTableIndex] = useState<number | null>(null);
    
    const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
    const [customItem, setCustomItem] = useState({ name: '', price: '' });
    
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [receiptHistory, setReceiptHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [historySearch, setHistorySearch] = useState('');
    
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<any>(null);
    const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
    const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>('');
    const [isImportPreviewModalOpen, setIsImportPreviewModalOpen] = useState(false);
    const [importedProducts, setImportedProducts] = useState<POSProduct[]>([]);
    const [importSpreadsheet, setImportSpreadsheet] = useState<Spreadsheet | null>(null);
    const [columnMapping, setColumnMapping] = useState<{name: string, price: string, stock: string, category: string}>({name: '', price: '', stock: '', category: ''});
    const [isTablesModalOpen, setIsTablesModalOpen] = useState(false);
    const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
    const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
    const [isQuotationsModalOpen, setIsQuotationsModalOpen] = useState(false);
    const [customTableNames, setCustomTableNames] = useState<Record<number, string>>({});
    const [tableCount, setTableCount] = useState<number>(12);
    const [isRenameTableModalOpen, setIsRenameTableModalOpen] = useState(false);
    const [tableToRename, setTableToRename] = useState<{index: number, currentName: string, orderId?: string} | null>(null);
    const [newTableName, setNewTableName] = useState('');
    const [businessType, setBusinessType] = useState<'general' | 'restaurant' | 'retail' | 'services' | 'hotel' | 'construction'>('general');
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products');
    
    // Register Management
    const [activeRegisterId, setActiveRegisterId] = useState<string | null>(null);
    const [openRegistersCount, setOpenRegistersCount] = useState<number>(0);
    const [isOpeningRegister, setIsOpeningRegister] = useState(false);
    const [isClosingRegister, setIsClosingRegister] = useState(false);
    const [startingCash, setStartingCash] = useState('');
    const [closingCash, setClosingCash] = useState('');
    const [registerData, setRegisterData] = useState<any>(null);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
    
    // Inventory UI States
    const [isSavingInventory, setIsSavingInventory] = useState(false);
    const [inventorySavedMessage, setInventorySavedMessage] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
    
    // Manual Product Form
    const [newProduct, setNewProduct] = useState<Partial<POSProduct>>({ name: '', price: 0, stock: 1, category: 'General' });
    const [newProductImage, setNewProductImage] = useState<File | null>(null);
    const [newProductImageUrl, setNewProductImageUrl] = useState<string | null>(null);
    const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<POSProduct | null>(null);
    const [editingProductImage, setEditingProductImage] = useState<File | null>(null);

    // Previews for photos
    useEffect(() => {
        if (!newProductImage) {
            setPreviewUrl(null);
            return;
        }
        const objectUrl = URL.createObjectURL(newProductImage);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [newProductImage]);

    useEffect(() => {
        if (!editingProductImage) {
            setEditPreviewUrl(null);
            return;
        }
        const objectUrl = URL.createObjectURL(editingProductImage);
        setEditPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [editingProductImage]);

    useEffect(() => {
        if (project?.metadata) {
            const meta = project.metadata as any;
            if (meta.posProducts) setProducts(meta.posProducts);
            if (meta.posPaymentLink) setPaymentLink(meta.posPaymentLink);
            if (meta.posBusinessType) setBusinessType(meta.posBusinessType);
            if (meta.posTableNames) setCustomTableNames(meta.posTableNames);
            if (meta.posTableCount) setTableCount(meta.posTableCount);
        }
    }, [project]);

    // Offline mode tracking
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Load offline queue
        const savedQueue = localStorage.getItem(`pos_offline_queue_${projectId}`);
        if (savedQueue) {
            try {
                setOfflineQueue(JSON.parse(savedQueue));
            } catch (e) {}
        }
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [projectId]);

    // Sync offline queue when coming back online
    useEffect(() => {
        if (!isOffline && offlineQueue.length > 0) {
            syncOfflineQueue();
        }
    }, [isOffline, offlineQueue]);

    const syncOfflineQueue = async () => {
        if (!project || offlineQueue.length === 0) return;
        
        const currentQueue = [...offlineQueue];
        setOfflineQueue([]);
        localStorage.removeItem(`pos_offline_queue_${projectId}`);
        
        let successCount = 0;
        let totalIncomeToAdd = 0;
        const newTransactions: any[] = [];
        
        for (const item of currentQueue) {
            try {
                if (item.type === 'receipt') {
                    const receiptData = item.data;
                    await setDoc(doc(db, 'receipts', receiptData.id), receiptData);
                    
                    // Prepare transaction for project finances
                    const newTransaction = {
                        id: `pos-sync-${Date.now()}-${uuidv4().slice(0, 4)}`,
                        type: 'income' as const,
                        description: `Venta POS (Offline): ${receiptData.items.map((c: any) => `${c.quantity}x ${c.name}`).join(', ')}`,
                        amount: receiptData.total || 0,
                        taxAmount: receiptData.tax || 0,
                        date: receiptData.date || new Date().toISOString(),
                        bucket: 'VENTAS' as const,
                        isPaid: true,
                        isAutoFromCrm: true
                    };
                    
                    totalIncomeToAdd += receiptData.total;
                    newTransactions.push(newTransaction);
                    
                    // Update register totals if it was associated with one
                    if (receiptData.registerId) {
                        try {
                            await updateDoc(doc(db, 'posRegisters', receiptData.registerId), {
                                totalSales: increment(receiptData.total),
                                cashSales: receiptData.paymentMethod === 'cash' ? increment(receiptData.total) : increment(0),
                                cardSales: receiptData.paymentMethod === 'card' ? increment(receiptData.total) : increment(0)
                            });
                        } catch (regError) {
                            console.error("Error updating register for offline receipt", regError);
                            // We don't fail the whole sync if register update fails, as the receipt is saved
                        }
                    }
                }
                successCount++;
            } catch (e) {
                console.error("Error syncing item", e);
                // Put back in queue if failed
                setOfflineQueue(prev => {
                    const newQueue = [...prev, item];
                    localStorage.setItem(`pos_offline_queue_${projectId}`, JSON.stringify(newQueue));
                    return newQueue;
                });
            }
        }
        
        // Batch update project finances
        if (newTransactions.length > 0) {
            try {
                // Fetch latest project data to avoid overwriting recent changes
                const projectRef = doc(db, 'projects', project.id);
                const projectSnap = await getDoc(projectRef);
                
                if (projectSnap.exists()) {
                    const latestProjectData = projectSnap.data();
                    const currentFinances = latestProjectData.finances || { income: 0, expenses: 0, transactions: [] };
                    
                    const updatedFinances = {
                        ...currentFinances,
                        income: (currentFinances.income || 0) + totalIncomeToAdd,
                        transactions: [...newTransactions, ...(currentFinances.transactions || [])]
                    };
                    
                    await updateDoc(projectRef, { finances: updatedFinances });
                }
            } catch (finError) {
                console.error("Error updating project finances during sync", finError);
            }
        }
        
        if (successCount > 0) {
            setToastNotification({ title: 'Sincronización', message: `${successCount} ventas sincronizadas.`, icon: 'cloud-check' });
        }
    };

    // Track open registers
    useEffect(() => {
        if (!project) return;
        const q = query(collection(db, 'posRegisters'), where('projectId', '==', project.id), where('status', '==', 'open'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOpenRegistersCount(snapshot.docs.length);
            
            // Check if current user has an open register
            if (userProfile) {
                const myRegister = snapshot.docs.find(d => d.data().openedBy === userProfile.uid);
                if (myRegister) {
                    setActiveRegisterId(myRegister.id);
                    setRegisterData({ id: myRegister.id, ...myRegister.data() });
                } else {
                    setActiveRegisterId(null);
                    setRegisterData(null);
                }
            }
        });
        return () => unsubscribe();
    }, [project, userProfile]);

    const handleOpenRegister = async () => {
        if (!project || !userProfile) return;
        
        // Check limits
        const plan = userProfile.plan || 'free';
        const limits = { free: 1, pro: 3, premium: 10 };
        const maxRegisters = limits[plan as keyof typeof limits] || 1;
        
        if (openRegistersCount >= maxRegisters) {
            setToastNotification({ title: 'Límite Alcanzado', message: `Tu plan ${plan.toUpperCase()} permite máximo ${maxRegisters} cajas abiertas simultáneamente.`, icon: 'close' });
            return;
        }

        const startAmount = Number(startingCash) || 0;
        
        try {
            const newRegister = {
                projectId: project.id,
                openedBy: userProfile.uid,
                openedByName: userProfile.name || 'Usuario',
                openedAt: new Date().toISOString(),
                startingCash: startAmount,
                status: 'open',
                cashSales: 0,
                cardSales: 0,
                totalSales: 0
            };
            
            await addDoc(collection(db, 'posRegisters'), newRegister);
            setIsOpeningRegister(false);
            setStartingCash('');
            setToastNotification({ title: 'Caja Abierta', message: 'Puedes comenzar a cobrar.', icon: 'check' });
        } catch (error) {
            console.error("Error opening register", error);
            setToastNotification({ title: 'Error', message: 'No se pudo abrir la caja.', icon: 'close' });
        }
    };

    const handleCloseRegister = async () => {
        if (!project || !activeRegisterId || !registerData || !userProfile) return;
        
        const closeAmount = Number(closingCash) || 0;
        const expectedCash = registerData.startingCash + (registerData.cashSales || 0);
        const discrepancy = closeAmount - expectedCash;
        
        try {
            // Update register document
            await updateDoc(doc(db, 'posRegisters', activeRegisterId), {
                status: 'closed',
                closedAt: new Date().toISOString(),
                expectedCash,
                actualCash: closeAmount,
                discrepancy
            });
            
            // Generate Z-Report Note
            const reportContent = `
<h1 style="color: #4c1d95; font-weight: 900; font-size: 2.2rem; margin-top: 1.5rem; border-left: 6px solid #4c1d95; padding-left: 15px;">Corte Z - Caja</h1>
<p><strong>Fecha de Apertura:</strong> ${new Date(registerData.openedAt).toLocaleString()}</p>
<p><strong>Fecha de Cierre:</strong> ${new Date().toLocaleString()}</p>
<p><strong>Cajero:</strong> ${registerData.openedByName}</p>

<h2 style="color: #4c1d95; font-weight: 800; font-size: 1.8rem; margin-top: 1.2rem; border-bottom: 2px solid rgba(76, 29, 149, 0.15); padding-bottom: 5px;">Resumen de Efectivo</h2>
<ul>
<li><strong>Fondo Inicial:</strong> $${registerData.startingCash.toFixed(2)}</li>
<li><strong>Ventas en Efectivo:</strong> $${(registerData.cashSales || 0).toFixed(2)}</li>
<li><strong>Efectivo Esperado:</strong> $${expectedCash.toFixed(2)}</li>
<li><strong>Efectivo Real en Caja:</strong> $${closeAmount.toFixed(2)}</li>
<li><strong>Descuadre:</strong> $${discrepancy.toFixed(2)} ${discrepancy === 0 ? '✅' : discrepancy > 0 ? '⚠️ (Sobrante)' : '❌ (Faltante)'}</li>
</ul>

<h2 style="color: #4c1d95; font-weight: 800; font-size: 1.8rem; margin-top: 1.2rem; border-bottom: 2px solid rgba(76, 29, 149, 0.15); padding-bottom: 5px;">Resumen de Ventas</h2>
<ul>
<li><strong>Ventas con Tarjeta:</strong> $${(registerData.cardSales || 0).toFixed(2)}</li>
<li><strong>Ventas Totales:</strong> $${(registerData.totalSales || 0).toFixed(2)}</li>
</ul>
            `.trim();
            
            const newNote = {
                id: uuidv4(),
                title: `Corte Z - ${new Date().toLocaleDateString()}`,
                content: reportContent,
                createdAt: new Date().toISOString()
            };
            
            const updatedNotes = [newNote, ...(project.notes || [])];
            await updateProject(project.id, { notes: updatedNotes });
            
            // Send notification to project owner
            if (project.ownerId !== userProfile.uid) {
                await addDoc(collection(db, 'notifications'), {
                    userId: project.ownerId,
                    type: 'general',
                    text: `Caja cerrada por ${userProfile.name || 'Usuario'}. Total vendido: $${(registerData.totalSales || 0).toFixed(2)}. Descuadre: $${discrepancy.toFixed(2)}. Revisa las notas del proyecto.`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    link: `projects/${project.id}/notes`
                });
            }
            
            setIsClosingRegister(false);
            setClosingCash('');
            setActiveRegisterId(null);
            setRegisterData(null);
            setToastNotification({ title: 'Caja Cerrada', message: 'El reporte Z se ha guardado en las notas del proyecto.', icon: 'check' });
        } catch (error) {
            console.error("Error closing register", error);
            setToastNotification({ title: 'Error', message: 'No se pudo cerrar la caja.', icon: 'close' });
        }
    };

    const saveBusinessType = async (type: string) => {
        if (!project) return;
        setBusinessType(type as any);
        const updatedMetadata = { ...project.metadata, posBusinessType: type };
        await updateProject(project.id, { metadata: updatedMetadata });
        setToastNotification({ title: 'Configuración Guardada', message: `Tipo de negocio actualizado a ${type}.`, icon: 'check' });
    };

    const handleRenameTableSubmit = async () => {
        if (!tableToRename || !newTableName.trim() || !project) return;
        
        const updatedNames = { ...customTableNames, [tableToRename.index]: newTableName.trim() };
        setCustomTableNames(updatedNames);
        
        const updatedMetadata = { ...project.metadata, posTableNames: updatedNames };
        await updateProject(project.id, { metadata: updatedMetadata });
        
        if (tableToRename.orderId) {
            const updatedOrders = heldOrders.map(o => o.id === tableToRename.orderId ? { ...o, name: newTableName.trim() } : o);
            setHeldOrders(updatedOrders);
        }
        
        setIsRenameTableModalOpen(false);
        setTableToRename(null);
        setNewTableName('');
        setToastNotification({ title: 'Nombre Actualizado', message: `El nombre ha sido cambiado a ${newTableName.trim()}.`, icon: 'check' });
    };

    const handleAddTable = async () => {
        if (!project) return;
        const newCount = tableCount + 1;
        setTableCount(newCount);
        const updatedMetadata = { ...project.metadata, posTableCount: newCount };
        await updateProject(project.id, { metadata: updatedMetadata });
        setToastNotification({ title: 'Agregado', message: businessType === 'hotel' ? 'Habitación agregada.' : 'Mesa agregada.', icon: 'plus' });
    };

    useEffect(() => {
        const cats = Array.from(new Set(products.map(p => p.category || 'General')));
        const filteredCats = cats.length === 1 && cats[0] === 'General' ? [] : cats;
        setCategories(['Todas', ...filteredCats]);
    }, [products]);

    const saveProducts = async (newProducts: POSProduct[]) => {
        if (!project) return;
        const safeProducts = newProducts.map(p => {
            const safeP: any = { ...p };
            Object.keys(safeP).forEach(key => {
                if (safeP[key] === undefined) {
                    delete safeP[key];
                }
            });
            return safeP;
        });
        const updatedMetadata = { ...project.metadata, posProducts: safeProducts };
        await updateProject(project.id, { metadata: updatedMetadata });
        setProducts(safeProducts);
    };

    const handleAddToCart = (product: POSProduct) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const handleRemoveFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const handleUpdateQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                const newQ = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQ };
            }
            return item;
        }));
    };

    const handleHoldOrder = () => {
        if (cart.length === 0) return;
        setIsHoldNameModalOpen(true);
    };

    const confirmHoldOrder = async () => {
        const finalName = holdOrderName || 'Sin Nombre';
        const newHeld: HeldOrder = {
            id: uuidv4(),
            name: finalName,
            cart: [...cart],
            time: new Date().toLocaleTimeString()
        };
        setHeldOrders([...heldOrders, newHeld]);
        
        if (selectedTableIndex !== null && project) {
            const updatedNames = { ...customTableNames, [selectedTableIndex]: finalName };
            setCustomTableNames(updatedNames);
            const updatedMetadata = { ...project.metadata, posTableNames: updatedNames };
            await updateProject(project.id, { metadata: updatedMetadata });
        }
        
        setCart([]);
        setHoldOrderName('');
        setSelectedTableIndex(null);
        setTipPercentage(0);
        setIsHoldNameModalOpen(false);
        setToastNotification({ title: 'Orden Pausada', message: 'La cuenta se ha guardado en espera.', icon: 'pause' });
    };

    const handleRestoreOrder = (orderId: string) => {
        const order = heldOrders.find(o => o.id === orderId);
        if (order) {
            setCart(order.cart);
            setHeldOrders(heldOrders.filter(o => o.id !== orderId));
            setIsHeldOrdersModalOpen(false);
        }
    };

    const confirmCustomItem = async (addToInventory: boolean = false) => {
        if (!customItem.name || !customItem.price) return;
        const newItem = {
            id: uuidv4(),
            name: customItem.name,
            price: Number(customItem.price),
            stock: 999,
            category: 'Manual'
        };
        handleAddToCart(newItem);
        
        if (addToInventory) {
            await saveProducts([...products, newItem]);
            setToastNotification({ title: 'Guardado', message: 'Ítem agregado al inventario principal.', icon: 'check' });
        }

        setCustomItem({ name: '', price: '' });
        setIsCustomItemModalOpen(false);
    };

    const fetchHistory = async () => {
        if (!project) return;
        setHistoryLoading(true);
        try {
            const q = query(collection(db, 'receipts'), where('projectId', '==', project.id));
            const snap = await getDocs(q);
            const history = snap.docs.map(d => d.data());
            // Sort client-side to avoid requiring a composite index in Firestore
            history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setReceiptHistory(history);
        } catch (error) {
            console.error("Error fetching history", error);
            setToastNotification({ title: 'Error', message: 'No se pudo cargar el historial.', icon: 'close' });
        } finally {
            setHistoryLoading(false);
        }
    };

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = subtotal * (discount / 100);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = applyTax ? taxableAmount * (taxRate / 100) : 0;
    const tipAmount = subtotal * (tipPercentage / 100);
    const total = taxableAmount + taxAmount + tipAmount;
    const change = cashGiven ? Number(cashGiven) - total : 0;

    const handleOpenCheckoutModal = () => {
        if (!activeRegisterId && !isOffline) {
            setToastNotification({ title: 'Caja Cerrada', message: 'Debes abrir caja para poder cobrar.', icon: 'close' });
            return;
        }
        setIsCheckoutModalOpen(true);
    };

    const handleCheckout = async () => {
        if (!project || !userProfile) return;
        if (cart.length === 0) return;
        
        if (!activeRegisterId && !isOffline) {
            setToastNotification({ title: 'Caja Cerrada', message: 'Debes abrir caja para poder cobrar.', icon: 'close' });
            return;
        }

        const receiptId = `rec-${uuidv4().split('-')[0].toUpperCase()}`;
        const newTransaction = {
            id: `pos-${Date.now()}`,
            type: 'income' as const,
            description: `Venta POS: ${cart.map(c => `${c.quantity}x ${c.name}`).join(', ')}`,
            amount: total,
            taxAmount: taxAmount,
            date: new Date().toISOString(),
            bucket: 'VENTAS' as const,
            isPaid: true,
            isAutoFromCrm: true
        };

        const currentFinances = project.finances || { income: 0, expenses: 0, transactions: [] };
        const updatedFinances = {
            ...currentFinances,
            income: (currentFinances.income || 0) + total,
            transactions: [newTransaction, ...(currentFinances.transactions || [])]
        };

        const updatedProducts = products.map(p => {
            const cartItem = cart.find(c => c.id === p.id);
            const updatedP: any = cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : { ...p };
            Object.keys(updatedP).forEach(key => {
                if (updatedP[key] === undefined) {
                    delete updatedP[key];
                }
            });
            return updatedP;
        });

        const currentMetadata = project.metadata || {};
        const updatedMetadata = { ...currentMetadata, posProducts: updatedProducts };
        
        const safeCart = cart.map(item => {
            const safeItem: any = { ...item };
            Object.keys(safeItem).forEach(key => {
                if (safeItem[key] === undefined) {
                    delete safeItem[key];
                }
            });
            return safeItem;
        });

        const receiptData = {
            id: receiptId,
            projectId: project.id,
            projectName: project.name,
            projectLogo: project.logoUrl || null,
            userId: userProfile.uid,
            date: new Date().toISOString(),
            items: safeCart,
            subtotal,
            discount,
            discountAmount,
            tax: taxAmount,
            taxRate: applyTax ? taxRate : 0,
            tipPercentage,
            tipAmount,
            total,
            paymentMethod,
            customerName: customerInfo.name || 'Consumidor Final',
            customerPhone: customerInfo.phone || '',
            customerEmail: customerInfo.email || '',
            registerId: activeRegisterId || null
        };

        try {
            if (isOffline) {
                // Queue offline
                const newQueue = [...offlineQueue, { type: 'receipt', data: receiptData }];
                setOfflineQueue(newQueue);
                localStorage.setItem(`pos_offline_queue_${projectId}`, JSON.stringify(newQueue));
                
                // Optimistically update local state
                setProducts(updatedProducts);
                // We don't update project finances or metadata locally to avoid complex sync conflicts,
                // but we could if we wanted to. For now, we'll just queue the receipt.
                
                setToastNotification({ title: 'Venta Offline', message: 'Guardada en cola. Se sincronizará al conectar.', icon: 'wifi-off' });
            } else {
                // Save receipt to root collection
                await setDoc(doc(db, 'receipts', receiptId), receiptData);

                await updateProject(project.id, { 
                    finances: updatedFinances,
                    metadata: updatedMetadata
                });
                
                // Update register totals
                if (activeRegisterId) {
                    await updateDoc(doc(db, 'posRegisters', activeRegisterId), {
                        totalSales: increment(total),
                        cashSales: paymentMethod === 'cash' ? increment(total) : increment(0),
                        cardSales: paymentMethod === 'card' ? increment(total) : increment(0)
                    });
                }

                setProducts(updatedProducts);
                setToastNotification({ title: 'Venta Completada', message: 'Recibo generado exitosamente.', icon: 'check' });

                // ENVIAR EMAIL AUTOMÁTICO AL CLIENTE (Si hay email)
                if (receiptData.customerEmail) {
                    try {
                        const htmlBody = constructPOSReceiptEmailHtml(project.name, {
                            id: receiptData.id,
                            date: receiptData.date,
                            items: receiptData.items,
                            subtotal: receiptData.subtotal,
                            tax: receiptData.tax,
                            total: receiptData.total,
                            customerName: receiptData.customerName
                        });

                        fetch('/api/pos/email-receipt', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ownerId: userProfile.uid,
                                ownerName: userProfile.name,
                                customerEmail: receiptData.customerEmail,
                                subject: `${project.name} - Recibo #${receiptData.id}`,
                                htmlBody: htmlBody
                            })
                        }).catch(err => console.error("Error async sending POS email:", err));
                    } catch (emailErr) {
                        console.error("Error constructing/queueing POS email:", emailErr);
                    }
                }
            }

            setCart([]);
            setIsCheckoutModalOpen(false);
            setCashGiven('');
            setTipPercentage(0);
            setCustomerInfo({ name: '', phone: '', email: '' });
            
            setLastReceipt(receiptData);
            setIsSuccessModalOpen(true);

        } catch (error) {
            console.error("Error saving sale", error);
            setToastNotification({ title: 'Error', message: 'No se pudo registrar la venta.', icon: 'close' });
        }
    };

    const handleDeleteProduct = async (id: string) => {
        const updatedProducts = products.filter(p => p.id !== id);
        await saveProducts(updatedProducts);
        setToastNotification({ title: 'Eliminado', message: 'Producto eliminado del inventario.', icon: 'trash' });
    };

    const saveEditedProduct = async () => {
        if (!editingProduct) return;
        
        if (!editingProduct.name) {
            setToastNotification({ title: 'Error', message: 'El nombre del producto no puede estar vacío.', icon: 'close' });
            return;
        }

        setIsSavingInventory(true);
        try {
            let imageUrl = editingProduct.imageUrl;
            
            if (editingProductImage && userProfile) {
                const uploaded = await uploadWithQuotaCheck({
                    userId: userProfile.uid,
                    data: editingProductImage,
                    sizeBytes: editingProductImage.size,
                    path: safeStoragePath('pos-images', userProfile.uid, `${Date.now()}_${editingProductImage.name}`),
                    metadata: { contentType: editingProductImage.type || 'application/octet-stream' },
                    plan: userProfile.plan
                });
                imageUrl = uploaded.url;
            }

            const updatedProduct = { ...editingProduct, imageUrl };
            const updatedProducts = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
            await saveProducts(updatedProducts);
            setEditingProduct(null);
            setEditingProductImage(null);
            setInventorySavedMessage("¡Producto actualizado!");
            setTimeout(() => setInventorySavedMessage(null), 3000);
        } catch (error) {
            console.error("Error saving edited product:", error);
            setToastNotification({ title: 'Error', message: 'No se pudo guardar la edición.', icon: 'close' });
        } finally {
            setIsSavingInventory(false);
        }
    };

    const handleManualProductAdd = async () => {
        if (!newProduct.name) {
            setToastNotification({ title: 'Campo Requerido', message: 'Debes ingresar un nombre para el producto.', icon: 'alert-circle' });
            return;
        }
        
        setIsSavingInventory(true);
        try {
            let imageUrl = newProductImageUrl || '';
            if (newProductImage && !newProductImageUrl && userProfile) {
                const uploaded = await uploadWithQuotaCheck({
                    userId: userProfile.uid,
                    data: newProductImage,
                    sizeBytes: newProductImage.size,
                    path: safeStoragePath('pos-images', userProfile.uid, `${Date.now()}_${newProductImage.name}`),
                    metadata: { contentType: newProductImage.type || 'application/octet-stream' },
                    plan: userProfile.plan
                });
                imageUrl = uploaded.url;
            }

            const product: POSProduct = {
                id: uuidv4(),
                name: newProduct.name,
                price: Number(newProduct.price) || 0,
                stock: Number(newProduct.stock) || 0,
                category: newProduct.category || 'General',
                imageUrl
            };

            await saveProducts([...products, product]);
            setNewProduct({ name: '', price: 0, stock: 1, category: 'General' });
            setNewProductImage(null);
            setNewProductImageUrl(null);
            setInventorySavedMessage("¡Producto guardado!");
            setTimeout(() => setInventorySavedMessage(null), 3000);
        } catch (error) {
            console.error("Error adding product manually:", error);
            setToastNotification({ title: 'Error', message: 'No se pudo agregar el producto.', icon: 'close' });
        } finally {
            setIsSavingInventory(false);
        }
    };

    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                if (!results.meta.fields || results.meta.fields.length === 0) {
                    setToastNotification({ title: 'Error', message: 'El archivo CSV no tiene columnas válidas.', icon: 'close' });
                    return;
                }

                // Convert CSV to Spreadsheet format for the preview modal
                const columns = results.meta.fields.map(field => ({
                    id: `col-${uuidv4()}`,
                    name: field
                }));

                const rows = results.data.map((row: any) => {
                    return {
                        id: `row-${uuidv4()}`,
                        cells: columns.map(col => ({
                            id: `cell-${uuidv4()}`,
                            value: row[col.name] || ''
                        }))
                    };
                });

                const spreadsheet: Spreadsheet = {
                    id: `csv-${Date.now()}`,
                    title: file.name,
                    columns,
                    rows,
                    createdAt: new Date().toISOString()
                };

                // Auto-detect columns
                const nameKeywords = ['nombre', 'articulo', 'artículo', 'producto', 'item', 'cliente', 'descripcion', 'descripción'];
                const priceKeywords = ['precio', 'costo', 'valor', 'monto', 'total'];
                const stockKeywords = ['stock', 'cantidad', 'cant', 'inventario'];
                const categoryKeywords = ['categoria', 'categoría', 'tipo', 'grupo', 'familia'];

                let nameColId = '';
                let priceColId = '';
                let stockColId = '';
                let categoryColId = '';

                spreadsheet.columns.forEach(col => {
                    const lowerName = col.name.toLowerCase();
                    if (!nameColId && nameKeywords.some(k => lowerName.includes(k))) nameColId = col.id;
                    else if (!priceColId && priceKeywords.some(k => lowerName.includes(k))) priceColId = col.id;
                    else if (!stockColId && stockKeywords.some(k => lowerName.includes(k))) stockColId = col.id;
                    else if (!categoryColId && categoryKeywords.some(k => lowerName.includes(k))) categoryColId = col.id;
                });

                // Fallbacks if not found by keywords
                if (!nameColId && spreadsheet.columns.length > 0) nameColId = spreadsheet.columns[0].id;
                if (!priceColId && spreadsheet.columns.length > 1) priceColId = spreadsheet.columns[1].id;

                setImportSpreadsheet(spreadsheet);
                setColumnMapping({
                    name: nameColId,
                    price: priceColId,
                    stock: stockColId,
                    category: categoryColId
                });
                
                setIsImportPreviewModalOpen(true);
            }
        });
    };

    const handleImportFromSpreadsheet = async () => {
        if (!project || !selectedSpreadsheetId) return;
        const spreadsheet = project.spreadsheets.find(s => s.id === selectedSpreadsheetId);
        if (!spreadsheet) return;

        // Find column indices
        const nameKeywords = ['nombre', 'articulo', 'artículo', 'producto', 'item', 'cliente', 'descripcion', 'descripción'];
        const priceKeywords = ['precio', 'costo', 'valor', 'monto', 'total'];
        const stockKeywords = ['stock', 'cantidad', 'cant', 'inventario'];
        const categoryKeywords = ['categoria', 'categoría', 'tipo', 'grupo', 'familia'];

        let nameColId = '';
        let priceColId = '';
        let stockColId = '';
        let categoryColId = '';

        spreadsheet.columns.forEach(col => {
            const lowerName = col.name.toLowerCase();
            if (!nameColId && nameKeywords.some(k => lowerName.includes(k))) nameColId = col.id;
            else if (!priceColId && priceKeywords.some(k => lowerName.includes(k))) priceColId = col.id;
            else if (!stockColId && stockKeywords.some(k => lowerName.includes(k))) stockColId = col.id;
            else if (!categoryColId && categoryKeywords.some(k => lowerName.includes(k))) categoryColId = col.id;
        });

        // Fallbacks if not found by keywords
        if (!nameColId && spreadsheet.columns.length > 0) nameColId = spreadsheet.columns[0].id;
        if (!priceColId && spreadsheet.columns.length > 1) priceColId = spreadsheet.columns[1].id;

        setImportSpreadsheet(spreadsheet);
        setColumnMapping({
            name: nameColId,
            price: priceColId,
            stock: stockColId,
            category: categoryColId
        });
        
        setIsSpreadsheetModalOpen(false);
        setIsImportPreviewModalOpen(true);
    };

    const handleAIInventoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userProfile) return;

        if (userUsage && userUsage.counters.daily_chat_count >= 50) {
            setToastNotification({ title: 'Límite Alcanzado', message: 'No tienes suficientes créditos de IA.', icon: 'close' });
            return;
        }

        setIsAnalyzing(true);
        setToastNotification({ title: 'Analizando...', message: 'La IA está extrayendo los productos...', icon: 'ai', isLoading: true });

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const result = await analyzeInventoryFile(base64, file.type, 'General');
                
                if (result && result.items) {
                    const newProducts: POSProduct[] = result.items.map((item: any) => ({
                        id: uuidv4(),
                        name: item.name || 'Producto Desconocido',
                        price: item.price || 0,
                        stock: item.stock || 10,
                        category: item.category || 'General'
                    }));

                    await saveProducts([...products, ...newProducts]);
                    await updateUserUsage(userProfile.uid, 'chat');
                    setToastNotification({ title: '¡Éxito!', message: `Se agregaron ${newProducts.length} productos.`, icon: 'check' });
                } else {
                    throw new Error("No items found");
                }
                setIsAnalyzing(false);
            };
        } catch (error) {
            console.error(error);
            setToastNotification({ title: 'Error', message: 'No se pudo analizar el documento.', icon: 'close' });
            setIsAnalyzing(false);
        }
    };

    const exportInventoryToExcel = () => {
        if (products.length === 0) {
            setToastNotification({ title: 'Inventario Vacío', message: 'No hay productos para exportar.', icon: 'alert-circle' });
            return;
        }
        
        const worksheet = XLSX.utils.json_to_sheet(products.map(p => ({
            ID: p.id,
            Nombre: p.name,
            Precio: p.price,
            Stock: p.stock,
            Categoría: p.category
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
        XLSX.writeFile(workbook, `inventario_${project?.name || 'pos'}.xlsx`);
        
        setToastNotification({ 
            title: 'Exportación Exitosa', 
            message: 'El inventario ha sido exportado a Excel.', 
            icon: 'check-circle' 
        });
    };

    const handleSavePaymentLink = async () => {
        if (!project) return;
        const updatedMetadata = { ...project.metadata, posPaymentLink: paymentLink };
        await updateProject(project.id, { metadata: updatedMetadata });
        setToastNotification({ title: 'Link Guardado', message: 'Tu link de cobro se ha guardado.', icon: 'check' });
    };

    const filteredProducts = selectedCategory === 'Todas' ? products : products.filter(p => p.category === selectedCategory);

    if (authLoading || (!project && projects.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900 border-none">
                <Spinner size="lg" className="text-brand-primary mb-4" />
                <h2 className="text-xl font-black text-neutral-800 dark:text-white uppercase tracking-tighter">Cargando Smart POS...</h2>
                <p className="text-neutral-500 font-medium">Sincronizando inventario de tu proyecto</p>
            </div>
        );
    }

    if (!project) return <div className="flex items-center justify-center h-screen bg-neutral-100 dark:bg-neutral-900 text-neutral-500 font-bold uppercase tracking-widest">Proyecto no encontrado</div>;

    const filteredHistory = receiptHistory.filter(receipt => {
        if (historySearch && !receipt.customerName?.toLowerCase().includes(historySearch.toLowerCase())) {
            return false;
        }
        
        const receiptDate = new Date(receipt.date);
        const now = new Date();
        
        if (historyFilter === 'today') {
            return receiptDate.toDateString() === now.toDateString();
        } else if (historyFilter === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return receiptDate >= weekAgo;
        } else if (historyFilter === 'month') {
            return receiptDate.getMonth() === now.getMonth() && receiptDate.getFullYear() === now.getFullYear();
        }
        
        return true;
    });

    return (
        <div className="flex flex-col h-[100dvh] w-full bg-neutral-100 dark:bg-neutral-900 font-sans overflow-hidden">
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* LEFT PANEL: Products & Categories */}
                <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'products' ? 'flex' : 'hidden md:flex'}`}>
                <div className="bg-white dark:bg-dark-surface pt-2 pb-1.5 px-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-2">
                        {project.logoUrl && (
                            <img src={project.logoUrl} alt="Logo" className="h-6 w-6 object-contain rounded-lg shadow-sm" />
                        )}
                        <div>
                            <h1 className="text-base md:text-lg font-black uppercase tracking-tighter text-neutral-900 dark:text-white leading-none">{project.name} POS</h1>
                            <p className="text-[8px] md:text-[10px] text-neutral-500 uppercase font-extrabold tracking-widest mt-1">Caja Registradora Inteligente</p>
                        </div>
                        <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 border border-neutral-200 dark:border-neutral-700">
                                <select 
                                    value={businessType} 
                                    onChange={e => saveBusinessType(e.target.value)}
                                    className="bg-transparent border-none px-1 py-0.5 text-[11px] font-bold text-neutral-700 dark:text-neutral-300 outline-none cursor-pointer"
                                >
                                    <option value="general">General</option>
                                    <option value="restaurant">Restaurante / Bar</option>
                                    <option value="retail">Retail / Tienda</option>
                                    <option value="services">Servicios / Citas</option>
                                    <option value="hotel">Hotel / Hospedaje</option>
                                    <option value="construction">Ferretería / Construcción</option>
                                </select>
                                {(businessType === 'restaurant' || businessType === 'hotel') && (
                                    <button 
                                        onClick={() => setIsTablesModalOpen(true)} 
                                        className="md:hidden p-1 bg-brand-primary text-white rounded-lg transition-all shadow-sm"
                                        title={businessType === 'hotel' ? 'Habitaciones' : 'Mesas'}
                                    >
                                        <Icon name="grid" className="w-2.5 h-2.5" />
                                    </button>
                                )}
                            </div>
                            <button 
                                onClick={() => setIsFullScreenActive(!isFullScreenActive)} 
                                className={`p-1 rounded-lg transition-all flex-shrink-0 ${isFullScreenActive ? 'bg-brand-primary/10 text-brand-primary' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-brand-primary'}`}
                                title={isFullScreenActive ? "Salir de Pantalla Completa" : "Pantalla Completa"}
                            >
                                <Icon name={isFullScreenActive ? "minimize" : "maximize"} className="w-3 h-3" />
                            </button>
                            <button 
                                onClick={() => activeRegisterId ? setIsClosingRegister(true) : setIsOpeningRegister(true)} 
                                className={`p-1 rounded-lg transition-all flex-shrink-0 ${!activeRegisterId ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}
                                title={activeRegisterId ? "Cerrar Caja" : "Abrir Caja"}
                            >
                                <Icon name={!activeRegisterId ? "unlock" : "lock"} className="w-3 h-3" />
                            </button>
                            <button onClick={() => setIsInfoModalOpen(true)} className="p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-brand-primary rounded-lg transition-all flex-shrink-0">
                                <Icon name="info" className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-1 mt-2 lg:mt-0 hidden md:flex">
                        {(businessType === 'restaurant' || businessType === 'hotel') && (
                            <button onClick={() => setIsTablesModalOpen(true)} className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded-lg font-black uppercase tracking-widest text-[8px] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all">
                                <Icon name="grid" className="w-3 h-3" /> {businessType === 'hotel' ? 'Habitaciones' : 'Mesas'}
                            </button>
                        )}
                        {businessType === 'retail' && (
                            <button onClick={() => setIsScannerModalOpen(true)} className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded-lg font-black uppercase tracking-widest text-[8px] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all">
                                <Icon name="maximize" className="w-3 h-3" /> Escáner
                            </button>
                        )}
                        {businessType === 'services' && (
                            <button onClick={() => {
                                window.open('/#globalCalendar', '_blank');
                            }} className="flex items-center gap-1 bg-brand-primary text-white px-2 py-1 rounded-lg font-black uppercase tracking-widest text-[8px] shadow-lg shadow-brand-primary/20 hover:scale-105 transition-transform">
                                <Icon name="calendar" className="w-3 h-3" /> Agenda
                            </button>
                        )}
                    </div>
                </div>

                {/* Categories and View Toggle */}
                <div className="flex items-center justify-between py-1 px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-dark-surface">
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                        {categories.length > 1 && (
                            <div className="flex gap-1 overflow-x-auto whitespace-nowrap hide-scrollbar py-0.5">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-md scale-105' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-1 md:gap-2 md:ml-3 ml-1 flex-shrink-0">
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => { fetchHistory(); setIsHistoryModalOpen(true); }} className="flex items-center gap-1 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-2 py-1 rounded-lg font-bold uppercase tracking-wider text-[10px] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 transition-all">
                                <Icon name="list" className="w-3 h-3" /> <span className="hidden sm:inline">Historial</span>
                            </button>
                            <button onClick={() => setIsHeldOrdersModalOpen(true)} className="flex items-center gap-1 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-2 py-1 rounded-lg font-bold uppercase tracking-wider text-[10px] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 transition-all">
                                <Icon name="clock" className="w-3 h-3" /> <span className="hidden sm:inline">Pausadas</span> ({heldOrders.length})
                            </button>
                            <button onClick={() => setIsInventoryModalOpen(true)} className="flex items-center gap-1 bg-brand-primary/10 text-brand-primary px-2 py-1 rounded-lg font-bold uppercase tracking-wider text-[10px] border border-brand-primary/20 hover:bg-brand-primary/20 transition-all">
                                <Icon name="box" className="w-3 h-3" /> <span className="hidden sm:inline">Inventario</span>
                            </button>
                        </div>

                        <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 border border-neutral-200 dark:border-neutral-700 shadow-inner flex-shrink-0">
                            <button 
                                onClick={() => setViewMode('grid')}
                                className={`p-0.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'}`}
                            >
                                <Icon name="grid" className="w-3 h-3" />
                            </button>
                            <button 
                                onClick={() => setViewMode('list')}
                                className={`p-0.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'}`}
                            >
                                <Icon name="list" className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Product Grid/List */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" : "flex flex-col gap-4"}>
                        {filteredProducts.map(product => (
                            viewMode === 'grid' ? (
                                <div 
                                    key={product.id} 
                                    onClick={() => handleAddToCart(product)}
                                    className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden shadow-sm border border-neutral-200 dark:border-neutral-800 cursor-pointer hover:shadow-xl hover:border-brand-primary/50 transition-all transform hover:-translate-y-1 group flex flex-col"
                                >
                                    <div className="h-32 md:h-36 bg-neutral-100 dark:bg-neutral-800 relative">
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-300 dark:text-neutral-700">
                                                <Icon name="image" className="w-8 h-8" />
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 bg-white/95 dark:bg-black/95 backdrop-blur-md px-2 py-1 rounded-lg text-[9px] font-black shadow-sm">
                                            STOCK: {product.stock}
                                        </div>
                                    </div>
                                    <div className="p-4 flex-1 flex flex-col justify-between">
                                        <h3 className="text-sm font-black text-neutral-900 dark:text-neutral-100 leading-tight mb-2 group-hover:text-brand-primary transition-colors tracking-tight uppercase">{product.name}</h3>
                                        <p className="text-lg font-black text-brand-primary tracking-tighter">${product.price.toFixed(2)}</p>
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    key={product.id} 
                                    onClick={() => handleAddToCart(product)}
                                    className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden shadow-sm border border-neutral-200 dark:border-neutral-800 cursor-pointer hover:border-brand-primary/50 transition-all flex items-center p-3 group"
                                >
                                    <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 rounded-xl overflow-hidden flex-shrink-0 relative">
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-300 dark:text-neutral-700">
                                                <Icon name="image" className="w-8 h-8" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-6 flex-1">
                                        <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100 group-hover:text-brand-primary transition-colors uppercase tracking-tight">{product.name}</h3>
                                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mt-1">Existencias: {product.stock} • Categoría: {product.category || 'General'}</p>
                                    </div>
                                    <div className="pr-6">
                                        <p className="text-xl font-black text-brand-primary tracking-tighter">${product.price.toFixed(2)}</p>
                                    </div>
                                </div>
                            )
                        ))}
                        {filteredProducts.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center h-64 text-neutral-400">
                                <Icon name="box" className="w-12 h-12 mb-4 opacity-50" />
                                <p className="font-bold uppercase tracking-widest text-sm">No hay productos</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

                {/* RIGHT PANEL: Cart & Checkout */}
                <div className={`w-full md:w-[450px] xl:w-[500px] bg-white dark:bg-dark-surface border-l border-neutral-200 dark:border-neutral-800 flex flex-col z-20 shadow-2xl ${activeTab === 'cart' ? 'flex' : 'hidden md:flex'} md:relative md:h-auto overflow-hidden`}>
                    <div className="pt-4 pb-3 px-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex-shrink-0">
                        <h2 className="text-sm font-black uppercase tracking-tighter text-neutral-900 dark:text-white flex items-center">
                            <Icon name="shopping-cart" className="w-4 h-4 mr-2 text-brand-primary" /> Cuenta Actual
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {cart.length === 0 && (
                            <button onClick={() => setIsCustomItemModalOpen(true)} className="w-full py-2 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 hover:text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5 transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest mb-3">
                                <Icon name="plus" className="w-3.5 h-3.5" /> Ítem Rápido
                            </button>
                        )}
                        {cart.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-lg border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                <div className="flex-1">
                                    <h4 className="text-[11px] font-black text-neutral-800 dark:text-neutral-200 line-clamp-1 uppercase tracking-tight">{item.name}</h4>
                                    <p className="text-[11px] text-brand-primary font-black mt-0.5">${item.price.toFixed(2)}</p>
                                </div>
                                <div className="flex items-center gap-1.5 bg-white dark:bg-dark-surface rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 shadow-sm">
                                    <button onClick={() => handleUpdateQuantity(item.id, -1)} className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors">
                                        <Icon name="minus" className="w-3 h-3" />
                                    </button>
                                    <span className="text-[10px] font-black w-4 text-center">{item.quantity}</span>
                                    <button onClick={() => handleUpdateQuantity(item.id, 1)} className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors">
                                        <Icon name="plus" className="w-3 h-3" />
                                    </button>
                                </div>
                                <button onClick={() => handleRemoveFromCart(item.id)} className="ml-1.5 text-red-400 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                                    <Icon name="trash" className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {cart.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-400 opacity-30 py-12">
                                <Icon name="shopping-cart" className="w-12 h-12 mb-2" />
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Carrito Vacío</p>
                            </div>
                        )}
                        {cart.length > 0 && (
                            <button onClick={() => setIsCustomItemModalOpen(true)} className="w-full py-2 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 hover:text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5 transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest mt-3">
                                <Icon name="plus" className="w-3.5 h-3.5" /> Ítem Rápido
                            </button>
                        )}
                    </div>

                <div className="p-3 md:p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 space-y-1 md:space-y-1.5 flex-shrink-0">
                    <div className="flex justify-between text-[9px] md:text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                        <div className="flex justify-between text-[9px] md:text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                            <span>Descuento ({discount}%)</span>
                            <span>-${discountAmount.toFixed(2)}</span>
                        </div>
                    )}
                    {applyTax && (
                        <div className="flex justify-between text-[9px] md:text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                            <span>Impuestos ({taxRate}%)</span>
                            <span>${taxAmount.toFixed(2)}</span>
                        </div>
                    )}
                    {tipPercentage > 0 && (
                        <div className="flex justify-between text-[9px] md:text-[10px] font-bold text-brand-primary uppercase tracking-wider">
                            <span>Propina ({tipPercentage}%)</span>
                            <span>${tipAmount.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-base md:text-xl font-black text-neutral-900 dark:text-white pt-1 md:pt-2 border-t border-neutral-200 dark:border-neutral-700 tracking-tighter">
                        <span>TOTAL</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="p-3 md:p-4 grid grid-cols-2 gap-2 flex-shrink-0">
                    <Button 
                        onClick={handleHoldOrder} 
                        disabled={cart.length === 0} 
                        className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-none font-black uppercase tracking-widest text-[9px] py-2.5 rounded-lg shadow-md hover:bg-brand-primary dark:hover:bg-brand-primary hover:text-white dark:hover:text-white hover:scale-[1.03] transition-all"
                    >
                        <Icon name="pause" className="w-3.5 h-3.5 mr-1" /> Pausar
                    </Button>
                    <Button onClick={handleOpenCheckoutModal} disabled={cart.length === 0} className="bg-brand-primary text-white border-none font-black uppercase tracking-widest text-[10px] py-2.5 rounded-lg shadow-lg shadow-brand-primary/30 hover:scale-[1.03] transition-transform">
                        Cobrar <Icon name="chevron-right" className="w-3.5 h-3.5 ml-1" />
                    </Button>
                </div>
                
                {/* Goatify Branding */}
                <div className="py-4 text-center border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hidden md:block">
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                        Solución desarrollada por <a href="https://www.goatify.app" target="_blank" rel="noopener noreferrer" className="text-brand-primary font-black hover:underline">Goatify</a>
                    </p>
                </div>
            </div>
        </div>

        {/* MOBILE NAVIGATION */}
        <div className="md:hidden bg-white dark:bg-dark-surface border-t border-neutral-200 dark:border-neutral-800 flex justify-around p-2 pb-safe z-50 flex-shrink-0">
            <button 
                onClick={() => setActiveTab('products')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'products' ? 'text-brand-primary' : 'text-neutral-400'}`}
            >
                <Icon name="grid" className="w-6 h-6" />
                <span className="text-[9px] font-black uppercase tracking-widest">Productos</span>
            </button>
            <button 
                onClick={() => setActiveTab('cart')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'cart' ? 'text-brand-primary' : 'text-neutral-400'}`}
            >
                <div className="relative">
                    <Icon name="shopping-cart" className="w-6 h-6" />
                    {cart.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-brand-primary text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                            {cart.length}
                        </span>
                    )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest">Carrito</span>
            </button>
        </div>

        {/* MODALS */}

            {/* Inventory Modal */}
            <Modal isOpen={isInventoryModalOpen} onClose={() => setIsInventoryModalOpen(false)} title="Gestión de Inventario" className="max-w-[95vw] lg:max-w-[1200px]">
                <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
                    {/* Manual Add - Horizontal Card */}
                    <div className="bg-neutral-50 dark:bg-neutral-800/50 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center text-brand-primary">
                            <Icon name="plus" className="w-4 h-4 mr-2"/> Agregar Nuevo Producto
                        </h3>
                        <div className="flex flex-col lg:flex-row gap-4 items-end">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                <Input label="Nombre / Artículo" placeholder="Ej: Producto A" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="h-10 text-xs" />
                                <Input label="Precio ($)" placeholder="0.00" type="number" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} className="h-10 text-xs" />
                                <Input label="Stock" placeholder="0" type="number" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: Number(e.target.value)})} className="h-10 text-xs" />
                                <Input label="Categoría" placeholder="General" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="h-10 text-xs" />
                            </div>
                            <div className="w-full lg:w-auto flex gap-2">
                                <div className="flex-1 lg:w-64">
                                    <div className="flex gap-2 items-center">
                                        <input type="file" id="inventory-file" accept="image/*" onChange={e => { setNewProductImage(e.target.files?.[0] || null); setNewProductImageUrl(null); }} className="hidden" />
                                        <label htmlFor="inventory-file" className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-2 text-[10px] font-bold cursor-pointer hover:bg-neutral-50 transition-colors">
                                            {previewUrl ? (
                                                <div className="w-6 h-6 rounded-md overflow-hidden bg-neutral-100 flex-shrink-0">
                                                    <img src={previewUrl} className="w-full h-full object-cover" alt="Pre" />
                                                </div>
                                            ) : (
                                                <Icon name="image" className="w-4 h-4" />
                                            )} 
                                            {newProductImage ? 'Cambiar Foto' : 'Subir Foto'}
                                        </label>
                                        <Button onClick={() => setIsDrivePickerOpen(true)} className="bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-none font-bold uppercase tracking-wider text-[10px] h-10 px-4">
                                            <Icon name="folder" className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    {newProductImageUrl && <p className="text-[9px] text-emerald-500 mt-1 font-bold flex items-center"><Icon name="check" className="w-3 h-3 mr-1"/> Drive OK</p>}
                                </div>
                                <div className="flex flex-col items-end">
                                    <Button 
                                        onClick={handleManualProductAdd} 
                                        disabled={isSavingInventory}
                                        className="bg-brand-primary text-white font-black uppercase tracking-widest text-[10px] h-10 px-8 shadow-lg shadow-brand-primary/20 flex items-center gap-2"
                                    >
                                        {isSavingInventory ? <Spinner size="sm" /> : null}
                                        {isSavingInventory ? 'Guardando...' : 'Guardar'}
                                    </Button>
                                    {inventorySavedMessage && (
                                        <span className="text-[10px] font-black text-emerald-500 mt-1 uppercase tracking-widest animate-pulse">
                                            {inventorySavedMessage}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Product List for Editing */}
                        <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col h-full">
                            <h3 className="text-sm font-black uppercase tracking-widest mb-8 flex items-center text-neutral-900 dark:text-white">
                                <Icon name="edit" className="w-5 h-5 mr-3 text-brand-primary"/> Gestión de Inventario
                            </h3>
                            <div className="space-y-4 overflow-y-auto pr-3 flex-1 max-h-[600px]">
                                {products.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                                        <Icon name="box" className="w-16 h-16 mb-4 opacity-20" />
                                        <p className="text-xs font-black uppercase tracking-widest">Sin productos</p>
                                    </div>
                                ) : (
                                    products.map(p => (
                                        <div key={p.id} className="flex flex-col p-6 bg-neutral-50 dark:bg-neutral-800/50 rounded-3xl border border-neutral-100 dark:border-neutral-800 hover:border-brand-primary/30 transition-all group gap-4">
                                            <div className="flex items-center justify-between">
                                                {editingProduct?.id === p.id ? (
                                                    <div className="flex-1 space-y-4 mr-6">
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[11px] font-black text-neutral-500 uppercase tracking-wider">Nombre del Producto</label>
                                                                <input className="w-full bg-white dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 text-sm font-bold focus:border-brand-primary outline-none transition-all" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} placeholder="Nombre" />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[11px] font-black text-neutral-500 uppercase tracking-wider">Precio Unitario ($)</label>
                                                                <input className="w-full bg-white dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 text-sm font-bold focus:border-brand-primary outline-none transition-all" type="number" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: Number(e.target.value)})} placeholder="Precio" />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[11px] font-black text-neutral-500 uppercase tracking-wider">Stock Actual</label>
                                                                <input className="w-full bg-white dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 text-sm font-bold focus:border-brand-primary outline-none transition-all" type="number" value={editingProduct.stock} onChange={e => setEditingProduct({...editingProduct, stock: Number(e.target.value)})} placeholder="Stock" />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[11px] font-black text-neutral-500 uppercase tracking-wider">Categoría</label>
                                                                <input className="w-full bg-white dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 text-sm font-bold focus:border-brand-primary outline-none transition-all" value={editingProduct.category || ''} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} placeholder="Categoría" />
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="space-y-3">
                                                            <label className="text-[11px] font-black text-neutral-500 uppercase tracking-wider">Imagen del Producto / Miniatura</label>
                                                            <div className="flex gap-4 items-center">
                                                                <input 
                                                                    type="file" 
                                                                    id={`edit-file-${p.id}`} 
                                                                    accept="image/*" 
                                                                    onChange={e => setEditingProductImage(e.target.files?.[0] || null)} 
                                                                    className="hidden" 
                                                                />
                                                                <label htmlFor={`edit-file-${p.id}`} className="flex-1 flex items-center justify-center gap-3 bg-white dark:bg-neutral-900 border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-2xl px-6 py-4 text-xs font-bold cursor-pointer hover:border-brand-primary hover:text-brand-primary transition-all">
                                                                    {editPreviewUrl ? (
                                                                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md">
                                                                            <img src={editPreviewUrl} className="w-full h-full object-cover" alt="Edit" />
                                                                        </div>
                                                                    ) : (
                                                                        <Icon name="image" className="w-5 h-5" />
                                                                    )}
                                                                    {editingProductImage ? 'Foto Nueva Lista' : 'Seleccionar Nueva Foto'}
                                                                </label>
                                                                {editingProduct.imageUrl && !editingProductImage && (
                                                                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-neutral-200 shadow-sm">
                                                                        <img src={editingProduct.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-6 flex-1">
                                                        <div className="w-20 h-20 bg-neutral-200 dark:bg-neutral-800 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center shadow-inner border border-neutral-200 dark:border-neutral-700">
                                                            {p.imageUrl ? (
                                                                <img src={p.imageUrl} className="w-full h-full object-cover" alt={p.name} />
                                                            ) : (
                                                                <Icon name="image" className="w-8 h-8 text-neutral-400" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-base font-black text-neutral-900 dark:text-white uppercase tracking-tighter leading-none">{p.name}</p>
                                                            <p className="text-xs font-bold text-neutral-500 mt-2 flex items-center gap-2">
                                                                <span className="text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full text-[10px] font-black tracking-widest">${p.price.toFixed(2)}</span>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300"></span>
                                                                Stock: {p.stock}
                                                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300"></span>
                                                                {p.category || 'General'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex gap-2">
                                                    {editingProduct?.id === p.id ? (
                                                        <div className="flex flex-col gap-2 items-end">
                                                            <div className="flex gap-2">
                                                                <button 
                                                                    onClick={saveEditedProduct} 
                                                                    disabled={isSavingInventory}
                                                                    className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                                                                >
                                                                    {isSavingInventory ? <Spinner size="sm" /> : <Icon name="check" className="w-4 h-4" />}
                                                                    {isSavingInventory && <span className="text-[10px] font-black uppercase">Guardando...</span>}
                                                                </button>
                                                                <button onClick={() => { setEditingProduct(null); setEditingProductImage(null); }} className="p-3 bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-xl hover:bg-neutral-300 shadow-sm transition-all"><Icon name="close" className="w-4 h-4" /></button>
                                                            </div>
                                                            {inventorySavedMessage && (
                                                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest animate-pulse whitespace-nowrap bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-800">
                                                                    {inventorySavedMessage}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => setEditingProduct(p)} className="p-3 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 rounded-xl hover:bg-brand-primary hover:text-white transition-all shadow-sm border border-neutral-200 dark:border-neutral-700"><Icon name="edit" className="w-4 h-4" /></button>
                                                    )}
                                                    {editingProduct?.id !== p.id && (
                                                        <button onClick={() => handleDeleteProduct(p.id)} className="p-3 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm border border-neutral-200 dark:border-neutral-700"><Icon name="trash" className="w-4 h-4" /></button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right Column: Bulk & AI & Export */}
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 flex flex-col items-center text-center group hover:border-emerald-500 transition-all">
                                    <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                                        <Icon name="upload" className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">Carga Masiva</h4>
                                    <p className="text-[9px] text-neutral-500 mb-4 leading-relaxed">Sube un archivo CSV para importar múltiples productos.</p>
                                    <label className="w-full cursor-pointer bg-emerald-500 text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors text-center shadow-md">
                                        Subir CSV
                                        <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                                    </label>
                                </div>
                                <div className="bg-brand-primary/5 p-5 rounded-2xl border border-brand-primary/20 flex flex-col items-center text-center group hover:border-brand-primary transition-all">
                                    <div className="w-12 h-12 bg-brand-primary text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20 group-hover:scale-110 transition-transform">
                                        <Icon name="ai" className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">Carga Mágica IA</h4>
                                    <p className="text-[9px] text-neutral-500 mb-4 leading-relaxed">Escanea una foto o PDF de tu inventario con IA.</p>
                                    <label className="w-full cursor-pointer bg-brand-primary text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-primary/90 transition-colors text-center shadow-md">
                                        {isAnalyzing ? <Spinner className="w-4 h-4" /> : 'Escanear'}
                                        <input type="file" accept="image/*,application/pdf,text/plain" className="hidden" onChange={handleAIInventoryUpload} disabled={isAnalyzing} />
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-2xl border border-amber-200 dark:border-amber-800/50 flex flex-col items-center text-center group hover:border-amber-500 transition-all">
                                    <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                                        <Icon name="download" className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">Exportar</h4>
                                    <p className="text-[9px] text-neutral-500 mb-4 leading-relaxed">Descarga tu inventario en formato Excel (.xlsx).</p>
                                    <Button onClick={exportInventoryToExcel} className="w-full bg-amber-500 text-white font-black text-[9px] uppercase tracking-widest py-2.5 rounded-xl shadow-md hover:bg-amber-600">
                                        Exportar Excel
                                    </Button>
                                </div>
                                {project?.spreadsheets && project.spreadsheets.length > 0 && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-2xl border border-blue-200 dark:border-blue-800/50 flex flex-col items-center text-center group hover:border-blue-500 transition-all">
                                        <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                                            <Icon name="table" className="w-6 h-6" />
                                        </div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">Tablas Proyecto</h4>
                                        <p className="text-[9px] text-neutral-500 mb-4 leading-relaxed">Importa directamente desde las tablas del proyecto.</p>
                                        <Button onClick={() => setIsSpreadsheetModalOpen(true)} className="w-full bg-blue-500 text-white font-black text-[9px] uppercase tracking-widest py-2.5 rounded-xl shadow-md hover:bg-blue-600">
                                            Seleccionar
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Spreadsheet Selection Modal */}
            <Modal isOpen={isSpreadsheetModalOpen} onClose={() => setIsSpreadsheetModalOpen(false)} title="Seleccionar Tabla">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">Selecciona una tabla del proyecto para importar productos:</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {project?.spreadsheets?.map(sheet => (
                            <div 
                                key={sheet.id} 
                                onClick={() => setSelectedSpreadsheetId(sheet.id)}
                                className={`p-3 rounded-xl border cursor-pointer transition-colors ${selectedSpreadsheetId === sheet.id ? 'bg-brand-primary/10 border-brand-primary text-brand-primary' : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-brand-primary/50'}`}
                            >
                                <div className="font-bold text-sm">{sheet.title}</div>
                                <div className="text-xs opacity-70">{sheet.rows.length} filas</div>
                            </div>
                        ))}
                    </div>
                    <Button 
                        onClick={handleImportFromSpreadsheet} 
                        disabled={!selectedSpreadsheetId || isAnalyzing}
                        className="w-full bg-brand-primary text-white font-bold"
                    >
                        {isAnalyzing ? <Spinner className="w-5 h-5" /> : 'Importar Productos'}
                    </Button>
                </div>
            </Modal>

            {/* Import Preview Modal */}
            <Modal isOpen={isImportPreviewModalOpen} onClose={() => setIsImportPreviewModalOpen(false)} title="Revisar Tabla Importada">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">Mapea las columnas de tu tabla a los campos del inventario.</p>
                    
                    {importSpreadsheet && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Nombre / Artículo</label>
                                    <select 
                                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm"
                                        value={columnMapping.name}
                                        onChange={e => setColumnMapping({...columnMapping, name: e.target.value})}
                                    >
                                        <option value="">-- No importar --</option>
                                        {importSpreadsheet.columns.map(col => (
                                            <option key={col.id} value={col.id}>{col.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Precio / Costo</label>
                                    <select 
                                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm"
                                        value={columnMapping.price}
                                        onChange={e => setColumnMapping({...columnMapping, price: e.target.value})}
                                    >
                                        <option value="">-- No importar --</option>
                                        {importSpreadsheet.columns.map(col => (
                                            <option key={col.id} value={col.id}>{col.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Stock / Cantidad</label>
                                    <select 
                                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm"
                                        value={columnMapping.stock}
                                        onChange={e => setColumnMapping({...columnMapping, stock: e.target.value})}
                                    >
                                        <option value="">-- No importar --</option>
                                        {importSpreadsheet.columns.map(col => (
                                            <option key={col.id} value={col.id}>{col.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Categoría</label>
                                    <select 
                                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm"
                                        value={columnMapping.category}
                                        onChange={e => setColumnMapping({...columnMapping, category: e.target.value})}
                                    >
                                        <option value="">-- No importar --</option>
                                        {importSpreadsheet.columns.map(col => (
                                            <option key={col.id} value={col.id}>{col.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="max-h-96 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-xl">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-neutral-50 dark:bg-neutral-800/50 sticky top-0 z-10">
                                        <tr className="text-xs text-neutral-500 uppercase tracking-widest border-b border-neutral-200 dark:border-neutral-700">
                                            {importSpreadsheet.columns.map(col => (
                                                <th key={col.id} className="p-3 font-bold whitespace-nowrap">
                                                    {col.name}
                                                    {columnMapping.name === col.id && <span className="ml-2 px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px]">Nombre</span>}
                                                    {columnMapping.price === col.id && <span className="ml-2 px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px]">Precio</span>}
                                                    {columnMapping.stock === col.id && <span className="ml-2 px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px]">Stock</span>}
                                                    {columnMapping.category === col.id && <span className="ml-2 px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px]">Categoría</span>}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                                        {importSpreadsheet.rows.map((row) => (
                                            <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                                {importSpreadsheet.columns.map((col, colIndex) => (
                                                    <td key={col.id} className="p-3 text-sm">
                                                        {row.cells[colIndex]?.value || <span className="text-neutral-400 italic">Vacío</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-2 pt-2">
                        <Button 
                            onClick={() => setIsImportPreviewModalOpen(false)} 
                            className="flex-1 bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300 font-bold"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            onClick={async () => {
                                if (!importSpreadsheet) return;
                                
                                const nameColIndex = importSpreadsheet.columns.findIndex(c => c.id === columnMapping.name);
                                const priceColIndex = importSpreadsheet.columns.findIndex(c => c.id === columnMapping.price);
                                const stockColIndex = importSpreadsheet.columns.findIndex(c => c.id === columnMapping.stock);
                                const categoryColIndex = importSpreadsheet.columns.findIndex(c => c.id === columnMapping.category);

                                const newProducts: POSProduct[] = importSpreadsheet.rows.map(row => {
                                    const nameCell = nameColIndex >= 0 ? row.cells[nameColIndex] : undefined;
                                    const priceCell = priceColIndex >= 0 ? row.cells[priceColIndex] : undefined;
                                    const stockCell = stockColIndex >= 0 ? row.cells[stockColIndex] : undefined;
                                    const categoryCell = categoryColIndex >= 0 ? row.cells[categoryColIndex] : undefined;

                                    const nameVal = nameCell?.value?.trim();
                                    const priceStr = priceCell?.value || '0';
                                    const priceMatch = priceStr.match(/[\d.]+/);
                                    const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

                                    const stockStr = stockCell?.value || '10';
                                    const stockMatch = stockStr.match(/[\d]+/);
                                    const stock = stockMatch ? parseInt(stockMatch[0], 10) : 10;

                                    return {
                                        id: uuidv4(),
                                        name: nameVal || 'Producto Desconocido',
                                        price: isNaN(price) ? 0 : price,
                                        stock: isNaN(stock) ? 10 : stock,
                                        category: categoryCell?.value || 'General'
                                    };
                                }).filter(p => p.name !== 'Producto Desconocido' && p.name !== '');

                                if (newProducts.length > 0) {
                                    await saveProducts([...products, ...newProducts]);
                                    setIsImportPreviewModalOpen(false);
                                    setToastNotification({ title: '¡Inventario Actualizado!', message: `Se importaron ${newProducts.length} productos.`, icon: 'check' });
                                } else {
                                    setToastNotification({ title: 'Error', message: 'No se encontraron datos válidos en la tabla.', icon: 'close' });
                                }
                            }} 
                            className="flex-1 bg-brand-primary text-white font-bold"
                            disabled={!columnMapping.name}
                        >
                            Importar Productos
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Scanner Modal (Retail) */}
            <Modal isOpen={isScannerModalOpen} onClose={() => setIsScannerModalOpen(false)} title="Escáner de Código de Barras">
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <div className="w-64 h-32 border-4 border-dashed border-brand-primary/50 rounded-xl flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-brand-primary/10 animate-pulse"></div>
                        <div className="w-full h-1 bg-brand-primary absolute top-1/2 transform -translate-y-1/2 shadow-[0_0_10px_rgba(var(--brand-primary),0.8)]"></div>
                        <Icon name="maximize" className="w-12 h-12 text-brand-primary/50" />
                    </div>
                    <p className="text-neutral-500 text-sm text-center">
                        Apunta la cámara al código de barras del producto.<br/>
                        <span className="text-xs opacity-70">(Simulación - Integración de cámara en desarrollo)</span>
                    </p>
                    <div className="w-full max-w-xs pt-4">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Ingreso Manual</label>
                        <div className="flex gap-2">
                            <Input placeholder="Ej. 7501234567890" className="flex-1" />
                            <Button onClick={() => {
                                setToastNotification({ title: 'Producto no encontrado', message: 'El código ingresado no existe en el inventario.', icon: 'alert-circle' });
                            }}>Buscar</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Agenda Modal (Services) */}
            <Modal isOpen={isAgendaModalOpen} onClose={() => setIsAgendaModalOpen(false)} title="Agenda de Citas">
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Hoy, {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                        <Button 
                            size="sm" 
                            className="bg-brand-primary text-white"
                            onClick={() => {
                                setIsAgendaModalOpen(false);
                                if (setNewTaskModalOpen) {
                                    setNewTaskModalOpen(true);
                                } else {
                                    window.open('/#globalCalendar', '_blank');
                                }
                            }}
                        >
                            <Icon name="plus" className="w-4 h-4 mr-1" /> Nueva Cita
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {[
                            { time: '09:00 AM', client: 'María García', service: 'Corte de Cabello', status: 'Completado' },
                            { time: '11:30 AM', client: 'Juan Pérez', service: 'Masaje Relajante', status: 'En progreso' },
                            { time: '02:00 PM', client: 'Ana Martínez', service: 'Manicura', status: 'Pendiente' },
                            { time: '04:15 PM', client: 'Carlos López', service: 'Limpieza Facial', status: 'Pendiente' },
                        ].map((appt, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                                <div className="flex items-center gap-4">
                                    <div className="text-sm font-bold text-brand-primary w-20">{appt.time}</div>
                                    <div>
                                        <div className="font-medium text-neutral-900 dark:text-white">{appt.client}</div>
                                        <div className="text-xs text-neutral-500">{appt.service}</div>
                                    </div>
                                </div>
                                <div className={`text-xs px-2 py-1 rounded-full ${
                                    appt.status === 'Completado' ? 'bg-green-100 text-green-700' :
                                    appt.status === 'En progreso' ? 'bg-blue-100 text-blue-700' :
                                    'bg-amber-100 text-amber-700'
                                }`}>
                                    {appt.status}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-center text-neutral-400 mt-4">(Vista previa del módulo de agenda)</p>
                </div>
            </Modal>

            {/* Quotations Modal (Construction) */}
            <Modal isOpen={isQuotationsModalOpen} onClose={() => setIsQuotationsModalOpen(false)} title="Cotizaciones y Obras">
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="bg-neutral-100 dark:bg-neutral-800">Activas</Button>
                            <Button size="sm" variant="ghost" className="text-neutral-500">Aprobadas</Button>
                            <Button size="sm" variant="ghost" className="text-neutral-500">Rechazadas</Button>
                        </div>
                        <Button size="sm" className="bg-brand-primary text-white"><Icon name="plus" className="w-4 h-4 mr-1" /> Nueva Cotización</Button>
                    </div>
                    <div className="space-y-3">
                        {[
                            { id: 'COT-001', client: 'Constructora ABC', project: 'Remodelación Oficina', amount: 4500.00, date: '15 Mar 2026' },
                            { id: 'COT-002', client: 'Familia Rodríguez', project: 'Ampliación Cocina', amount: 1250.50, date: '18 Mar 2026' },
                            { id: 'COT-003', client: 'Edificio Central', project: 'Mantenimiento Eléctrico', amount: 850.00, date: '19 Mar 2026' },
                        ].map((quote, i) => (
                            <div key={i} className="p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-xs font-bold text-brand-primary mb-1">{quote.id}</div>
                                        <div className="font-bold text-neutral-900 dark:text-white">{quote.project}</div>
                                        <div className="text-sm text-neutral-500">{quote.client}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-lg text-neutral-900 dark:text-white">${quote.amount.toFixed(2)}</div>
                                        <div className="text-xs text-neutral-400">{quote.date}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                    <Button size="sm" variant="outline" className="flex-1 text-xs py-1 h-auto">Ver PDF</Button>
                                    <Button size="sm" variant="outline" className="flex-1 text-xs py-1 h-auto">Aprobar</Button>
                                    <Button size="sm" variant="outline" className="flex-1 text-xs py-1 h-auto">Enviar</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-center text-neutral-400 mt-4">(Vista previa del módulo de cotizaciones)</p>
                </div>
            </Modal>

            {/* Info Modal */}
            <Modal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} title="¿Cómo funciona el Smart POS?">
                <div className="space-y-4 text-sm text-neutral-600 dark:text-neutral-400">
                    <p><strong>Tipos de Negocio:</strong> Selecciona el tipo de negocio arriba para adaptar la interfaz. Restaurantes y Hoteles tienen un mapa de mesas/habitaciones. Retail, Servicios y Construcción tienen opciones adaptadas a su flujo.</p>
                    <p><strong>Categorías (Burbujas):</strong> Sirven para filtrar rápidamente tus productos. "Todas" muestra el catálogo completo. Puedes organizar tus productos por categorías al crearlos o importarlos.</p>
                    <p><strong>Pausar Cuentas:</strong> Puedes armar un pedido y "Pausarlo" (guardarlo en espera) para cobrarlo después. En restaurantes/hoteles, puedes asignarlo a una mesa o habitación específica.</p>
                    <p><strong>Renombrar Mesas/Habitaciones:</strong> En el mapa, usa el ícono de lápiz para ponerle un nombre personalizado (ej. "Familia Pérez"). Este nombre se reflejará en las cuentas pausadas.</p>
                    <p><strong>Recibos:</strong> Al cobrar, se genera un recibo digital detallado con impuestos, descuentos y propinas, que puedes enviar por WhatsApp o imprimir.</p>
                </div>
            </Modal>

            {/* Tables Map Modal */}
            <Modal isOpen={isTablesModalOpen} onClose={() => setIsTablesModalOpen(false)} title={businessType === 'hotel' ? 'Mapa de Habitaciones' : 'Mapa de Mesas'}>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                    {Array.from({ length: tableCount }, (_, i) => {
                        const defaultName = businessType === 'hotel' ? `Habitación ${100 + i + 1}` : `Mesa ${i + 1}`;
                        let tableName = customTableNames[i] || defaultName;
                        
                        // Fix for hotel mode showing 'Mesa' defaults if they were left over from restaurant mode
                        if (businessType === 'hotel' && tableName.startsWith('Mesa ')) {
                            tableName = defaultName;
                        }

                        const order = heldOrders.find(o => o.name?.toLowerCase() === tableName.toLowerCase());
                        const isOccupied = !!order;
                        const total = order ? order.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;

                        return (
                            <div 
                                key={i}
                                onClick={() => {
                                    if (isOccupied) {
                                        handleRestoreOrder(order.id);
                                        setIsTablesModalOpen(false);
                                    } else {
                                        setSelectedTableIndex(i);
                                        setHoldOrderName(tableName);
                                        setIsTablesModalOpen(false);
                                        // Just setting the name doesn't create it until they hold an order.
                                        // But it pre-fills the name for the next hold.
                                        setToastNotification({ title: businessType === 'hotel' ? 'Habitación Seleccionada' : 'Mesa Seleccionada', message: `Agrega productos y pausa la cuenta para ocupar la ${tableName}.`, icon: 'info' });
                                    }
                                }}
                                className={`relative p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center aspect-square text-center ${isOccupied ? 'bg-brand-primary/10 border-brand-primary' : 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 hover:border-brand-primary/50'}`}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTableToRename({ index: i, currentName: tableName, orderId: order?.id });
                                        setNewTableName(tableName);
                                        setIsRenameTableModalOpen(true);
                                    }}
                                    className="absolute top-2 right-2 p-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-brand-primary hover:text-white rounded-full transition-all shadow-sm z-10"
                                    title="Renombrar"
                                >
                                    <Icon name="edit" className="w-3.5 h-3.5" />
                                </button>
                                <Icon name={isOccupied ? 'users' : 'grid'} className={`w-6 h-6 mb-2 ${isOccupied ? 'text-brand-primary' : 'text-neutral-400'}`} />
                                <span className={`text-sm font-black ${isOccupied ? 'text-brand-primary' : 'text-neutral-500'}`}>{tableName}</span>
                                {isOccupied && (
                                    <span className="text-xs font-bold text-neutral-900 dark:text-white mt-1">${total.toFixed(2)}</span>
                                )}
                            </div>
                        );
                    })}
                    <div 
                        onClick={handleAddTable}
                        className="relative p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center aspect-square text-center bg-neutral-50 dark:bg-neutral-800/50 border-neutral-300 dark:border-neutral-600 hover:border-brand-primary hover:bg-brand-primary/5"
                    >
                        <Icon name="plus" className="w-6 h-6 mb-2 text-neutral-400" />
                        <span className="text-sm font-bold text-neutral-500">Agregar</span>
                    </div>
                </div>
            </Modal>

            {/* Rename Table Modal */}
            <Modal isOpen={isRenameTableModalOpen} onClose={() => setIsRenameTableModalOpen(false)} title="Renombrar">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Ingresa un nuevo nombre.</p>
                    <Input 
                        label="Nuevo Nombre" 
                        value={newTableName} 
                        onChange={e => setNewTableName(e.target.value)} 
                        autoFocus
                    />
                    <Button onClick={handleRenameTableSubmit} className="w-full bg-brand-primary text-white font-bold">
                        Guardar Nombre
                    </Button>
                </div>
            </Modal>

            {/* Held Orders Modal */}
            <Modal isOpen={isHeldOrdersModalOpen} onClose={() => setIsHeldOrdersModalOpen(false)} title="Cuentas Pausadas">
                <div className="space-y-4">
                    {heldOrders.length === 0 ? (
                        <p className="text-center text-neutral-500 text-sm py-8">No hay cuentas pausadas.</p>
                    ) : (
                        heldOrders.map(order => (
                            <div key={order.id} className="flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                                <div>
                                    {order.name && <p className="text-sm font-black text-neutral-900 dark:text-white mb-1">{order.name}</p>}
                                    <p className="text-xs font-bold text-neutral-500 mb-1">{order.time}</p>
                                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{order.cart.length} artículos</p>
                                    <p className="text-xs text-brand-primary font-black">${order.cart.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2)}</p>
                                </div>
                                <Button onClick={() => handleRestoreOrder(order.id)} className="bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold text-xs">
                                    Recuperar
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </Modal>

            {/* Open Register Modal */}
            <Modal isOpen={isOpeningRegister} onClose={() => setIsOpeningRegister(false)} title="Abrir Caja">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Ingresa el monto de efectivo inicial con el que abres la caja.
                    </p>
                    <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1 uppercase tracking-wider">
                            Fondo Inicial (Efectivo)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">$</span>
                            <input 
                                type="number" 
                                value={startingCash} 
                                onChange={(e) => setStartingCash(e.target.value)} 
                                className="w-full pl-8 pr-4 py-3 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl text-sm font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-primary/50 transition-all"
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                        <Button variant="secondary" onClick={() => setIsOpeningRegister(false)}>Cancelar</Button>
                        <Button onClick={handleOpenRegister} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold">
                            Abrir Caja
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Close Register Modal */}
            <Modal isOpen={isClosingRegister} onClose={() => setIsClosingRegister(false)} title="Cerrar Caja (Corte Z)">
                {registerData ? (
                    <div className="space-y-6">
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl space-y-2">
                            <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-3">Resumen de Turno</h3>
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-600 dark:text-neutral-400">Fondo Inicial:</span>
                                <span className="font-bold">${registerData.startingCash.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-600 dark:text-neutral-400">Ventas en Efectivo:</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">+ ${(registerData.cashSales || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-neutral-200 dark:border-neutral-700">
                                <span className="font-bold text-neutral-900 dark:text-white">Efectivo Esperado:</span>
                                <span className="font-black text-lg text-neutral-900 dark:text-white">${(registerData.startingCash + (registerData.cashSales || 0)).toFixed(2)}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1 uppercase tracking-wider">
                                Efectivo Real en Caja
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">$</span>
                                <input 
                                    type="number" 
                                    value={closingCash} 
                                    onChange={(e) => setClosingCash(e.target.value)} 
                                    className="w-full pl-8 pr-4 py-3 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl text-sm font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-primary/50 transition-all"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            {closingCash && (
                                <p className={`text-xs font-bold mt-2 ${Number(closingCash) === (registerData.startingCash + (registerData.cashSales || 0)) ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    Diferencia: ${(Number(closingCash) - (registerData.startingCash + (registerData.cashSales || 0))).toFixed(2)}
                                </p>
                            )}
                        </div>

                        <div className="bg-neutral-50 dark:bg-neutral-900/50 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800">
                            <p className="text-xs text-neutral-500">
                                Al cerrar la caja, se generará un reporte (Corte Z) que se guardará en las notas del proyecto y se notificará al administrador.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                            <Button variant="secondary" onClick={() => setIsClosingRegister(false)}>Cancelar</Button>
                            <Button onClick={handleCloseRegister} className="bg-rose-500 hover:bg-rose-600 text-white font-bold" disabled={!closingCash}>
                                Confirmar Cierre
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-center text-neutral-500">Cargando datos de la caja...</div>
                )}
            </Modal>

            {/* Checkout Modal */}
            <Modal isOpen={isCheckoutModalOpen} onClose={() => setIsCheckoutModalOpen(false)} title="Cobrar" className="max-w-[98vw] lg:max-w-[1400px]">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[80vh] overflow-y-auto lg:overflow-visible pr-2 lg:pr-0">
                    {/* Column 1: Settings (Tax/Tip) */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center text-neutral-900 dark:text-white"><Icon name="settings" className="w-3.5 h-3.5 mr-2 text-brand-primary"/> Ajustes de Cobro</h3>
                        
                        <div className="space-y-3">
                            {/* Tip Selection */}
                            <div className="space-y-1.5">
                                <label className="block text-[9px] font-black text-neutral-500 uppercase tracking-widest">Propina Sugerida</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[0, 10, 15, 20].map(tip => (
                                        <button 
                                            key={tip} 
                                            onClick={() => setTipPercentage(tip)} 
                                            className={`py-1.5 rounded-lg text-[10px] font-black transition-all border-2 ${tipPercentage === tip ? 'bg-brand-primary text-white border-brand-primary shadow-md scale-[1.01]' : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-100 dark:border-neutral-700 hover:border-brand-primary/30'}`}
                                        >
                                            {tip === 0 ? 'Sin Propina' : `${tip}%`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-neutral-700 dark:text-neutral-300 flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={applyTax} 
                                            onChange={(e) => setApplyTax(e.target.checked)}
                                            className="w-3.5 h-3.5 mr-2 rounded text-brand-primary focus:ring-brand-primary border-neutral-300"
                                        />
                                        Aplicar Impuestos
                                    </label>
                                </div>
                                {applyTax && (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex-1">
                                            <Input 
                                                type="number" 
                                                value={taxRate} 
                                                onChange={(e) => setTaxRate(Number(e.target.value))} 
                                                className="text-right font-black text-xs py-0.5 h-8"
                                            />
                                        </div>
                                        <span className="text-xs font-black text-neutral-500">%</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/10">
                                <p className="text-[8px] font-black uppercase tracking-widest text-brand-primary mb-0.5">Nota</p>
                                <p className="text-[9px] text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">Los impuestos y propinas se calculan sobre el subtotal de la venta.</p>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Payment Method & Change Calculator */}
                    <div className="space-y-3 border-x border-neutral-200 dark:border-neutral-800 px-0 lg:px-6">
                        <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center text-neutral-900 dark:text-white"><Icon name="credit-card" className="w-3.5 h-3.5 mr-2 text-brand-primary"/> Pago y Calculadora</h3>
                        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
                            <button onClick={() => setPaymentMethod('cash')} className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'cash' ? 'bg-white dark:bg-neutral-700 shadow-md text-neutral-900 dark:text-white scale-[1.01]' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                Efectivo
                            </button>
                            <button onClick={() => setPaymentMethod('card')} className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'card' ? 'bg-white dark:bg-neutral-700 shadow-md text-neutral-900 dark:text-white scale-[1.01]' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                Tarjeta / Link
                            </button>
                        </div>

                        {paymentMethod === 'cash' ? (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[8px] font-black text-neutral-500 uppercase tracking-widest mb-1">Efectivo Recibido</label>
                                    <div className="text-xl font-black text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 text-center shadow-inner">
                                        ${cashGiven === '' ? '0.00' : cashGiven}
                                    </div>
                                </div>
                                {/* Quick Bills */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[10, 20, 50, 100].map(bill => (
                                        <button key={bill} onClick={() => setCashGiven(String(bill))} className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-black py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all hover:scale-105 active:scale-95 text-xs">
                                            ${bill}
                                        </button>
                                    ))}
                                    <button onClick={() => setCashGiven(String(total.toFixed(2)))} className="col-span-4 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-black py-2 rounded-lg uppercase tracking-widest text-[8px] shadow-md hover:bg-neutral-800 transition-all">
                                        Monto Exacto (${total.toFixed(2)})
                                    </button>
                                </div>
                                {/* Numpad */}
                                <div className="grid grid-cols-3 gap-1">
                                    {[1,2,3,4,5,6,7,8,9,'.',0,'C'].map(key => (
                                        <button 
                                            key={key} 
                                            onClick={() => {
                                                if (key === 'C') setCashGiven('');
                                                else {
                                                    setCashGiven(prev => {
                                                        if (key === '.' && prev.includes('.')) return prev;
                                                        return prev + key;
                                                    });
                                                }
                                            }}
                                            className="bg-white dark:bg-dark-surface border border-neutral-200 dark:border-neutral-700 py-2 rounded-lg font-black text-base hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all active:bg-neutral-100 shadow-sm"
                                        >
                                            {key}
                                        </button>
                                    ))}
                                </div>
                                {change >= 0 && cashGiven !== '' && Number(cashGiven) > 0 && (
                                    <div className="bg-emerald-500 text-white p-3 rounded-xl text-center shadow-lg shadow-emerald-500/20 animate-in zoom-in duration-300">
                                        <p className="text-[8px] font-black uppercase tracking-widest mb-0.5 opacity-80">Cambio a devolver</p>
                                        <p className="text-xl font-black">${change.toFixed(2)}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3 text-center py-4">
                                <p className="text-[9px] text-neutral-500 uppercase font-black tracking-widest mb-2">Escanea para pagar</p>
                                {paymentLink ? (
                                    <div className="bg-white p-3 rounded-xl inline-block shadow-xl border border-neutral-100">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(paymentLink)}`} alt="QR Code" className="w-32 h-32 mx-auto" />
                                    </div>
                                ) : (
                                    <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700">
                                        <Icon name="link" className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                                        <p className="text-[10px] font-black text-neutral-600 dark:text-neutral-400 mb-3 uppercase tracking-tight">No has configurado un link de pago</p>
                                        <Input label="Tu Link (Stripe, PayPal, etc.)" value={paymentLink} onChange={e => setPaymentLink(e.target.value)} className="text-[10px] h-8" />
                                        <Button onClick={handleSavePaymentLink} className="w-full mt-2 bg-neutral-900 text-white text-[9px] font-black uppercase tracking-widest py-2">Guardar Link de Cobro</Button>
                                    </div>
                                )}
                                <p className="text-[8px] text-neutral-400 mt-3 font-bold leading-relaxed">Verifica que el cliente haya completado el pago antes de confirmar la venta.</p>
                            </div>
                        )}
                    </div>

                    {/* Column 3: Customer Info & Summary */}
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center text-neutral-900 dark:text-white"><Icon name="user" className="w-3.5 h-3.5 mr-2 text-brand-primary"/> Datos del Cliente</h3>
                                <button 
                                    onClick={() => setCustomerInfo({ name: 'Consumidor Final', phone: '9999999999', email: 'consumidor@final.com' })}
                                    className="text-[8px] font-black text-brand-primary hover:underline uppercase tracking-widest"
                                >
                                    Consumidor Final
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <Input label="Nombre o Razón Social" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} className="font-bold text-[10px] h-8" />
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="WhatsApp / Tel" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} className="font-bold text-[10px] h-8" />
                                    <Input label="Correo Electrónico" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} className="font-bold text-[10px] h-8" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                            <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center text-neutral-900 dark:text-white"><Icon name="shopping-cart" className="w-3.5 h-3.5 mr-2 text-brand-primary"/> Resumen Final</h3>
                            
                            <div className="bg-neutral-900 dark:bg-black p-4 rounded-2xl text-white space-y-2 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-brand-primary/10 rounded-full -mr-10 -mt-10 blur-3xl"></div>
                                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest opacity-60">
                                    <span>Subtotal</span>
                                    <span>${subtotal.toFixed(2)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-emerald-400">
                                        <span>Descuento ({discount}%)</span>
                                        <span>-${discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {applyTax && (
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest opacity-60">
                                        <span>Impuestos ({taxRate}%)</span>
                                        <span>${taxAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {tipPercentage > 0 && (
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-brand-primary">
                                        <span>Propina ({tipPercentage}%)</span>
                                        <span>${tipAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-2xl font-black pt-4 border-t border-white/10 tracking-tighter">
                                    <span className="text-base self-center opacity-40">TOTAL</span>
                                    <span>${total.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="pt-1">
                                <Button 
                                    onClick={handleCheckout} 
                                    disabled={paymentMethod === 'cash' && (cashGiven === '' || Number(cashGiven) < total)}
                                    className="w-full bg-brand-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-brand-primary/30 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 text-sm flex items-center justify-center"
                                >
                                    Confirmar Venta <Icon name="check" className="w-5 h-5 ml-2" />
                                </Button>
                                <p className="text-[8px] text-center text-neutral-400 mt-4 uppercase font-black tracking-[0.2em] leading-relaxed">
                                    Al confirmar se generará el recibo y se actualizará el inventario automáticamente
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Hold Order Name Modal */}
            <Modal isOpen={isHoldNameModalOpen} onClose={() => setIsHoldNameModalOpen(false)} title="Pausar Cuenta">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Ingresa un nombre para identificar esta cuenta (ej. "Mesa 4", "Cliente Hotel").</p>
                    <Input 
                        label="Nombre de la cuenta (Opcional)" 
                        value={holdOrderName} 
                        onChange={e => setHoldOrderName(e.target.value)} 
                        autoFocus
                    />
                    <Button onClick={confirmHoldOrder} className="w-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold">
                        Pausar Cuenta
                    </Button>
                </div>
            </Modal>

            {/* Custom Item Modal */}
            <Modal isOpen={isCustomItemModalOpen} onClose={() => setIsCustomItemModalOpen(false)} title="Agregar Ítem Rápido">
                <div className="space-y-4">
                    <Input 
                        label="Nombre del Ítem" 
                        value={customItem.name} 
                        onChange={e => setCustomItem({...customItem, name: e.target.value})} 
                        autoFocus
                    />
                    <Input 
                        label="Precio ($ USD)" 
                        type="number" 
                        value={customItem.price} 
                        onChange={e => setCustomItem({...customItem, price: e.target.value})} 
                    />
                    <div className="flex gap-2">
                        <Button onClick={() => confirmCustomItem(false)} className="flex-1 bg-brand-primary text-white font-bold text-xs uppercase tracking-wider">
                            Solo Carrito
                        </Button>
                        <Button onClick={() => confirmCustomItem(true)} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider">
                            Carrito + Inventario
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* History Modal */}
            <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="Historial de Ventas">
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-2">
                        <Input 
                            label="Buscar por cliente" 
                            value={historySearch} 
                            onChange={e => setHistorySearch(e.target.value)} 
                            className="flex-1"
                        />
                        <div className="flex gap-2 items-end">
                            <select 
                                value={historyFilter} 
                                onChange={e => setHistoryFilter(e.target.value as any)}
                                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                            >
                                <option value="all">Todas</option>
                                <option value="today">Hoy</option>
                                <option value="week">Últimos 7 días</option>
                                <option value="month">Este mes</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="max-h-[50vh] overflow-y-auto space-y-4 pr-2">
                        {historyLoading ? (
                            <div className="flex justify-center py-8"><Spinner /></div>
                        ) : filteredHistory.length === 0 ? (
                            <p className="text-center text-neutral-500 text-sm py-8">No hay ventas registradas con estos filtros.</p>
                        ) : (
                            filteredHistory.map(receipt => (
                                <div key={receipt.id} className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="text-sm font-black text-neutral-900 dark:text-white">Recibo #{receipt.id.slice(0, 8)}</p>
                                            <p className="text-xs text-neutral-500">{new Date(receipt.date).toLocaleString()}</p>
                                        </div>
                                        <p className="text-lg font-black text-brand-primary">${receipt.total.toFixed(2)}</p>
                                    </div>
                                    {receipt.customerName && (
                                        <p className="text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-2">Cliente: {receipt.customerName}</p>
                                    )}
                                    <div className="space-y-1 mt-2 border-t border-neutral-200 dark:border-neutral-700 pt-2">
                                        {receipt.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400">
                                                <span>{item.quantity}x {item.name}</span>
                                                <span>${(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <Button 
                                            onClick={() => window.open(`#/recibo/${receipt.id}`, '_blank')}
                                            className="flex-1 bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl shadow-sm hover:scale-[1.02] transition-all"
                                        >
                                            <Icon name="file-text" className="w-3 h-3 mr-1.5" /> Ver Recibo
                                        </Button>
                                        <Button 
                                            onClick={() => {
                                                const html = constructPOSReceiptEmailHtml(project?.name || 'Venta', {
                                                    id: receipt.id,
                                                    date: receipt.date,
                                                    items: receipt.items,
                                                    subtotal: receipt.subtotal,
                                                    tax: receipt.tax,
                                                    total: receipt.total,
                                                    customerName: receipt.customerName || 'Cliente'
                                                });
                                                const draft = {
                                                    to: receipt.customerEmail || '',
                                                    subject: `Recibo de Venta - ${project?.name || 'Goatify'}`,
                                                    htmlBody: html
                                                };
                                                setMailDraft(draft);
                                                localStorage.setItem('goatify_pending_mail_draft', JSON.stringify(draft));
                                                window.open('/#/mail', '_blank');
                                            }}
                                            className="flex-1 bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl shadow-lg shadow-brand-primary/20 hover:scale-[1.02] transition-all"
                                        >
                                            <Icon name="mail" className="w-3 h-3 mr-1.5" /> Enviar Email
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </Modal>

            {/* Success Modal */}
            <Modal isOpen={isSuccessModalOpen} onClose={() => setIsSuccessModalOpen(false)} title="¡Venta Exitosa!">
                <div className="text-center space-y-6">
                    <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                        <Icon name="check" className="w-10 h-10" />
                    </div>
                    <div>
                        <p className="text-2xl font-black text-neutral-900 dark:text-white mb-1">${lastReceipt?.total.toFixed(2)}</p>
                        <p className="text-sm font-bold text-neutral-500">Cobro completado correctamente</p>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                        {lastReceipt?.customerEmail && (
                            <Button 
                                onClick={() => {
                                    const html = constructPOSReceiptEmailHtml(project?.name || 'Venta', {
                                        id: lastReceipt.id,
                                        date: lastReceipt.date,
                                        items: lastReceipt.items,
                                        subtotal: lastReceipt.subtotal,
                                        tax: lastReceipt.tax,
                                        total: lastReceipt.total,
                                        customerName: lastReceipt.customerName || 'Cliente'
                                    });
                                    const draft = {
                                        to: lastReceipt.customerEmail || '',
                                        subject: `Recibo de Venta - ${project?.name || 'Goatify'}`,
                                        htmlBody: html
                                    };
                                    setMailDraft(draft);
                                    localStorage.setItem('goatify_pending_mail_draft', JSON.stringify(draft));
                                    window.open('/#/mail', '_blank');
                                }}
                                className="w-full bg-brand-primary text-white font-black uppercase tracking-widest py-4 flex items-center justify-center rounded-2xl shadow-xl shadow-brand-primary/20"
                            >
                                <Icon name="mail" className="w-5 h-5 mr-2" /> Enviar por Email
                            </Button>
                        )}
                        {lastReceipt?.customerPhone && (
                            <Button 
                                onClick={() => {
                                    const url = `${window.location.origin}/#/recibo/${lastReceipt.id}`;
                                    const message = `Hola${lastReceipt.customerName ? ` ${lastReceipt.customerName}` : ''}, aquí tienes tu recibo por $${lastReceipt.total.toFixed(2)}: ${url}`;
                                    window.open(`https://wa.me/${lastReceipt.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                                }}
                                className="w-full bg-[#25D366] text-white font-bold py-3 flex items-center justify-center"
                            >
                                <Icon name="message-circle" className="w-4 h-4 mr-2" /> Enviar por WhatsApp
                            </Button>
                        )}
                        <Button 
                            onClick={() => window.open(`#/recibo/${lastReceipt?.id}`, '_blank')}
                            className="w-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold py-3 flex items-center justify-center"
                        >
                            <Icon name="file-text" className="w-4 h-4 mr-2" /> Ver / Descargar Recibo
                        </Button>
                        <Button 
                            onClick={() => window.open('https://facturadorsri.sri.gob.ec/portal-facturadorsri-internet/pages/inicio.html', '_blank')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 flex items-center justify-center"
                        >
                            <Icon name="file-text" className="w-4 h-4 mr-2" /> Emitir Factura Legal SRI
                        </Button>
                        <Button 
                            onClick={() => setIsSuccessModalOpen(false)}
                            className="w-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-black uppercase tracking-widest py-4 rounded-xl shadow-xl hover:bg-brand-primary dark:hover:bg-brand-primary hover:text-white dark:hover:text-white hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                        >
                            <Icon name="plus" className="w-5 h-5" /> Nueva Venta
                        </Button>
                    </div>
                </div>
            </Modal>

            <DriveFilePicker 
                isOpen={isDrivePickerOpen} 
                onClose={() => setIsDrivePickerOpen(false)} 
                onSelect={(file) => {
                    setNewProductImageUrl(file.url);
                    setNewProductImage(null);
                    setIsDrivePickerOpen(false);
                }} 
                allowedTypes={['image/']} 
            />
        </div>
    );
}
