/**
 * Page-level heading — design guide type scale "title":
 * text-2xl, font-bold, tracking-tight (negative tracking for premium feel).
 */
export const PageTitle = ({ children }: { children: React.ReactNode }) => {
  return (
    <h1 className="mt-0! mb-1! text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
      {children}
    </h1>
  );
};
