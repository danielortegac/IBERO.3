import React, { useState, useContext, useRef, useEffect, useMemo } from 'react';
import type { HubView, UserProfile, HubPost, MarketplaceListing, HubGroup, DirectMessage, AgentConversation, ChatMessage } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import Card from './ui/Card';
import Icon from './Icon';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
// Added Spinner import
import Spinner from './ui/Spinner';
import type { Translations } from '../localization/en';
import DirectMessageModal from './DirectMessageModal';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import LinkRenderer from './ui/LinkRenderer';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { storage, db } from '../firebaseConfig';
import { HubSidebarAds, CreatePost, PostCard } from './HubComponents'; 
import { doc, updateDoc, writeBatch, query, collection, where, getDocs, increment, arrayUnion, serverTimestamp, orderBy, onSnapshot, arrayRemove, setDoc } from 'firebase/firestore';
import { useSwipe } from '../hooks/useSwipe';

// --- Constants ---
const INTIS_CONVERSION_RATE = 2; 

const STICKERS = [
    'https://cdn-icons-png.flaticon.com/512/1998/1998610.png', 
    'https://cdn-icons-png.flaticon.com/512/616/616430.png',   
    'https://cdn-icons-png.flaticon.com/512/1998/1998749.png', 
    'https://cdn-icons-png.flaticon.com/512/1998/1998798.labelKey', 
    'https://cdn-icons-png.flaticon.com/512/2313/2313443.png', 
    'https://cdn-icons-png.flaticon.com/512/616/616554.png',   
    'https://cdn-icons-png.flaticon.com/512/2829/2829820.png', 
    'https://cdn-icons-png.flaticon.com/512/1998/1998627.png', 
    'https://cdn-icons-png.flaticon.com/512/616/616494.png',   
    'https://cdn-icons-png.flaticon.com/512/4712/4712109.png',
    'https://cdn-icons-png.flaticon.com/512/4712/4712100.png',
    'https://cdn-icons-png.flaticon.com/512/4712/4712139.png',
    'https://cdn-icons-png.flaticon.com/512/4712/4712093.png',
    'https://cdn-icons-png.flaticon.com/512/4712/4712123.png',
    'https://cdn-icons-png.flaticon.com/512/1933/1933657.png',
    'https://cdn-icons-png.flaticon.com/512/1933/1933691.png',
    'https://cdn-icons-png.flaticon.com/512/1933/1933111.png',
    'https://cdn-icons-png.flaticon.com/512/4712/4712009.png',
    'https://cdn-icons-png.flaticon.com/512/4712/4712027.png',
    'https://cdn-icons-png.flaticon.com/512/742/742751.png',
    'https://cdn-icons-png.flaticon.com/512/742/742752.png',
    'https://cdn-icons-png.flaticon.com/512/742/742923.png',
    'https://cdn-icons-png.flaticon.com/512/742/742822.png',
    'https://cdn-icons-png.flaticon.com/512/742/742760.png',
    'https://cdn-icons-png.flaticon.com/512/742/742939.png',
    'https://cdn-icons-png.flaticon.com/512/742/742774.png',
    'https://cdn-icons-png.flaticon.com/512/4105/4105448.png',
    'https://cdn-icons-png.flaticon.com/512/4105/4105452.png',
];

const EMOJIS = ["🐐", "🐑", "🐏", "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🧐", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😧", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👺", "👽", "👻", "💀", "☠️", "💩", "🤡", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😼", "😽", "🙀", "😿", "😾", "🤲", "👐", "🙌", "👏", "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘", "👌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐", "🖖", "👋", "🤙", "💪", "🦾", "🖕", "✍️", "🙏", "🦶", "🦵", "🦿", "💄", "💋", "👄", "🦷", "👅", "👂", "🦻", "👃", "👣", "👁", "👀", "🧠", "🗣", "👤", "👥", "👶", "👧", "🧒", "👦", "👩", "🧑", "👨"];

// Improved Helper to safely convert Firestore Timestamp or string to Date
const getDateFromTimestamp = (timestamp: any): Date => {
    if (!timestamp) return new Date(0); 
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
    }
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return new Date(0); 
};

const StickerPicker: React.FC<{ onSelect: (url: string) => void; onClose: () => void; onInsertEmoji: (emoji: string) => void; }> = ({ onSelect, onClose, onInsertEmoji }) => {
    const { customStickers, addCustomSticker, deleteCustomSticker } = useContext(AppContext);
    const stickerInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<'stickers' | 'emojis'>('stickers');
    const pickerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) { onClose(); } }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, [onClose]);
    
    const handleCustomStickerChange = async (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (file) { 
            const url = await addCustomSticker(file); 
            if (url) { 
                // onSelect(url); 
            } 
        } 
    };
    
    const handleSelectSticker = (url: string) => { onSelect(url); onClose(); }
    const handleSelectEmoji = (emoji: string) => { onInsertEmoji(emoji); }
    
    return ( 
    <div ref={pickerRef} className="absolute bottom-full left-0 mb-2 bg-white dark:bg-dark-surface shadow-xl rounded-xl p-3 border border-light-border dark:border-dark-border w-80 z-50 max-h-96 overflow-y-auto custom-scrollbar animate-scale-in origin-bottom-left" onClick={(e) => e.stopPropagation()}> 
        <div className="flex justify-between items-center mb-3 border-b border-light-border dark:border-dark-border pb-2 sticky top-0 bg-white dark:bg-dark-surface z-10"> 
            <div className="flex gap-2"> 
                <button onClick={() => setActiveTab('stickers')} className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${activeTab === 'stickers' ? 'bg-brand-primary text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>Stickers</button> 
                <button onClick={() => setActiveTab('emojis')} className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${activeTab === 'emojis' ? 'bg-brand-primary text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>Emojis</button> 
            </div> 
            <button onClick={onClose}><Icon name="close" className="w-4 h-4"/></button> 
        </div> 
        {activeTab === 'stickers' ? ( 
            <div className="space-y-4"> 
                <div> 
                    <div className="aspect-square border-2 border-dashed border-brand-primary/50 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-brand-accent/10 transition-colors group w-16 h-16 mb-2" onClick={() => stickerInputRef.current?.click()} title="Guardar Sticker Personalizado"> 
                        <Icon name="plus" className="w-6 h-6 text-brand-primary mb-1 group-hover:scale-110 transition-transform"/> 
                        <span className="text-[8px] text-brand-primary font-semibold uppercase">Subir</span> 
                        <input type="file" ref={stickerInputRef} className="hidden" accept="image/*" onChange={handleCustomStickerChange} /> 
                    </div> 
                </div> 
                {customStickers.length > 0 && ( 
                    <div> 
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 sticky top-8 bg-white dark:bg-dark-surface z-10">Mis Stickers</p> 
                        <div className="grid grid-cols-4 gap-2"> 
                            {customStickers.map((sticker) => ( 
                                <div key={sticker.id} className="aspect-square p-1 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-brand-accent/10 cursor-pointer transition-colors flex items-center justify-center shadow-sm relative group"> 
                                    <img src={sticker.url} alt="custom sticker" className="w-full h-full object-contain" onClick={() => handleSelectSticker(sticker.url)} /> 
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); deleteCustomSticker(sticker.id, sticker.url); }} 
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-md z-20" 
                                        title="Eliminar Sticker"
                                    > 
                                        <Icon name="close" className="w-3 h-3"/> 
                                    </button> 
                                </div> 
                            ))} 
                        </div> 
                    </div> 
                )} 
                <div> 
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 sticky top-8 bg-white dark:bg-dark-surface z-10">Goatify Stickers</p> 
                    <div className="grid grid-cols-4 gap-2"> 
                        {STICKERS.map((url, idx) => ( 
                            <div key={idx} className="aspect-square flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-brand-accent/10 cursor-pointer transition-colors p-1 group"> 
                                <img src={url} alt="sticker" className="w-full h-full object-contain hover:scale-110 transition-transform duration-200" onClick={() => handleSelectSticker(url)} /> 
                            </div> 
                        ))} 
                    </div> 
                </div> 
            </div> 
        ) : ( 
            <div className="grid grid-cols-8 gap-1"> 
                {EMOJIS.map((emoji, idx) => ( 
                    <button key={idx} onClick={() => handleSelectEmoji(emoji)} className="text-xl p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"> {emoji} </button> 
                ))} 
            </div> 
        )} 
    </div> );
};

const ShareModal: React.FC<{ isOpen: boolean; onClose: () => void; post: HubPost }> = ({ isOpen, onClose, post }) => {
    const { userProfile, allUsers, sendDirectMessage, setToastNotification, currentUser } = useContext(AppContext);
    const [search, setSearch] = useState('');
    
    if (!isOpen) return null;
    
    const circleMembers = userProfile.circle 
        ? userProfile.circle.map(uid => allUsers.find(u => u.uid === uid)).filter(Boolean) as UserProfile[]
        : [];
        
    const filteredMembers = circleMembers.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));
    
    const handleShare = async (user: UserProfile) => {
        try {
            const shareContent = `📢 **Te comparto esta publicación:**\n\n> ${post.content.substring(0, 100)}...\n\n[Ver Publicación](/#/hub/feed/${post.id})`;
            await sendDirectMessage(user, shareContent);
            setToastNotification({ title: "Compartido", message: `Enviado a ${user.name}`, icon: 'check' });
            onClose();
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo compartir.", icon: 'close' });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Compartir con mi Círculo">
             <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto..." className="mb-4"/>
             <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                 {filteredMembers.length > 0 ? filteredMembers.map(user => (
                     <div key={user.uid} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer" onClick={() => handleShare(user)}>
                         <div className="flex items-center gap-3">
                             <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-10 h-10 rounded-full" alt={user.name}/>
                             <span className="font-bold text-sm">{user.name}</span>
                         </div>
                         <Icon name="send" className="w-4 h-4 text-brand-primary"/>
                     </div>
                 )) : (
                     <p className="text-center text-gray-500 py-4">No tienes contactos en tu círculo o no coinciden con la búsqueda.</p>
                 )}
             </div>
        </Modal>
    );
}

const NewListingModal: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => { const { addMarketplaceListing, addHubPost } = useContext(AppContext); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState(''); const [type, setType] = useState<'product' | 'service'>('product'); const [acceptsIntis, setAcceptsIntis] = useState(true); const isValid = title.trim() !== '' && description.trim() !== '' && price.trim() !== ''; const handleSubmit = () => { if (!isValid) return; addMarketplaceListing({ title, description, priceUSD: Number(price), type, acceptsIntis, tags: [] }); const postContent = `### 🛍️ Nueva Oferta en el Mercado\n\n**${title}**\n*${type === 'product' ? 'Producto' : 'Servicio'}*\n\n> "${description}"\n\n**Precio:** $${Number(price).toFixed(2)} USD ${acceptsIntis ? '(Acepta Intis)' : ''}\n\n[Ver en el Mercado](/#hub/marketplace)\n`; addHubPost(postContent); onClose(); setTitle(''); setDescription(''); setPrice(''); }; return ( <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Anuncio"> <div className="space-y-4"> <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título *" required /> <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción *" required /> <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Precio (USD) *" required /> <select value={type} onChange={e => setType(e.target.value as any)} className="w-full p-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border"> <option value="product">Producto</option> <option value="service">Servicio</option> </select> <label className="flex items-center gap-2"> <input type="checkbox" checked={acceptsIntis} onChange={e => setAcceptsIntis(e.target.checked)} /> Aceptar Intis </label> <div className="flex justify-end gap-2"> <Button variant="secondary" onClick={onClose}>Cancelar</Button> <Button onClick={handleSubmit} disabled={!isValid}>Publicar</Button> </div> </div> </Modal> ); };
const NewJobModal: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => { const { addJobListing, addHubPost } = useContext(AppContext); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [company, setCompany] = useState(''); const [location, setLocation] = useState(''); const [salary, setSalary] = useState(''); const [jobType, setTopicType] = useState('Full-time'); const isValid = title.trim() !== '' && description.trim() !== '' && company.trim() !== '' && location.trim() !== '' && salary.trim() !== ''; const handleSubmit = () => { if (!isValid) return; addJobListing({ title, description, company, location, salary, jobType: jobType as any, tags: [] }); const postContent = `### 💼 Nuevo Empleo: ${title}\n\n**Empresa:** ${company}\n**Ubicación:** ${location}\n**Tipo:** ${jobType}\n**Salario:** ${salary}\n\n> "${description}"\n\n[Aplicar en Empleos](/#hub/jobs)\n`; addHubPost(postContent); onClose(); setTitle(''); setDescription(''); setCompany(''); setLocation(''); setSalary(''); }; return ( <Modal isOpen={isOpen} onClose={onClose} title="Publicar Empleo"> <div className="space-y-4"> <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del Puesto *" required /> <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Empresa *" required /> <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del Puesto *" required /> <div className="grid grid-cols-2 gap-4"> <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ubicación *" required /> <Input value={salary} onChange={e => setSalary(e.target.value)} placeholder="Salario (ej. $50k - $70k) *" required /> </div> <select value={jobType} onChange={e => setTopicType(e.target.value)} className="w-full p-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border"> <option value="Full-time">Tiempo Completo</option> <option value="Part-time">Medio Tiempo</option> <option value="Contract">Contrato</option> <option value="Freelance">Freelance</option> </select> <div className="flex justify-end gap-2"> <Button variant="secondary" onClick={onClose}>Cancelar</Button> <Button onClick={handleSubmit} disabled={!isValid}>Publicar</Button> </div> </div> </Modal> ); };
const GroupModal: React.FC<{ isOpen: boolean, onClose: () => void, initialGroup?: HubGroup }> = ({ isOpen, onClose, initialGroup }) => { const { addHubGroup, updateHubGroup } = useContext(AppContext); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [isPrivate, setIsPrivate] = useState(false); const [onlyAdminsCanPost, setOnlyAdminsCanPost] = useState(false); const [icon, setIcon] = useState<any>('hub'); useEffect(() => { if (initialGroup) { setName(initialGroup.name); setDescription(initialGroup.description); setIsPrivate(initialGroup.isPrivate); setOnlyAdminsCanPost(initialGroup.onlyAdminsCanPost || false); setIcon(initialGroup.icon); } else { setName(''); setDescription(''); setIsPrivate(false); setOnlyAdminsCanPost(false); setIcon('hub'); } }, [initialGroup, isOpen]); const handleSubmit = () => { if (initialGroup) { updateHubGroup(initialGroup.id, { name, description, isPrivate, onlyAdminsCanPost, icon }); } else { addHubGroup({ name, description, isPrivate, onlyAdminsCanPost, icon, rules: '', tags: [] }, []); } onClose(); }; return ( <Modal isOpen={isOpen} onClose={onClose} title={initialGroup ? "Editar Grupo" : "Crear Grupo"}> <div className="space-y-4"> <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del Grupo" /> <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción" /> <div className="space-y-2"> <label className="flex items-center gap-2 cursor-pointer"> <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="rounded text-brand-primary focus:ring-brand-primary"/> <span className="text-sm">Grupo Privado (Requiere aprobación)</span> </label> <label className="flex items-center gap-2 cursor-pointer"> <input type="checkbox" checked={onlyAdminsCanPost} onChange={e => setOnlyAdminsCanPost(e.target.checked)} className="rounded text-brand-primary focus:ring-brand-primary"/> <span className="text-sm">Solo Administradores pueden enviar mensajes</span> </label> </div> <div className="flex justify-end gap-2"> <Button variant="secondary" onClick={onClose}>Cancelar</Button> <Button onClick={handleSubmit}>{initialGroup ? "Guardar" : "Crear"}</Button> </div> </div> </Modal> ); };

