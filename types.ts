
import React from 'react';
import Icon from './components/Icon';

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
export type TtsVoice = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Aoede';
export type AIModule = 'chat' | 'summaries' | 'contracts' | 'cfo' | 'web' | 'media' | 'agent' | 'search' | 'alter_ego';
export type BudgetMode = 'normal' | 'saving' | 'panic';
export type AutomationPlan = 'pro_connect' | 'premium_connect' | null;
export type ManyChatSource = 'whatsapp' | 'instagram' | 'tiktok' | 'messenger' | 'internal';

// --- NUEVA CAPA: ALTER EGO IA V5.0 (ALBEDRÍO, APRENDIZAJE Y ACCIÓN MULTI-NODO) ---
export type AgentMode = 'EXECUTIVE' | 'OPEN_MIND' | 'INVISIBLE' | 'VENTURE_ARCHITECT' | 'GROWTH_HACKER' | 'SKEPTIC_CFO' | 'MINIMAL_FUTURIST' | 'DISRUPTIVE_PHILOSOPHER';
export type RelationshipTier = 'ALLY' | 'RIVAL' | 'MENTOR' | 'NEUTRAL';

export interface SocialAffinity {
    uid: string;
    tier: RelationshipTier;
    interactionCount: number;
    lastSentiment: string; // "Agreed", "Debated", "Critiqued"
}

export interface ProposedAction {
    id: string;
    type: 'CREATE_PROJECT' | 'CREATE_GROUP' | 'SCHEDULE_MEETING' | 'SEND_DM';
    payload: any;
    status: 'pending' | 'executed' | 'cancelled';
    label: string; // Ejemplo: "Crear Proyecto para Venta de Software"
}

export interface AlterEgoMemory {
    lastInteractedWithUids: string[];
    socialAlliesAis: string[];
    preferredTopics: string[];
    autonomousDecisionsCount: number;
    affinityMatrix?: SocialAffinity[];
    latentThoughts?: { 
        timestamp: string; 
        thought: string; 
        isHighAlert?: boolean; 
        isMonetizationOpp?: boolean;
        actionType?: string;
        proposedAction?: ProposedAction;
    }[];
    recentThreadDebates?: Record<string, number>; // PostID -> Contador de intervenciones para evitar bucles
    learnedInsights?: string[]; // Lo que ha aprendido de otros agentes
}

export interface AlterEgoConfig {
    enabled: boolean;
    agentName: string;
    frequencyPerDay: number; // 0-48 "Latidos"
    mode: AgentMode;
    scouterEnabled: boolean;
    proactiveSyncEnabled: boolean;
    lastPulseAt?: string;
    dailyPulseCount?: number;
    privacyRulesAccepted: boolean;
    autonomyLevel: number; // 1-100% de libertad de pensamiento
    adminPaused?: boolean;
    adminPausedAt?: string;
    adminResumedAt?: string;
    adminPausedBy?: string;
    adminPauseReason?: string;
    adminPreviousEnabled?: boolean;
    memory?: AlterEgoMemory;
}

export interface SynergyProposal {
    id: string;
    type: 'collaboration' | 'business' | 'technical' | 'ai_alliance';
    title: string;
    reason: string;
    targetUid: string;
    targetName: string;
    status: 'pending' | 'accepted' | 'ignored';
    createdAt: string;
    aiNotes?: string; // Lo que la IA piensa del negocio
}
// --- FIN CAPA ALTER EGO ---

export interface EmailAccount {
  id: string;
  email: string;
  provider: 'zoho' | 'custom';
}

export interface MailContact {
  id: string;
  email: string;
  name?: string;
  addedAt: string;
}

export interface MailList {
  id: string;
  name: string;
  emails: string[];
  createdAt: string;
}

/**
 * Chat and Messaging
 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: string;
    isLoading?: boolean;
    imageUrl?: string;
    audioUrl?: string;
    stickerUrl?: string;
    files?: {
        name: string;
        type: string;
        url: string;
        base64Data?: string;
    }[];
    artifacts?: {
        id: string;
        name: string;
        type: string;
        downloadUrl: string;
        sizeBytes?: number;
    }[];
    actionResults?: {
        type: 'GENERATE_ARTIFACT' | 'GENERATE_CHART' | 'CREATE_TASK' | 'CREATE_MEETING' | 'CREATE_EVENT' | 'CREATE_PROJECT' | 'ERROR' | 'NAVIGATE' | 'SEND_EMAIL' | 'SEND_DM' | 'SAVE_DRAFT' | 'LIST_EMAILS' | 'LIST_CONTACTS';
        success: boolean;
        message: string;
        data?: any;
    }[];
    file?: {
        name: string;
        type: string;
        url: string;
        base64Data?: string;
    };
}

export interface WebDevMessage {
    role: 'user' | 'model';
    text: string;
    file?: {
        name: string;
        content: string;
    };
    urlContext?: string;
}

/**
 * Content and Media
 */
export interface SocialPost {
    id?: string;
    campaignId?: string;
    platform: string;
    format?: string;
    content: string;
    hashtags?: string | string[];
    hook?: string;
    cta?: string;
    imagePrompt?: string;
    photoPrompt?: string;
    videoPrompt?: string;
    videoBrief?: string;
    shotList?: string[];
    visualCues?: string;
    adBrief?: string;
    targetingSuggestion?: string;
    publishingChecklist?: string;
    calendarSuggestion?: string;
    qualityScore?: number;
    abVariants?: string[];
    status?: 'draft' | 'generated' | 'scheduled' | 'ready' | 'published' | 'archived';
    createdAt?: string;
    scheduledAt?: string;
    reminderMinutes?: number;
    lastPublishActionAt?: string;
    publishedAt?: string;
}

export interface SocialCampaign {
    id: string;
    ownerId: string;
    name: string;
    description: string;
    objective: string;
    offer?: string;
    tone?: string;
    networks: string[];
    audience?: string;
    industry?: string;
    campaignMode?: string;
    campaignLength?: string;
    budget?: string;
    brandVoice?: string;
    contentUniverse?: string;
    status: 'draft' | 'generated' | 'scheduled' | 'ready' | 'published' | 'archived';
    createdAt: string;
    updatedAt: string;
    posts: SocialPost[];
    creditsNote?: string;
}

