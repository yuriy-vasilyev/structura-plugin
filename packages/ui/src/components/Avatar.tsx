import React from "react";
import { type VariantProps } from "class-variance-authority";
import { avatar } from "../variants/avatar";
import { cn } from "../utils"; // --- Component Props ---

// --- Component Props ---
interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatar> {}

const AvatarRoot = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, ...props }, ref) => (
    <span ref={ref} className={cn(avatar({ size }), className)} {...props} />
  )
);
AvatarRoot.displayName = "Avatar";

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, ...props }, ref) => (
    <img ref={ref} className={cn("aspect-square h-full w-full", className)} alt="" {...props} />
  )
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-neutral-200 font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
        className
      )}
      {...props}
    />
  )
);
AvatarFallback.displayName = "AvatarFallback";

// --- Final Export ---
export const Avatar = Object.assign(AvatarRoot, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
});

/*
  // --- NEW USAGE EXAMPLE ---
  import { User } from "@structura/types";
  import { Avatar } from "@structura/ui";

  const getInitials = (user: User) => `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();

  <Avatar size="lg">
    {user.photoURL && <Avatar.Image src={user.photoURL} alt={`${user.firstName}'s avatar`} />}
    <Avatar.Fallback>{getInitials(user)}</Avatar.Fallback>
  </Avatar>
*/
