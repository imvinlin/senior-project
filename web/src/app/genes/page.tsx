"use client";

import { Suspense, useState } from "react";

import { CohortShell, loading } from "@/components/CohortShell";
import { GeneComparison, type GeneExpressionView } from "@/components/GeneComparison";
import { useApi } from "@/lib/useApi";
import { useCohort } from "@/lib/useCohort";

function GeneExplorer() {
  const state = useCohort();
  const [gene1, setGene1] = useState("");
  const [gene2, setGene2] = useState("");
  const [scope, setScope] = useState<"global" | "cohort">("global");
  const params = new URLSearchParams(scope === "cohort" ? state.filters.toString() : undefined);
  params.set("gene1", gene1);
  params.set("gene2", gene2);
  params.set("scope", scope);
  params.set("assay", state.assay);
  const ready = Boolean(gene1 && gene2 && gene1 !== gene2);
  const { data, error, pending } = useApi<GeneExpressionView>(
    `/api/genes/expression?${params.toString()}`,
    ready,
  );

  return (
    <CohortShell state={state}>
      <GeneComparison
        gene1={gene1}
        gene2={gene2}
        setGene1={setGene1}
        setGene2={setGene2}
        scope={scope}
        setScope={setScope}
        assay={state.assay}
        view={data}
        error={error}
        pending={pending}
      />
    </CohortShell>
  );
}

export default function Genes() {
  return (
    <Suspense fallback={loading}>
      <GeneExplorer />
    </Suspense>
  );
}
