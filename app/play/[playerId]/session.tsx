import { Placeholder } from "@/components/ui/Placeholder";

export default function Session() {
  return <Placeholder kicker="Today's session" title="Day Briefing" uses={["api.game.session.today","api.game.session.submitAnswer","api.game.session.useAbility","api.game.session.complete","api.ravo.hints.request"]} />;
}
