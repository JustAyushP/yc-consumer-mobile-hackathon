import { Placeholder } from "@/components/ui/Placeholder";

export default function Role() {
  return <Placeholder kicker="Role reveal" title="Your Role" uses={["api.game.groups.get","api.game.roles.list"]} />;
}
