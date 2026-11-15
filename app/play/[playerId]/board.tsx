import { Placeholder } from "@/components/ui/Placeholder";

export default function Board() {
  return <Placeholder kicker="Evidence board" title="The Board" uses={["api.game.board.get"]} />;
}
