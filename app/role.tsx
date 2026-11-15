import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function Role() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.me, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="Your role" title="Role Card" uses="game.viewer.me" data={data} />;
}
