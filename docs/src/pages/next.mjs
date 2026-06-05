import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const nextBlocks = [
  h2("Use in app workflows", "use-in-app-workflows"),
  p("pire-browser can test a locally running Next.js app from the command line or from an AI coding agent."),
  code(`npm run dev
pire-browser open http://localhost:3000
pire-browser snapshot -i
pire-browser click '@e4'
pire-browser screenshot next-page.png`),
  h2("Pre-navigation setup", "pre-navigation-setup"),
  code(`pire-browser --session-name next open about:blank
pire-browser --session-name next state load ./.pire-state/local-next.json
pire-browser --session-name next open http://localhost:3000/dashboard`),
  h2("Serverless", "serverless"),
  p("The current runtime depends on local Firefox plus Native Messaging. It is not a drop-in serverless browser provider."),
];

export default page({
  path: "/next/",
  title: "Next.js + Vercel",
  description: "Using pire-browser in app workflows.",
  blocks: nextBlocks,
});
