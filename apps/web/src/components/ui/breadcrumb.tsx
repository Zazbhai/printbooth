// --- Component ---
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { motion } from "motion/react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import "./breadcrumb.css";

const ChevronRightIcon = ({ size = 15, strokeWidth = 2, className, ...props }: any) => (
  <ChevronRight size={size} strokeWidth={strokeWidth} className={className} {...props} />
);

const DotsHorizontalIcon = ({ size = 16, strokeWidth = 2, className, ...props }: any) => (
  <MoreHorizontal size={size} strokeWidth={strokeWidth} className={className} {...props} />
);

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & {
    separator?: React.ReactNode;
  }
>(({ className, ...props }, ref) => (
  <nav
    ref={ref}
    aria-label="breadcrumb"
    className={cn("breadcrumb-nav", className)}
    {...props}
  />
));
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<"ol">
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5 breadcrumb-list",
      className
    )}
    {...props}
  />
));
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(({ className, children, ...props }, ref) => (
  <li
    ref={ref}
    className={cn("inline-flex items-center gap-1.5 breadcrumb-item", className)}
    {...props}
  >
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 24 }}
      className="inline-flex items-center gap-1.5"
    >
      {children}
    </motion.div>
  </li>
));
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & {
    asChild?: boolean;
  }
>(({ asChild, className, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";

  return (
    <motion.span
      className="breadcrumb-link-motion"
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Comp
        ref={ref}
        className={cn("transition-colors hover:text-foreground breadcrumb-link", className)}
        {...props}
      >
        {children}
      </Comp>
    </motion.span>
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>(({ className, children, ...props }, ref) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn("text-foreground breadcrumb-page", className)}
    {...props}
  >
    <motion.span
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
      className="inline-flex items-center gap-1.5"
    >
      {children}
    </motion.span>
  </span>
));
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn("breadcrumb-separator", className)}
    {...props}
  >
    {children ?? <ChevronRightIcon size={15} strokeWidth={2} className="breadcrumb-separator-icon" />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn("flex size-5 items-center justify-center breadcrumb-ellipsis", className)}
    {...props}
  >
    <motion.span
      whileHover={{ scale: 1.15 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="inline-flex items-center justify-center"
    >
      <DotsHorizontalIcon size={16} strokeWidth={2} />
    </motion.span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