export interface SocialCalendarItem {
    id: string;
    campaignId: string;
    postId: string;
    ownerId: string;
    platform: string;
    title: string;
    scheduledAt: string;
    reminderMinutes: number;
    status: 'scheduled' | 'ready' | 'published' | 'missed';
}

export interface PresentationSlide {
    id: string;
    title: string;
    subtitle?: string;
    bullets: string[];
    layout: 'content' | 'split-left' | 'split-right' | 'big-number';
    visualCue?: string;
    visualAssets?: PresentationVisualAsset[];
    icon?: string;
    type: 'content' | 'video';
    backgroundColor?: string;
    textColor?: 'white' | 'black';
    fontFamily?: string;
    textAlign?: 'left' | 'center' | 'right';
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    fontSizeLevel?: number;
    externalLinks?: { text: string; url: string }[];
    customHtml?: string;
}

export interface PresentationVisualAsset {
    id: string;
    url: string;
    type: 'image' | 'video' | 'youtube';
    scale?: number;
    objectFit?: 'contain' | 'cover';
}

export interface Presentation {
    id: string;
    userId: string;
    title: string;
    slides: PresentationSlide[];
    theme: string;
    createdAt: string;
    externalUrl?: string;
    code?: string;
    sharedBy?: { uid: string; name: string };
    fromProjectName?: string;
}

export interface GoatifyArticle {
    id: string;
    title: string;
    summary: string;
    content: string;
    category?: string;
    source?: string;
    publicationDate: string;
    imageUrl?: string;
    author?: string;
    authorLinkedinUrl?: string;
    goatifyTakeaway?: string;
    readBy?: string[];
}

export interface AiTask {
    id?: string;
    type: 'image' | 'video_analysis' | 'web_search' | 'presentation' | 'social_post';
    prompt: string;
    status: 'pending' | 'completed' | 'failed';
    createdAt: string;
    resultUrl?: string;
    resultText?: string;
    videoUrl?: string;
    aspectRatio?: AspectRatio;
    size?: number;
}

export interface UsageStats {
    stdQueries: number;
    advQueries: number;
    agentResponses: number;
    images: number;
    ttsMinutes: number;
    webDevCalls: number;
    storageUsed: number;
    presentationsGenerated: number;
    socialPostsGenerated: number;
    shivoActions: number;
    billingCycleStart: string;
}

export interface RewardStats {
    lastReset: string;
    totalDailyEarnings: number;
    actions: {
        posts: number;
        comments: number;
        groupsJoined: number;
        jobsApplied: number;
        uploads: number;
        tasksCompleted: number;
    };
}

export interface PartnerLead {
    id: string;
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    clientName: string;
    clientContact: string;
    clientTaxId?: string; 
    clientRepresentative?: string;
    projectFormalName?: string;
    serviceType: string;
    notes: string;
    status: 'pending' | 'meeting' | 'closing' | 'won' | 'lost';
    estimatedValue: number; 
    finalValue?: number; 
    advanceValue?: number;
    balanceValue?: number;
    advancePaid?: boolean;
    balancePaid?: boolean;
    advanceVoucherUrl?: string;
    balanceVoucherUrl?: string;
    extraDevValue?: number; 
    extraDevName?: string; 
    estimatedDays?: number; 
    commissionRate: number;
    createdAt: string;
    paid: boolean; 
    duration: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
    meetingUrl?: string;
    meetingDate?: string;
    lastFollowUpNotify?: string;
    hasProposal?: boolean;
    hasPrefactura?: boolean;
    hasContrato?: boolean;
    clientSiteUrl?: string;
    proposalText?: string;
    contractText?: string; 
    contractEcuText?: string;
    contractLatText?: string;
    preInvoiceText?: string; 
    preInvoiceEcuText?: string;
    preInvoiceLatText?: string;
    changeRequests?: ClientChangeRequest[];
    contractSigned?: boolean;
    taxPercentage?: number;
    proposalApproved?: boolean;
    preInvoicePaid?: boolean;
    paymentVoucherUrl?: string; 
    archived?: boolean;
    customServices?: { name: string; value: number; isMonthly: boolean }[];
}

export interface ProjectClientTodo {
    id: string;
    text: string;
    completed: boolean;
}

export interface CrmServiceItem {
    id: string;
    name: string;
    price: number;
}

export interface ClientActivity {
    id: string;
    type: 'note' | 'call' | 'document' | 'system' | 'sales_room_view';
    text: string;
    date: string;
    user?: string;
}

export interface ClientFile {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    uploadedAt: string;
}

export interface ClientChangeRequest {
    id: string;
    section: 'proposal' | 'contract' | 'preInvoice' | string;
    description: string;
    date: string;
    status: 'pending' | 'resolved';
}

export interface ProjectClient {
    id: string;
    name: string;
    contact: string; 
    phone: string;
    taxId: string; 
    status: string; 
    value: number; 
    deliveryTime: string;
    applyTax: boolean; 
    taxPercentage?: number;
    businessNotes: string;
    notes: string; 
    todoList: ProjectClientTodo[];
    createdAt: string;
    brandName?: string;
    businessDescription?: string; 
    issuerName?: string;
    issuerPhone?: string; 
    issuerEmail?: string; 
    providerName: string; 
    providerTaxId: string;
    providerContact: string;
    businessType?: string; 
    services?: CrmServiceItem[];
    proformaGenerated?: boolean;
    preInvoiceGenerated?: boolean;
    agreementGenerated?: boolean;
    meetingUrl?: string;
    meetingDate?: string;
    logoUrl?: string;
    issuerLogoUrl?: string;
    files?: ClientFile[];
    activityFeed?: ClientActivity[];
    changeRequests?: ClientChangeRequest[];
    salesRoomId?: string;
    viewsCount?: number;
    lastViewedAt?: string;
    currency?: string;
    enableAdvances?: boolean;
    advancePercentage?: number;
    proposalApproved?: boolean;
    preInvoicePaid?: boolean;
    contractSigned?: boolean;
    lastFollowUpNotify?: string;
    proposalText?: string;
    contractText?: string;
    preInvoiceText?: string;
}

export type FinanceADN = 'lifestyle' | 'independent' | 'business' | 'investment' | 'enterprise';
export type FinanceBucket = 'PRODUCIR' | 'EXISTIR' | 'ACTIVOS' | 'VENTAS' | 'IMPUESTOS';
export type FiscalCountry = 'EC' | 'MX' | 'CO' | 'OTHER';

