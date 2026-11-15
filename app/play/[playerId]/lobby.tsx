import { Placeholder } from "@/components/ui/Placeholder";

export default function Lobby() {
  return <Placeholder kicker="Lobby" title="The Team" uses={["api.game.groups.get","api.game.groups.start"]} />;
}
