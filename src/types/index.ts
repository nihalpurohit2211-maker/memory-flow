export type CaptureTimeSource = 'exif' | 'user' | 'unknown' | null;
export type ProcessingStatus = 'ready' | 'processing' | 'error';
export type ProvenanceType = 'organizer-confirmed' | 'imported' | 'suggested' | 'ai-provisional' | 'visitor-suggested';
export type MomentLabelSource = 'organizer' | 'imported_folder' | 'suggested_time' | 'demo' | 'ai_clustering';
export type MembershipSource = 'manual' | 'imported_folder' | 'suggested_time' | 'demo' | 'ai_clustering' | 'visitor_suggestion';

export interface EventWorkspace {
  id: string;
  title: string;
  description: string | null;
  updatedAt: string;
}

export interface MediaItem {
  id: string;
  eventId: string;
  originalName: string;
  mimeType: string;
  size: number;
  blobUrl?: string; // active in-memory object URL
  thumbnailUrl: string; // optimized thumbnail (data URL or object URL)
  lowResUrl?: string; // progressive low-res stream
  width: number | null;
  height: number | null;
  duration: number | null; // seconds for video
  captureTime: string | null; // ISO string
  captureTimeSource: CaptureTimeSource;
  timezoneKnown: boolean | null;
  importedAt: string;
  fileModifiedAt: string | null;
  processingStatus: ProcessingStatus;
  hash: string | null;
  duplicateGroupId: string | null;
  isDemo?: boolean;
  isDrive?: boolean;
  driveFileId?: string;
  driveThumbnailUrl?: string;
  driveFullUrl?: string;
  driveParentFolderId?: string;
  caption?: string | null;
  mediaBlob?: Blob;
  // Provenance & Contributor
  contributorName?: string | null;
  contributorVerified?: boolean;
  // Integrity & Damage indication
  isDamaged?: boolean;
  damageNotes?: string | null;
  // Categorical tags
  places?: string[];
  activities?: string[];
  people?: string[];
  // AI visual embedding status
  embeddingStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  embeddingVector?: number[];
  nearDuplicateOfId?: string | null;
  nearDuplicateSimilarity?: number;
}

export interface Place {
  id: string;
  name: string;
  labelSource: 'organizer' | 'ai_suggested';
  isConfirmed: boolean;
  coverMediaId?: string | null;
  mediaCount?: number;
}

export interface ActivityTag {
  id: string;
  name: string;
  confidence: number;
  isConfirmed: boolean;
  modelInfo?: string;
}

export interface PersonGroup {
  id: string;
  label: string; // Unnamed initially: e.g. "Person Group A"
  isConfirmed: boolean;
  consented: boolean;
  mediaIds: string[];
}

export interface MediaChip {
  type: 'moment' | 'place' | 'activity' | 'person';
  id: string;
  label: string;
  isConfirmed?: boolean;
}

export interface MediaContribution {
  id: string;
  collectionSlug: string;
  contributorName: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  targetMomentId?: string | null;
  notes?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string | null;
}

export interface Moment {
  id: string;
  eventId: string;
  label: string;
  labelSource: MomentLabelSource;
  coverMediaId: string | null;
  description: string | null;
  isDemo?: boolean;
  isProvisional?: boolean;
  provisionalReasons?: string[];
  createdAt: string;
}

export interface Membership {
  mediaId: string;
  momentId: string;
  source: MembershipSource;
  confidence: number | null;
}

export interface Connection {
  id: string;
  sourceMomentId: string;
  targetMomentId: string;
  type: 'temporal' | 'activity' | 'related';
  provenance: ProvenanceType;
  evidence: string | null;
  confidence: number | null;
}

export interface Visit {
  momentId: string;
  lastVisitedAt: string;
  visitCount: number;
}

export type ViewMode = 'flow' | 'timeline' | 'universe';

export interface StorageEstimate {
  quota: number;
  usage: number;
  percentage: number;
  isPersisted: boolean;
}

export type UserRole = 'admin' | 'visitor';

export interface AdminSession {
  isAuthenticated: boolean;
  token: string | null;
  expiresAt: number | null;
}

export interface DriveConfig {
  folderId: string;
  folderUrl: string;
  apiKey: string | null;
  accessToken: string | null;
  folderName?: string;
  autoSync: boolean;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'paused' | 'error' | 'ready';
  errorMessage?: string | null;
  indexedCount: number;
  totalDiscovered: number;
  nextPageToken?: string | null;
}

export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  thumbnailLink?: string;
  webContentLink?: string;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    time?: string;
    cameraMake?: string;
    cameraModel?: string;
  };
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
  parents?: string[];
}

export interface VisitorSuggestion {
  id: string;
  visitorName: string;
  createdAt: string;
  mediaId: string;
  targetMomentId: string;
  action: 'add_to_moment' | 'move_to_moment' | 'unlink_from_moment' | 'rename_moment';
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface AISimilarityMatch {
  mediaId1: string;
  mediaId2: string;
  similarity: number;
  timeDiffMinutes: number | null;
  isNearDuplicate: boolean;
  sharedFolder: boolean;
}

export type CollectionVisibility = 'public' | 'unlisted' | 'password';

export interface SharedCollectionInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  visibility: CollectionVisibility;
  passwordHint: string | null;
  requiresPassword: boolean;
  peopleGroupingEnabled: boolean;
  updatedAt: string;
}