export interface AiFinanceReport {
    id: string;
    date: string;
    score: number;
    report: string;
    dnaAdvice: string;
}

export interface FinancialTransaction {
    id: string;
    type: 'income' | 'expense';
    description: string;
    amount: number;
    taxAmount?: number;
    date: string;
    bucket: FinanceBucket;
    isPaid: boolean;
    attachmentUrl?: string;
    providerTaxId?: string; 
    isAutoFromCrm?: boolean;
}

export interface FinancialState {
    income: number;
    expenses: number;
    transactions: FinancialTransaction[];
    adn: FinanceADN;
    fiscalCountry: FiscalCountry;
    healthScore?: number;
    aiReport?: string;
    lastAiAnalysis?: string;
    reports?: AiFinanceReport[]; 
}

export interface ProjectMetadata {
    industry?: string;
    objective?: string;
    targetAudience?: string;
    valueProposition?: string;
    currentStage?: string;
}

/**
 * Projects and Task Management
 */
export interface GlobalChat {
    id: string;
    name: string;
    history: ChatMessage[];
    updatedAt: string;
    deletedBy?: string[];
}

export interface Project {
    id: string;
    name: string;
    ownerId: string;
    createdAt: string;
    members: UserProfile[];
    memberIds: string[];
    folders: Folder[];
    documents: Document[];
    notes: Note[];
    drawings: Drawing[];
    chats: GlobalChat[];
    spreadsheets: Spreadsheet[];
    spreadsheetData?: any; 
    finances: FinancialState;
    statuses: ProjectStatus[];
    hubGroupId?: string;
    clients?: ProjectClient[];
    metadata?: ProjectMetadata;
    driveMetadata?: {
        folders: any[];
        fileFolderMap: Record<string, string>;
    };
    isLocked?: boolean;
    allowAlterEgo?: boolean; 
    pendingInvites?: string[];
    endDate?: string;
    stage?: 'Anteproyecto' | 'Inicio' | 'Planificación' | 'Ejecución' | 'Seguimiento y control' | 'Cierre';
    roles?: {
        director?: (string | {name: string, email?: string})[];
        socios?: (string | {name: string, email?: string})[];
        colaboradores?: (string | {name: string, email?: string})[];
        clientes?: (string | {name: string, email?: string})[];
    };
    logoUrl?: string;
    loyaltyConfig?: LoyaltyConfig;
    publicLinkConfig?: {
        enabled: boolean;
        includedSections: string[];
        importantSections?: string[];
        includedNotes?: string[];
        urlId?: string;
        additionalNotes?: string;
        notesColor?: string;
        contactEmail?: string;
        contactWhatsapp?: string;
        meetingLink?: string;
        loyaltyProgram?: {
            enabled: boolean;
            rewardName: string;
            requiredVisits: number;
            icon?: string;
        };
        schedulingConfig?: {
            enabled: boolean;
            workingDays: number[]; // 0-6
            startTime: string; // "09:00"
            endTime: string; // "17:00"
            slotDuration: number; // minutes
            timezone?: string;
        };
        customSections?: {
            id: string;
            title: string;
            content: string;
            color: string;
        }[];
    };
}

export interface Folder {
    id: string;
    name: string;
    tasks: Task[];
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    projectId: string;
    folderId: string;
    tags?: string[];
    date: string;
    time?: string;
    hours?: number | null;
    isAiGenerated?: boolean;
    assignedTo?: string[]; 
}

export interface Document {
    id: string;
    name: string;
    content: string;
    uploadedAt: string;
    size: number;
    fileType: string;
}

export interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt?: string;
}

export interface LoyaltyConfig {
    enabled: boolean;
    rewardName: string; // e.g., "Café gratis"
    targetVisits: number; // e.g., 10
    description?: string;
}

export interface LoyaltyClaim {
    id: string;
    projectId: string;
    projectName: string;
    userEmail: string;
    userId?: string; // If they have an account
    status: 'pending' | 'approved' | 'rejected';
    redeemed?: boolean;
    createdAt: string;
    approvedAt?: string;
    rewardName: string;
}

export interface Drawing {
    id: string;
    title: string;
    dataUrl: string;
    createdAt: string;
}

export interface Spreadsheet {
    id: string;
    title: string;
    columns: SpreadsheetColumn[];
    rows: SpreadsheetRow[];
    createdAt: string;
}

export interface SpreadsheetColumn {
    id: string;
    name: string;
}

export interface SpreadsheetRow {
    id: string;
    cells: { id: string; value: string }[];
}

