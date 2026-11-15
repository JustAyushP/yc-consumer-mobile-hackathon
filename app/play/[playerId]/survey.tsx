import { Placeholder } from "@/components/ui/Placeholder";

export default function Survey() {
  return <Placeholder kicker="Onboarding" title="The Survey" uses={["api.game.survey.questions","api.game.survey.submit"]} />;
}
