/**
 * Design reminder — «مرسم التصفّح»: data structures serve a calm, local-first
 * reading workflow. Every persisted item must be portable and sync-ready.
 */

export type Article = {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  content: string;
  image?: string;
  tags: string[];
  folderId?: string;
  savedAt: number;
  updatedAt: number;
  contentUpdatedAt?: number;
  lastOpenedAt?: number;
  progress: number;
  isRead: boolean;
  isArchived: boolean;
  isFavorite: boolean;
  readingTimeMinutes: number;
  sourceStatus: "cached" | "link-only";
};

export type Folder = { id: string; name: string; createdAt: number };

export type Note = {
  id: string;
  articleId?: string;
  url?: string;
  quote?: string;
  content: string;
  isRtl: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Highlight = {
  id: string;
  articleId: string;
  quote: string;
  prefix?: string;
  createdAt: number;
};

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  wordSpacing: number;
  width: number;
  widthCustomized?: boolean;
  fontFamily: "serif" | "sans" | "mono";
  textAlign: "right" | "left" | "justify";
  theme: "light" | "cream" | "sepia" | "dark";
  isRtl: boolean;
  showImages: boolean;
  libraryBackground: "paper" | "sand" | "mist";
  autoOpenEnabled: boolean;
  autoOpenSites: string[];
  importantSites: Array<{ domain: string; checked: boolean }>;
};

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.9,
  wordSpacing: 0,
  width: 980,
  fontFamily: "serif",
  textAlign: "right",
  theme: "cream",
  isRtl: true,
  showImages: true,
  libraryBackground: "paper",
  autoOpenEnabled: false,
  autoOpenSites: [],
  importantSites: [],
};

export type ExportBundle = {
  version: 1;
  exportedAt: number;
  articles: Article[];
  folders: Folder[];
  notes: Note[];
  highlights: Highlight[];
  settings: ReaderSettings;
};
