/**
 * Page description — uses the Structura "overline" signature:
 * text-[10px] (actually), font-medium, tracking-widest, uppercase.
 *
 * Note: The component is exported as PageDescription but the file
 * is named PageSubtitle for historical reasons.
 */
export const PageDescription = ({ children }: { children: React.ReactNode }) => {
  return (
    <p className="m-0! text-xs font-medium tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
      {children}
    </p>
  );
};
