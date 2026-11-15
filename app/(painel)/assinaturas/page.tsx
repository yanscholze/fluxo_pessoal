import { CommitmentTabs } from "../../ui/commitment-tabs.tsx";
import AssinaturasContent from "./content.tsx";

export const dynamic = "force-dynamic";

/** One complete management view, shared by the direct route and legacy links. */
export default function Assinaturas() {
  return (
    <div className="content-area">
      <CommitmentTabs active="assinaturas" />
      <AssinaturasContent />
    </div>
  );
}
