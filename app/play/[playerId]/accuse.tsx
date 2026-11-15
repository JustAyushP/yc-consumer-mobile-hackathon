import { Placeholder } from "@/components/ui/Placeholder";

export default function Accuse() {
  return <Placeholder kicker="Final accusation" title="Name the Killer" uses={["api.game.board.get","api.game.accuse.accuse","api.game.engine.fastForward (demo)"]} />;
}
