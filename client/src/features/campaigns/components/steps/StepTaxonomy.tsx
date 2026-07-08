import { __ } from "@wordpress/i18n";
import { FolderOpen, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import apiFetch from "@wordpress/api-fetch";
import { PageLoader, useToast } from "@structura/ui";
import { TaxonomySection } from "../TaxonomySection";
import { useCampaignForm } from "../../context/CampaignContext";

export const StepTaxonomy = () => {
  const [loading, setLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<number[]>([]);
  const [availableTags, setAvailableTags] = useState<number[]>([]);
  const { errorToast } = useToast();

  // Use the nested formData and the cluster-based updateForm
  const { formData, updateForm } = useCampaignForm();
  const { categories, tags } = formData.taxonomy;

  useEffect(() => {
    const fetchTaxonomies = async () => {
      try {
        setLoading(true);
        // We run these in parallel for better performance
        const [cats, tg] = await Promise.all([
          apiFetch<number[]>({ path: "/wp/v2/categories?per_page=100" }),
          apiFetch<number[]>({ path: "/wp/v2/tags?per_page=100" }),
        ]);

        setAvailableCats(cats);
        setAvailableTags(tg);
      } catch (error: any) {
        errorToast(__("Failed to load taxonomies from WordPress core.", "structura"));
      } finally {
        setLoading(false);
      }
    };

    fetchTaxonomies();
  }, [errorToast]);

  if (loading) {
    return <PageLoader label={__("Mapping site architecture…", "structura")} padding="lg" />;
  }

  return (
    <div className="animate-in slide-in-from-right-4 space-y-8 duration-500">
      {/* CATEGORY GOVERNANCE */}
      <TaxonomySection
        title={__("Category Governance", "structura")}
        icon={<FolderOpen size={18} />}
        mode={categories.mode}
        // Use the cluster-based update
        setMode={(val) =>
          updateForm("taxonomy", {
            categories: { ...categories, mode: val },
          })
        }
        items={availableCats}
        selected={categories.list}
        setSelected={(val) =>
          updateForm("taxonomy", {
            categories: { ...categories, list: val },
          })
        }
      />

      <div className="h-px w-full bg-neutral-100" />

      {/* TAG GOVERNANCE */}
      <TaxonomySection
        title={__("Tag Governance", "structura")}
        icon={<Tag size={18} />}
        mode={tags.mode}
        setMode={(val) =>
          updateForm("taxonomy", {
            tags: { ...tags, mode: val },
          })
        }
        items={availableTags}
        selected={tags.list}
        setSelected={(val) =>
          updateForm("taxonomy", {
            tags: { ...tags, list: val },
          })
        }
      />
    </div>
  );
};
