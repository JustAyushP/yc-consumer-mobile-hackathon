import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function Reveal() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.reveal, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="Case closed" title="The Reveal" uses="game.viewer.reveal" data={data} />;
}
