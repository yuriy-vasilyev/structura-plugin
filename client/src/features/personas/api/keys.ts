export const personaKeys = {
  all: ["personas"] as const,
  lists: () => [...personaKeys.all, "list"] as const,
  users: () => ["wp-users"] as const, // Separate root key for WP users
};
