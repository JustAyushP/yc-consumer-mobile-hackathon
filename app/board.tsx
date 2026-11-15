import { useQuery } from "convex/react";

import { useViewerToken } from "@/components/viewer";
import { Placeholder } from "@/components/ui/Placeholder";
import { api } from "@/convex/_generated/api";

export default function Board() {
  const { token } = useViewerToken();
  const data = useQuery(api.game.viewer.board, token ? { viewerToken: token } : "skip");
  return <Placeholder kicker="Evidence" title="The Board" uses="game.viewer.board" data={data} />;
}
