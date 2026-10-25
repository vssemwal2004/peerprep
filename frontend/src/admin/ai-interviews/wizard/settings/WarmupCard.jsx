import { Coffee } from "lucide-react";
import { Toggle } from "../../ui";
import { Card, NumberField } from "../controls";
import { readWarmup, writeWarmup } from "./model";

export default function WarmupCard({ data, onChange, readOnly }) {
  const warmup = readWarmup(data);
  const set = (patch) => onChange(writeWarmup(data, patch));
  return (
    <Card
      data-field="warmup"
      icon={Coffee}
      title="Warm-up"
      description="A short, relaxed chat before Question 1 so students can settle in."
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-6 [&>legend+*]:!mt-0">
        <legend className="sr-only">Warm-up</legend>
        <Toggle
          label="Start with a warm-up"
          description={
            warmup.enabled
              ? "ANVI chats briefly before the first question."
              : "ANVI goes straight to Question 1 after her introduction."
          }
          checked={warmup.enabled}
          onChange={(enabled) => set({ enabled })}
          disabled={readOnly}
        />
        {warmup.enabled && (
          <div className="space-y-6 border-l-2 border-slate-100 pl-4 dark:border-gray-800">
            <div className="max-w-xs">
              <NumberField
                label="Icebreaker questions"
                stepper
                min={0}
                max={3}
                value={warmup.icebreakers}
                hint="Light questions such as “How is your day going?”. Up to 3."
                onChange={(icebreakers) => set({ icebreakers })}
              />
            </div>
            <Toggle
              label="Ask “Tell me about yourself”"
              description="A common opening question that lets students introduce themselves."
              checked={warmup.tellMeAboutYourself}
              onChange={(tellMeAboutYourself) => set({ tellMeAboutYourself })}
              disabled={readOnly}
            />
            <Toggle
              label="Count it in the score"
              description={
                warmup.tellMeAboutYourself
                  ? "“Tell me about yourself” is marked like any other question (10 marks). Icebreakers are never scored."
                  : "Turn on “Tell me about yourself” to score it. Icebreakers are never scored."
              }
              checked={warmup.scored && warmup.tellMeAboutYourself}
              onChange={(scored) => set({ scored })}
              disabled={readOnly || !warmup.tellMeAboutYourself}
            />
          </div>
        )}
      </fieldset>
    </Card>
  );
}
