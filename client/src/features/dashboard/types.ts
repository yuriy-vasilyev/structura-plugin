export interface DashboardStats {
  content: { posts: number; blocks: number };
  visual: { total_images: number; optimized: number; space_saved: string };
}