const Hub: React.FC = () => {
    const { t } = useTranslation();
    const { userProfile, allUsers, hubPosts, addHubPost, marketplaceListings, jobListings, hubGroups, setCurrentView, setViewingProfile, likePost, addCommentToPost, deleteHubGroup, addJobListing, joinGroup, applyToJob, intisBalance, setToastNotification, currentUser, conversations, sendDirectMessage, deepLinkTarget, setDeepLinkTarget, deleteConversation, approveGroupMember, denyGroupMember, removeGroupMember, deleteHubPost, sendHubMediaToProject, projects, agentConversations, activeHubView, setActiveHubView, buyItem, deleteMarketplaceListing, totalUnreadMessages, deleteAgentConversation, createNotification, markPostAsRead, deleteComment, markNotificationsReadForSender, updateHubPost, setAiChatOpen, isAiChatOpen, sendCircleRequest, unreadGroupIds, markGroupPostsAsRead, cancelGroupJoinRequest, setIsAgentFullScreen, createTask, checkAndConsumeLimit, setProModalOpen, setMailDraft } = useContext(AppContext);
    const { startCall } = useContext(CallContext);
    
    const [activeConversationData, setActiveConversationData] = useState<{
        id: string;
        type: 'user' | 'group' | 'agent';
        name: string;
        avatarUrl: string | null;
        otherUser?: UserProfile;
        agentName?: string;
        userName?: string;
        automationPaused?: boolean;
        history?: ChatMessage[];
        userId?: string; 
        projectId?: string;
    } | null>(null);

    const [groupView, setGroupView] = useState<'all' | 'my'>('all');
    const [groupSubView, setGroupSubView] = useState<'chat' | 'requests' | 'members'>('chat');
    const [messageFilter, setMessageFilter] = useState<'all' | 'people' | 'agents'>('all');
    // NUEVO ESTADO PARA FILTRO DE PROYECTOS v11.9
    const [projectFilterIds, setProjectFilterIds] = useState<string[]>([]);
    const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
    
    // REF PARA FILTRO DE PROYECTOS
    const projectFilterRef = useRef<HTMLDivElement>(null);

    const [isListingModalOpen, setListingModalOpen] = useState(false);
    const [isJobModalOpen, setJobModalOpen] = useState(false);
    const [isGroupModalOpen, setGroupModalOpen] = useState(false);
    const [groupToEdit, setGroupToEdit] = useState<HubGroup | undefined>(undefined);
    const [isDeleteGroupModalOpen, setDeleteGroupModalOpen] = useState(false);
    const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
    const [dmInput, setDmInput] = useState('');
    const [groupChatInput, setGroupChatInput] = useState('');
    const [isRecordingDm, setIsRecordingDm] = useState(false);
    const [isRecordingGroup, setIsRecordingGroup] = useState(false);
    const [isDmOpen, setIsDmOpen] = useState(false);
    const [dmRecipient, setDmRecipient] = useState<UserProfile | null>(null);
    const [dmInitialMessage, setDmInitialMessage] = useState('');
    
    const [isMobileSubMenuOpen, setMobileSubMenuOpen] = useState(false);
    
    const [itemToBuy, setItemToBuy] = useState<MarketplaceListing | null>(null);
    const [isSendingGroupMessage, setIsSendingGroupMessage] = useState(false);
    const [isSendingDm, setIsSendingDm] = useState(false);

    const [sendingMedia, setSendingMedia] = useState<{ url: string; name: string; type: string; } | null>(null);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [dmMediaToSend, setDmMediaToSend] = useState<{ file: File, previewUrl: string } | null>(null);
    const [groupMediaToSend, setGroupMediaToSend] = useState<{ file: File, previewUrl: string } | null>(null);
    
    const [showStickers, setShowStickers] = useState(false);
    const [showGroupStickers, setShowGroupStickers] = useState(false);

    const [isInviteMemberModalOpen, setInviteMemberModalOpen] = useState(false);
    const [inviteMemberEmail, setInviteMemberEmail] = useState('');
    const [activeMessages, setActiveMessages] = useState<DirectMessage[]>([]);
    const [hiddenGroupIds, setHiddenGroupIds] = useState<string[]>([]);
    
    const [feedFilter, setFeedFilter] = useState<'all' | 'circle'>('all');
    const [inviteFilter, setInviteFilter] = useState<'all' | 'circle'>('all');
    
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [postToShare, setPostToShare] = useState<HubPost | null>(null);

    // ESTADOS PARA CONVERSIÓN A TAREA v11.8
    const [isConvertToTaskModalOpen, setIsConvertToTaskModalOpen] = useState(false);
    const [convoToConvert, setConvoToConvert] = useState<any>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [isProcessingTask, setIsProcessingTask] = useState(false);

    const dmTextareaRef = useRef<HTMLTextAreaElement>(null);
    const groupChatTextareaRef = useRef<HTMLTextAreaElement>(null);
    const dmMessagesEndRef = useRef<HTMLDivElement>(null);
    const groupMessagesEndRef = useRef<HTMLDivElement>(null);
    
    // --- NUEVO: SISTEMA DE LECTURA INTELIGENTE v4.7 ---
    const [showNewPostsBanner, setShowNewPostsBanner] = useState(false);
    const feedContainerRef = useRef<HTMLDivElement>(null);
    const unreadPosts = useMemo(() => {
        if (!currentUser) return [];
        return hubPosts.filter(p => !p.groupId && !p.readBy?.includes(currentUser.uid));
    }, [hubPosts, currentUser]);

    useEffect(() => {
        if (unreadPosts.length > 0 && activeHubView === 'feed') {
            setShowNewPostsBanner(true);
        } else {
            setShowNewPostsBanner(false);
        }
    }, [unreadPosts.length, activeHubView]);

    const scrollToFirstUnread = () => {
        if (unreadPosts.length === 0) return;
        const firstUnreadId = unreadPosts[unreadPosts.length - 1].id; // El más antiguo no leído
        const element = document.getElementById(`post-${firstUnreadId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setShowNewPostsBanner(false);
        }
    };

    // DETECTAR CLIC FUERA DEL FILTRO DE PROYECTOS
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (projectFilterRef.current && !projectFilterRef.current.contains(event.target as Node)) {
                setIsProjectFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sync Full Screen State for Mobile Nav Hiding
    useEffect(() => {
        if (activeConversationData) {
            setIsAgentFullScreen(true);
        } else {
            setIsAgentFullScreen(false);
        }
        return () => setIsAgentFullScreen(false);
    }, [activeConversationData, setIsAgentFullScreen]);

    // Auto-scroll helper
    const scrollToBottom = (ref: React.RefObject<HTMLDivElement>) => {
        if (ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Auto-scroll on message updates (User DMs)
    useEffect(() => {
        if (activeConversationData?.id && activeConversationData.type === 'user') {
             setTimeout(() => scrollToBottom(dmMessagesEndRef), 100);
        }
    }, [activeConversationData?.id, activeMessages.length]);

    // Auto-scroll on post updates (Groups)
    const postsForGroup = useMemo(() => {
        if (activeConversationData?.type !== 'group') return [];
        return hubPosts.filter(p => p.groupId === activeConversationData.id).sort((a, b) => {
             const tA = getDateFromTimestamp(a.timestamp).getTime();
             const tB = getDateFromTimestamp(b.timestamp).getTime();
             return tA - tB;
        });
    }, [activeConversationData?.id, hubPosts]);

    useEffect(() => {
        if (activeConversationData?.type === 'group' && groupSubView === 'chat') {
            setTimeout(() => scrollToBottom(groupMessagesEndRef), 100);
        }
    }, [activeConversationData?.id, groupSubView, postsForGroup.length]);


    useEffect(() => {
        const isMobile = window.innerWidth < 1024;
        if (isMobile && !activeConversationData && activeHubView !== 'messages' && activeHubView !== 'feed') {
            setMobileSubMenuOpen(true);
        }
    }, []); 

    useEffect(() => {
        if (window.innerWidth < 1024 && (activeHubView === 'messages' || activeHubView === 'feed')) {
            setMobileSubMenuOpen(false);
        }
    }, [activeHubView]);

    const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
        onSwipedRight: (startX) => {
            if (activeConversationData) { setActiveConversationData(null); return; }
            if (!isMobileSubMenuOpen) { setMobileSubMenuOpen(true); } else { if ((window as any).openMainSidebar) { (window as any).openMainSidebar(); } }
        },
        onSwipedLeft: () => { if (isMobileSubMenuOpen) { setMobileSubMenuOpen(false); } }
    });

    const combinedConversations = useMemo(() => {
        const userConvos = conversations.filter(c => !c.deletedBy?.includes(currentUser?.uid || '')).map(c => ({...c, type: 'user' as const, lastActivity: c.lastMessage?.timestamp}));
        const activeAgentConvos = agentConversations.filter(c => !c.deletedBy?.includes(currentUser?.uid || ''));
        const agentConvos = activeAgentConvos.map(c => ({...c, type: 'agent' as const}));
        const userGroups = hubGroups.filter(g => g.members.includes(currentUser?.uid || ''));
        const activeGroups = userGroups.filter(g => {
            if (!hiddenGroupIds.includes(g.id)) return true;
            return false; 
        });
        
        const groupConvos = activeGroups.map(g => {
            const groupPosts = hubPosts.filter(p => p.groupId === g.id);
            const latestPost = groupPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            const lastActivity = latestPost ? latestPost.timestamp : (g.createdAt || null);
            
            return { id: g.id, name: g.name, type: 'group' as const, lastActivity: lastActivity, lastMessage: latestPost ? { text: `Mensaje del grupo: ${g.name}`, senderId: latestPost.author.uid, timestamp: latestPost.timestamp } : null, icon: g.icon, imageUrl: g.imageUrl, memberCount: g.memberCount, creatorId: g.creatorId };
        });

        return [...userConvos, ...agentConvos, ...groupConvos].sort((a, b) => {
            const timeA = getDateFromTimestamp(a.lastActivity || a.lastMessage?.timestamp).getTime();
            const timeB = getDateFromTimestamp(b.lastActivity || b.lastMessage?.timestamp).getTime();
            return timeB - timeA;
        });
    }, [conversations, agentConversations, currentUser, hubGroups, hubPosts, hiddenGroupIds]);

    const filteredConversations = useMemo(() => {
        let list = combinedConversations;
        
        // FILTRO DE TIPO (Personas/Agentes)
        if (messageFilter === 'people') list = list.filter(c => c.type === 'user');
        else if (messageFilter === 'agents') list = list.filter(c => c.type === 'agent');
        
        // FILTRO DE PROYECTOS v11.9
        if (projectFilterIds.length > 0) {
            list = list.filter(c => (c as any).projectId && projectFilterIds.includes((c as any).projectId));
        }

        return list;
    }, [combinedConversations, messageFilter, projectFilterIds]);
    
    useEffect(() => {
        if (activeConversationData) {
            const updatedConvo = combinedConversations.find(c => c.id === activeConversationData.id);
            if (updatedConvo) {
                if (updatedConvo.type === 'agent') {
                     setActiveConversationData(prev => prev ? ({ ...prev, ...updatedConvo }) : null);
                } else if (updatedConvo.type === 'user') {
                     setActiveConversationData(prev => prev ? ({ ...prev, ...updatedConvo }) : null);
                } else if (updatedConvo.type === 'group') {
                     setActiveConversationData(prev => prev ? ({ ...prev, ...updatedConvo }) : null);
                }
            }
        }
    }, [combinedConversations]);

    // LIMPIEZA DE NOTIFICACIONES AL SELECCIONAR CHAT
    useEffect(() => {
        if (!currentUser || !activeConversationData) return;

        const handleInteractionCleanup = async () => {
            // Mark conversation as read
            const batch = writeBatch(db);
            let hasUpdates = false;

            if (activeConversationData.type === 'user') {
                 const msgsRef = collection(db, `conversations/${activeConversationData.id}/messages`);
                 const qUnread = query(msgsRef, where("read", "==", false), where("senderId", "!=", currentUser.uid));
                 const snapshot = await getDocs(qUnread);
                 snapshot.forEach(doc => {
                     batch.update(doc.ref, { read: true });
                     hasUpdates = true;
                 });
                 
                 // CLEAR FAST UNREAD COUNTER ON THE CONVERSATION DOCUMENT
                 await updateDoc(doc(db, 'conversations', activeConversationData.id), { [`unreadBy.${currentUser.uid}`]: 0 }).catch(() => null);
                 // CLEAR SYSTEM NOTIFICATIONS FROM THIS SENDER
                 if (activeConversationData.otherUser) {
                    await markNotificationsReadForSender(activeConversationData.otherUser.uid);
                 }
            } else if (activeConversationData.type === 'group') {
                 markGroupPostsAsRead(activeConversationData.id);
            } else if (activeConversationData.type === 'agent') {
                if (activeConversationData.userId) {
                     await markNotificationsReadForSender(activeConversationData.userId);
                }
            }
            
            if (hasUpdates) {
                await batch.commit();
            }
        };
        
        handleInteractionCleanup();
    }, [activeConversationData?.id, activeConversationData?.type, currentUser]);

    useEffect(() => {
        if (!activeConversationData || activeConversationData.type !== 'user') {
             if (!activeConversationData) setActiveMessages([]);
             return;
        }

        const q = query(collection(db, `conversations/${activeConversationData.id}/messages`));
        
        const unsub = onSnapshot(q, (snap) => {
            const msgs = snap.docs.map(d => ({
                id: d.id, 
                ...d.data()
            } as DirectMessage));
            
            msgs.sort((a, b) => {
                const tA = getDateFromTimestamp(a.timestamp).getTime();
                const tB = getDateFromTimestamp(b.timestamp).getTime();
                return tA - tB;
            });

            setActiveMessages(msgs);
        }, (error) => {
            console.error("Error fetching messages:", error);
        });
        
        return () => unsub();
    }, [activeConversationData?.id, activeConversationData?.type]);

    const groupMembers = useMemo(() => {
        if (activeConversationData?.type !== 'group') return [];
        const group = hubGroups.find(g => g.id === activeConversationData.id);
        return group ? group.members.map(uid => allUsers.find(u => u.uid === uid)).filter((u): u is UserProfile => !!u) : [];
    }, [activeConversationData?.id, allUsers, hubGroups]);

    const dmMediaRecorderRef = useRef<MediaRecorder | null>(null);
    const groupMediaRecorderRef = useRef<MediaRecorder | null>(null);
    const dmAudioChunksRef = useRef<Blob[]>([]);
    const groupAudioChunksRef = useRef<Blob[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const groupFileInputRef = useRef<HTMLInputElement>(null);
    const subMenuRef = useRef<HTMLElement>(null);
    const mainContentRef = useRef<HTMLElement>(null);
    const groupChatContainerRef = useRef<HTMLDivElement>(null);
    
    const pendingGroupRequestsCount = useMemo(() => {
        if (!currentUser) return 0;
        return hubGroups.reduce((acc, group) => { if (group.creatorId === currentUser.uid && group.pendingMembers && group.pendingMembers.length > 0) { return acc + group.pendingMembers.length; } return acc; }, 0);
    }, [hubGroups, currentUser]);

    
    useEffect(() => {
        if (deepLinkTarget && typeof deepLinkTarget === 'object') {
            const { view, id, action } = deepLinkTarget;
            if (view === 'groups' && id) { 
                const group = hubGroups.find(g => g.id === id); 
                if (group) { 
                    setActiveHubView('groups'); 
                    setActiveConversationData({
                        id: group.id,
                        type: 'group',
                        name: group.name,
                        avatarUrl: group.imageUrl || null,
                    });
                    if (action === 'requests') setGroupSubView('requests'); 
                    setDeepLinkTarget(null); 
                    markGroupPostsAsRead(group.id);
                } 
            } else if (view === 'messages' && id) { 
                const convo = combinedConversations.find(c => c.id === id);
                if (convo) {
                    setActiveHubView('messages'); 
                    setActiveConversationData(convo as any);
                    setDeepLinkTarget(null);
                } else if (!id.includes('_')) {
                    // It's a user ID, try to open DM modal or find conversation
                    const otherUser = allUsers.find(u => u.uid === id);
                    if (otherUser && currentUser) {
                        const conversationId = [currentUser.uid, otherUser.uid].sort().join('_');
                        const existingConvo = combinedConversations.find(c => c.id === conversationId);
                        if (existingConvo) {
                            setActiveHubView('messages');
                            setActiveConversationData(existingConvo as any);
                        } else {
                            setActiveHubView('messages');
                            setDmRecipient(otherUser);
                            setIsDmOpen(true);
                        }
                    }
                    setDeepLinkTarget(null);
                }
            } else if (view === 'feed' && id) { setActiveHubView('feed'); setTimeout(() => { const postElement = document.getElementById(`post-${id}`); if (postElement) { postElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); postElement.classList.add('animate-pulse-once'); setTimeout(() => postElement.classList.remove('animate-pulse-once'), 2000); } }, 100); setDeepLinkTarget(null); } else if (view === 'post' && id) { setActiveHubView('feed'); setTimeout(() => { const postElement = document.getElementById(`post-${id}`); if (postElement) { postElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); postElement.classList.add('animate-pulse-once'); setTimeout(() => postElement.classList.remove('animate-pulse-once'), 2000); } }, 1000); setDeepLinkTarget(null); }
        }
    }, [deepLinkTarget, setDeepLinkTarget, hubGroups, combinedConversations, setActiveHubView, markGroupPostsAsRead]);

    useEffect(() => { 
        if (activeConversationData && activeConversationData.type === 'group' && groupSubView === 'chat' && currentUser) { 
            markGroupPostsAsRead(activeConversationData.id);
        } 
    }, [activeConversationData, groupSubView, hubPosts, currentUser, markGroupPostsAsRead]);

    useEffect(() => { if (activeConversationData && activeConversationData.type === 'user' && activeConversationData.otherUser) { markNotificationsReadForSender(activeConversationData.otherUser.uid); } }, [activeConversationData, markNotificationsReadForSender]);
    
    const handleDeleteGroup = () => { 
        if (activeConversationData && activeConversationData.type === 'group') { 
            deleteHubGroup(activeConversationData.id); 
            setActiveConversationData(null); 
        } 
        setDeleteGroupModalOpen(false); 
    };    
    
    const handleViewProfile = (user: Partial<UserProfile> & { uid: string }) => { 
        if (user.uid === 'shivo_ai') {
            setCurrentView('aiStudio');
            window.location.hash = 'aiStudio/chat';
            return;
        }
        
        const fullUser = allUsers.find(u => u.uid === user.uid) || (user as UserProfile); 
        setViewingProfile(fullUser);
        setCurrentView('profile'); 
        window.location.hash = `profile`; 
        
        // Clean notifications for this user when viewing their profile (likely to interact)
        markNotificationsReadForSender(user.uid);
    };

    const handleMessageClick = (targetUser: UserProfile, initialMsg: string = '') => { 
        const isCircle = userProfile.circle?.includes(targetUser.uid);
        
        if (targetUser.isPrivate && !isCircle) {
             setToastNotification({
                 title: "Perfil Privado",
                 message: "Solo las conexiones del círculo pueden enviar mensajes a este usuario.",
                 icon: "lock"
             });
             return;
        }
        
        // CLEAN NOTIFICATIONS UPON CLICKING NAME
        markNotificationsReadForSender(targetUser.uid);

        setDmRecipient(targetUser); 
        setDmInitialMessage(initialMsg); 
        setIsDmOpen(true); 
    };
    
    const handleSharePost = (post: HubPost) => {
        setPostToShare(post);
        setIsShareModalOpen(true);
    };

    const handleShareGroup = (group: HubGroup) => { navigator.clipboard.writeText(`${window.location.origin}/#hub/group/invite/${group.id}`); setToastNotification({ title: "Enlace Copiado", message: `El enlace de invitación para "${group.name}" ha sido copiado.`, icon: 'share' }); };
    const handleSendToProject = () => { if (sendingMedia && targetProjectId) { sendHubMediaToProject(sendingMedia, targetProjectId); setSendingMedia(null); } };
    const handleOpenMobileSubMenu = () => { setMobileSubMenuOpen(true); };
    
    const handleContactSeller = (item: MarketplaceListing) => { 
        if (!item.user || !item.user.uid) { 
            setToastNotification({ title: "Error", message: "No se pudo contactar al vendedor.", icon: 'close' }); 
            return; 
        } 
        const seller = allUsers.find(u => u.uid === item.user.uid) || (item.user as unknown as UserProfile);
        handleMessageClick(seller, `Hola, estoy interesado en comprar tu "${item.title}". ¿Podemos coordinar el pago y la entrega?`); 
    }
    const handleContactRecruiter = (job: MarketplaceListing) => { 
        // Fixed: changed 'item' to 'job' as 'item' was not defined in this scope
        const recruiter = allUsers.find(u => u.uid === job.user.uid) || (job.user as unknown as UserProfile);
        handleMessageClick(recruiter, `Hola, estoy interesado en la posición de "${job.title}" en ${job.company}. ¿Podrías darme más información?`); 
    }

    const handleConfirmBuyIntis = () => { if (itemToBuy) { buyItem(itemToBuy); setItemToBuy(null); } }
    
    const handleStartRecordingDm = async () => { if (isRecordingDm) return; setIsRecordingDm(true); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); dmMediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' }); dmAudioChunksRef.current = []; dmMediaRecorderRef.current.ondataavailable = (event: any) => { dmAudioChunksRef.current.push(event.data); }; dmMediaRecorderRef.current.onstop = () => { const audioBlob = new Blob(dmAudioChunksRef.current, { type: 'audio/webm' }); const audioFile = new File([audioBlob], "voice-note-dm.webm", { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { setDmMediaToSend({ file: audioFile, previewUrl: reader.result as string }); }; stream.getTracks().forEach(track => track.stop()); }; dmMediaRecorderRef.current.start(); } catch (err) { console.error("Mic access error", err); setIsRecordingDm(false); } };
    const handleStopRecordingDm = () => { if (dmMediaRecorderRef.current && isRecordingDm) { dmMediaRecorderRef.current.stop(); setIsRecordingDm(false); } };
    const handleStartRecordingGroup = async () => { if (isRecordingGroup) return; setIsRecordingGroup(true); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); groupMediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' }); groupAudioChunksRef.current = []; groupMediaRecorderRef.current.ondataavailable = (event: any) => { groupAudioChunksRef.current.push(event.data); }; groupMediaRecorderRef.current.onstop = () => { const audioBlob = new Blob(groupAudioChunksRef.current, { type: 'audio/webm' }); const audioFile = new File([audioBlob], "voice-note-group.webm", { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { setGroupMediaToSend({ file: audioFile, previewUrl: reader.result as string }); }; stream.getTracks().forEach(track => track.stop()); }; groupMediaRecorderRef.current.start(); } catch (err) { console.error("Mic access error", err); setIsRecordingGroup(false); } };
    const handleStopRecordingGroup = () => { if (groupMediaRecorderRef.current && isRecordingGroup) { groupMediaRecorderRef.current.stop(); setIsRecordingGroup(false); } };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { setDmMediaToSend({ file: file, previewUrl: event.target?.result as string }); }; reader.readAsDataURL(file); if (fileInputRef.current) fileInputRef.current.value = ''; } };
    const handleGroupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { setGroupMediaToSend({ file: file, previewUrl: event.target?.result as string }); }; reader.readAsDataURL(file); if (groupFileInputRef.current) groupFileInputRef.current.value = ''; } };

    const handleSendDm = async (stickerUrl?: string) => {
        if ((!dmInput.trim() && !dmMediaToSend && !stickerUrl) || !activeConversationData || isSendingDm) return;
        
        const isAgentChat = activeConversationData.type === 'agent';
        if (isAgentChat && !(activeConversationData as any).automationPaused) { 
             setToastNotification({ title: "Automatizado", message: "Pausa la automatización para intervenir manualmente.", icon: 'agent' }); 
             return; 
        }
        
        const cleanInput = dmInput.trim(); 
        setDmInput(''); 
        setDmInput(''); 
        setDmMediaToSend(null); 
        setShowStickers(false);
        
        setTimeout(() => {
            if (dmTextareaRef.current) {
                dmTextareaRef.current.focus();
            }
        }, 0);

        setIsSendingDm(true);
        let filePayload: { name: string; type: string; url: string; size?: number; driveFileId?: string } | undefined = undefined;
        let audioUrl: string | undefined = undefined;
        try {
            if (dmMediaToSend) { 
                const safeFileName = dmMediaToSend.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uploaded = await uploadWithQuotaCheck({
                    userId: currentUser?.uid || userProfile.uid,
                    data: dmMediaToSend.file,
                    path: safeStoragePath('drive', currentUser?.uid || userProfile.uid, 'messages', `${Date.now()}_${safeFileName}`),
                    sizeBytes: dmMediaToSend.file.size,
                    metadata: { contentType: dmMediaToSend.file.type || 'application/octet-stream' },
                    plan: userProfile?.plan
                });
                const downloadUrl = uploaded.url; 
                
                const driveFileId = `message-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const driveFile = {
                    id: driveFileId,
                    name: dmMediaToSend.file.name,
                    url: downloadUrl,
                    type: dmMediaToSend.file.type || 'application/octet-stream',
                    size: dmMediaToSend.file.size,
                    date: new Date().toISOString(),
                    origin: 'Mensajes',
                    parentId: 'personal',
                    parentName: 'Personal',
                    isUnassigned: true
                };

                if (currentUser?.uid) {
                    const driveSettingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
                    await setDoc(
                        driveSettingsRef,
                        {
                            personalFiles: arrayUnion(driveFile),
                            updatedAt: new Date().toISOString()
                        },
                        { merge: true }
                    );
                }

                if (dmMediaToSend.file.type.startsWith('audio/')) { 
                    audioUrl = downloadUrl; 
                } else { 
                    filePayload = { name: dmMediaToSend.file.name, type: dmMediaToSend.file.type || 'application/octet-stream', url: downloadUrl, size: dmMediaToSend.file.size, driveFileId }; 
                } 
            }

            const textToSend = stickerUrl ? '' : cleanInput;

            if (activeConversationData.type === 'user' && activeConversationData.otherUser) { 
                await sendDirectMessage(activeConversationData.otherUser, textToSend, filePayload, audioUrl, stickerUrl); 
            } else { 
                const ref = doc(db, 'agentConversations', activeConversationData.id); 
                
                const msgData: any = { 
                    id: `manual-${Date.now()}`, 
                    role: 'model', 
                    text: textToSend,
                    timestamp: new Date().toISOString()
                };

                if (filePayload) {
                    msgData.file = filePayload;
                    if (filePayload.type.startsWith('image/')) {
                        msgData.imageUrl = filePayload.url;
                    }
                }
                if (audioUrl) {
                    msgData.audioUrl = audioUrl;
                }
                
                if (stickerUrl) {
                    msgData.stickerUrl = stickerUrl;
                }

                await updateDoc(ref, { 
                    history: arrayUnion(msgData), 
                    lastActivity: new Date().toISOString() 
                }); 
            }
             
            setTimeout(() => scrollToBottom(dmMessagesEndRef), 100);

        } catch(e) { 
            console.error("Error sending DM", e); 
            alert("Error sending message. Please try again."); 
        } finally { 
            setIsSendingDm(false);
            setTimeout(() => {
                 if (dmTextareaRef.current) {
                     dmTextareaRef.current.focus();
                 }
            }, 50);
        }
    };
    
    const handleSendGroupMessage = async (stickerUrl?: string) => {
        if ((!groupChatInput.trim() && !groupMediaToSend && !stickerUrl) || !activeConversationData || isSendingGroupMessage) return;
        const cleanInput = groupChatInput.trim(); setGroupChatInput(''); setGroupMediaToSend(null); setShowGroupStickers(false);
        
        setTimeout(() => {
            if (groupChatTextareaRef.current) {
                groupChatTextareaRef.current.focus();
            }
        }, 0);

        setIsSendingGroupMessage(true);
        let media = undefined;
        try {
            if (groupMediaToSend) { 
                const uploaded = await uploadWithQuotaCheck({
                    userId: currentUser?.uid || userProfile.uid,
                    data: groupMediaToSend.file,
                    path: safeStoragePath('hub-media', currentUser?.uid || userProfile.uid, activeConversationData.id, `${Date.now()}_${groupMediaToSend.file.name}`),
                    sizeBytes: groupMediaToSend.file.size,
                    metadata: { contentType: groupMediaToSend.file.type || 'application/octet-stream' },
                    plan: userProfile.plan
                });
                const downloadUrl = uploaded.url; let type = 'file'; if (groupMediaToSend.file.type.startsWith('image/')) type = 'image'; else if (groupMediaToSend.file.type.startsWith('video/')) type = 'video'; else if (groupMediaToSend.file.type.startsWith('audio/')) type = 'audio'; media = { url: downloadUrl, type, name: groupMediaToSend.file.name, originalType: groupMediaToSend.file.type }; }
            const textToSend = stickerUrl ? '' : cleanInput;
            await addHubPost(textToSend, activeConversationData.id, media, stickerUrl, true); 
            setTimeout(() => scrollToBottom(groupMessagesEndRef), 100);
        } catch(e) { console.error("Error sending group message", e); alert("Error sending message. Please try again."); } 
        finally { 
            setIsSendingGroupMessage(false); 
            setTimeout(() => {
                 if (groupChatTextareaRef.current) {
                     groupChatTextareaRef.current.focus();
                 }
            }, 50);
        }
    };

    const handleDeleteConversation = (convId: string) => { 
        if(activeConversationData?.type === 'user') { deleteConversation(convId); } 
        else if (activeConversationData?.type === 'agent') { deleteAgentConversation(convId); } 
        else if (activeConversationData?.type === 'group') { setHiddenGroupIds(prev => [...prev, convId]); } 
        setDeletingConversationId(null); 
        if(activeConversationData?.id === convId) setActiveConversationData(null); 
    };

    const handleInviteMember = async (email: string) => {
        if (!email.trim() || !activeConversationData || activeConversationData.type !== 'group') return;
        const group = hubGroups.find(g => g.id === activeConversationData.id);
        if (!group) return;
        
        const userToInvite = allUsers.find(u => u.email === email);
        if (!userToInvite) { setToastNotification({ title: "Error", message: "Usuario no encontrado.", icon: 'close' }); return; }
        if (group.members.includes(userToInvite.uid)) { setToastNotification({ title: "Info", message: "El usuario ya es miembro.", icon: 'user' }); return; }
        try {
            await createNotification(userToInvite.uid, {
                type: 'group_join_request', text: `<strong>${userProfile.name}</strong> te ha invitado a unirte al grupo <strong>${group.name}</strong>.`, link: `/#hub/group/${group.id}`, fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
            });
            const groupRef = doc(db, "hubGroups", group.id);
            await updateDoc(groupRef, { pendingMembers: arrayUnion(userToInvite.uid) });
            setToastNotification({ title: "Invitación Enviada", message: `Se ha enviado una solicitud a ${userToInvite.name}.`, icon: 'check' });
        } catch (e) { console.error("Invite failed", e); setToastNotification({ title: "Error", message: "Falló la invitación.", icon: 'close' }); }
    };

    const handleAddToCircle = async (uid: string) => { await sendCircleRequest(uid); }
    const handleCancelRequest = async (uid: string) => { if (!currentUser) return; try { await updateDoc(doc(db, "users", uid), { circleRequests: arrayRemove(currentUser.uid) }); setToastNotification({ title: "Solicitud Cancelada", message: "Has cancelado la solicitud.", icon: 'close' }); } catch (e) { console.error(e); } }
    
    const getPresenceStatus = (lastSeen?: string): 'online' | 'offline' | 'away' => { if (!lastSeen) return 'offline'; const last = new Date(lastSeen).getTime(); const now = Date.now(); const diff = (now - last) / 1000 / 60; if (diff < 5) return 'online'; if (diff < 30) return 'away'; return 'offline'; };
    const toggleAgentPause = async (agentConvoId: string, isPaused: boolean) => { try { await updateDoc(doc(db, 'agentConversations', agentConvoId), { automationPaused: !isPaused }); setToastNotification({ title: !isPaused ? "Automatización Pausada" : "Automatización Reanudada", message: !isPaused ? "Ahora puedes intervenir manualmente." : "El agente ha retomado el control.", icon: !isPaused ? "pause" : "ai" }); } catch (e) { console.error("Error toggling agent pause", e); } };

    const TABS: { id: HubView, labelKey: keyof Translations, icon: React.ComponentProps<typeof Icon>['name'] }[] = [
        { id: 'feed', labelKey: 'feed', icon: 'goat' },
        { id: 'messages', labelKey: 'message', icon: 'message' },
        { id: 'people', labelKey: 'people', icon: 'users' },
        { id: 'groups', labelKey: 'groups', icon: 'hub' },
        { id: 'jobs', labelKey: 'jobs', icon: 'briefcase' },
        { id: 'marketplace', labelKey: 'marketplace', icon: 'market' },
    ];
    
    const postsForFeed = useMemo(() => { const allFeedPosts = hubPosts.filter(p => !p.groupId); if (feedFilter === 'circle') { return allFeedPosts.filter(p => userProfile.circle?.includes(p.author.uid) || p.author.uid === userProfile.uid); } return allFeedPosts; }, [hubPosts, feedFilter, userProfile.circle, userProfile.uid]);
    const groupsForView = useMemo(() => { if (groupView === 'all') return hubGroups; return hubGroups.filter(g => g.members.includes(currentUser?.uid || '')); }, [hubGroups, groupView, currentUser]);
    const usersForInvite = useMemo(() => { const baseList = allUsers.filter(u => u.uid !== currentUser?.uid && (!activeConversationData || activeConversationData.type !== 'group' || !hubGroups.find(g => g.id === activeConversationData.id)?.members.includes(u.uid))); if (inviteFilter === 'circle') { return baseList.filter(u => userProfile.circle?.includes(u.uid)); } return baseList; }, [allUsers, currentUser, activeConversationData, inviteFilter, userProfile.circle]);

    // LÓGICA DE CONVERSIÓN A TAREA v11.8
    const handleOpenConvertTask = (convo: any) => {
        setConvoToConvert(convo);
        setNewTaskTitle(`Seguimiento: ${convo.name || convo.agentName || 'Chat'}`);
        setTargetProjectId(projects[0]?.id || '');
        setIsConvertToTaskModalOpen(true);
    };

    const handleConfirmConvertTask = async () => {
        if (!targetProjectId || !newTaskTitle.trim() || !convoToConvert) return;
        setIsProcessingTask(true);
        try {
            const project = projects.find(p => p.id === targetProjectId);
            if (project && project.folders.length > 0) {
                const folderId = project.folders[0].id;
                await createTask({
                    title: newTaskTitle.trim(),
                    description: `Seguimiento generado desde chat de Comunidad.`,
                    projectId: targetProjectId,
                    folderId: folderId,
                    date: new Date().toISOString().split('T')[0],
                    status: 'Por Hacer'
                }, folderId);

                // ACTUALIZAR CONVERSACIÓN CON EL ID DEL PROYECTO PARA MOSTRAR ETIQUETA
                if (convoToConvert.type === 'user') {
                    await updateDoc(doc(db, 'conversations', convoToConvert.id), { projectId: targetProjectId });
                } else if (convoToConvert.type === 'agent') {
                    await updateDoc(doc(db, 'agentConversations', convoToConvert.id), { projectId: targetProjectId });
                }

                setToastNotification({ title: "Tarea Creada", message: `Se añadió seguimiento a ${project.name}`, icon: "check" });
                setIsConvertToTaskModalOpen(false);
                setConvoToConvert(null);
            }
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo crear la tarea.", icon: "close" });
        } finally {
            setIsProcessingTask(false);
        }
    };

    // NUEVAS FUNCIONES PARA FILTRO DE PROYECTO v11.9
    const toggleProjectFilter = (pid: string) => {
        setProjectFilterIds(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]);
    };

    const clearProjectFilters = () => setProjectFilterIds([]);

    const renderActiveChatPanel = () => {
         if (!activeConversationData) return null;
         
         const targetGroup = activeConversationData.type === 'group' ? hubGroups.find(g => g.id === activeConversationData.id) : null;
         
         if (activeConversationData.type === 'group' && targetGroup) {
             const isMember = targetGroup.members.includes(currentUser?.uid || '');
             const isCreator = targetGroup.creatorId === currentUser?.uid;
             const pendingUsers = (targetGroup.pendingMembers || []).map(uid => allUsers.find(u => u.uid === uid)).filter((u): u is UserProfile => !!u);
             const isPending = targetGroup.pendingMembers?.includes(currentUser?.uid || '');
             const canPost = !targetGroup.onlyAdminsCanPost || isCreator;
             
             const creator = allUsers.find(u => u.uid === targetGroup.creatorId);

             if (!isMember) {
                 if (isPending) {
                      return ( 
                        <Card className="p-12 text-center h-full flex flex-col items-center justify-center"> 
                            <Icon name="hub" className="w-16 h-16 text-brand-primary mb-4"/> 
                            <h3 className="text-2xl font-bold mb-2">{targetGroup.name}</h3> 
                            <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">Has enviado una solicitud para unirte.</p> 
                            <div className="flex gap-4"> 
                                <Button onClick={() => { cancelGroupJoinRequest(targetGroup.id); setActiveConversationData(null); }} variant="secondary" className="text-red-500 border border-red-200">Cancelar Solicitud</Button> 
                            </div> 
                        </Card> 
                     );
                 }
                 if (targetGroup.isPrivate) { 
                     return ( <Card className="p-12 text-center h-full flex flex-col items-center justify-center"> <Icon name="security" className="w-16 h-16 text-amber-500 mb-4"/> <h3 className="text-2xl font-bold mb-2">{targetGroup.name}</h3> <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">Este es un grupo privado. Debes ser miembro para ver su contenido.</p> <div className="flex gap-4"> <Button onClick={() => joinGroup(targetGroup.id)} disabled={isPending} variant="primary"> {isPending ? 'Solicitud Pendiente' : 'Solicitar Unirse'} </Button> <Button onClick={() => setActiveConversationData(null)} variant="secondary">Volver a Grupos</Button> </div> </Card> ); 
                 }
             }
            
            return (
                <div className="flex flex-col h-full overflow-hidden relative bg-white dark:bg-dark-bg">
                    {isDeleteGroupModalOpen && (
                        <Modal isOpen={isDeleteGroupModalOpen} onClose={() => setDeleteGroupModalOpen(false)} title="Eliminar Grupo">
                            <p>¿Estás seguro de que quieres eliminar este grupo permanentemente? Esta acción se puede deshacer.</p>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="secondary" onClick={() => setDeleteGroupModalOpen(false)}>Cancelar</Button>
                                <Button variant="primary" onClick={handleDeleteGroup} className="bg-red-50 hover:bg-red-600 text-white">Eliminar</Button>
                            </div>
                        </Modal>
                    )}

                    <div className="p-3 sm:p-4 border-b border-light-border dark:border-dark-border bg-light-surface/95 dark:bg-dark-surface/95 backdrop-blur-sm z-10 flex-none flex items-center justify-between shadow-sm">
                         <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setGroupSubView('members'); }}>
                             <button onClick={() => { setActiveConversationData(null); }} className="lg:hidden p-1 mr-1"><Icon name="chevronLeft" className="w-6 h-6 text-brand-primary"/></button>
                            {targetGroup.imageUrl ? ( <img src={targetGroup.imageUrl} alt={targetGroup.name} className="w-10 h-10 rounded-full object-contain" /> ) : ( <div className="w-10 h-10 bg-brand-accent/20 rounded-full flex items-center justify-center"><Icon name={targetGroup.icon} className="w-6 h-6 text-brand-primary"/></div> )}
                            <div> <h2 className="text-base sm:text-lg font-bold truncate max-w-[150px] sm:max-w-[200px]">{targetGroup.name}</h2> <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1"> {targetGroup.memberCount} miembros {groupSubView !== 'chat' && <span className="opacity-50">• {groupSubView === 'requests' ? 'Solicitudes' : 'Detalles'}</span>} </p> </div>
                        </div>
                        <div className="flex items-center gap-1">
                             {isCreator && pendingUsers.length > 0 && ( <Button size="sm" variant="ghost" className="relative !p-2 text-brand-primary" onClick={() => setGroupSubView('requests')} title="Solicitudes"> <Icon name="users" className="w-5 h-5"/> <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-dark-surface"></span> </Button> )}
                             {targetGroup.memberCount <= 50 && groupSubView === 'chat' && ( <> <Button size="sm" variant="ghost" className="!p-2 text-neutral-800 dark:text-white" onClick={() => startCall(groupMembers, 'audio')} title="Llamada de Voz"> <Icon name="phone" className="w-5 h-5"/> </Button> <Button size="sm" variant="ghost" className="!p-2 text-neutral-800 dark:text-white" onClick={() => startCall(groupMembers, 'video')} title="Videollamada"> <Icon name="video" className="w-5 h-5"/> </Button> </> )}
                             {isCreator && <Button size="sm" variant="ghost" className="!p-2" onClick={() => {
                                 const emails = groupMembers.map(m => m.email).filter(Boolean).join(', ');
                                 if (!emails) return setToastNotification({title:"Sin Correos", message:"Ningún miembro del grupo ha configurado su correo", icon:"info"});
                                 setMailDraft({
                                     to: emails,
                                     subject: `Comunicado: ${targetGroup.name}`,
                                     htmlBody: `
                                         <div style="text-align:center; margin-bottom:20px;">
                                             <div style="display:inline-block;padding:15px;background:#10B981;border-radius:50%;color:white;margin-bottom:10px;">
                                                 ★
                                             </div>
                                             <h2 style="margin:0;color:#111827;font-size:24px;">Comunicado Especial</h2>
                                             <p style="margin:5px 0 0;color:#6B7280;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Comunidad Goatify Hub</p>
                                         </div>
                                         <p style="color:#374151;">Hola a todos en <strong>${targetGroup.name}</strong>,</p>
                                         <br/>
                                         <p style="color:#374151;font-style:italic;background:#F3F4F6;padding:15px;border-radius:8px;">[Elimina esto y escribe tu comunicado interno aquí]</p>
                                         <br/>
                                         <div style="text-align:center; margin-top:30px;">
                                             <a href="https://ia.goatify.app/#hub" style="display:inline-block;padding:12px 24px;background-color:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">Ir al Grupo en Social Hub</a>
                                         </div>
                                     `
                                 });
                                 setCurrentView('mail');
                             }} title="Enviar Comunicado o Newsletter por correo"><Icon name="mail" className="w-5 h-5"/></Button>}
                             {isCreator && <Button size="sm" variant="ghost" className="!p-2" onClick={() => setInviteMemberModalOpen(true)} title="Invitar Miembro"><Icon name="plus" className="w-5 h-5"/></Button>}
                             <Button size="sm" variant="ghost" className="!p-2" onClick={() => setGroupSubView(groupSubView === 'chat' ? 'members' : 'chat')} title={groupSubView === 'chat' ? 'Info del Grupo' : 'Volver al Chat'}> <Icon name={groupSubView === 'chat' ? 'list' : 'message'} className="w-5 h-5"/> </Button>
                             {isCreator && (
                                <Button onClick={() => setDeleteGroupModalOpen(true)} variant="ghost" size="sm" className="!p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar Grupo">
                                    <Icon name="trash" className="w-5 h-5"/>
                                </Button>
                             )}
                             <Button onClick={() => { setActiveConversationData(null); }} variant="ghost" size="sm" className="!p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 hidden lg:block" title="Cerrar Grupo"> <Icon name="close" className="w-5 h-5"/> </Button>
                        </div>
                    </div>
                    
                    {groupSubView === 'chat' && (
                         <>
                             <div ref={groupChatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative z-0 bg-neutral-100 dark:bg-[#0d0d0d] pb-32">
                                <div className="absolute inset-0 opacity-5 dark:opacity-[0.02] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>
                                {postsForGroup.length > 0 ? ( postsForGroup.map((post, idx) => { 
                                    const isMe = post.author.uid === currentUser?.uid; 
                                    const allRead = post.readBy && post.readBy.length >= targetGroup.memberCount; 
                                    return ( <div key={post.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-subtle-slide-in-up group/message relative z-10`}> <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}> {!isMe && ( <img src={post.author.avatarUrl || `https://ui-avatars.com/api/?name=${post.author.name.replace(' ', '+')}&background=6D28D9&color=fff`} alt={post.author.name} className="w-6 h-6 rounded-full object-contain mb-1 cursor-pointer shadow-sm" onClick={() => handleViewProfile(post.author)} title={post.author.name} /> )} <div className={`relative px-3 py-2 shadow-sm text-sm ${ isMe ? 'bg-brand-primary text-white rounded-2xl rounded-tr-sm' : 'bg-white dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-2xl rounded-tl-none' } ${post.stickerUrl ? '!bg-transparent !p-0 shadow-none border-0' : ''}`}> {!isMe && !post.stickerUrl && <p className="text-[10px] font-bold text-brand-secondary mb-0.5 cursor-pointer hover:underline" onClick={() => handleViewProfile(post.author)}>{post.author.name}</p>} {post.stickerUrl ? ( <img src={post.stickerUrl} alt="Sticker" className="w-32 h-32 object-contain drop-shadow-md" /> ) : ( <> {post.content && <ChatMessageRenderer text={post.content} className={isMe ? 'text-white' : ''} />} {post.imageUrl && <img src={post.imageUrl} alt="Shared" className="rounded-lg mt-2 max-h-60 w-auto object-contain cursor-pointer" onClick={() => window.open(post.imageUrl, '_blank')}/>} {post.videoUrl && <video src={post.videoUrl} controls className="rounded-lg mt-2 max-h-60 w-auto bg-black"/>} {post.audioUrl && <div className={`mt-2 flex items-center gap-2 p-2 rounded-lg ${isMe ? 'bg-white/20' : 'bg-neutral-100 dark:bg-neutral-800'}`}><Icon name="mic" className="w-4 h-4"/><audio src={post.audioUrl} controls className="h-8 w-48"/></div>} {post.file && !post.imageUrl && !post.videoUrl && !post.audioUrl && ( <div className={`mt-2 flex items-center gap-2 p-2 rounded-lg cursor-pointer ${isMe ? 'bg-white/20 hover:bg-white/30' : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`} onClick={() => window.open(post.file?.url, '_blank')}> <Icon name="folder" className="w-5 h-5"/> <span className="truncate max-w-[150px] font-medium">{post.file.name}</span> <Icon name="upload" className="w-4 h-4 ml-1 opacity-70"/> </div> )} </> )} <div className={`flex items-center justify-end gap-1 mt-1 ${post.stickerUrl ? 'bg-black/30 rounded-full px-2 py-0.5 w-fit ml-auto backdrop-blur-sm' : ''}`}> <span className={`text-[10px] ${isMe || post.stickerUrl ? 'text-white/80' : 'text-neutral-400'}`}> {getDateFromTimestamp(post.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} </span> {isMe && ( allRead ? <Icon name="check-double" className="w-3 h-3 text-blue-300"/> : <Icon name="check" className="w-3 h-3 opacity-70"/> )} </div> </div> {(isMe || isCreator) && <button onClick={() => deleteHubPost(post.id)} className="lg:opacity-0 lg:group-hover/message:opacity-100 opacity-100 text-neutral-400 hover:text-red-500 transition-opacity p-1 self-center"><Icon name="trash" className="w-4 h-4"/></button>} </div> </div> ); }) ) : ( <div className="h-full flex flex-col items-center justify-center text-center opacity-60 p-8"> <div className="bg-neutral-200 dark:bg-neutral-800 p-4 rounded-full mb-4"> <Icon name="message" className="w-8 h-8 text-neutral-400"/> </div> <p className="text-sm font-medium">No hay mensajes aún.</p> <p className="text-xs">¡Inicia la conversación en este grupo!</p> </div> )} <div ref={groupMessagesEndRef}></div> </div> 
                             <div className="flex-none p-2 bg-white dark:bg-dark-surface border-t border-light-border dark:border-dark-border z-[150] fixed bottom-0 left-0 right-0 lg:relative lg:bottom-0">
                                 {groupMediaToSend && ( <div className="absolute bottom-full left-0 w-full bg-white dark:bg-dark-surface border-t border-light-border dark:border-dark-border p-2 flex items-center gap-3 animate-slide-in-up shadow-lg z-10"> {groupMediaToSend.file.type.startsWith('image/') && <img src={groupMediaToSend.previewUrl} alt="preview" className="h-16 w-16 object-contain rounded-lg border border-light-border dark:border-dark-border"/>} {groupMediaToSend.file.type.startsWith('video/') && <video src={groupMediaToSend.previewUrl} className="h-16 w-16 object-cover rounded-lg border border-light-border dark:border-dark-border bg-black"/>} {!groupMediaToSend.file.type.startsWith('image/') && !groupMediaToSend.file.type.startsWith('video/') && <div className="h-16 w-16 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center border border-light-border dark:border-dark-border shadow-sm"><Icon name="folder" className="w-8 h-8 text-neutral-400"/></div>} <div className="flex-1 min-w-0"> <p className="text-sm font-semibold truncate">{groupMediaToSend.file.name}</p> <p className="text-xs text-neutral-500">{(groupMediaToSend.file.size / 1024).toFixed(1)} KB</p> </div> <button onClick={() => setGroupMediaToSend(null)} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full"><Icon name="close" className="w-5 h-5"/></button> </div> )}
                                 {showGroupStickers && canPost && <StickerPicker onSelect={(url) => handleSendGroupMessage(url)} onInsertEmoji={(emoji) => setGroupChatInput(prev => prev + emoji)} onClose={() => setShowGroupStickers(false)} />}
                                 {!canPost ? ( <div className="text-center text-sm text-gray-500 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg"> <Icon name="lock" className="w-4 h-4 inline-block mr-1"/> Solo los administradores pueden publicar mensajes. </div> ) : ( <div className="flex items-end gap-2"> <div className="flex-shrink-0 flex gap-1 pb-1"> <button onClick={() => setShowGroupStickers(!showGroupStickers)} className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors" title="Stickers"> <span className="text-xl leading-none filter grayscale hover:grayscale-0 transition-all">😊</span> </button> <input type="file" ref={groupFileInputRef} className="hidden" onChange={handleGroupFileChange} accept="*" /> <button onClick={() => groupFileInputRef.current?.click()} className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors" title="Adjuntar"> <Icon name="plus" className="w-6 h-6"/> </button> </div> <div className="flex-grow bg-neutral-100 dark:bg-neutral-800 rounded-2xl flex items-center px-1 py-1 min-h-[44px] border border-transparent focus-within:border-brand-primary/30 focus-within:ring-2 focus-within:ring-brand-primary/10 transition-all"> <Textarea ref={groupChatTextareaRef} value={groupChatInput} onChange={e => setGroupChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendGroupMessage())} placeholder="Escribe un mensaje..." className="!mt-0 w-full bg-transparent border-none focus:ring-0 !p-2 max-h-32 min-h-[36px] !shadow-none resize-none" rows={1} style={{ height: 'auto' }} disabled={false} /> </div> <div className="flex-shrink-0 pb-1"> {(groupChatInput.trim() || groupMediaToSend) ? ( <button onClick={() => handleSendGroupMessage()} className="p-3 bg-brand-primary hover:bg-brand-secondary text-white rounded-full shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center justify-center" disabled={isSendingGroupMessage}> <Icon name={isSendingGroupMessage ? "sync" : "send"} className={`w-5 h-5 translate-x-0.5 ${isSendingGroupMessage ? 'animate-spin' : ''}`}/> </button> ) : ( <button onMouseDown={handleStartRecordingGroup} onMouseUp={handleStopRecordingGroup} onTouchStart={handleStartRecordingGroup} onTouchEnd={handleStartRecordingGroup} className={`p-3 rounded-full shadow-md transition-all ${isRecordingGroup ? 'bg-red-500 text-white animate-pulse scale-110' : 'bg-brand-primary hover:bg-brand-secondary text-white'}`}> <Icon name="mic" className="w-4 h-4"/> </button> )} </div> </div> )}
                             </div>
                         </>
                    )}
                    {groupSubView !== 'chat' && (
                         <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-neutral-50 dark:bg-dark-bg pb-[env(safe-area-inset-bottom)]"> 
                            {groupSubView === 'requests' && isCreator && ( <><h3 className="font-bold text-lg mb-4 px-2">Solicitudes Pendientes</h3> {pendingUsers.length === 0 ? ( <div className="text-center p-12 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-light-border dark:border-dark-border"> <Icon name="users" className="w-12 h-12 mx-auto text-neutral-300 mb-3"/> <p className="text-neutral-500">No hay solicitudes pendientes.</p> </div> ) : ( pendingUsers.map(user => ( <div key={user.uid} className="flex items-center justify-between p-4 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-light-border dark:border-dark-border"> <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleViewProfile(user)}> <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name.replace(' ', '+')}`} alt={user.name} className="w-12 h-12 rounded-full object-contain"/> <div> <p className="font-bold text-lg">{user.name}</p> <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{user.headline}</p> </div> </div> <div className="flex gap-2"> <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white border-none" onClick={() => approveGroupMember(targetGroup.id, user.uid)}>Aceptar</Button> <Button size="sm" variant="secondary" className="text-red-500 hover:bg-red-50" onClick={() => denyGroupMember(targetGroup.id, user.uid)}>Rechazar</Button> </div> </div> )) )} </> )}
                             {groupSubView === 'members' && ( 
                                <><div className="bg-white dark:bg-dark-surface p-6 rounded-xl shadow-sm border border-light-border dark:border-dark-border mb-6 text-center"> 
                                    {targetGroup.imageUrl ? ( <img src={targetGroup.imageUrl} alt={targetGroup.name} className="w-24 h-24 rounded-full object-contain mx-auto mb-4 shadow-md" /> ) : ( <div className="w-24 h-24 bg-brand-accent/20 rounded-full flex items-center justify-center mx-auto mb-4"><Icon name={targetGroup.icon} className="w-12 h-12 text-brand-primary"/></div> )} 
                                    <h2 className="text-2xl font-bold">{targetGroup.name}</h2> 
                                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2 max-w-md mx-auto">{targetGroup.description}</p> 
                                    <p className="text-xs text-neutral-500 mt-1">Creado por: <span className="font-bold text-brand-primary">{creator?.name || 'Desconocido'}</span></p>
                                    {targetGroup.rules && ( <div className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm text-left inline-block w-full max-w-md"> <p className="font-bold mb-1">Reglas:</p> <p className="whitespace-pre-wrap opacity-80">{targetGroup.rules}</p> </div> )} 
                                    <div className="mt-6 flex justify-center gap-3"> <Button onClick={() => handleShareGroup(targetGroup)} variant="secondary" size="sm"><Icon name="share"/> Compartir Grupo</Button> {isCreator && ( <> <Button onClick={() => { setGroupToEdit(targetGroup); setGroupModalOpen(true); }} variant="secondary" size="sm"><Icon name="edit"/> Editar</Button> <Button onClick={() => setDeleteGroupModalOpen(true)} variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10 border border-red-200 dark:border-red-900/30"><Icon name="trash"/> Eliminar</Button> </> )} </div> 
                                </div>
                                <h3 className="font-bold text-lg mb-3 px-2">Miembros ({targetGroup.memberCount})</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupMembers.map(member => (
                                        <div key={member.uid} className="flex items-center justify-between p-3 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-light-border dark:border-dark-border hover:shadow-md transition-shadow">
                                            <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleViewProfile(member)}>
                                                <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${member.name.replace(' ', '+')}`} alt={member.name} className="w-10 h-10 rounded-full object-contain"/>
                                                <div>
                                                    <p className="font-bold text-sm">{member.name}</p>
                                                    {targetGroup.creatorId === member.uid ? (
                                                        <span className="text-[10px] font-bold bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>
                                                    ) : (
                                                        <p className="text-xs text-neutral-500 truncate w-32">{member.headline}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {isCreator && member.uid !== currentUser?.uid && (
                                                <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 !p-2" onClick={() => removeGroupMember(targetGroup.id, member.uid)} title="Eliminar del grupo">
                                                    <Icon name="close" className="w-4 h-4"/>
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        </div>
                    )}
                </div>
            );
         }

         if (activeConversationData.type === 'user') {
             const otherUser = activeConversationData.otherUser;
             const isSystem = activeConversationData.id.startsWith('system_');
             
             if (!otherUser && !isSystem) return null;

             return (
                <div className="flex flex-col h-full overflow-hidden relative bg-white dark:bg-dark-bg">
                    <div className="p-4 border-b border-light-border dark:border-dark-border flex flex-none items-center gap-3 bg-light-surface dark:bg-dark-surface z-10 shadow-sm justify-between">
                        <div className="flex items-center gap-3">
                            <Button onClick={() => setActiveConversationData(null)} variant="ghost" size="sm" className="lg:hidden !p-2 mr-2">
                                <Icon name="chevronLeft" className="w-5 h-5 text-brand-primary" />
                            </Button>
                            <div className="flex items-center gap-3 cursor-pointer" onClick={() => !isSystem && otherUser && handleViewProfile(otherUser)}>
                                {isSystem ? (
                                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-neutral-700 flex items-center justify-center text-gray-600 dark:text-gray-400"><Icon name="bell" className="w-6 h-6"/></div>
                                ) : (
                                    <img src={otherUser!.avatarUrl || `https://ui-avatars.com/api/?name=${otherUser!.name.replace(' ', '+')}`} alt={otherUser!.name} className="w-10 h-10 rounded-full object-contain" />
                                )}
                                <div className="flex-grow">
                                    <h3 className="font-bold hover:underline"> {isSystem ? "Sistema Goatify" : otherUser!.name } </h3>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {!isSystem && otherUser && (
                                <>
                                    <Button size="sm" variant="ghost" className="!p-2 text-neutral-800 dark:text-white" onClick={() => startCall([otherUser], 'audio')} title="Llamada de Voz">
                                        <Icon name="phone" className="w-5 h-5"/>
                                    </Button>
                                    <Button size="sm" variant="ghost" className="!p-2 text-neutral-800 dark:text-white" onClick={() => startCall([otherUser], 'video')} title="Videollamada">
                                        <Icon name="video" className="w-5 h-5"/>
                                    </Button>
                                </>
                            )}
                             <Button size="sm" variant="ghost" className="!p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleDeleteConversation(activeConversationData.id)} title="Eliminar Conversación">
                                <Icon name="trash" className="w-5 h-5"/>
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 custom-scrollbar bg-neutral-50 dark:bg-black/20 relative z-0 pb-32">
                        {activeMessages.map((msg: DirectMessage) => {
                            const isUserMsg = msg.senderId === userProfile.uid;
                            const isSystemMessage = msg.text?.includes("Call ended") || msg.text?.includes("Missed call") || msg.text?.includes("Call duration") || msg.text?.includes("Llamada realizada") || msg.text?.includes("Video llamada finalizada") || msg.isSystem;
                            if (isSystemMessage) {
                                return ( <div key={msg.id} className="flex justify-center my-4 w-full"> <div className="bg-white/90 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[10px] sm:text-xs p-3 sm:p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 max-w-md text-center"> <div className="font-bold mb-1 flex items-center justify-center gap-2"> <Icon name="bell" className="w-3 h-3 sm:w-4 sm:h-4 text-brand-primary"/> Mensaje del Sistema </div> <div className="whitespace-pre-wrap"><LinkRenderer text={msg.text}/></div> </div> </div> );
                            }
                            return (
                                <div key={msg.id} className={`flex flex-col ${isUserMsg ? 'items-end' : 'items-start'}`}>
                                    <div className={`relative group max-w-[85%] rounded-xl px-4 py-2 shadow-sm ${isUserMsg ? 'bg-brand-primary text-white' : 'bg-white dark:bg-dark-surface'} ${msg.stickerUrl ? '!bg-transparent !p-0 shadow-none' : ''}`}>
                                        {msg.stickerUrl ? ( <img src={msg.stickerUrl} alt="Sticker" className="w-32 h-32 object-contain drop-shadow-md" /> ) : ( <> {msg.file?.type.startsWith('image/') && ( <div className="relative group/image"> <img src={msg.file.url} alt={msg.file.name} className="max-h-60 w-auto rounded-lg mb-2 cursor-pointer object-contain" onClick={() => window.open(msg.file?.url, '_blank')} /> <div className="absolute top-1 right-1 bg-black/50 rounded-md p-1 opacity-0 group-hover/image:opacity-100 transition-opacity flex gap-1"> <a href={msg.file.url} download={msg.file.name} className="p-1 hover:bg-white/20 rounded-md" title="Save"> <Icon name="upload" className="w-4 h-4 text-white" /> </a> <button onClick={() => setSendingMedia(msg.file!)} className="p-1 hover:bg-white/20 rounded-md" title="Send to Project"> <Icon name="send" className="w-4 h-4 text-white" /> </button> </div> </div> )} {msg.file?.type.startsWith('video/') && ( <video src={msg.file.url} controls className="max-h-60 w-auto rounded-lg mb-2 bg-black" /> )} {msg.file && !msg.file.type.startsWith('image/') && !msg.file.type.startsWith('video/') && ( <div className={`flex items-center gap-3 p-3 rounded-lg mb-2 cursor-pointer transition-colors ${isUserMsg ? 'bg-white/20 hover:bg-white/30' : 'bg-black/10 hover:bg-black/20'}`} onClick={() => window.open(msg.file?.url, '_blank')}> <Icon name="folder" className="w-8 h-8"/> <div className="flex flex-col overflow-hidden"> <span className="font-bold truncate text-xs">{msg.file.name}</span> <span className="text-[10px] opacity-80 uppercase">{msg.file.type.split('/')[1] || 'FILE'}</span> </div> <Icon name="upload" className="w-4 h-4 ml-1 opacity-70"/> </div> )} {msg.audioUrl && <div className={`mt-2 flex items-center gap-2 p-2 rounded-lg ${isUserMsg ? 'bg-white/20' : 'bg-neutral-100 dark:bg-neutral-800'}`}><Icon name="mic" className="w-4 h-4"/><audio src={msg.audioUrl} controls className="h-8 w-48"/></div>} {msg.text && <div className="text-[15px] leading-relaxed"><ChatMessageRenderer text={msg.text} className={isUserMsg ? 'text-white' : 'text-gray-800 dark:text-gray-200'} /></div>} </> )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-neutral-400 mt-1 px-1">
                                        <span>{getDateFromTimestamp(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        {isUserMsg && ( msg.isSending ? ( <Icon name="clock" className="w-3 h-3" /> ) : msg.read ? ( <Icon name="check-double" className="w-4 h-4 text-blue-500" /> ) : ( <Icon name="check-single" className="w-4 h-4" /> ) )}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={dmMessagesEndRef}/>
                    </div>

                    {!isSystem ? (
                        <div className="flex-none p-2 border-t border-light-border dark:border-dark-border bg-white dark:bg-dark-surface z-[150] fixed bottom-0 left-0 right-0 lg:relative lg:bottom-0">
                            {showStickers && <StickerPicker onSelect={(url) => handleSendDm(url)} onInsertEmoji={(emoji) => setDmInput(prev => prev + emoji)} onClose={() => setShowStickers(false)} />}
                            {dmMediaToSend && ( <div className="absolute bottom-full left-0 w-full bg-gray-100 dark:bg-gray-800 p-2 flex items-center gap-2 animate-slide-in-up border-t border-light-border dark:border-dark-border shadow-lg"> {dmMediaToSend.file.type.startsWith('image/') ? ( <img src={dmMediaToSend.previewUrl} className="w-10 h-10 object-contain rounded" alt="Preview"/> ) : ( <Icon name="folder" className="w-5 h-5" /> )} <span className="text-sm truncate flex-1">{dmMediaToSend.file.name}</span> <button onClick={() => setDmMediaToSend(null)}><Icon name="close" className="w-4 h-4" /></button> </div> )}
                            <div className="flex items-end gap-2">
                                <div className="flex-shrink-0 flex gap-1 pb-1">
                                    <button onClick={() => setShowStickers(!showStickers)} className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors" title="Stickers"> <span className="text-xl leading-none filter grayscale hover:grayscale-0 transition-all">😊</span> </button>
                                    <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="!p-2 text-brand-primary" title="Adjuntar Archivo" disabled={isSendingDm}> <Icon name="upload" className="w-5 h-5" /> </Button>
                                    <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*" />
                                </div>
                                <div className="flex-grow bg-neutral-100 dark:bg-neutral-800 rounded-2xl px-1 py-1 min-h-[44px] flex items-center border border-transparent focus-within:border-brand-primary/30 focus-within:ring-2 focus-within:ring-brand-primary/10 transition-all">
                                    <Textarea ref={dmTextareaRef} value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendDm())} placeholder={isRecordingDm ? "Grabando..." : dmMediaToSend ? "Añade un comentario..." : "Escribe un mensaje..."} className="!mt-0 w-full bg-transparent border-none focus:ring-0 !p-2 max-h-32 min-h-[36px] !shadow-none resize-none" rows={1} style={{ height: 'auto' }} disabled={isRecordingDm} />
                                </div>
                                <div className="flex-shrink-0 pb-1">
                                    {(dmInput.trim() || dmMediaToSend) ? (
                                        <Button size="sm" className="!p-3 rounded-full shadow-md hover:scale-105 transition-transform" onClick={() => handleSendDm()} disabled={isRecordingDm || isSendingDm}> <Icon name={isSendingDm ? "sync" : "send"} className={`w-4 h-4 ${isSendingDm ? 'animate-spin' : ''}`} /> </Button>
                                    ) : (
                                        <button onMouseDown={handleStartRecordingDm} onMouseUp={handleStopRecordingDm} onTouchStart={handleStartRecordingDm} onTouchEnd={handleStartRecordingDm} className={`p-3 rounded-full shadow-md transition-all ${isRecordingDm ? 'bg-red-500 text-white animate-pulse scale-110' : 'bg-brand-primary text-white hover:bg-brand-secondary'}`}> <Icon name="mic" className="w-4 h-4"/> </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 border-t border-light-border dark:border-dark-border flex-none bg-white dark:bg-dark-surface text-center lg:pb-4 pb-1 sticky bottom-0 z-20"> <p className="text-xs text-gray-500 flex items-center justify-center gap-2"> <Icon name="security" className="w-3 h-3"/> Este chat es de solo lectura (Sistema). </p> </div>
                    )}
                </div>
             );
        }

        if (activeConversationData.type === 'agent') {
             return (
                <div className="flex flex-col h-full overflow-hidden relative bg-white dark:bg-dark-bg">
                    <div className="p-4 border-b border-light-border dark:border-dark-border flex flex-none items-center gap-3 bg-light-surface dark:bg-dark-surface z-10 shadow-sm justify-between">
                        <div className="flex items-center gap-3">
                            <Button onClick={() => setActiveConversationData(null)} variant="ghost" size="sm" className="lg:hidden !p-2 mr-2">
                                <Icon name="chevronLeft" className="w-5 h-5 text-brand-primary" />
                            </Button>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 overflow-hidden"><img className="w-full h-full object-contain" src={activeConversationData.avatarUrl || "https://ui-avatars.com/api/?name=Agent"} /></div>
                                <div className="flex-grow">
                                    <h3 className="font-bold text-sm sm:text-base">{activeConversationData.userName ? activeConversationData.userName : 'Visitante'}</h3>
                                    <p className="text-xs text-neutral-500 flex items-center gap-1">Vía <span className="font-bold text-brand-primary">{activeConversationData.agentName}</span></p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <Button size="sm" variant="ghost" className="!p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleDeleteConversation(activeConversationData.id)} title="Eliminar Conversación">
                                <Icon name="trash" className="w-5 h-5"/>
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto min-0 p-4 space-y-4 custom-scrollbar bg-neutral-50 dark:bg-black/20 relative z-0 pb-32">
                        {activeConversationData.history?.map((msg: ChatMessage) => {
                            const isMe = msg.role === 'model';
                            return (
                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`relative group max-w-[85%] rounded-xl px-4 py-2 shadow-sm text-[15px] ${isMe ? 'bg-brand-primary text-white' : 'bg-white dark:bg-dark-surface'}`}>
                                        {msg.file && (
                                            <div className="mb-2 p-2 bg-black/10 rounded-lg flex items-center gap-2 cursor-pointer hover:bg-black/20 transition-colors" onClick={() => window.open(msg.file?.url, '_blank')}>
                                                {msg.file.type.startsWith('image/') ? (
                                                    <img src={msg.file.url} className="max-h-40 rounded-lg" alt="attachment"/>
                                                ) : (
                                                    <>
                                                        <Icon name="folder" className="w-5 h-5"/>
                                                        <span className="textxs truncate max-w-[150px]">{msg.file.name}</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {msg.audioUrl && <div className="mb-2 p-2 bg-black/10 rounded-lg flex items-center gap-2"><Icon name="mic" className="w-4 h-4"/><audio src={msg.audioUrl} controls className="h-8 w-40"/></div>}
                                        {msg.text && <div className="text-[15px] leading-relaxed"><ChatMessageRenderer text={msg.text} className={isMe ? 'text-white' : 'text-gray-800 dark:text-gray-200'} /></div>}
                                        {!isMe && <div className="text-[10px] opacity-70 mt-1 border-t border-gray-200 dark:border-gray-700 pt-1">{activeConversationData.userName || "Visitante"}</div>}
                                        
                                        {/* Hora en el mensaje del agente */}
                                        <div className={`text-[8px] mt-1 opacity-50 text-right ${isMe ? 'text-white' : 'text-neutral-500'}`}>
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={dmMessagesEndRef}/>
                    </div>
                    <div className="p-2 border-t border-light-border dark:border-dark-border bg-white dark:bg-dark-surface z-[150] fixed bottom-0 left-0 right-0 lg:relative lg:bottom-0 text-center">
                        {!activeConversationData.automationPaused && <div className="text-xs text-brand-primary font-bold mb-2">Automatización activa. Pausa para intervenir.</div>}
                        <div className="flex items-end gap-2">
                             <Button 
                                onClick={() => toggleAgentPause(activeConversationData.id, !!activeConversationData.automationPaused)} 
                                className={`w-full py-2 rounded-full text-xs font-bold ${activeConversationData.automationPaused ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'}`}
                            >
                                {activeConversationData.automationPaused ? 'Reanudar Automatización' : 'Pausar para Escribir'}
                            </Button>
                        </div>
                        {activeConversationData.automationPaused && (
                             <>
                                {dmMediaToSend && ( <div className="absolute bottom-full left-0 w-full bg-gray-100 dark:bg-gray-800 p-2 flex items-center gap-2 animate-slide-in-up border-t border-light-border dark:border-dark-border shadow-lg"> {dmMediaToSend.file.type.startsWith('image/') ? ( <img src={dmMediaToSend.previewUrl} className="w-10 h-10 object-contain rounded" alt="Preview"/> ) : ( <Icon name="folder" className="w-5 h-5" /> )} <span className="text-sm truncate flex-1">{dmMediaToSend.file.name}</span> <button onClick={() => setDmMediaToSend(null)}><Icon name="close" className="w-4 h-4" /></button> </div> )}
                                <div className="flex items-end gap-2 mt-2">
                                    <div className="flex-shrink-0 flex gap-1 pb-1">
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*" />
                                        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors" title="Adjuntar"> <Icon name="plus" className="w-6 h-6"/> </button>
                                    </div>
                                    <div className="flex-grow bg-neutral-100 dark:bg-neutral-800 rounded-2xl px-1 py-1 min-h-[44px] flex items-center border border-transparent focus-within:border-brand-primary/30 focus-within:ring-2 focus-within:ring-brand-primary/10 transition-all">
                                        <Textarea ref={dmTextareaRef} value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendDm())} placeholder={isRecordingDm ? "Grabando..." : dmMediaToSend ? "Añade comentario..." : "Escribe como el agente..."} className="!mt-0 w-full bg-transparent border-none focus:ring-0 !p-2 max-h-32 min-h-[36px] !shadow-none resize-none" rows={1} style={{ height: 'auto' }} disabled={isRecordingDm} />
                                    </div>
                                    <div className="flex-shrink-0 pb-1">
                                        {(dmInput.trim() || dmMediaToSend) ? (
                                            <Button size="sm" className="!p-3 rounded-full shadow-md" onClick={() => handleSendDm()} disabled={isSendingDm}> <Icon name="send" className="w-4 h-4"/> </Button>
                                        ) : (
                                            <button onMouseDown={handleStartRecordingDm} onMouseUp={handleStopRecordingDm} onTouchStart={handleStartRecordingDm} onTouchEnd={handleStartRecordingDm} className={`p-3 rounded-full shadow-md transition-all ${isRecordingDm ? 'bg-red-500 text-white animate-pulse scale-110' : 'bg-brand-primary text-white hover:bg-brand-secondary'}`}> <Icon name="mic" className="w-4 h-4"/> </button>
                                        )}
                                    </div>
                                </div>
                             </>
                        )}
                    </div>
                </div>
            );
        }

        return null;
    };

    const renderContent = () => {
        if (activeHubView === 'messages') {
            return (
                <div className="h-full flex flex-col lg:flex-row overflow-hidden bg-white dark:bg-dark-surface lg:rounded-2xl shadow-sm border border-light-border dark:border-dark-border" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*" />
                    <div className={`w-full lg:w-1/3 border-r border-light-border dark:border-dark-border flex-col bg-light-bg/50 dark:bg-dark-bg/50 h-full ${activeConversationData ? 'hidden lg:flex' : 'flex'}`}>
                        <div className="p-4 border-b border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface z-10 space-y-3">
                            <h2 className="hidden lg:block text-xl font-bold flex-shrink-0">Mensajes</h2>
                            
                            {/* FILTROS DE MENSAJES v11.8 */}
                            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                                <button onClick={() => setMessageFilter('all')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all tracking-widest whitespace-nowrap border ${messageFilter === 'all' ? 'bg-brand-primary text-white border-brand-primary shadow-md' : 'bg-white dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:text-brand-primary'}`}>Todos</button>
                                <button onClick={() => setMessageFilter('people')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all tracking-widest whitespace-nowrap border ${messageFilter === 'people' ? 'bg-brand-primary text-white border-brand-primary shadow-md' : 'bg-white dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:text-brand-primary'}`}>Personas</button>
                                <button onClick={() => setMessageFilter('agents')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all tracking-widest whitespace-nowrap border ${messageFilter === 'agents' ? 'bg-brand-primary text-white border-brand-primary shadow-md' : 'bg-white dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:text-brand-primary'}`}>Agentes</button>
                            </div>

                            {/* FILTRO POR PROYECTO v11.9 */}
                            <div className="relative" ref={projectFilterRef}>
                                <button 
                                    onClick={() => setIsProjectFilterOpen(!isProjectFilterOpen)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${projectFilterIds.length > 0 ? 'bg-brand-primary/10 border-brand-primary text-brand-primary' : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon name="projects" className="w-3.5 h-3.5"/>
                                        <span>{projectFilterIds.length === 0 ? 'Filtrar por Proyecto' : `${projectFilterIds.length} Proyectos Seleccionados`}</span>
                                    </div>
                                    <Icon name="chevronDown" className={`w-3 h-3 transition-transform ${isProjectFilterOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isProjectFilterOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl z-[100] p-3 max-h-64 overflow-y-auto custom-scrollbar animate-scale-in origin-top">
                                        <div className="flex justify-between items-center mb-3 pb-2 border-b dark:border-neutral-800">
                                            <span className="text-[9px] font-black text-neutral-400 uppercase">Selecciona Proyectos</span>
                                            {projectFilterIds.length > 0 && (
                                                <button onClick={clearProjectFilters} className="text-[9px] font-black text-brand-primary uppercase underline">Limpiar</button>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            {projects.map(p => (
                                                <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl cursor-pointer transition-colors">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={projectFilterIds.includes(p.id)} 
                                                        onChange={() => toggleProjectFilter(p.id)}
                                                        className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary"
                                                    />
                                                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 truncate">{p.name}</span>
                                                </label>
                                            ))}
                                            {projects.length === 0 && <p className="text-[10px] text-center text-neutral-400 py-4">No hay proyectos activos.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                            {filteredConversations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-80 min-h-[300px]">
                                    <div className="w-20 h-20 bg-neutral-200 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                                        <Icon name="message" className="w-10 h-10 text-neutral-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-neutral-800 dark:text-white mb-2">Bandeja vacía</h3>
                                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-xs mx-auto">
                                        No hay conversaciones que coincidan con los filtros seleccionados.
                                    </p>
                                    <Button onClick={() => setActiveHubView('people')}>
                                        <Icon name="plus" className="w-4 h-4" /> Empezar un Chat
                                    </Button>
                                </div>
                            ) : (
                                filteredConversations.map(conv => {
                                    const otherUser = conv.type === 'user' ? conv.otherUser : null;
                                    const isAgent = conv.type === 'agent';
                                    const isGroup = conv.type === 'group';
                                    const isSystem = conv.id.startsWith('system_');
                                    let displayName = "Desconocido";
                                    let contextInfo = "";
                                    let avatarUrl = null;
                                    if (isSystem) { displayName = "Sistema Goatify"; avatarUrl = null; } else if (otherUser) { displayName = otherUser.name; avatarUrl = otherUser.avatarUrl; } else if (isAgent) { displayName = conv.userName || "Visitante"; contextInfo = `Vía ${conv.agentName}`; } else if (isGroup) { displayName = conv.name; avatarUrl = conv.imageUrl; }
                                    const unreadCount = conv.type === 'user' ? conv.unreadCount : 0;
                                    const lastMessage = conv.lastMessage;
                                    
                                    // BÚSQUEDA DEL PROYECTO VINCULADO v11.8
                                    const linkedProject = (conv as any).projectId ? projects.find(p => p.id === (conv as any).projectId) : null;

                                    return (
                                        <div key={conv.id} className={`p-3 mb-2 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 border border-transparent relative touch-manipulation active:bg-white lg:hover:bg-white dark:active:bg-dark-surface dark:lg:hover:bg-dark-surface group ${activeConversationData?.id === conv.id ? 'bg-white dark:bg-dark-surface shadow-md border-brand-primary/20' : 'border-light-border dark:border-dark-border'} ${isSystem ? 'bg-gray-100 dark:bg-neutral-800 border-l-4 border-l-gray-500' : ''}`} onClick={() => { setActiveConversationData({ id: conv.id, type: conv.type, name: displayName, avatarUrl, otherUser: otherUser || undefined, agentName: conv.agentName, userName: conv.userName, automationPaused: conv.automationPaused, history: conv.history, userId: (conv as any).userId, projectId: (conv as any).projectId }); }}>
                                            <div className="relative flex-shrink-0" onClick={(e) => { if (otherUser) { e.stopPropagation(); handleViewProfile(otherUser); } }}>
                                                {isSystem ? ( <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-neutral-700 flex items-center justify-center text-gray-600 dark:text-gray-400"><Icon name="bell" className="w-6 h-6"/></div> ) : isAgent ? ( <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 overflow-hidden flex items-center justify-center text-purple-600 dark:text-purple-400"><img src={avatarUrl || `https://ui-avatars.com/api/?name=Agent`} className="w-full h-full object-contain" /></div> ) : isGroup ? ( avatarUrl ? <img src={avatarUrl} alt={displayName} className="w-12 h-12 rounded-full object-contain bg-white" /> : <div className="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center"><Icon name={conv.icon} className="w-6 h-6 text-brand-primary"/></div> ) : ( <img src={avatarUrl || `https://ui-avatars.com/api/?name=${displayName.replace(' ', '+')}`} alt={displayName} className="w-12 h-12 rounded-full object-contain border border-light-border dark:border-dark-border shadow-sm bg-white" /> )} {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-dark-surface">{unreadCount}</span>}
                                            </div>
                                            <div className="flex-1 overflow-hidden min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <div className="min-w-0 pr-2">
                                                        <h4 className={`font-bold truncate text-sm ${activeConversationData?.id === conv.id ? 'text-brand-primary' : ''}`}>{displayName}</h4>
                                                        {contextInfo && <p className="text-[10px] font-medium text-purple-500 truncate">{contextInfo}</p>}
                                                        {!contextInfo && (isAgent && <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 rounded font-bold uppercase tracking-wider">Agent</span>)} 
                                                        {isSystem && <span className="text-[9px] bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 px-1.5 rounded font-bold uppercase tracking-wider">System</span>} 
                                                        {isGroup && <span className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 rounded font-bold uppercase tracking-wider">Group</span>}
                                                        
                                                        {/* ETIQUETA DE PROYECTO VINCULADO v11.8 */}
                                                        {linkedProject && (
                                                            <div className="flex items-center gap-1 mt-0.5">
                                                                <Icon name="projects" className="w-2.5 h-2.5 text-brand-primary opacity-60"/>
                                                                <span className="text-[8px] font-black text-brand-primary uppercase tracking-tighter truncate max-w-[100px]">Proyecto: {linkedProject.name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap ml-auto self-start">
                                                        {conv.lastActivity ? getDateFromTimestamp(conv.lastActivity).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate opacity-80"> {conv.type === 'user' && lastMessage?.senderId === currentUser?.uid && !isSystem ? 'Tú: ' : ''} {isGroup && <span className="font-semibold text-brand-primary">Mensaje de grupo: </span>} {isAgent ? 'Ver historial...' : lastMessage?.text} </p>
                                            </div>
                                            
                                            {/* ACCIONES DE LÍNEA v11.8 */}
                                            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!isSystem && !isGroup && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleOpenConvertTask({ ...conv, name: displayName }); }} 
                                                        className="p-1.5 rounded-lg bg-white dark:bg-neutral-800 text-brand-primary hover:bg-brand-primary hover:text-white transition-all shadow-sm border border-neutral-100 dark:border-neutral-700" 
                                                        title="Convertir en Tarea"
                                                    >
                                                        <Icon name="list" className="w-3.5 h-3.5"/>
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }} className="p-1.5 rounded-lg bg-white dark:bg-neutral-800 text-neutral-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all shadow-sm border border-neutral-100 dark:border-neutral-700" title="Eliminar Conversación"><Icon name="trash" className="w-3.5 h-3.5"/></button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    <div className={`w-full lg:w-2/3 flex flex-col h-full relative ${activeConversationData ? 'flex' : 'hidden lg:flex'}`}>
                        {activeConversationData ? renderActiveChatPanel() : ( <div className="flex-1 flex-col items-center justify-center text-center hidden lg:flex bg-neutral-50 dark:bg-black/20 h-full"> <div className="w-20 h-20 bg-neutral-200 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4"> <Icon name="message" className="w-10 h-10 text-neutral-400" /> </div> <p className="text-light-text-secondary dark:text-dark-text-secondary font-medium">Selecciona una conversación para empezar a chatear.</p> </div> )}
                    </div>
                </div>
            );
        }
        
        if (activeConversationData) {
             return renderActiveChatPanel();
        }

        switch (activeHubView) {
            case 'feed': return ( 
                <div ref={feedContainerRef} className="space-y-4 overflow-x-hidden lg:p-4 p-0 relative h-full"> 
                    <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} post={postToShare!} /> 
                    
                    {/* BANNER DE PUBLICACIONES NUEVAS v4.7 */}
                    {showNewPostsBanner && (
                        <div className="sticky top-2 z-[60] flex justify-center animate-fade-in">
                            <button 
                                onClick={scrollToFirstUnread}
                                className="bg-brand-primary text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl flex items-center gap-2 transform hover:scale-105 active:scale-95 transition-all ring-4 ring-brand-primary/20"
                            >
                                <Icon name="plus" className="w-4 h-4"/> Tienes {unreadPosts.length} publicaciones nuevas
                            </button>
                        </div>
                    )}

                    <div className="flex justify-center mb-2">
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded-full flex text-xs font-semibold border border-neutral-200 dark:border-neutral-700 shadow-sm">
                            <button onClick={() => setFeedFilter('all')} className={`px-4 py-1.5 rounded-full transition-all ${feedFilter === 'all' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:text-brand-primary'}`}>Toda la Comunidad</button>
                            <button onClick={() => setFeedFilter('circle')} className={`px-4 py-1.5 rounded-full transition-all ${feedFilter === 'circle' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:text-brand-primary'}`}>Solo mi Círculo</button>
                        </div>
                    </div>
                    <CreatePost onPost={addHubPost} /> 
                    {postsForFeed.map(post => (
                        <PostCard 
                            key={post.id} 
                            post={post} 
                            onLike={likePost} 
                            onComment={addCommentToPost} 
                            onViewProfile={(u) => handleViewProfile(u)} 
                            onShare={() => handleSharePost(post)} 
                            isNew={!post.readBy?.includes(currentUser?.uid || '')}
                            onVisible={() => markPostAsRead(post.id)}
                        />
                    ))} 
                    {postsForFeed.length === 0 && (
                        <div className="py-20 text-center opacity-30">
                            <Icon name="hub" className="w-16 h-16 mx-auto mb-4"/>
                            <p className="font-bold">No hay publicaciones para mostrar.</p>
                        </div>
                    )}
                </div> 
            );
            case 'people': {
                const otherUsers = allUsers.filter(u => u.uid !== currentUser?.uid);
                return (
                    <div className="p-4">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Icon name="users" className="w-6 h-6 text-brand-primary" />
                                Miembros de la Comunidad
                            </h2>
                        </div>
                        {otherUsers.length === 0 ? (
                            <div className="text-center py-20 bg-white dark:bg-dark-surface rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-700">
                                <Icon name="search" className="w-16 h-16 mx-auto text-neutral-200 mb-4" />
                                <h3 className="text-lg font-bold text-neutral-400">Buscando miembros...</h3>
                                <p className="text-sm text-neutral-400">Asegúrate de invitar de tus contactos a Goatify.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                {otherUsers.map(user => {
                                    const presence = getPresenceStatus(user.lastSeen);
                                    const isCircle = userProfile.circle?.includes(user.uid);
                                    const isRequested = user.circleRequests?.includes(currentUser?.uid || '');
                                    return (
                                        <Card key={user.uid} className="flex flex-col text-center items-center p-3 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-subtle-slide-in-up border border-neutral-100 dark:border-neutral-800">
                                            <div className="relative">
                                                <img onClick={() => handleViewProfile(user)} src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name.replace(' ', '+')}&background=6D28D9&color=fff`} alt={user.name} className="w-16 h-16 rounded-full mb-2 cursor-pointer shadow-md object-contain border-2 border-white dark:border-neutral-700" />
                                                {presence === 'online' && <div className="absolute bottom-2 right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-dark-surface shadow-sm" title="Online"></div>}
                                                {presence === 'away' && <div className="absolute bottom-2 right-1 w-3.5 h-3.5 bg-yellow-500 rounded-full border-2 border-white dark:border-dark-surface shadow-sm" title="Away"></div>}
                                            </div>
                                            <h3 onClick={() => handleViewProfile(user)} className="font-bold text-sm cursor-pointer hover:text-brand-primary truncate w-full">{user.name}</h3>
                                            <p className="text-neutral-500 font-semibold text-[10px] h-6 line-clamp-2 w-full mt-0.5">{user.headline || 'Miembro de Goatify'}</p>
                                            <div className="flex mt-auto w-full pt-3 border-t border-neutral-100 dark:border-neutral-800 gap-1">
                                                <button onClick={() => handleMessageClick(user)} className="flex-1 py-1.5 bg-brand-primary/5 text-[9px] font-black uppercase tracking-tighter text-brand-primary hover:bg-brand-primary hover:text-white rounded-lg transition-all"> MENSAJE </button>
                                                <button onClick={() => isCircle ? null : isRequested ? handleCancelRequest(user.uid) : handleAddToCircle(user.uid)} disabled={isCircle} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-tighter transition-all rounded-lg shadow-sm ${isCircle ? 'bg-green-100 text-green-600 border border-green-200' : isRequested ? 'bg-red-50 text-red-500 border border-red-100 hover:bg-red-500 hover:text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-brand-primary hover:text-white'}`} > {isCircle ? 'Conectado' : isRequested ? 'Cancelar' : 'Conectar'} </button>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            }
            case 'groups': return ( <div className="space-y-4 p-4"> <div className="flex justify-between items-center"> <div className="bg-light-surface dark:bg-dark-surface p-1 rounded-lg flex items-center border border-light-border dark:border-dark-border"> <Button size="sm" variant={groupView === 'all' ? 'primary' : 'ghost'} onClick={() => setGroupView('all')}>Todos</Button> <Button size="sm" variant={groupView === 'my' ? 'primary' : 'ghost'} onClick={() => setGroupView('my')}>Mis Grupos</Button> </div> <Button onClick={() => { setGroupToEdit(undefined); setGroupModalOpen(true); }}>Crear Grupo</Button> </div> {groupsForView.map(group => { const isMember = group.members.includes(currentUser?.uid || ''); const isPending = group.pendingMembers?.includes(userProfile.uid); const hasUnread = unreadGroupIds.includes(group.id); const isCreator = group.creatorId === currentUser?.uid; const specificPendingCount = (group.pendingMembers || []).length; return ( <Card key={group.id} className="flex flex-col gap-2 p-4 cursor-pointer active:bg-light-bg lg:hover:bg-light-bg dark:active:bg-dark-bg dark:lg:hover:bg-dark-bg animate-subtle-slide-in-up border border-gray-200 dark:border-gray-700 lg:hover:border-brand-primary dark:lg:hover:border-brand-primary shadow-sm lg:hover:shadow-lg transition-all lg:hover:scale-[1.01] touch-manipulation" onClick={() => { if (isMember) { setActiveConversationData({ id: group.id, type: 'group', name: group.name, avatarUrl: group.imageUrl || null }); setGroupSubView('chat'); } }}> <div className="flex items-center gap-4"> <div className="p-2 bg-brand-accent/20 rounded-lg relative"> {group.imageUrl ? <img src={group.imageUrl} alt={group.name} className="w-10 h-10 rounded-md object-contain"/> : <Icon name={group.icon} className="w-10 h-10 text-brand-primary"/>} {hasUnread && (<span className="absolute -top-1 -right-1 flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-dark-surface animate-pulse"></span>)} {isCreator && specificPendingCount > 0 && (<span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md z-10 animate-pulse">{specificPendingCount}</span>)} </div> <div className="flex-grow"> <div className="flex items-center gap-2"> {group.isPrivate && <Icon name="security" className="w-4 h-4 text-amber-500" title="Private Group"/>} <h4 className="font-bold text-lg">{group.name}</h4> </div> <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{group.memberCount} miembros</p> </div> <Button onClick={async (e) => { e.stopPropagation(); if (isMember) { setActiveConversationData({ id: group.id, type: 'group', name: group.name, avatarUrl: group.imageUrl || null }); setGroupSubView('chat'); } else if (isPending) { await cancelGroupJoinRequest(group.id); } else { await joinGroup(group.id); if (!group.isPrivate) { setActiveConversationData({ id: group.id, type: 'group', name: group.name, avatarUrl: group.imageUrl || null }); setGroupSubView('chat'); } } }} variant={isMember ? 'primary' : isPending ? 'secondary' : 'secondary'} size="sm" disabled={false} className={isMember ? "bg-green-600 hover:bg-green-700 text-white" : isPending ? "text-red-500 border border-red-200 hover:bg-red-50" : ""} > {isMember ? 'Entrar' : isPending ? 'Cancelar Solicitud' : group.isPrivate ? 'Solicitar' : 'Unirse'} </Button> </div> <div className="flex flex-wrap gap-2 pt-2 border-t border-light-border dark:border-dark-border mt-2"> {group.tags?.map(tag => ( <span key={tag} className="text-xs bg-neutral-200 dark:bg-neutral-700 font-semibold px-2 py-1 rounded-full">{tag}</span> ))} </div> </Card> )})} </div> );
            case 'jobs': return ( <div className="space-y-4 p-4"> <div className="flex justify-end mb-4"><Button onClick={() => setJobModalOpen(true)}>{t('postAJob')}</Button></div> <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6"> {jobListings.map(job => { const isOwner = job.user.uid === userProfile.uid; const hasApplied = job.applicants?.includes(userProfile.uid); return ( <Card key={job.id} className="flex flex-col p-0 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] relative animate-subtle-slide-in-up overflow-hidden group h-full border border-light-border dark:border-dark-border"> <div className="h-32 bg-gradient-to-br from-brand-primary to-purple-900 relative p-4 flex flex-col justify-between"> <div className="flex justify-between items-start"> <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-[10px] text-white font-bold uppercase tracking-wider">{job.jobType}</span> {isOwner && ( <Button size="sm" variant="ghost" className="text-white hover:bg-white/20 !p-1.5" onClick={() => deleteMarketplaceListing(job.id)}> <Icon name="trash" className="w-4 h-4" /> </Button> )} </div> <div className="flex items-center gap-3"> <img src={job.user.avatarUrl || `https://ui-avatars.com/api/?name=${job.company?.replace(' ', '+')}`} className="w-12 h-12 rounded-full border-2 border-white object-contain shadow-md bg-white" alt={job.company}/> <div className="text-white overflow-hidden"> <p className="text-sm font-bold leading-none truncate">{job.company}</p> <p className="text-[10px] opacity-80 mt-1 truncate">{job.location}</p> </div> </div> </div> <div className="p-4 flex flex-col flex-grow"> <h4 className="font-bold text-sm sm:text-base mb-1 line-clamp-2 h-10 leading-tight">{job.title}</h4> <div className="flex items-center gap-2 mb-3 text-green-600 dark:text-green-400 font-bold text-xs sm:text-sm"> <Icon name="wallet" className="w-4 h-4"/> {job.salary || 'N/A'} </div> <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 flex-grow leading-relaxed"><ChatMessageRenderer text={job.description || ''} /></div> <div className="mt-auto pt-3 border-t border-light-border dark:border-dark-border flex gap-2"> {isOwner ? ( <div className="w-full flex gap-2"><Button size="sm" variant="secondary" className="w-full text-xs" onClick={() => alert("Edit functionality coming soon.")}>Editar</Button> <Button size="sm" variant="secondary" className="w-full bg-red-50 text-red-600 hover:bg-red-100 border-none text-xs" onClick={() => deleteMarketplaceListing(job.id)}>Eliminar</Button></div> ) : ( <div className="grid grid-cols-1 gap-2 mt-auto w-full"> <Button size="sm" className={`w-full text-white shadow-sm text-xs py-1.5 ${hasApplied ? 'bg-green-600 hover:bg-green-700' : 'bg-brand-primary hover:bg-brand-secondary'}`} disabled={!!hasApplied} onClick={() => applyToJob(job.id)} > {hasApplied ? 'Aplicado' : 'Aplicar Ahora'} </Button> <Button size="sm" variant="secondary" className="w-full text-xs py-1.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleContactRecruiter(job); }}> Contactar </Button> </div> )} </div> </div> </Card> )})} </div> </div> );
            case 'marketplace': return ( <div className="p-4"> {itemToBuy && ( <Modal isOpen={!!itemToBuy} onClose={() => setItemToBuy(null)} title="Confirmar Compra"> <div className="text-center"> <div className="w-20 h-20 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"> <Icon name="market" className="w-10 h-10 text-brand-primary"/> </div> <p className="text-lg font-semibold mb-2">¿Estás seguro de comprar "{itemToBuy.title}"?</p> <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6"> Se descontarán <strong>{((itemToBuy.priceUSD || 0) * INTIS_CONVERSION_RATE).toLocaleString()} Intis</strong> de tu billetera. </p> <div className="flex justify-center gap-3"> <Button variant="secondary" onClick={() => setItemToBuy(null)}>Cancelar</Button> <Button onClick={handleConfirmBuyIntis} className="bg-green-600 hover:bg-green-700 text-white">Confirmar Compra</Button> </div> </div> </Modal> )} <div className="flex justify-end mb-4"> <Button variant="primary" onClick={() => setListingModalOpen(true)}><Icon name="plus" className="w-4 h-4" /> {t('createListing')}</Button> </div> <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6"> {marketplaceListings.map(item => { const priceInIntis = (item.priceUSD || 0) * INTIS_CONVERSION_RATE; const canBuyWithIntis = item.acceptsIntis && intisBalance >= priceInIntis; const isOwner = item.user.uid === userProfile.uid; return ( <Card key={item.id} className="flex flex-col p-0 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] relative animate-subtle-slide-in-up overflow-hidden border border-light-border dark:border-dark-border group h-full"> <div className="h-32 sm:h-40 w-full relative overflow-hidden bg-neutral-100 dark:bg-neutral-800"> {item.imageUrl ? ( <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" /> ) : ( <div className="w-full h-full bg-gradient-to-br from-brand-primary/20 to-purple-500/20 flex items-center justify-center"> <Icon name="market" className="w-12 h-12 text-brand-primary/40"/> </div> )} <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div> <span className={`absolute top-2 right-2 px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider shadow-sm ${item.type === 'service' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}> {item.type} </span> <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between"> <p className="font-bold text-lg text-white whitespace-nowrap drop-shadow-md">${item.priceUSD?.toFixed(2)}</p> </div> </div> <div className="p-4 flex flex-col flex-grow relative"> <div className="absolute -top-6 right-3 z-10"> <img src={item.user.avatarUrl || `https://ui-avatars.com/api/?name=${item.user.name}`} className="w-10 h-10 rounded-full object-contain border-2 border-white dark:border-dark-surface shadow-md bg-white" alt="seller" title={item.user.name} onClick={() => handleViewProfile(item.user)}/> </div> <div className="mb-2 pr-8"> <h3 className="font-bold text-sm sm:text-base leading-tight line-clamp-2 h-10" title={item.title}>{item.title}</h3> <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-1 truncate">por {item.user.name}</p> </div> <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 flex-grow leading-relaxed"><ChatMessageRenderer text={item.description || ''} /></div> {isOwner ? ( <div className="grid grid-cols-2 gap-2 mt-auto"> <Button size="sm" variant="secondary" className="w-full text-xs" onClick={() => alert("Edit functionality coming soon.")}>Editar</Button> 
                                    <Button size="sm" variant="secondary" className="w-full bg-red-50 text-red-600 hover:bg-red-100 border-none text-xs" onClick={() => deleteMarketplaceListing(item.id)}>Eliminar</Button> </div> ) : ( <div className="grid grid-cols-1 gap-2 mt-auto"> {item.acceptsIntis && ( <Button size="sm" className="w-full bg-brand-primary hover:bg-brand-secondary text-white shadow-sm text-xs py-1.5" disabled={!canBuyWithIntis} title={intisBalance < priceInIntis ? "Saldo Insuficiente" : ""} onClick={() => setItemToBuy(item)} > Comprar: {priceInIntis.toLocaleString()} Intis </Button> )} <Button size="sm" variant="secondary" className="w-full text-xs py-1.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleContactSeller(item); }}> Contactar (USD) </Button> </div> )} </div> </Card> )})} </div> </div> );
        }
    };
    
    return (
        <div className="h-full flex flex-col lg:flex-row">
             <NewListingModal isOpen={isListingModalOpen} onClose={() => setListingModalOpen(false)} />
             <NewJobModal isOpen={isJobModalOpen} onClose={() => setJobModalOpen(false)} />
             <GroupModal isOpen={isGroupModalOpen} onClose={() => { setGroupModalOpen(false); setGroupToEdit(undefined); }} initialGroup={groupToEdit} />
             {dmRecipient && <DirectMessageModal isOpen={isDmOpen} onClose={() => {setIsDmOpen(false); setDmInitialMessage('');}} recipient={dmRecipient} initialMessage={dmInitialMessage} />}
             <Modal isOpen={isInviteMemberModalOpen} onClose={() => setInviteMemberModalOpen(false)} title="Invitar a Paraíso"><div className="space-y-4"><p>Selecciona a quién deseas invitar a <strong>{activeConversationData?.name}</strong>.</p><div className="flex justify-center gap-2 mb-2"><Button size="sm" variant={inviteFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setInviteFilter('all')}>Todos</Button><Button size="sm" variant={inviteFilter === 'circle' ? 'primary' : 'secondary'} onClick={() => setInviteFilter('circle')}>Círculo</Button></div><div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar">{usersForInvite.length > 0 ? usersForInvite.map(u => ( <div key={u.uid} className="flex justify-between items-center p-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg"><div className="flex items-center gap-2"><img src={u.avatarUrl || `https://ui-avatars.com/api/?name=${u.name}`} className="w-8 h-8 rounded-full" alt={u.name}/><div><p className="text-sm font-bold">{u.name}</p><p className="text-[10px] text-neutral-500">{u.headline}</p></div></div><Button size="sm" onClick={() => handleInviteMember(u.email)} className="text-xs py-1 px-2">Invitar</Button></div> )) : ( <p className="text-center text-sm text-neutral-500 py-4">No hay usuarios disponibles para invitar.</p> )}</div><div className="flex justify-end mt-4"><Button variant="secondary" onClick={() => setInviteMemberModalOpen(false)}>Cerrar</Button></div></div></Modal>
             
             {/* MODAL PARA CONVERTIR CHAT EN TAREA v11.8 */}
             <Modal isOpen={isConvertToTaskModalOpen} onClose={() => setIsConvertToTaskModalOpen(false)} title="Convertir Conversación en Tarea">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">Esto creará un seguimiento formal en el proyecto que selecciones.</p>
                    <div>
                        <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Título de la Tarea</label>
                        <Input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Ej: Llamar seguimiento..." />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Proyecto Destino</label>
                        <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-bold text-sm outline-none focus:ring-2 focus:ring-brand-primary">
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t dark:border-neutral-800">
                        <Button variant="secondary" onClick={() => setIsConvertToTaskModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleConfirmConvertTask} disabled={!newTaskTitle.trim()}>
                            {isProcessingTask ? <Spinner className="w-4 h-4 text-white" /> : "Confirmar Tarea"}
                        </Button>
                    </div>
                </div>
             </Modal>

            <div className={`fixed inset-0 bg-black/50 z-[215] lg:hidden transition-opacity ${isMobileSubMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileSubMenuOpen(false)}></div>
            <nav ref={subMenuRef} className={`flex-shrink-0 overflow-y-auto pr-4 transition-transform duration-300 z-[220] bg-light-surface dark:bg-dark-surface lg:bg-transparent lg:dark:bg-transparent lg:relative fixed lg:translate-x-0 h-full top-0 left-0 p-4 lg:p-0 w-64 lg:w-64 ${isMobileSubMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                 <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border lg:hidden"><h3 className="font-bold text-lg">Comunidad</h3><Button onClick={() => setMobileSubMenuOpen(false)} variant="ghost" size="sm" className="!p-2"><Icon name="close" /></Button></div>
                <div className="flex flex-col gap-2 p-4 lg:p-0">{TABS.map(tab => { 
                    const isActive = activeHubView === tab.id; 
                    const isMessages = tab.id === 'messages'; 
                    const isFeed = tab.id === 'feed';
                    const showFeedBadge = isFeed && unreadPosts.length > 0;
                    
                    return ( 
                        <button key={tab.id} onClick={() => { setActiveHubView(tab.id); setActiveConversationData(null); if(window.innerWidth < 1024) setMobileSubMenuOpen(false); }} className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 font-medium group ${isActive ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-lg shadow-brand-primary/30 scale-[1.02]' : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-surface hover:shadow-sm'}`} > <div className="flex items-center gap-3"> <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-white/20 text-white' : 'bg-brand-accent/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-white'}`}> <Icon name={tab.icon} className="w-5 h-5"/> </div> <span className="text-sm">{t(tab.labelKey)}</span> </div> 
                            <div className="flex items-center gap-1.5">
                                {showFeedBadge && (
                                    <span className="flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full shadow-sm animate-pulse">
                                        {unreadPosts.length}
                                    </span>
                                )}
                                {isMessages && totalUnreadMessages > 0 && ( <span className="flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full shadow-sm animate-pulse">{totalUnreadMessages}</span> )} 
                                {tab.id === 'groups' && pendingGroupRequestsCount > 0 && ( <span className="flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full shadow-sm animate-pulse">{pendingGroupRequestsCount}</span> )}
                            </div>
                        </button> 
                    ); 
                })}</div>
            </nav>

            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Mobile-only header for SubMenu trigger */}
                {!activeConversationData && (
                    <div className="lg:hidden p-3 border-b border-light-border dark:border-dark-border flex items-center gap-3 bg-light-surface dark:bg-dark-surface flex-none z-10 shadow-sm">
                        <button 
                            onClick={() => setMobileSubMenuOpen(true)} 
                            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm font-bold text-brand-primary hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        >
                            <Icon name="chevronLeft" className="w-4 h-4"/> Menú Comunidad
                        </button>
                        <h2 className="text-sm font-bold truncate flex-1">
                            {TABS.find(tab => tab.id === activeHubView) ? t(TABS.find(tab => tab.id === activeHubView)!.labelKey) : ''}
                        </h2>
                    </div>
                )}
                
                <main ref={mainContentRef} className="flex-1 overflow-y-auto h-full lg:p-0 relative pb-[env(safe-area-inset-bottom)]" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
                        <div className={`h-full overflow-y-auto ${['feed', 'people', 'groups', 'jobs', 'marketplace'].includes(activeHubView) ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
                            {renderContent()}
                        </div>
                        {['feed', 'people', 'groups', 'jobs', 'marketplace'].includes(activeHubView) && ( 
                            <div className="hidden lg:block lg:col-span-1 sticky top-0 pt-4 h-full">
                                <HubSidebarAds />
                            </div> 
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};
export default Hub;