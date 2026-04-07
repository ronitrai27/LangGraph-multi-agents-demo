// ============================================================
// LESSON 3: CHAINS (LCEL — LangChain Expression Language) — TypeScript
//
// KEY DIFFERENCE FROM PYTHON:
//   Python uses the | pipe operator:  prompt | model | parser
//   TypeScript uses .pipe() method:   prompt.pipe(model).pipe(parser)
//
//   Everything else maps 1:1 — same concepts, same method names.
// ============================================================

import "dotenv/config";
import { initChatModel } from "langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableLambda } from "@langchain/core/runnables";
import { z } from "zod";

const openai = await initChatModel("gpt-4.1-nano", { modelProvider: "openai" });
const claude = await initChatModel("claude-sonnet-4-6", { modelProvider: "anthropic" });

// ── 1. The simplest chain: prompt → model → parser ───────────
// StringOutputParser → extracts .content from AIMessage → returns string
// Python:      chain = prompt | openai | StrOutputParser()
// TypeScript:  chain = prompt.pipe(openai).pipe(parser)

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a concise technical writer."],
  ["human", "Summarize what {concept} is in exactly 2 sentences."],
]);

const chain = prompt.pipe(openai).pipe(new StringOutputParser());

// ---------------------------
// .invoke() on the chain passes a dict matching template variables
// const result = await chain.invoke({ concept: "vector databases" });
// console.log(typeof result);  // string  ← clean string, not AIMessage
// console.log(result);

// ── 2. Chain is reusable — call it many times ────────────────
// for (const concept of ["JWT tokens", "webhooks", "rate limiting"]) {
//   console.log(`\n${concept}:`);
//   console.log(await chain.invoke({ concept }));
// }

// ── 3. Stream a chain ────────────────────────────────────────
// TypeScript streaming uses for-await-of (same as Python's for chunk in chain.stream())
// console.log("\n--- Streaming chain ---");
// const stream = await chain.stream({ concept: "microservices" });
// for await (const chunk of stream) {
//   process.stdout.write(chunk);
// }
// console.log();

// ── 4. Batch a chain ─────────────────────────────────────────
// const results = await chain.batch([
//   { concept: "CI/CD" },
//   { concept: "feature flags" },
//   { concept: "A/B testing" },
// ]);
// for (const r of results) console.log(r, "\n");

// ── 5. Structured output chain ───────────────────────────────
// TypeScript uses Zod schemas instead of Python's Pydantic BaseModel.
// Zod is already in your stack (used in Next.js / tRPC) — same idea.
//
// Python:  class SprintPlan(BaseModel): goal: str = Field(...)
// TypeScript: const SprintPlan = z.object({ goal: z.string().describe("...") })

// const SprintPlan = z.object({
//   goal: z.string().describe("The sprint goal in one sentence"),
//   tickets: z.array(z.string()).describe("3-5 ticket titles to include"),
//   risks: z.array(z.string()).describe("Potential blockers or risks"),
//   durationDays: z.number().describe("Sprint length in days"),
// });

// const planPrompt = ChatPromptTemplate.fromMessages([
//   ["system", "You are a senior PM. Create practical sprint plans."],
//   ["human", "Create a sprint plan for: {featureDescription}"],
// ]);

// // withStructuredOutput replaces the parser — returns typed Zod-validated object
// const planChain = planPrompt.pipe(openai.withStructuredOutput(SprintPlan));

// const plan = await planChain.invoke({
//   featureDescription: "Building a Slack notification integration for our task manager",
// });

// console.log(`Goal: ${plan.goal}`);
// console.log(`Tickets: ${plan.tickets}`);
// console.log(`Risks: ${plan.risks}`);
// console.log(`Duration: ${plan.durationDays} days`);

// ── 6. Chaining chains (pipeline) ────────────────────────────
// Chain 1: user idea → structured feature spec (via Claude)
// Chain 2: feature spec → ticket breakdown (via OpenAI)
// Connect: chain1.pipe(RunnableLambda(...)).pipe(chain2)
//
// PYTHON → TS MAPPING:
//   Python: full_pipeline = spec_chain | RunnableLambda(spec_to_dict) | tickets_chain
//   TS:     full_pipeline = specChain.pipe(RunnableLambda.from(specToDict)).pipe(ticketsChain)

// Step 1: generate a feature spec (returns Zod-validated object)
const FeatureSpec = z.object({
  name: z.string().describe("Feature name"),
  description: z.string().describe("2 sentence description"),
  userValue: z.string().describe("Why users care about this"),
});
type FeatureSpec = z.infer<typeof FeatureSpec>;

const specPrompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a product strategist."],
  ["human", "Define this feature idea: {idea}"],
]);

// withStructuredOutput locks the output to our Zod schema — fully typed
const specChain = specPrompt.pipe(claude.withStructuredOutput(FeatureSpec));

// Step 2: take the spec → write tickets
const ticketsPrompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a tech lead writing Jira tickets."],
  [
    "human",
    "Break down this feature into dev tickets:\nFeature: {name}\n{description}\nUser value: {userValue}",
  ],
]);
const ticketsChain = ticketsPrompt.pipe(openai).pipe(new StringOutputParser());

// Bridge: Zod-typed object → plain dict for the next prompt's variables
// RunnableLambda.from() wraps any function as a chain step (same as Python's RunnableLambda)
const specToDict = RunnableLambda.from((spec: FeatureSpec) => ({
  name: spec.name,
  description: spec.description,
  userValue: spec.userValue,
}));

// Full pipeline — reads exactly like the Python version, just with .pipe()
const fullPipeline = specChain.pipe(specToDict).pipe(ticketsChain);

const result = await fullPipeline.invoke({
  idea: "AI-powered standup summary generator",
});
console.log(result);