export interface MeetingRequest {
    id?: string;
    projectId: string;
    projectName: string;
    ownerId: string;
    clientName: string;
    clientEmail: string;
    clientWhatsapp?: string;
    requestedAt: string; // ISO
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    notes?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface ProjectStatus {
    id: string;
    name: string;
    color: string;
    isFixed?: boolean;
}

/**
 * Hub and Community
 */

// Added missing Comment interface
export interface Comment {
    id: string;
    author: { uid: string; name: string; avatarUrl: string | null };
    text: string;
    timestamp: string;
    audioUrl?: string | null;
    likedBy?: string[];
    likes?: number;
    replies?: Comment[];
    isAgentComment?: boolean;
    agentName?: string;
    agentOwnerHumanName?: string;
}

export interface HubPost {
    id: string;
    author: { uid: string; name: string; avatarUrl: string | null; headline?: string };
    content: string;
    timestamp: any;
    likes: number;
    likedBy: string[];
    comments: Comment[];
    groupId?: string | null;
    readBy?: string[];
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    file?: { url: string; type: string; name: string };
    stickerUrl?: string | null;
    isSensitive?: boolean;
    isAgentPost?: boolean;
    agentName?: string;
    agentOwnerUid?: string;
    agentOwnerHumanName?: string;
    repostOf?: string;
    repostedBy?: { uid: string; name: string };
}

export interface HubGroup {
    id: string;
    name: string;
    description: string;
    isPrivate: boolean;
    icon: string;
    imageUrl?: string;
    memberCount: number;
    creatorId: string;
    members: string[];
    pendingMembers?: string[];
    onlyAdminsCanPost?: boolean;
    rules?: string;
    tags?: string[];
    createdAt?: string;
}

export interface MarketplaceListing {
    id: string;
    title: string;
    description: string;
    priceUSD: number;
    type: 'product' | 'service' | 'job';
    acceptsIntis: boolean;
    user: { uid: string; name: string; avatarUrl: string | null };
    imageUrl?: string;
    createdAt: string;
    tags?: string[];
    company?: string; // for jobs
    location?: string; // for jobs
    salary?: string; // for jobs
    jobType?: string; // for jobs
    applicants?: string[]; // for jobs
}

/**
 * Communications and Meetings
 */
export interface CallRecording {
    id: string;
    url: string;
    sizeBytes: number;
    title: string;
    createdAt: string;
}

export interface CallSession {
    id: string;
    caller: { uid: string; name: string; avatarUrl: string | null };
    participants: string[];
    invited?: string[];
    type: 'audio' | 'video';
    status: 'ringing' | 'active' | 'ended' | 'scheduled';
    isActive: boolean;
    isMeeting: boolean;
    title?: string;
    description?: string;
    scheduledAt?: string;
    // Added missing createdAt property
    createdAt: string;
    adminId: string;
    maxDurationMinutes?: number;
    waitingRoom: string[];
    isPrivate?: boolean;
    projectId?: string;
    endedAt?: string;
    videoUpgradeRequest?: { fromUid: string; status: 'pending' | 'accepted' | 'rejected' } | null;
    guestInfo?: { name: string; email: string; whatsapp: string; notes?: string };
    source?: 'scheduler' | 'direct' | 'project' | 'chat';
}

export type CallType = 'audio' | 'video';

export interface Conversation {
    id: string;
    members: string[];
    otherUser?: UserProfile;
    lastMessage?: {
        text: string;
        senderId: string;
        timestamp: any;
    };
    unreadCount?: number;
    deletedBy?: string[];
    lastActivity?: any;
    agentName?: string;
    userName?: string;
    automationPaused?: boolean;
    history?: ChatMessage[];
    projectId?: string;
}

export interface DirectMessage {
    id: string;
    senderId: string;
    text: string;
    timestamp: any;
    read: boolean;
    file?: {
        name: string;
        type: string;
        url: string;
    };
    audioUrl?: string | null;
    stickerUrl?: string | null;
    isSending?: boolean;
    isSystem?: boolean;
}

export interface AgentConversation extends Conversation {
    agentId: string;
    userId: string;
    agentVersion: string;
    isFlowCompleted?: boolean;
    // Added missing properties for flow management
    currentFlowStepId?: string | null;
    status?: 'active' | 'waiting_for_input' | 'completed' | string;
}

/**
 * AI Agents
 */
export interface AiAgentConfig {
    id: string;
    ownerId: string;
    name: string;
    persona: string;
    mode: 'basic' | 'advanced';
    voice: TtsVoice;
    responseCount: number;
    avatarUrl?: string;
    whatsappStyle?: boolean;
    updatedAt: string;
    flow?: AgentFlow | null;
}

export interface AgentFlow {
    startStepId: string;
    steps: FlowStep[];
}

export interface FlowStep {
    id: string;
    name: string;
    type: StepType;
    message: string;
    options: FlowOption[];
    position: { x: number; y: number };
    waitForInput: boolean;
    mediaUrl?: string;
    mediaType?: string;
    nextStepId?: string;
}

export interface FlowOption {
    id: string;
    label: string;
    nextStepId: string;
}

export type StepType = 'TEXT' | 'IMAGE' | 'AI_RESPONSE';

/**
 * Other Systems
 */
export interface Form {
    id: string;
    ownerId: string;
    name: string;
    description: string;
    htmlCode: string;
    createdAt: string;
    responseCount: number;
}

export interface IntisTransaction {
    id: string;
    type: string;
    amount: number;
    description: string;
    date: string;
}

export interface ActivityLogItem {
    id: string;
    type: string;
    text: string;
    date: string;
    projectId?: string;
}

export interface Book {
    id: string;
    title: string;
    spanishTitle: string;
    author: string;
    description: string;
    coverUrl: string;
    summary: string;
    content: string;
    sourceUrl?: string;
}

export interface Product {
    id: string;
    nameKey: string;
    descriptionKey: string;
    icon: string;
}

export interface WebFile {
    name: string;
    code: string;
    history: WebDevMessage[];
    isGenerating: boolean;
    agentStatus?: string;
    versions?: string[];
    currentVersionIndex?: number;
}

export interface WebDevSession {
    id: string;
    name: string;
    type: 'web' | 'app';
    files: WebFile[];
    activeFileIndex: number;
    createdAt: string;
    // Deprecated but kept for migration
    code?: string;
    history?: WebDevMessage[];
    isGenerating?: boolean;
}

export interface CustomSticker {
    id: string;
    url: string;
    ownerId: string;
    createdAt: string;
}

export interface SystemAnnouncement {
    id: string;
    title?: string;
    message: string;
    type: 'text' | 'html' | 'image';
    frequency: 1 | 3 | 5;
    createdAt: string;
    active: boolean;
}

export interface AdminUserData {
    user: UserProfile;
    usage: UserUsage | null;
}

export type View = 'dashboard' | 'projects' | 'globalCalendar' | 'discovery' | 'hub' | 'wallet' | 'partners' | 'aiStudio' | 'profile' | 'calls' | 'sales_room' | 'drive' | 'scheduler' | 'chill' | 'mail';
export type HubView = 'feed' | 'groups' | 'messages' | 'marketplace' | 'jobs' | 'people';
export type AiStudioView = 'chat' | 'live' | 'webProgrammer' | 'mediaGenerator' | 'imageEditor' | 'videoInsights' | 'audioTools' | 'agents' | 'formBuilder' | 'presentations' | 'socialManager' | 'webSearch';
export type ProjectSubView = 'overview' | 'info' | 'tasks' | 'spreadsheet' | 'documents' | 'notepad' | 'drawingpad' | 'financials' | 'chat' | 'members' | 'crm' | 'loyalty' | 'pos';
export type UserPlan = 'free' | 'pro' | 'premium';

export enum TaskStatus {
    TODO = 'Por Hacer',
    IN_PROGRESS = 'En Progreso',
    DONE = 'Hecho'
}

export interface NotificationSettings {
    likes: boolean;
    comments: boolean;
    groupPosts: boolean;
    projectInvites: boolean;
    projectUpdates: boolean;
    newJobs: boolean;
    newMessages: boolean;
    taskDue: boolean;
    general: boolean;
    ai_task_complete: boolean;
    newsAlerts: boolean;
    agentMessages: boolean;
}

export type NotificationType = 'new_message' | 'sticker' | 'incoming_call' | 'missed_call' | 'project_invite' | 'project_update' | 'group_post' | 'agent_message' | 'general' | 'like' | 'comment' | 'task_due' | 'ai_task_complete' | 'news_alert' | 'group_join_request' | 'group_join_accepted' | 'group_join_denied' | 'repost';

export interface Notification {
    id: string;
    type: NotificationType | string;
    text: string;
    timestamp: string;
    read: boolean;
    link?: string;
    fromUser?: {
        uid: string;
        name: string;
        avatarUrl: string | null;
    };
    metadata?: any;
}

export interface WorkExperienceItem {
    id: string;
    role: string;
    company: string;
    duration: string;
    description: string;
}

export interface EducationItem {
    id: string;
    degree: string;
    school: string;
    year: string;
}

export const SUPER_ADMIN_EMAILS = [
    'deoc29@gmail.com', 
    'deoc29@hotmail.com', 
    'vaoc93@hotmail.com',
    'info@goatify.app'
];

export const COURTESY_EMAILS: string[] = [];
export const EXTRA_AGENT_RESPONSES = 500;

export interface UserUsage {
    user_id: string;
    plan_id: string;
    billing_cycle_start: string;
    billing_cycle_end: string;
    tokens_in?: number;
    tokens_out?: number;
    total_cost_usd?: number;
    counters: {
        daily_chat_count: number;
        daily_entry_count: number;
        daily_form_edits: number; 
        last_daily_reset: string;
        monthly_images_used: number;
        monthly_web_ops_used: number;
        monthly_presentations_used: number;
        monthly_posts_used: number;
        monthly_agent_responses: number;
        monthly_voice_commands: number;
        monthly_voice_minutes: number;
        monthly_video_minutes: number;
        current_projects_count: number;
        current_tasks_count: number;
        current_forms_count: number;
        current_agents_count: number;
        current_storage_bytes: number;
        monthly_crm_clients_created: number;
        monthly_meetings_created: number;
        monthly_grounding_used: number; 
        monthly_live_sessions_used: number; 
        monthly_articles_published: number; 
        current_published_sites: number; 
        last_entry_date?: string;
        monthly_videos_analyzed: number;
    }
}

export const FEATURE_LIMIT_MAP = {
    "ai_chat": { limitKey: "ai_chat_daily_queries", usageKey: "daily_chat_count", reset: "daily" },
    "ai_image": { limitKey: "ai_images_monthly", usageKey: "monthly_images_used", reset: "monthly" },
    "web_programmer": { limitKey: "web_programmer_ops", usageKey: "monthly_web_ops_used", reset: "monthly" },
    "presentation": { limitKey: "presentations_monthly", usageKey: "monthly_presentations_used", reset: "monthly" },
    "social_post": { limitKey: "social_posts_monthly", usageKey: "monthly_posts_used", reset: "monthly" },
    "agent_response": { limitKey: "agent_responses_monthly", usageKey: "monthly_agent_responses", reset: "monthly" },
    "voice_command": { limitKey: "voice_commands_monthly", usageKey: "monthly_voice_commands", reset: "monthly" },
    "voice_live_minute": { limitKey: "voice_live_minutes", usageKey: "monthly_voice_minutes", reset: "monthly" },
    "video_live_minute": { limitKey: "video_live_minutes", usageKey: "monthly_video_minutes", reset: "monthly" },
    "project_create": { limitKey: "active_projects", usageKey: "current_projects_count", reset: "none" },
    "task_create": { limitKey: "active_tasks", usageKey: "current_tasks_count", reset: "none" },
    "form_create": { limitKey: "active_forms", usageKey: "current_forms_count", reset: "none" },
    "agent_create": { limitKey: "agent_create", usageKey: "current_agents_count", reset: "none" },
    "storage": { limitKey: "storage_gb", usageKey: "current_storage_bytes", reset: "none" },
    "crm_client_create": { limitKey: "crm_clients_monthly", usageKey: "monthly_crm_clients_created", reset: "monthly" },
    "meeting_create": { limitKey: "meetings_monthly", usageKey: "monthly_meetings_created", reset: "monthly" },
    "ai_grounding": { limitKey: "grounding_monthly", usageKey: "monthly_grounding_used", reset: "monthly" },
    "ai_video": { limitKey: "ai_video_analysis_monthly", usageKey: "monthly_videos_analyzed", reset: "monthly" },
    "live_session": { limitKey: "live_sessions_monthly", usageKey: "monthly_live_sessions_used", reset: "monthly" },
    "article_publish": { limitKey: "articles_monthly", usageKey: "monthly_articles_published", reset: "monthly" },
    "site_publish": { limitKey: "publish_sites", usageKey: "current_published_sites", reset: "none" }
} as const;

export type FeatureKey = keyof typeof FEATURE_LIMIT_MAP;

export interface UserProfile {
    uid: string;
    name: string;
    lastName?: string;
    email: string;
    phoneNumber?: string; 
    emailVerified?: boolean; 
    avatarUrl: string | null;
    headline?: string;
    bio?: string;
    birthDate?: string;
    experienceList?: WorkExperienceItem[];
    educationList?: EducationItem[];
    businessList?: string[]; 
    workExperience?: string;
    businessName?: string;
    businessName2?: string;
    skills: string[];
    country?: string;
    currency?: string;
    socials?: {
        linkedin?: string;
        twitter?: string;
        instagram?: string;
        facebook?: string;
        tiktok?: string;
        youtube?: string;
        kick?: string;
    };
    plan: UserPlan;
    subscriptionStatus?: 'active' | 'canceled' | 'trialing';
    subscriptionId?: string;
    automationPlan?: AutomationPlan;
    automationPlanStatus?: 'active' | 'canceled' | 'expired';
    automationPlanRenewalDate?: string;
    extraAgentsPurchased?: number;
    profileType: 'personal' | 'business';
    notificationSettings: NotificationSettings;
    isPrivate?: boolean;
    hideShivo?: boolean; 
    dailyActivityStreak?: number;
    usage?: UsageStats;
    acceptsIntis?: boolean;
    circle?: string[];
    circleRequests?: string[];
    blockedUsers?: string[];
    lastSeen?: string;
    showInHub?: boolean;
    intisBalance?: number;
    primaryEmailAccountId?: string;
    partnerCode?: string;
    welcomeEmailSent?: boolean;
    mailAccounts?: any[];
    mailSignatures?: MailSignature[];
    modelInstructions?: {
        preferredName?: string;
        modelStyle?: string;
        customInstructions?: string;
    };
    rewardStats?: RewardStats; 
    goatifyTakeaway?: string;
    alterEgo?: AlterEgoConfig; 
    username?: string;
    schedulingConfig?: {
        enabled: boolean;
        workingDays: number[]; // 0-6
        startTime: string; // "09:00"
        endTime: string; // "17:00"
        slotDuration: number; // minutes
        timezone?: string;
        meetingLink?: string;
    };
}

export interface MailSignature {
    id: string;
    name: string;
    type: 'plain' | 'html' | 'image';
    content: string; // HTML, Text or Image URL
    active: boolean;
}

// Added missing DeepLinkTarget interface
export interface DeepLinkTarget {
    view: string;
    id: string;
    action?: string;
}

export interface AppContextType {
    currentUser: any;
    authLoading: boolean;
    isSuperAdmin: boolean;
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
    language: 'en' | 'es';
    setLanguage: (lang: 'en' | 'es') => void;
    isOnboardingComplete: boolean;
    setOnboardingComplete: (val: boolean) => void;
    currentView: View;
    setCurrentView: (view: View) => void;
    activeHubView: HubView;
    setActiveHubView: (view: HubView) => void;
    projects: Project[];
    addProject: (project: Omit<Project, 'id'>, isAutomatic?: boolean) => Promise<string>;
    updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
    deleteProject: (projectId: string) => Promise<void>;
    createTask: (taskData: Omit<Task, 'id' | 'status'>, folderId: string) => Promise<void>;
    updateTask: (task: Task) => Promise<void>;
    reorderOrMoveTask: (draggedTaskId: string, targetTaskId: string | null, targetFolderId: string, projectId: string) => Promise<void>;
    deleteTask: (taskId: string, projectId: string, folderId: string) => Promise<void>;
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    agents: AiAgentConfig[];
    addAgent: (agent: any) => Promise<void>;
    updateAgent: (id: string, updates: any) => Promise<void>;
    deleteAgent: (id: string) => Promise<void>;
    agentConversations: any[];
    deleteAgentConversation: (id: string) => Promise<void>;
    globalChats: GlobalChat[];
    setGlobalChats: React.Dispatch<React.SetStateAction<GlobalChat[]>>;
    activeGlobalChatId: string;
    setActiveGlobalChatId: (id: string) => void;
    addNewGlobalChat: () => Promise<void>;
    updateGlobalChatName: (chatId: string, newName: string) => Promise<void>;
    deleteGlobalChat: (chatId: string) => Promise<void>;
    assignGlobalChatToProject: (chatId: string, projectId: string) => Promise<void>;
    isNewTaskModalOpen: boolean;
    setNewTaskModalOpen: (val: boolean) => void;
    newTaskModalDate: string | null;
    setNewTaskModalDate: (date: string | null) => void;
    isTaskEditModalOpen: boolean;
    setTaskEditModalOpen: (val: boolean) => void;
    editingTask: Task | null;
    setEditingTask: (task: Task | null) => void;
    isProModalOpen: boolean;
    setProModalOpen: (val: boolean) => void;
    proModalMode: 'plan' | 'agent' | 'connect';
    setProModalMode: (mode: 'plan' | 'agent' | 'connect') => void;
    isAiChatOpen: boolean;
    setAiChatOpen: (val: boolean) => void;
    imageToEditUrl: string | null;
    setImageToEditUrl: (val: string | null) => void;
    emailAccounts: EmailAccount[];
    fetchEmailAccounts: () => Promise<void>;
    goatifyNews: GoatifyArticle[];
    areNewsLoading: boolean;
    hasNewNews: boolean;
    setHasNewNews: (val: boolean) => void;
    hasNewStudioContent: boolean;
    setHasNewStudioContent: (val: boolean) => void;
    markArticleAsRead: (id: string) => void;
    automationSettings: { newsEnabled?: boolean; welcomeEnabled?: boolean };
    hubPosts: HubPost[];
    setHubPosts: React.Dispatch<React.SetStateAction<HubPost[]>>;
    addHubPost: (content: string, groupId?: string, media?: any, stickerUrl?: string, silent?: boolean, isSensitive?: boolean) => Promise<void>;
    repostPost: (postId: string) => Promise<void>;
    updateHubPost: (postId: string, updates: Partial<HubPost>) => Promise<void>;
    deleteHubPost: (postId: string) => Promise<void>;
    likePost: (postId: string) => Promise<void>;
    addCommentToPost: (postId: string, text: string, audioUrl?: string, parentCommentId?: string) => Promise<void>;
    updateComment: (postId: string, commentId: string, text: string) => Promise<void>;
    likeComment: (postId: string, commentId: string) => Promise<void>;
    deleteComment: (postId: string, commentId: string) => Promise<void>;
    markPostAsRead: (postId: string) => Promise<void>;
    applyToJob: (jobId: string) => Promise<void>;
    sendHubMediaToProject: (media: { url: string; name: string; type: string }, projectId: string) => Promise<void>;
    marketplaceListings: MarketplaceListing[];
    setMarketplaceListings: React.Dispatch<React.SetStateAction<MarketplaceListing[]>>;
    addMarketplaceListing: (listing: any) => Promise<void>;
    addJobListing: (listing: any) => Promise<void>;
    jobListings: MarketplaceListing[];
    deleteMarketplaceListing: (id: string) => Promise<void>;
    buyItem: (item: MarketplaceListing) => Promise<void>;
    hubGroups: HubGroup[];
    setHubGroups: React.Dispatch<React.SetStateAction<HubGroup[]>>;
    addHubGroup: (group: any, initialMembers: string[]) => Promise<string>;
    updateHubGroup: (groupId: string, updates: any) => Promise<void>;
    joinGroup: (groupId: string) => Promise<void>;
    deleteHubGroup: (groupId: string) => Promise<void>;
    joinedGroupIds: Set<string>;
    approveGroupMember: (groupId: string, uid: string) => Promise<void>;
    denyGroupMember: (groupId: string, uid: string) => Promise<void>;
    removeGroupMember: (groupId: string, uid: string) => Promise<void>;
    conversations: Conversation[];
    sendDirectMessage: (recipient: UserProfile, text: string, file?: any, audioUrl?: string, stickerUrl?: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    totalUnreadMessages: number;
    userProfile: UserProfile;
    updateUserProfile: (uid: string, data: Partial<UserProfile>) => Promise<void>;
    viewingProfile: UserProfile | null;
    setViewingProfile: (user: UserProfile | null) => void;
    sendCircleRequest: (uid: string) => Promise<void>;
    acceptCircleRequest: (uid: string) => Promise<void>;
    declineCircleRequest: (uid: string) => Promise<void>;
    logOut: () => Promise<void>;
    logInWithEmail: (e: string, p: string) => Promise<void>;
    deleteUserAccount: (pwd: string) => Promise<void>;
    allUsers: UserProfile[];
    allBooks: Book[];
    addBook: (book: Omit<Book, 'id'>) => Promise<void>;
    updateBook: (id: string, updates: Partial<Book>) => Promise<void>;
    deleteBook: (id: string) => Promise<void>;
    seedBooks: () => Promise<void>;
    mockBooks: Book[];
    mockProducts: Product[];
    intisBalance: number;
    setIntisBalance: React.Dispatch<React.SetStateAction<number>>;
    intisTransactions: IntisTransaction[];
    addIntisTransaction: (tx: any) => Promise<void>;
    sendIntis: (email: string, amount: number, note: string) => Promise<void>;
    isAiMuted: boolean;
    setIsAiMuted: (val: boolean) => void;
    inviteUserToProject: (projectId: string, email: string) => Promise<void>;
    acceptProjectInvite: (notificationId: string, projectId: string) => Promise<void>;
    declineProjectInvite: (notificationId: string) => Promise<void>;
    checkTaskLimit: () => Promise<boolean>;
    checkQueryLimit: () => Promise<boolean>;
    checkThinkingQueryLimit: () => Promise<boolean>;
    checkMediaLimit: (type?: 'image' | 'video') => Promise<boolean>;
    checkAgentLimit: (type: 'create' | 'response', agentId?: string) => Promise<boolean>;
    buyExtraAgent: () => Promise<void>;
    checkLiveConversationLimit: (duration: number, type: 'voice' | 'video') => Promise<boolean>;
    checkAndConsumeLimit: (userId: string, featureKey: FeatureKey, amount?: number, forcedPlanKey?: string) => Promise<boolean>;
    checkFormLimit: () => Promise<boolean>;
    checkWebSearchLimit: () => Promise<boolean>;
    checkWebProgrammerLimit: () => Promise<boolean>;
    checkPresentationLimit: () => Promise<boolean>;
    checkProjectLimit: () => Promise<boolean>;
    checkSocialPostLimit: (amount?: number) => Promise<boolean>;
    checkShivoLimit: () => Promise<boolean>;
    checkCrmLimit: () => Promise<boolean>;
    checkMeetingLimit: () => Promise<boolean>;
    startupPrompt: string | null;
    setStartupPrompt: (prompt: string | null) => void;
    toastNotification: any;
    setToastNotification: (val: any) => void;
    deepLinkTarget: DeepLinkTarget | 'productivity-analysis' | null;
    setDeepLinkTarget: (val: DeepLinkTarget | 'productivity-analysis' | null) => void;
    webDevSessions: WebDevSession[];
    setWebDevSessions: React.Dispatch<React.SetStateAction<WebDevSession[]>>;
    activeWebDevSessionId: string;
    setActiveWebDevSessionId: (id: string) => void;
    addNewWebDevSession: () => Promise<void>;
    updateWebDevSession: (sessionId: string, updates: Partial<WebDevSession>) => Promise<void>;
    updateWebDevFile: (sessionId: string, fileIndex: number, updates: Partial<WebFile>) => Promise<void>;
    deleteWebDevSession: (sessionId: string) => Promise<void>;
    assignCodeToProject: (sessionId: string, projectId: string) => Promise<void>;
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
    activityLog: ActivityLogItem[];
    addActivityLog: (type: string, text: string, projectId?: string) => void;
    collapsedFolderIds: string[];
    toggleFolderCollapse: (id: string) => void;
    isDrawingPadFullScreen: boolean;
    setDrawingPadFullScreen: (val: boolean) => void;
    rewardFileUpload: () => void;
    notifications: Notification[];
    markNotificationAsRead: (id: string) => Promise<void>;
    markNotificationsAsReadByType: (type: string) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
    markGroupNotificationsAsRead: (groupId: string) => Promise<void>;
    markNotificationsReadForSender: (senderUid: string) => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    deleteAllNotifications: () => Promise<void>;
    createNotification: (userId: string, notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => Promise<void>;
    aiTaskHistory: AiTask[];
    startAiTask: (task: Partial<AiTask>) => Promise<void>;
    deleteAiTask: (task: any) => Promise<void>;
    sendMediaToProject: (media: any, projectId: string) => Promise<void>;
    sendDataUrlToProject: (dataUrl: string, name: string, type: string, projectId: string) => Promise<void>;
    sendArticleToProject: (article: GoatifyArticle, projectId: string) => Promise<void>;
    sendFormResponsesToProject: (form: Form, projectId: string, format: 'csv' | 'pdf') => Promise<void>;
    deleteProjectChat: (projectId: string, chatId: string) => Promise<void>;
    removeProjectMember: (projectId: string, uid: string) => Promise<void>;
    forms: Form[];
    addForm: (form: any) => Promise<void>;
    deleteForm: (id: string) => Promise<void>;
    formResponses: Record<string, any[]>;
    loadFormResponses: (formId: string) => Promise<void>;
    customStickers: CustomSticker[];
    addCustomSticker: (file: File) => Promise<string | undefined>;
    deleteCustomSticker: (stickerId: string, stickerUrl: string) => Promise<void>;
    GOATIFY_SERVICES: any[];
    nextNewsUpdate: number | null;
    isAnalyzing: boolean;
    setIsAnalyzing: (val: boolean) => void;
    trends: any[];
    isNewsRefreshing: boolean;
    uploadImageToStorage: (base64: string) => Promise<string>;
    unreadGroupIds: string[];
    markGroupPostsAsRead: (groupId: string) => Promise<void>;
    isLiveSessionActive: boolean;
    setIsLiveSessionActive: (val: boolean) => void;
    cancelGroupJoinRequest: (groupId: string) => Promise<void>;
    userUsage: UserUsage | null;
    getAllUsersData: () => Promise<AdminUserData[]>;
    performNuclearDeletion: (uid: string) => Promise<void>;
    isManualOpen: boolean;
    setIsManualOpen: (val: boolean) => void;
    saveCallRecording: (url: string, sizeBytes: number, title?: string) => Promise<void>;
    deleteCallRecording: (recordingId: string, url: string, sizeBytes: number) => Promise<void>;
    notifyAdminsOfNewUser: (newUser: UserProfile) => Promise<void>;
    isAgentFullScreen: boolean;
    setIsAgentFullScreen: (val: boolean) => void;
    registerLiveSession: (callback: () => void) => void;
    disconnectLiveSession: () => void;
    forceNewsUpdate: () => Promise<void>;
    announcementToShow: SystemAnnouncement | null;
    publishAnnouncement: (text: string, frequency: 1 | 3 | 5, title?: string, type?: 'text' | 'html' | 'image') => Promise<void>;
    dismissAnnouncement: () => Promise<void>;
    publishedSites: any[];
    toggleSiteStatus: (id: string, active: boolean) => Promise<void>;
    cancelAnnouncement: () => Promise<void>;
    triggerReward: (action: 'post' | 'comment' | 'group_join' | 'job_apply' | 'upload' | 'task_complete') => Promise<boolean>;
    removeConnection: (targetUid: string) => Promise<void>;
    blockUser: (targetUid: string) => Promise<void>;
    unblockUser: (targetUid: string) => Promise<void>;
    isUserBlocked: (targetUid: string) => boolean;
    addPartnerLead: (leadData: any) => Promise<void>;
    updatePartnerLead: (leadId: string, updates: Partial<PartnerLead>) => Promise<void>;
    allLeads: PartnerLead[];
    isMeetsInfoOpen: boolean;
    setMeetsInfoOpen: (val: boolean) => void;
    isScheduleModalOpen: boolean;
    setScheduleModalOpen: (val: boolean) => void;
    liveSessionMode: 'audio' | 'video' | null;
    setLiveSessionMode: (val: 'audio' | 'video' | null) => void;
    liveSessionContext: { chatId: string, projectId?: string, isGlobal: boolean, history?: ChatMessage[] } | null;
    setLiveSessionContext: (val: { chatId: string, projectId?: string, isGlobal: boolean, history?: ChatMessage[] } | null) => void;
    isScreenSharingGlobal: boolean;
    setIsScreenSharingGlobal: (val: boolean) => void;
    textSizeLevel: number;
    setTextSizeLevel: (val: number) => void;
    processLoyaltyClaim: (claimId: string, status: 'approved' | 'rejected') => Promise<void>;
    isFullScreenActive: boolean;
    setIsFullScreenActive: (val: boolean) => void;
    // Notes Subcollection Methods
    getProjectNotes: (projectId: string) => Promise<Note[]>;
    saveProjectNote: (projectId: string, note: Note) => Promise<void>;
    deleteProjectNote: (projectId: string, noteId: string) => Promise<void>;
    mailDraft: { to: string, subject: string, htmlBody: string, cc?: string, bcc?: string, accountId?: string } | null;
    setMailDraft: (draft: { to: string, subject: string, htmlBody: string, cc?: string, bcc?: string, accountId?: string } | null) => void;
    mailLists: MailList[];
    mailContacts: MailContact[];
}

export const SUBSCRIPTION_PLANS = {
    free: {
        ai_budget_usd: 1.0,
        limits: {
            active_projects: 3,
            active_tasks: 50,
            active_forms: 1,
            ai_chat_daily_queries: 30,
            ai_images_monthly: 3,
            agent_responses_monthly: 100,
            voice_live_minutes: 5,
            video_live_minutes: 1,
            storage_gb: 1,
            crm_clients_monthly: 4,
            meetings_monthly: 30,
            grounding_monthly: 20,
            live_sessions_monthly: 0,
            articles_monthly: 0,
            publish_sites: 1,
            web_programmer_ops: 10,
            presentations_monthly: 1,
            social_posts_monthly: 30,
            ai_video_analysis_monthly: 2,
            agent_create: 1,
            pos_enabled: true
        }
    },
    pro: {
        ai_budget_usd: 15.0,
        limits: {
            active_projects: 999999,
            active_tasks: 999999,
            active_forms: 10,
            ai_chat_daily_queries: 150,
            ai_images_monthly: 15,
            agent_responses_monthly: 500,
            voice_live_minutes: 30,
            video_live_minutes: 5,
            storage_gb: 10,
            crm_clients_monthly: 999999,
            meetings_monthly: 60,
            grounding_monthly: 100,
            live_sessions_monthly: 30,
            articles_monthly: 0,
            publish_sites: 10,
            web_programmer_ops: 120,
            presentations_monthly: 10,
            social_posts_monthly: 100,
            ai_video_analysis_monthly: 10,
            agent_create: 1,
            pos_enabled: true
        }
    },
    premium: {
        ai_budget_usd: 40.0,
        limits: {
            active_projects: 999999,
            active_tasks: 999999,
            active_forms: 50,
            ai_chat_daily_queries: 500,
            ai_images_monthly: 60,
            agent_responses_monthly: 1500,
            voice_live_minutes: 120,
            video_live_minutes: 20,
            storage_gb: 50,
            crm_clients_monthly: 999999,
            meetings_monthly: 999999,
            grounding_monthly: 300,
            live_sessions_monthly: 999999,
            articles_monthly: 10,
            publish_sites: 30,
            web_programmer_ops: 350,
            presentations_monthly: 50,
            social_posts_monthly: 300,
            ai_video_analysis_monthly: 40,
            agent_create: 3,
            pos_enabled: true
        }
    }
};

export const getPlanConfig = (plan: string) => {
    return (SUBSCRIPTION_PLANS as any)[plan] || SUBSCRIPTION_PLANS.free;
};
