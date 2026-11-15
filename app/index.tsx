import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function CaseFile() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.caseFile, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="RAVO presents" title="The Case File" uses="game.viewer.caseFile" data={data} />;
}
