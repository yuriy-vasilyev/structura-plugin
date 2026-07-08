import { __ } from "@wordpress/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@structura/ui";

interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const TablePagination = ({ currentPage, totalPages, onPageChange }: Props) => (
  <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
    <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
      {__("Page", "structura")} {currentPage} {__("of", "structura")} {totalPages}
    </span>
    <div className="flex gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft size={14} />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <ChevronRight size={14} />
      </Button>
    </div>
  </div>
);
