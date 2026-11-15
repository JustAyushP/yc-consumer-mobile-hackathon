import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function Story() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.story, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="As told by RAVO" title="The Story So Far" uses="game.viewer.story" data={data} />;
}
