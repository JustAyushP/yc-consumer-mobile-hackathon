import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function Team() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.team, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="The squad" title="Progress & Pace" uses="game.viewer.team" data={data} />;
}
