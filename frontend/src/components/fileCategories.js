// The folders of the drive. ``key`` matches the category the server sends.
export const CATEGORY_META = [
  { key: "images", label: "Images", icon: "🖼️" },
  { key: "videos", label: "Videos", icon: "🎬" },
  { key: "pdfs", label: "PDFs", icon: "📕" },
  { key: "documents", label: "Documents", icon: "📄" },
  { key: "audio", label: "Audio", icon: "🎵" },
  { key: "archives", label: "Archives", icon: "🗜️" },
  { key: "other", label: "Other", icon: "📦" },
];

const BY_KEY = Object.fromEntries(
  CATEGORY_META.map((category) => [category.key, category])
);

export function categoryInfo(key) {
  return BY_KEY[key] || BY_KEY.other;
}
