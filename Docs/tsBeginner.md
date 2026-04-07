cd my-agent-ts
npm init -y
npm install typescript ts-node @types/node
npm install nodemon --save-dev
npx tsc --init

// KEY INSIGHT: LCEL chains are lazy — they don't run until you
// call .invoke(), .stream(), or .batch(). They're composable
// building blocks, just like React components.
//
// PYTHON → TYPESCRIPT CHEAT SHEET:
// ┌─────────────────────────────┬──────────────────────────────────────────┐
// │ Python                      │ TypeScript                               │
// ├─────────────────────────────┼──────────────────────────────────────────┤
// │ prompt | model | parser     │ prompt.pipe(model).pipe(parser)          │
// │ BaseModel + Field()         │ z.object() + .describe()                 │
// │ class Foo(BaseModel): ...   │ const Foo = z.object({...})              │
// │ Foo instance                │ z.infer<typeof Foo>                      │
// │ load_dotenv()               │ import "dotenv/config"                   │
// │ for chunk in stream:        │ for await (const chunk of stream)        │
// │ RunnableLambda(fn)          │ RunnableLambda.from(fn)                  │
// └─────────────────────────────┴──────────────────────────────────────────┘