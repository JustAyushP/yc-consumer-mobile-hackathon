import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function Timeline() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.timeline, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="The week" title="Timeline" uses="game.viewer.timeline" data={data} />;
}
